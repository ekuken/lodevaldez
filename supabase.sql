-- ============================================================
--  SISTEMA DE CAFÉ — base de datos en Supabase
--  Pegar todo esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- 1. Los dos cafés ----------
create table if not exists public.locales (
  id          text primary key,                 -- 'valdez' | 'eva'
  nombre      text not null,
  datos       jsonb not null default '{}'::jsonb,
  version     bigint not null default 1,        -- sube en cada guardado
  actualizado timestamptz not null default now()
);

-- Si la tabla ya venía de antes, "create table if not exists" no la toca:
-- estas tres líneas agregan lo que le falte y no hacen nada si ya está.
alter table public.locales add column if not exists datos       jsonb       not null default '{}'::jsonb;
alter table public.locales add column if not exists version     bigint      not null default 1;
alter table public.locales add column if not exists actualizado timestamptz not null default now();

insert into public.locales (id, nombre) values
  ('valdez', 'Lo de Valdez'),
  ('eva',    'Evacafé')
on conflict (id) do nothing;

-- ---------- 2. Quién puede entrar a qué café ----------
-- rol 'cafe'  = la computadora del local, ve y edita solo ese café
-- rol 'duena' = puede entrar a los dos
create table if not exists public.miembros (
  user_id  uuid not null references auth.users(id) on delete cascade,
  local_id text not null references public.locales(id) on delete cascade,
  rol      text not null default 'cafe' check (rol in ('cafe', 'duena')),
  primary key (user_id, local_id)
);

-- ---------- 3. Historial de respaldos ----------
-- Una copia entera del café cada 12 horas, guardadas 30 días (la regla está
-- en guardar_local, más abajo). Sirve para volver atrás si algo se rompe:
-- fue lo que permitió recuperar los dos cafés el 7/9/2026.
create table if not exists public.respaldos (
  id       bigserial primary key,
  local_id text not null references public.locales(id) on delete cascade,
  datos    jsonb not null,
  creado   timestamptz not null default now()
);

-- Igual que arriba: por si la tabla ya existía con otra forma.
alter table public.respaldos add column if not exists local_id text;
alter table public.respaldos add column if not exists datos    jsonb;
alter table public.respaldos add column if not exists creado   timestamptz not null default now();

create index if not exists respaldos_local_fecha
  on public.respaldos (local_id, creado desc);

-- ============================================================
--  SEGURIDAD (Row Level Security)
--  Sin esto, cualquiera con la dirección del sistema leería todo.
--  Con esto, la base rechaza el pedido aunque toquen el código
--  desde el navegador: el filtro corre en el servidor.
-- ============================================================

alter table public.locales   enable row level security;
alter table public.miembros  enable row level security;
alter table public.respaldos enable row level security;

-- ---------- Permisos sobre las tablas ----------
-- OJO: RLS decide QUÉ FILAS ve cada uno, pero antes hace falta el permiso
-- común de Postgres sobre la tabla. Sin estos GRANT la base contesta
-- "permission denied for table locales" aunque las políticas estén bien.
grant usage on schema public to authenticated;

grant select, update on public.locales   to authenticated;
grant select         on public.miembros  to authenticated;
grant select, insert on public.respaldos to authenticated;
grant usage, select  on sequence public.respaldos_id_seq to authenticated;

-- Sin iniciar sesión no se toca nada.
revoke all on public.locales   from anon;
revoke all on public.miembros  from anon;
revoke all on public.respaldos from anon;

-- ¿El usuario que está pidiendo es miembro de este café?
-- Se reemplaza, NO se borra: puede haber muchas políticas colgando de ella
-- y un "drop" las arrastraría. Como la firma y el tipo de retorno no cambian,
-- "create or replace" funciona sin tocar nada de lo que ya depende.
create or replace function public.es_miembro(p_local text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.miembros m
    where m.local_id = p_local and m.user_id = auth.uid()
  );
$$;

-- --- locales: se puede ver y actualizar solo el café propio ---
drop policy if exists "ver su cafe" on public.locales;
create policy "ver su cafe" on public.locales
  for select to authenticated
  using (public.es_miembro(id));

drop policy if exists "editar su cafe" on public.locales;
create policy "editar su cafe" on public.locales
  for update to authenticated
  using (public.es_miembro(id))
  with check (public.es_miembro(id));

-- Nadie puede crear ni borrar cafés desde el sistema: no hay
-- políticas de insert ni de delete, así que la base los rechaza.

-- --- miembros: cada uno ve solo su propia membresía ---
drop policy if exists "ver mi membresia" on public.miembros;
create policy "ver mi membresia" on public.miembros
  for select to authenticated
  using (user_id = auth.uid());

-- --- respaldos: se pueden crear y leer los del café propio ---
drop policy if exists "ver respaldos de su cafe" on public.respaldos;
create policy "ver respaldos de su cafe" on public.respaldos
  for select to authenticated
  using (public.es_miembro(local_id));

drop policy if exists "crear respaldos de su cafe" on public.respaldos;
create policy "crear respaldos de su cafe" on public.respaldos
  for insert to authenticated
  with check (public.es_miembro(local_id));

-- Los respaldos no se pueden modificar ni borrar desde el sistema.

-- ============================================================
--  Guardado seguro: sube la versión y deja copia de respaldo.
--  Si otra computadora guardó mientras tanto, avisa en vez de
--  pisar los datos.
-- ============================================================
-- Se reemplaza, NO se borra: un "drop" se lleva puestos los permisos y hay
-- que acordarse de volver a darlos. Como la firma no cambia, "create or
-- replace" la deja igual sin tocar nada de lo que depende de ella.
create or replace function public.guardar_local(
  p_local   text,
  p_datos   jsonb,
  p_version bigint
)
returns table (ok boolean, version bigint, datos jsonb)
language plpgsql
security definer
set search_path = public
-- El cuerpo va entre $func$ y no entre $$: algunos editores de SQL parten el
-- texto en el primer ";" que encuentran y con $$ pelado cortan la función por
-- la mitad ("syntax error at end of input"). Con la etiqueta no se confunden.
as $func$
declare
  v_actual bigint;
begin
  if not public.es_miembro(p_local) then
    raise exception 'Sin permiso para este café';
  end if;

  select l.version into v_actual from public.locales l where l.id = p_local for update;

  -- Otra computadora guardó primero: se devuelve lo que hay sin pisar nada
  if p_version is not null and p_version <> v_actual then
    return query
      select false, l.version, l.datos from public.locales l where l.id = p_local;
    return;
  end if;

  update public.locales l
     set datos = p_datos,
         version = l.version + 1,
         actualizado = now()
   where l.id = p_local;

  -- ---------- Copias de respaldo: corto y largo plazo a la vez ----------
  -- Las dos reglas simples fallaron, cada una a su manera, el 7/9/2026:
  --
  --   "una por guardado, las últimas 200" → en servicio se guarda cada pocos
  --   segundos, así que 200 copias eran menos de un día de historia. Cuando
  --   se borraron los datos a las 20:22, la copia buena más vieja era de las
  --   19:12: una hora de margen para darse cuenta.
  --
  --   "una cada 12 horas" → arregló eso, pero dejó de guardar copias
  --   seguidas. Esa misma noche se borró Valdez a las 23:20 y la última
  --   copia era de las 21:20: dos horas sin red.
  --
  -- Hacen falta las dos cosas, y no se estorban:
  --   corto plazo → las últimas 50 copias, pase lo que pase. Para deshacer
  --                 un accidente de hace un rato.
  --   largo plazo → una por cada franja de 12 horas, durante 30 días. Para
  --                 volver a como estaba anteayer.
  -- De cada franja se conserva la copia con MÁS registros, no la más nueva:
  -- si en esa franja pasó un borrado, lo que hay que guardar es la de antes.
  insert into public.respaldos (local_id, datos) values (p_local, p_datos);

  delete from public.respaldos r
   where r.local_id = p_local
     and r.id not in (
           select id from public.respaldos
            where local_id = p_local
            order by creado desc
            limit 50
         )
     and r.id not in (
           select distinct on (floor(extract(epoch from creado) / 43200)) id
             from public.respaldos
            where local_id = p_local
              and creado > now() - interval '30 days'
            order by floor(extract(epoch from creado) / 43200),
                     jsonb_array_length(coalesce(datos->'pedidos',   '[]'::jsonb)) +
                     jsonb_array_length(coalesce(datos->'productos', '[]'::jsonb)) +
                     jsonb_array_length(coalesce(datos->'mesas',     '[]'::jsonb)) desc,
                     creado desc
         );

  return query
    select true, l.version, l.datos from public.locales l where l.id = p_local;
end;
$func$;

revoke all on function public.guardar_local(text, jsonb, bigint) from public;
grant execute on function public.guardar_local(text, jsonb, bigint) to authenticated;

-- ============================================================
--  Avisarle a la API que hay cosas nuevas. Sin esto, la función
--  recién creada puede seguir contestando "no existe" un rato.
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
--  Control. Tiene que decir:
--    tablas               3
--    funciones            2
--    columnas_de_locales  datos=jsonb, version=bigint
--    estorba_en_respaldos (vacío)
--  Si algo no da, el script se cortó por un error más arriba.
-- ============================================================
select
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('locales','miembros','respaldos'))                    as tablas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('es_miembro','guardar_local'))                      as funciones,
  -- Columnas que el sistema necesita en "locales", con su tipo.
  -- Tiene que decir exactamente: datos=jsonb, version=bigint.
  (select string_agg(column_name || '=' || data_type, ', ' order by column_name)
     from information_schema.columns
    where table_schema='public' and table_name='locales'
      and column_name in ('datos','version'))                                as columnas_de_locales,
  -- Columnas obligatorias de "respaldos" que el guardado no llena:
  -- si aparece alguna, la copia de respaldo va a fallar en cada guardado.
  (select string_agg(column_name, ', ') from information_schema.columns
    where table_schema='public' and table_name='respaldos'
      and is_nullable='NO' and column_default is null
      and column_name not in ('local_id','datos'))                           as estorba_en_respaldos;
