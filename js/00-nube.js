/* ============================================================
   NUBE — guardado en Supabase
   ------------------------------------------------------------
   El sistema sigue guardando en la computadora (para que funcione
   sin internet) y además manda una copia a la nube. Al abrir, si
   la nube tiene algo más nuevo, se trae eso.
   ============================================================ */

/* --- Datos del proyecto de Supabase (ver NUBE.md) --- */
const NUBE_URL = 'https://hiwheqcslweegkdcvurh.supabase.co';
const NUBE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpd2hlcWNzbHdlZWdrZGN2dXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTI5NTMsImV4cCI6MjEwMzg2ODk1M30.UNibpKa3RPccxHlXGrhcWd9DOoxdZfAxwMWwvP1-uSk';

const NUBE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

let NUBE = {
  cli: null,        /* cliente de Supabase */
  activa: false,    /* hay conexión configurada y sesión iniciada */
  version: null,    /* versión del último dato bajado */
  guardando: false,
  pendiente: false,
  timer: null,
  fallos: 0,        /* intentos seguidos que fallaron, para espaciar reintentos */
  ultimoError: null,/* el último error crudo, para revisarlo desde la consola */
  base: null,       /* lo último que sabemos que quedó en la nube (ver más abajo) */
  choques: 0,       /* choques seguidos con la otra computadora */
  repintar: false,  /* llegaron datos nuevos pero la pantalla estaba ocupada */
  reconecta: 0,     /* cuándo se probó volver a conectar por última vez */
  trabado: false,   /* se frenó el guardado para no borrar datos (ver nubeTrabar) */
  borradoAdrede: false, /* el usuario pidió borrar todo: ese vaciado SÍ se sube */
  estado: 'local'   /* local | sincronizado | guardando | error | conflicto | configurar */
};

/* ---------- La "base": qué había en la nube la última vez ----------
   Guardar esto es lo que permite combinar el trabajo de dos computadoras
   sin que una pise a la otra. Teniendo tres cosas —lo que había (base), lo
   que hicimos acá, y lo que hay ahora en la nube— se puede saber QUIÉN tocó
   CADA registro: si un pedido cambió respecto de la base solo del lado de
   la otra compu, el cambio es suyo y se respeta; si cambió solo acá, es
   nuestro. Sin la base habría que adivinar, y adivinar es lo que hacía que
   se borraran datos. */
function nubeBaseKey(){ return 'cafe_base_v1_' + LOCAL; }
function nubeBaseLeer(){
  if (NUBE.base) return NUBE.base;
  try{
    const r = localStorage.getItem(nubeBaseKey());
    NUBE.base = r ? JSON.parse(r) : null;
  }catch(e){ NUBE.base = null; }
  return NUBE.base;
}
function nubeBaseEscribir(o){
  NUBE.base = o || {};
  try{ localStorage.setItem(nubeBaseKey(), JSON.stringify(NUBE.base)); }
  catch(e){ console.warn('[nube] no se pudo guardar la referencia para combinar:', e); }
}

/* Errores que NO son falta de internet sino que la base todavía no está
   preparada: falta correr supabase.sql, faltan permisos o falta cargar la
   fila en "miembros". Con internet andando, reintentar no los arregla. */
const NUBE_ERRORES_DE_SETUP = [
  'PGRST202',  /* no existe la función guardar_local */
  'PGRST205',  /* no existe la tabla */
  'PGRST301',  /* la sesión no sirve / no autenticado */
  'PGRST116',  /* la base no devolvió ninguna fila: casi siempre es que las
                  reglas de seguridad la esconden porque la cuenta no figura
                  en "miembros". NO es un problema de internet. */
  '42883',     /* function does not exist */
  '42P01',     /* relation does not exist */
  '42501',     /* permission denied: faltan los GRANT */
  'P0001'      /* raise exception: "Sin permiso para este café" (falta miembros) */
];
function esErrorDeSetup(e){
  if (!e) return false;
  const cod = String(e.code || '');
  const msg = String(e.message || '');
  return NUBE_ERRORES_DE_SETUP.indexOf(cod) >= 0 ||
         /permission denied|does not exist|Sin permiso para este caf/i.test(msg);
}

/* Un solo lugar donde se registran los fallos: sin esto, cuando algo se
   rompía en la base el sistema mostraba "Sin conexión" y no quedaba rastro
   de qué había pasado. */
function nubeFallo(donde, e){
  NUBE.ultimoError = e || null;
  console.error('[nube] ' + donde + ':', e);
  nubeEstado(esErrorDeSetup(e) ? 'configurar' : 'error');
}

/* Hay datos de conexión cargados. No quiere decir que la librería ya esté. */
function nubeConfigurada(){ return !!(NUBE_URL && NUBE_KEY); }

/* La librería de Supabase se baja de internet recién cuando hace falta y
   NUNCA frena el arranque: si la conexión está lenta o caída, el sistema
   abre igual con los datos de la computadora. */
function nubeCargarLibreria(){
  if (!nubeConfigurada()) return Promise.resolve(false);
  if (window.supabase) return Promise.resolve(true);
  return new Promise(resolve => {
    let listo = false;
    const fin = motivo => {
      if (listo) return;
      listo = true;
      if (!window.supabase){
        console.error('[nube] no cargó la librería de Supabase (' + motivo +
          '). Sin ella el sistema trabaja solo en esta computadora. Dirección: ' + NUBE_LIB);
        /* Se saca el <script> que no cargó: esto se reintenta cada tanto y
           si no, al final del día quedan cientos colgando del <head>. */
        s.remove();
      }
      resolve(!!window.supabase);
    };
    const s = document.createElement('script');
    s.src = NUBE_LIB;
    s.onload  = () => fin('cargó el archivo');
    s.onerror = () => fin('no se pudo bajar el archivo: sin internet, o el CDN está bloqueado');
    document.head.appendChild(s);
    setTimeout(() => fin('tardó más de 6 segundos'), 6000);
  });
}
/* ---------- Ninguna espera a la nube puede ser eterna ----------
   Con el Wi-Fi del café a medio caer, una consulta puede quedar colgada sin
   dar error ni contestar nunca. Si alguien la está esperando para dibujar,
   la pantalla se queda en blanco. Pasado el límite se sigue sin ella y se
   reintenta después: los datos de esta computadora alcanzan para trabajar. */
function nubeConLimite(promesa, ms){
  const limite = new Promise(r => setTimeout(() => r({
    data: null, error: { code: 'TIMEOUT', message: 'la nube no contestó en ' + ((ms || 12000) / 1000) + ' s' }
  }), ms || 12000));
  return Promise.race([promesa, limite]);
}

function nubeIniciar(){
  if (!nubeConfigurada() || !window.supabase) return false;
  if (!NUBE.cli) NUBE.cli = window.supabase.createClient(NUBE_URL, NUBE_KEY);
  return true;
}

/* ---------- Sesión ---------- */
async function nubeSesion(){
  if (!nubeIniciar()) return null;
  try{
    const { data } = await NUBE.cli.auth.getSession();
    return data && data.session ? data.session : null;
  }catch(e){ nubeFallo('leyendo la sesión', e); return null; }
}

async function nubeEntrar(email, clave){
  if (!nubeIniciar()) return { ok: false, msg: 'La nube no está configurada' };
  try{
    const { error } = await NUBE.cli.auth.signInWithPassword({ email: email, password: clave });
    if (error){
      console.error('[nube] no se pudo iniciar sesión:', error);
      return { ok: false, msg: 'Usuario o contraseña incorrectos' };
    }
    return { ok: true };
  }catch(e){
    console.error('[nube] no se pudo conectar al iniciar sesión:', e);
    return { ok: false, msg: 'No se pudo conectar con la nube' };
  }
}

async function nubeSalir(){
  if (NUBE.cli) { try{ await NUBE.cli.auth.signOut(); }catch(e){} }
  NUBE.activa = false; NUBE.version = null;
}

/* Cafés a los que tiene acceso la cuenta que inició sesión */
async function nubeMisLocales(){
  if (!nubeIniciar()) return [];
  try{
    /* Con límite, como el resto: sin él, un wifi flojo deja la pantalla de
       ingreso esperando para siempre en vez de avisar que no hay conexión. */
    const { data, error } = await nubeConLimite(NUBE.cli.from('miembros').select('local_id'));
    if (error){ nubeFallo('leyendo "miembros"', error); return []; }
    if (!data || !data.length){
      console.warn('[nube] la cuenta no figura en la tabla "miembros": no va a poder ' +
                   'leer ni guardar ningún café (ver paso 4 de NUBE.md).');
      nubeEstado('configurar');
      return [];
    }
    return data.map(x => x.local_id);
  }catch(e){ nubeFallo('leyendo "miembros"', e); return []; }
}

/* ---------- Bajar ---------- */
async function nubeBajar(localId){
  if (!nubeIniciar()) return null;
  try{
    const { data, error } = await nubeConLimite(NUBE.cli
      .from('locales').select('datos, version').eq('id', localId).single());
    if (error || !data){
      /* Sin la versión de la nube, subir pisaría lo que haya del otro lado:
         se corta la subida hasta poder leer. */
      if (error && error.code === 'PGRST116')
        console.error('[nube] la base no devuelve el café "' + localId + '". La cuenta ' +
          'inició sesión bien, pero no figura en la tabla "miembros" para ese café, ' +
          'así que las reglas de seguridad le esconden la fila. Ver el paso 4 de NUBE.md.');
      nubeFallo('bajando el café "' + localId + '"', error);
      NUBE.activa = false;
      return null;
    }
    NUBE.version = data.version;
    NUBE.activa = true;
    NUBE.fallos = 0;
    return data.datos && Object.keys(data.datos).length ? data.datos : null;
  }catch(e){
    nubeFallo('bajando el café "' + localId + '"', e);
    NUBE.activa = false;
    return null;
  }
}

/* ============================================================
   COMBINAR EL TRABAJO DE DOS COMPUTADORAS
   ------------------------------------------------------------
   El sistema manda el café entero como un solo JSON, no "agregué
   este pedido". Si dos computadoras guardan, la segunda pisaría
   todo lo de la primera. Acá se juntan registro por registro,
   usando el "id" que cada uno tiene.
   ============================================================ */

/* Listas del estado donde cada elemento tiene su propio id */
const NUBE_LISTAS = ['mesas', 'productos', 'proveedores', 'pedidos', 'compras',
                     'cierres', 'cuentas', 'pagosCuenta', 'usuarios', 'movimientos'];
/* Estas se tratan aparte, no como un valor suelto más */
const NUBE_APARTE = NUBE_LISTAS.concat(['config', 'salon', 'guardado']);

/* Texto único de un valor, con las claves siempre en el mismo orden.
   Hace falta ordenarlas porque Postgres devuelve el JSON con las claves
   reacomodadas: comparando el texto crudo, todo parecería distinto. */
function nubeFirma(v){
  if (v === null || typeof v !== 'object') { const t = JSON.stringify(v); return t === undefined ? 'null' : t; }
  if (Array.isArray(v)) return '[' + v.map(nubeFirma).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + nubeFirma(v[k])).join(',') + '}';
}

/* Con qué se identifica un registro. Los guardados viejos pueden no tener
   id: a esos se los identifica por su contenido. */
function nubeClave(x){
  return (x && typeof x === 'object' && x.id != null) ? 'id:' + x.id : 'f:' + nubeFirma(x);
}
function nubeIndice(lista){
  const m = {};
  (Array.isArray(lista) ? lista : []).forEach(x => { m[nubeClave(x)] = x; });
  return m;
}

/* El corazón del asunto: qué versión de un registro sobrevive.
   b = como estaba en la nube la última vez que sincronizamos
   m = como está en esta computadora
   s = como está ahora en la nube (lo que hizo la otra)
   Devuelve undefined si el registro tiene que desaparecer. */
/* ---------- Dos mozos cargando en la misma mesa ----------
   El caso que se perdía: uno agrega un café desde el celular y otro una
   medialuna desde el mostrador, en la misma cuenta. Los dos cambiaron el
   mismo pedido respecto de la referencia, así que era un choque, y en un
   choque ganaba la nube: uno de los dos productos desaparecía y la mesa se
   cobraba de menos.

   Pero un pedido abierto no es un dato que se pisa, es una suma. Cada ítem
   tiene su id (ver migrar), así que se puede resolver por cantidad: lo que
   queda es lo que tenía cada uno menos lo que había antes. Si uno sumó una
   unidad y el otro sumó otra, quedan las dos; si uno lo sacó, se va.

   Solo para pedidos ABIERTOS. Uno ya cobrado no se toca: ahí la cuenta está
   cerrada y cambiarla sería mover plata. Devolver undefined es decir "no sé
   juntarlo", y vuelve a la regla de siempre. */
function nubeJuntarPedido(b, m, s, cuenta){
  if (!m || !s || m.estado !== 'abierto' || s.estado !== 'abierto') return undefined;
  if (!Array.isArray(m.items) || !Array.isArray(s.items)) return undefined;

  const cant = lista => {
    const o = {};
    (Array.isArray(lista) ? lista : []).forEach(i => {
      if (i && i.iid) o[i.iid] = (o[i.iid] || 0) + (Number(i.cant) || 0);
    });
    return o;
  };
  const cb = cant(b && b.items), cm = cant(m.items), cs = cant(s.items);
  /* Los ítems viejos sin iid no se pueden seguir de un lado al otro */
  if (m.items.some(i => !i.iid) || s.items.some(i => !i.iid)) return undefined;

  const porId = {};
  s.items.concat(m.items).forEach(i => { if (!porId[i.iid]) porId[i.iid] = i; });

  const items = [];
  Object.keys(porId).forEach(k => {
    const q = (cm[k] || 0) + (cs[k] || 0) - (cb[k] || 0);
    if (q <= 0) return;                       /* alguno lo sacó */
    const mio = m.items.find(i => i.iid === k), suyo = s.items.find(i => i.iid === k);
    const base = suyo || mio;
    items.push(Object.assign({}, base, {
      cant: q,
      /* Enviado a cocina de un lado ya está enviado */
      enviado: !!((mio && mio.enviado) || (suyo && suyo.enviado))
    }));
  });

  const out = nubeCombinarObjeto(b, m, s, cuenta, ['items']);
  out.items = items;
  return out;
}

function nubeElegir(b, m, s, cuenta, juntar){
  const fb = b === undefined ? null : nubeFirma(b);
  const fm = m === undefined ? null : nubeFirma(m);
  const fs = s === undefined ? null : nubeFirma(s);
  if (fm === null && fs === null) return undefined;
  /* Está de un solo lado: o lo agregó ese lado, o el otro lo borró */
  if (fs === null){
    if (fb === null || fb !== fm) return m;   /* se agregó o se cambió acá: es nuestro */
    /* Está igual que en la referencia y la nube ya no lo tiene. La lectura
       natural es "la otra computadora lo borró"… pero es la MISMA lectura
       que hace una restauración: una copia vieja tampoco lo tiene, y no
       porque alguien lo haya borrado sino porque todavía no existía. Se
       cuentan aparte para que quien llama decida con el total a la vista
       (ver nubeJuntarConLaNube). */
    cuenta.borrados++;
    return cuenta.sinBorrar ? m : undefined;
  }
  if (fm === null) return (fb !== null && fb === fs) ? undefined : s;
  if (fm === fs){
    /* Quedaron iguales de los dos lados. Si además están como en la
       referencia, no los tocó nadie y no hay nada que decidir.
       Pero si los dos cambiaron y llegaron al mismo resultado, sí pasó algo:
       en una mesa con un café, que las dos computadoras muestren dos cafés
       quiere decir que CADA UNA agregó uno, y son tres. Devolver "dos"
       porque coinciden es cobrar de menos. */
    if (fb === null || fb === fm) return m;
    if (juntar){
      const r = juntar(b, m, s, cuenta);
      if (r !== undefined) return r;
    }
    return m;
  }
  if (fb !== null && fb === fm) return s;     /* acá no se tocó: el cambio es de la otra */
  if (fb !== null && fb === fs) return m;     /* la otra no lo tocó: el cambio es nuestro */
  /* Las dos lo editaron. Si es algo que se puede juntar en vez de elegir
     —una cuenta abierta con ítems cargados de los dos lados— se junta y no
     hay nada que perder. */
  if (juntar){
    const r = juntar(b, m, s, cuenta);
    if (r !== undefined) return r;
  }
  cuenta.choques++;                           /* no hay forma de adivinar */
  return s;                                   /* queda el que ya está guardado en la nube */
}

function nubeCombinarLista(base, mio, suyo, cuenta, juntar){
  const ib = nubeIndice(base), im = nubeIndice(mio), is = nubeIndice(suyo);
  const salida = [], puestas = {};
  /* Primero en el orden que tiene la nube, después lo que solo está acá */
  const orden = (Array.isArray(suyo) ? suyo : []).map(nubeClave)
          .concat((Array.isArray(mio) ? mio : []).map(nubeClave));
  orden.forEach(k => {
    if (puestas[k]) return;
    puestas[k] = 1;
    const r = nubeElegir(ib[k], im[k], is[k], cuenta, juntar);
    if (r !== undefined) salida.push(r);
  });
  return salida;
}

function nubeCombinarObjeto(base, mio, suyo, cuenta, saltear){
  const out = {}, claves = {};
  Object.keys(mio  || {}).forEach(k => { claves[k] = 1; });
  Object.keys(suyo || {}).forEach(k => { claves[k] = 1; });
  Object.keys(claves).forEach(k => {
    if (saltear && saltear.indexOf(k) >= 0) return;
    const r = nubeElegir(base ? base[k] : undefined,
                         mio  ? mio[k]  : undefined,
                         suyo ? suyo[k] : undefined, cuenta);
    if (r !== undefined) out[k] = r;
  });
  return out;
}

function nubeProximoNum(c){ return c && typeof c.nextNum === 'number' ? c.nextNum : 1; }

/* ---------- Borrados que SÍ son a propósito ----------
   El sistema no manda "borré el pedido 318", manda el café entero: la otra
   computadora ve una ausencia y tiene que adivinar si fue alguien borrando o
   un accidente. Adivinar es justo lo que salió mal el 7/9/2026, así que el
   que borra a propósito lo deja dicho: un contador que sube de a uno cada
   vez que se usa "Borrar todo" o "Sacar los repetidos". Si lo que llega de
   la nube tiene el contador más alto que la referencia, esas bajas son
   pedidas por una persona y se aplican sin discutir. */
function nubeBorradosAdrede(e){
  const n = e && e.config && e.config.borradosAdrede;
  return typeof n === 'number' ? n : 0;
}

/* ---------- Catálogos: lo que HAY en el café ----------
   Las listas se dividen en dos clases y no se combinan igual:

   - Registro de lo que pasó (pedidos, compras, cierres, pagos, movimientos):
     si un pedido está de un solo lado, es que esa computadora lo cargó.
     Sumar los dos lados es lo correcto.

   - Catálogo de lo que hay (mesas, productos, proveedores, cuentas,
     usuarios): la mesa 5 del café es UNA. Si cada computadora armó su
     salón por su cuenta, la misma mesa quedó con un id distinto en cada
     una; combinando por id sobreviven las dos y en el plano se ven una
     encima de la otra. Por eso los catálogos llevan además una clave
     natural: dos registros con la misma clave son el mismo, tengan el id
     que tengan.                                                          */
const NUBE_CLAVE_NATURAL = {
  mesas:       m => 'mesa:' + m.num,
  productos:   p => 'prod:' + nubeTextoClave(p.nombre),
  proveedores: p => 'prov:' + nubeTextoClave(p.nombre),
  cuentas:     c => 'cta:'  + nubeTextoClave(c.nombre),
  usuarios:    u => 'usr:'  + nubeTextoClave(u.nombre)
};
function nubeTextoClave(s){ return String(s == null ? '' : s).trim().toLowerCase(); }

/* Deja un solo registro por clave natural. "prefiere" decide cuál se queda
   cuando hay repetidos: se usa para no descartar la mesa que tiene una
   cuenta abierta ni el usuario con el que alguien está trabajando. */
function nubeSacarDuplicados(lista, clave, prefiere){
  if (!Array.isArray(lista)) return [];
  const donde = {}, salida = [];
  let sacados = 0;
  lista.forEach(x => {
    if (!x || typeof x !== 'object'){ salida.push(x); return; }
    const k = clave(x);
    if (donde[k] === undefined){ donde[k] = salida.length; salida.push(x); return; }
    sacados++;
    if (prefiere && prefiere(x) && !prefiere(salida[donde[k]])) salida[donde[k]] = x;
  });
  salida.sacados = sacados;
  return salida;
}

/* Limpia los catálogos de un estado ya armado. Sirve tanto después de
   combinar como al abrir el sistema, para arreglar lo que quedó repetido
   de antes. Devuelve cuántos registros se sacaron. */
function nubeLimpiarCatalogos(estado){
  if (!estado) return 0;
  const enUso = {};
  (estado.pedidos || []).forEach(p => { if (p && p.estado === 'abierto' && p.mesaId) enUso[p.mesaId] = 1; });
  const activo = (typeof USUARIO !== 'undefined' && USUARIO) ? USUARIO.id : null;
  let total = 0;
  Object.keys(NUBE_CLAVE_NATURAL).forEach(k => {
    const prefiere = k === 'mesas'    ? (m => !!enUso[m.id])
                   : k === 'usuarios' ? (u => u.id === activo)
                   : null;
    const r = nubeSacarDuplicados(estado[k], NUBE_CLAVE_NATURAL[k], prefiere);
    total += r.sacados || 0;
    estado[k] = r;
  });
  /* Los elementos del salón no tienen nombre, así que se los separa por tipo:

     - De los que hay UNO SOLO en un café (la barra, la cocina, los baños, la
       entrada) alcanza con el tipo y el texto. No importa dónde estén: si
       aparecen dos cocinas, una sobra. Comparar también la posición no
       servía, porque basta que en una computadora la hayan corrido un poco
       para que parezcan dos cosas distintas.
     - De los que puede haber muchos iguales y legítimos (ventanas, paredes,
       plantas) solo se sacan los que están en el mismo lugar exacto. Dos
       ventanas en paredes distintas son dos ventanas de verdad.            */
  const EL_UNICOS = ['barra', 'cocina', 'bano', 'deposito', 'puerta', 'escalera', 'sector'];
  if (estado.salon && Array.isArray(estado.salon.elementos)){
    const r = nubeSacarDuplicados(estado.salon.elementos, e =>
      EL_UNICOS.indexOf(e.tipo) >= 0
        ? 'el:' + e.tipo + '|' + nubeTextoClave(e.texto)
        : 'el:' + [e.tipo, nubeTextoClave(e.texto), e.x, e.y, e.w, e.h].join('|'), null);
    total += r.sacados || 0;
    estado.salon.elementos = r;
  }
  return total;
}

/* Junta los tres estados y devuelve uno solo */
/* Cuántos registros tiene un café. Es la medida con la que se decide si algo
   "tiene datos" o "está vacío": sirve igual para lo de acá, lo de la nube y
   el resultado de combinar. */
function nubeCuantos(e){
  if (!e || typeof e !== 'object') return 0;
  return NUBE_LISTAS.reduce((a, k) => a + (Array.isArray(e[k]) ? e[k].length : 0), 0);
}

/* Hasta acá se cree que fue alguien borrando a mano: anular un pedido, sacar
   un producto que ya no va. Pasado ese número no es una persona trabajando,
   es un accidente (ver nubeJuntarConLaNube). */
const NUBE_BORRADOS_DE_A_UNO = 3;

/* ---------- ¿La nube volvió atrás en el tiempo? ----------
   Una restauración es la única forma de que la nube pase a tener algo MÁS
   VIEJO de lo que ya nos había dado. Se nota comparando la fecha de guardado
   de lo que llega contra la de la referencia: hacia adelante siempre crece.
   Si retrocede, lo que falta no lo borró nadie —la copia vieja todavía no lo
   tenía— y hacerle caso a esa ausencia borra trabajo bueno.
   El reloj de cada computadora puede estar corrido, así que esto puede dar
   una falsa alarma. No importa: equivocarse acá significa NO borrar, que es
   el lado seguro del error. */
function nubeVolvioAtras(remoto, base){
  const fr = remoto && remoto.guardado, fb = base && base.guardado;
  if (!fr || !fb) return false;
  return String(fr) < String(fb);
}

/* ---------- La copia de antes de sincronizar ----------
   El 7/9/2026 esta computadora tenía dos horas de pedidos que la nube no
   tenía; al sincronizarse con una copia restaurada los perdió, y no había
   de dónde volver. Ahora, cada vez que una sincronización saca registros de
   acá, primero se guarda cómo estaba todo. Vive en esta computadora, es una
   sola —la última— y se recupera con nubeVolverAtras() desde la consola. */
function nubeCopiaKey(){ return 'cafe_antes_v1_' + LOCAL; }
function nubeGuardarCopiaLocal(motivo){
  try{
    localStorage.setItem(nubeCopiaKey(), JSON.stringify({
      cuando: new Date().toISOString(), motivo: motivo, datos: S
    }));
  }catch(e){ console.warn('[nube] no se pudo guardar la copia de antes:', e); }
}
function nubeVolverAtras(){
  let c = null;
  try{ c = JSON.parse(localStorage.getItem(nubeCopiaKey()) || 'null'); }catch(e){}
  if (!c || !c.datos){ console.log('[nube] no hay copia guardada en esta computadora.'); return false; }
  console.log('[nube] volviendo a como estaba el ' + c.cuando + ' (' +
              nubeCuantos(c.datos) + ' registros). Motivo de la copia: ' + c.motivo);
  S = c.datos;
  try{ localStorage.setItem(KEY(), JSON.stringify(S)); }catch(e){}
  /* Se olvida la referencia: con la copia puesta, lo que la nube tenga hay
     que volver a mirarlo de cero en vez de restarle lo que ya no vale. */
  nubeBaseEscribir({});
  if (typeof refresh === 'function'){ try{ refresh(); }catch(e){} }
  nubeGuardar(300);
  return true;
}

/* Frena TODO el guardado a la nube y avisa. Se usa cuando lo que estaba por
   pasar era una pérdida de datos: es preferible quedarse sin sincronizar —los
   datos siguen enteros en cada computadora— que sincronizar un borrado.
   No se destraba solo: hay que recargar, ya mirando qué pasó. */
function nubeTrabar(motivo){
  NUBE.trabado = true;
  NUBE.pendiente = false;
  clearTimeout(NUBE.timer);
  console.error('[nube] GUARDADO FRENADO para no borrar datos: ' + motivo);
  nubeEstado('conflicto');
  if (typeof toast === 'function')
    toast('⛔ Guardado frenado: se evitó borrar datos. No cierres sin avisar.');
  const el = document.getElementById('nubeEstado');
  if (el) el.title = 'Guardado frenado: ' + motivo;
}

function nubeCombinar(base, mio, suyo, sinBorrar){
  const cuenta = { choques: 0, borrados: 0, sinBorrar: !!sinBorrar };
  base = base || {}; mio = mio || {}; suyo = suyo || {};
  const out = nubeCombinarObjeto(base, mio, suyo, cuenta, NUBE_APARTE);
  /* Los pedidos son la única lista que sabe juntarse en vez de elegir un
     lado (ver nubeJuntarPedido); el resto sigue la regla común. */
  NUBE_LISTAS.forEach(k => {
    out[k] = nubeCombinarLista(base[k], mio[k], suyo[k], cuenta,
                               k === 'pedidos' ? nubeJuntarPedido : null);
  });
  out.config = nubeCombinarObjeto(base.config, mio.config, suyo.config, cuenta);
  /* El número de pedido es un contador compartido: se toma el más alto
     para no repetir. Aun así, dos pedidos abiertos en el mismo instante
     pueden salir con el mismo número. */
  out.config.nextNum = Math.max(nubeProximoNum(mio.config), nubeProximoNum(suyo.config));
  /* El contador de borrados a propósito tampoco se combina: se toma el más
     alto, así el aviso no se pierde por el camino. */
  out.config.borradosAdrede = Math.max(nubeBorradosAdrede(mio), nubeBorradosAdrede(suyo));
  out.salon = nubeCombinarObjeto(base.salon, mio.salon, suyo.salon, cuenta, ['elementos']);
  out.salon.elementos = nubeCombinarLista((base.salon || {}).elementos,
                                          (mio.salon  || {}).elementos,
                                          (suyo.salon || {}).elementos, cuenta);
  /* Solo se pone la fecha si alguno la tenía: dejar la clave con "undefined"
     haría que el estado combinado nunca parezca igual al de la nube, y las
     dos computadoras se estarían subiendo cambios la una a la otra sin fin. */
  const g = (mio.guardado || '') > (suyo.guardado || '') ? mio.guardado : suyo.guardado;
  if (g !== undefined) out.guardado = g;
  /* Sin referencia previa, combinar por id deja los dos juegos de mesas y
     productos que cada computadora había armado por su cuenta. */
  /* Acá se sacaban los repetidos en cada sincronización, sin preguntar. Iban
     por nombre —dos productos que se llamen igual son el mismo, dos usuarios
     también— y eso convierte una coincidencia legítima en un borrado: si en
     el café trabajan dos Martín, uno se quedaba sin poder entrar, y nadie se
     enteraba de por qué.
     El propio sistema ya decía cuál era la forma correcta: migrar() aclara
     que lo repetido NO se saca solo al abrir, porque borrar registros sin
     que nadie lo pida es peligroso, y para eso está el botón "Sacar los
     repetidos" de Ajustes, que muestra qué se va a sacar y pide confirmar.
     Además, los duplicados venían de una computadora que arrancaba vacía y
     sumaba su café de ejemplo al de verdad, y eso ya no puede pasar. */
  return { estado: out, choques: cuenta.choques, repetidos: 0,
           borrados: cuenta.borrados };
}

/* Repinta la pantalla, salvo que el usuario esté en el medio de algo:
   con un formulario abierto no se le mueve la pantalla de abajo. */
function nubeRepintar(){
  NUBE.repintar = true;
  if (typeof USUARIO === 'undefined' || !USUARIO) return;   /* todavía no entró */
  const ovl = document.getElementById('ovl');
  const log = document.getElementById('login');
  if ((ovl && !ovl.hidden) || (log && !log.hidden)) return;  /* ocupado: más tarde */
  if (typeof refresh !== 'function' || typeof VIEW === 'undefined' || !VIEW) return;
  NUBE.repintar = false;
  try{ refresh(); }catch(e){ console.error('[nube] repintando la pantalla:', e); }
}

/* Trae lo que hay en la nube, lo junta con lo de acá y deja el resultado
   en pantalla. Si quedó algo nuestro sin subir, lo programa para subir. */
function nubeJuntarConLaNube(remoto, tomarLaNubeSinCombinar){
  remoto = (remoto && Object.keys(remoto).length) ? remoto : null;
  if (!remoto){ nubeBaseEscribir({}); nubeGuardar(300); return; }
  const base = nubeBaseLeer();

  /* ---------- Arrancar en blanco NO es borrar ----------
     Acá se perdieron los datos dos veces, el 7/9/2026. El mecanismo: una
     computadora que abre sin datos guardados —porque es nueva, porque se
     abrió el sistema desde otra dirección, porque se limpió el navegador—
     conserva igual la nota de "así estaba la nube la última vez". Al
     combinar, el sistema veía los 309 pedidos en la nube, veía que la nota
     decía que esos mismos 309 ya estaban, y no encontraba ninguno acá.
     Conclusión: "los borró el usuario". Y los borraba de los dos lados.
     Pero una computadora que arranca vacía no está borrando nada: está
     arrancando. Si acá no hay NADA y en la nube hay algo, no se combina:
     se toma lo de la nube tal cual, que es lo que ya se hacía cuando el
     sistema se abría por primera vez y armaba el café de ejemplo. */
  const tengoAca = nubeCuantos(S);
  const enLaNube = nubeCuantos(remoto);
  const arrancoEnBlanco = tomarLaNubeSinCombinar || (tengoAca === 0 && enLaNube > 0);
  if (arrancoEnBlanco && !tomarLaNubeSinCombinar)
    console.warn('[nube] esta computadora abrió sin datos y la nube tiene ' + enLaNube +
                 ' registros: se toma lo de la nube sin combinar, para no borrarlos.');

  let res = arrancoEnBlanco
    ? { estado: JSON.parse(JSON.stringify(remoto)), choques: 0, repetidos: 0, borrados: 0 }
    : nubeCombinar(base, S, remoto);

  /* ---------- Restaurar no es borrar ----------
     El otro agujero del 7/9/2026, y el más traicionero: se abre justo cuando
     se está recuperando de un problema. Esta computadora tenía 318 pedidos y
     su referencia decía que la nube tenía esos mismos 318. Al restaurar la
     copia de 309, los nueve que faltaban entraron por el camino de "la otra
     computadora los borró" y se borraron acá también. El candado no los
     atajó: nueve de seiscientos registros ni se acercan a la mitad.

     Se toman por buenos los borrados de a uno —alguien anula un pedido, saca
     un producto— pero no una desaparición en montón, ni ninguna si la nube
     volvió atrás en el tiempo. En esos casos se rehace la combinación sin
     aceptar bajas: lo nuestro se conserva y se vuelve a subir. Si de verdad
     alguien había borrado algo, vuelve a aparecer y se borra de nuevo; el
     error cuesta un minuto, y al revés cuesta el día de trabajo. */
  const restaura = nubeVolvioAtras(remoto, base);
  const loPidieron = nubeBorradosAdrede(remoto) > nubeBorradosAdrede(base);
  let copiaHecha = false;
  if (!arrancoEnBlanco && !loPidieron && res.borrados > 0 &&
      (restaura || res.borrados > NUBE_BORRADOS_DE_A_UNO)){
    const motivo = restaura
      ? 'la nube volvió a una copia anterior (' + remoto.guardado + ')'
      : 'desaparecieron ' + res.borrados + ' registros de golpe';
    console.warn('[nube] ' + motivo + ': se conservan los ' + res.borrados +
                 ' registros de esta computadora en vez de borrarlos.');
    nubeGuardarCopiaLocal(motivo);
    copiaHecha = true;
    res = nubeCombinar(base, S, remoto, true);
    if (typeof toast === 'function' && typeof USUARIO !== 'undefined' && USUARIO)
      toast('⚠ Se recuperaron ' + res.borrados + ' registro(s) que la nube no tenía');
  }

  /* ---------- El candado ----------
     Red de seguridad para cualquier otro camino que termine borrando de
     golpe. Un café no pasa de 309 pedidos a 0 por las buenas: si el
     resultado se lleva puesto casi todo lo que hay en la nube, se frena
     todo —no se aplica, no se sube— y se avisa en pantalla. Lo único que
     puede vaciar un café es pedirlo a mano desde Ajustes, y eso avisa que
     viene (ver NUBE.borradoAdrede en borrarTodo). */
  const quedaria = nubeCuantos(res.estado);
  if (!NUBE.borradoAdrede && enLaNube >= 10 && quedaria < enLaNube / 2){
    nubeTrabar('la combinación dejaba ' + quedaria + ' registros de los ' + enLaNube +
               ' que hay en la nube');
    return;
  }

  /* Un choque también es una pérdida, más chica: lo que se editó acá quedó
     pisado por la versión de la otra computadora. Va a la misma copia, salvo
     que ya se haya guardado una por algo más grave. */
  if (res.choques && !copiaHecha)
    nubeGuardarCopiaLocal(res.choques + ' cambio(s) pisados por la otra computadora');

  nubeBaseEscribir(remoto);                 /* esto es lo que la nube tiene ahora */
  const cambio = nubeFirma(res.estado) !== nubeFirma(S);
  S = res.estado;
  /* Completa lo que falte, igual que al abrir el sistema */
  if (typeof DEFAULT_STATE !== 'undefined'){
    S = Object.assign(structuredClone(DEFAULT_STATE), S);
    S.config = Object.assign({}, DEFAULT_STATE.config, S.config || {});
    S.salon  = Object.assign({}, DEFAULT_STATE.salon,  S.salon  || {});
  }
  if (typeof migrar === 'function'){ try{ migrar(); }catch(e){ console.error('[nube] migrar():', e); } }
  try{ localStorage.setItem(KEY(), JSON.stringify(S)); }catch(e){}
  if (res.choques){
    console.warn('[nube] ' + res.choques + ' registro(s) se editaron en las dos computadoras ' +
                 'a la vez; quedó la versión que ya estaba en la nube.');
    if (typeof toast === 'function' && typeof USUARIO !== 'undefined' && USUARIO)
      toast('⚠ La otra computadora cambió lo mismo — quedó su versión');
  }
  /* ¿Quedó algo nuestro que la nube no tiene? Se compara sobre una copia
     pasada por JSON, que es exactamente lo que se subiría: así una clave
     sobrante no dispara un guardado eterno entre las dos computadoras. */
  let limpio = null;
  try{ limpio = JSON.parse(JSON.stringify(S)); }catch(e){}
  if (!limpio || nubeFirma(limpio) !== nubeFirma(remoto)) nubeGuardar(300);
  else nubeEstado('sincronizado');
  if (cambio) nubeRepintar();
}

/* ---------- Mirar si la otra computadora guardó algo ----------
   Cada tanto se pide SOLO el número de versión (no los datos), y recién
   si cambió se baja el café. Así la pantalla se actualiza sola y no hace
   falta apretar F5.                                                     */
async function nubeMirarNovedades(){
  if (NUBE.repintar) nubeRepintar();
  if (document.visibilityState !== 'visible') return;
  if (!NUBE.activa){ await nubeReconectar(); return; }
  /* Tener algo nuestro sin subir ya NO frena esta lectura. Antes sí, y en
     pleno servicio la pantalla se quedaba vieja: cada toque en un pedido
     reprograma la subida, así que "pendiente" quedaba prendido minutos
     enteros y en todo ese rato no se miraba lo que hacía la otra
     computadora. Bajar y combinar no pierde lo de acá: para eso está la
     base de referencia, y si queda algo sin subir se reprograma solo. */
  if (NUBE.guardando || !S) return;
  if (!nubeIniciar() || !LOCAL) return;
  try{
    const { data, error } = await nubeConLimite(NUBE.cli
      .from('locales').select('version').eq('id', LOCAL).single(), 8000);
    if (error || !data || data.version === NUBE.version) return;
    const full = await nubeConLimite(NUBE.cli
      .from('locales').select('datos, version').eq('id', LOCAL).single());
    if (full.error || !full.data) return;
    /* Mientras se bajaba pudo arrancar una subida, que ya mandó la versión
       vieja: combinar ahora se la cambiaría abajo de los pies. Se deja para
       la próxima vuelta, dentro de 8 segundos. */
    if (NUBE.guardando) return;
    NUBE.version = full.data.version;
    nubeJuntarConLaNube(full.data.datos);
  }catch(e){ /* es un chequeo de fondo: si falla, se reintenta en la próxima */ }
}
setInterval(nubeMirarNovedades, 8000);

/* ---------- Volver a conectar sin recargar ----------
   Si el café abre con el internet caído, o si se corta un rato largo, la
   nube queda apagada (NUBE.activa = false) y hasta ahora la única forma de
   revivirla era apretar F5. El evento "online" no alcanza: avisa cuando
   cambia la placa de red, y el Wi-Fi del café puede seguir prendido con el
   internet caído, así que nunca llega. Por eso se reintenta solo.        */
async function nubeReconectar(){
  if (NUBE.activa || !nubeConfigurada()) return false;
  const ahora = Date.now();
  if (ahora - NUBE.reconecta < 30000) return false;   /* sin insistir de más */
  NUBE.reconecta = ahora;
  if (!(await nubeCargarLibreria())) return false;
  if (!(await nubeSesion())) return false;
  NUBE.activa = true;
  /* Se BAJA antes de subir. Sin la versión de la nube, guardar_local pisa
     lo que haya del otro lado sin preguntar: si mientras estábamos sin
     internet la otra computadora trabajó, subir primero le borraría el
     turno entero. cargarDesdeNube() lee, combina y recién ahí sube. */
  if (typeof cargarDesdeNube === 'function') await cargarDesdeNube();
  if (NUBE.activa) nubeRepintar();
  return NUBE.activa;
}

/* ---------- Subir ----------
   Se llama solo, con un respiro de unos segundos, para no mandar
   una copia por cada toque en la pantalla.                        */
function nubeGuardar(demora){
  if (!NUBE.activa || NUBE.trabado) return;
  NUBE.pendiente = true;
  if (NUBE.estado !== 'error' && NUBE.estado !== 'configurar') nubeEstado('guardando');
  clearTimeout(NUBE.timer);
  NUBE.timer = setTimeout(nubeSubirAhora, demora == null ? 4000 : demora);
}

/* Cuando falla se vuelve a intentar solo, esperando cada vez un poco más
   (4 s, 8 s, 16 s… hasta 2 minutos). Antes, si una subida fallaba el cambio
   quedaba sin subir hasta que alguien tocara otra cosa. */
function nubeReintentar(){
  NUBE.fallos++;
  const espera = Math.min(120000, 4000 * Math.pow(2, NUBE.fallos - 1));
  NUBE.pendiente = true;
  clearTimeout(NUBE.timer);
  NUBE.timer = setTimeout(nubeSubirAhora, espera);
}

async function nubeSubirAhora(){
  if (!NUBE.activa || NUBE.guardando || NUBE.trabado || !S) return;
  /* Sin la versión de la nube, guardar_local pisa lo que haya del otro lado
     sin preguntar: es la puerta por la que una computadora recién abierta
     puede borrarle el día entero a la otra. Si no se sabe, primero se baja. */
  if (NUBE.version == null){
    console.warn('[nube] no se sube todavía: falta leer la versión de la nube.');
    if (typeof cargarDesdeNube === 'function') cargarDesdeNube();
    return;
  }
  NUBE.guardando = true; NUBE.pendiente = false;
  let fallo = false;
  /* Se manda una copia congelada: S puede cambiar mientras se espera la
     respuesta, y la referencia tiene que ser exactamente lo que se subió. */
  let enviado;
  try{ enviado = JSON.parse(JSON.stringify(S)); }
  catch(e){ NUBE.guardando = false; nubeFallo('preparando los datos', e); return; }
  try{
    /* ---------- Con límite de tiempo, como todas las demás ----------
       Esta era la única llamada a la nube sin corte, y es la que más tarda
       porque manda el café entero. Con el wifi del local flojo la petición
       se queda colgada sin resolverse nunca, y "guardando" no se apaga más.
       A partir de ahí esa computadora se congela: no vuelve a subir nada
       —nubeSubirAhora arranca con "if (NUBE.guardando) return"— y tampoco
       mira lo que hacen las otras, porque nubeMirarNovedades corta por lo
       mismo. La pantalla se queda vieja y la única salida es F5. Pasó en el
       café el 7 y el 8/9/2026.
       Si la subida llegó igual y lo que se perdió fue la respuesta, el
       reintento manda la versión anterior, la base contesta "hay conflicto"
       y se combina: el camino de siempre, sin pisar nada. */
    const { data, error } = await nubeConLimite(NUBE.cli.rpc('guardar_local', {
      p_local: LOCAL, p_datos: enviado, p_version: NUBE.version
    }), 30000);
    const r = Array.isArray(data) ? data[0] : data;
    if (error){
      nubeFallo('guardando el café "' + LOCAL + '"', error);
      fallo = true;
    } else if (!r){
      nubeFallo('guardando el café "' + LOCAL + '"', { message: 'La base no devolvió respuesta' });
      fallo = true;
    } else if (r.ok === false){
      /* La otra computadora guardó primero. No se pisa su trabajo: se junta
         con el nuestro y se vuelve a subir el resultado. */
      NUBE.version = r.version;
      NUBE.fallos = 0;
      NUBE.choques++;
      NUBE.guardando = false;                 /* nubeGuardar() necesita esto libre */
      nubeJuntarConLaNube(r.datos);
      if (NUBE.choques > 8) nubeGuardar(15000);  /* las dos escriben sin parar: aflojar */
      return;
    } else {
      NUBE.version = r.version;
      NUBE.fallos = 0;
      NUBE.choques = 0;
      /* El permiso para vaciar el café dura un solo guardado: es el que sube
         el borrado pedido desde Ajustes. Sin esto la marca quedaba prendida
         hasta cerrar la pestaña, y el candado —lo único que ataja un borrado
         masivo— pasaba el resto del día apagado en esa computadora. */
      NUBE.borradoAdrede = false;
      nubeBaseEscribir(enviado);              /* ahora la nube tiene esto */
      nubeEstado('sincronizado');
    }
  }catch(e){ nubeFallo('guardando el café "' + LOCAL + '"', e); fallo = true; }
  NUBE.guardando = false;
  if (fallo) nubeReintentar();
  else if (NUBE.pendiente) nubeGuardar();
}

/* Guarda ya mismo, sin esperar: al cerrar caja o al salir */
async function nubeGuardarYa(){
  clearTimeout(NUBE.timer);
  if (!NUBE.activa) return;
  /* Si justo hay una subida en curso se espera a que termine y se manda de
     nuevo, así los últimos cambios no se quedan afuera. */
  let vueltas = 0;
  while (NUBE.guardando && vueltas++ < 100) await new Promise(r => setTimeout(r, 120));
  await nubeSubirAhora();
}

/* ---------- Cartelito de estado ---------- */
function nubeEstado(e){
  NUBE.estado = e;
  const el = document.getElementById('nubeEstado');
  if (!el) return;
  const txt = {
    local:        ['⚠ Solo en esta PC',  'warn'],
    guardando:    ['⏳ Guardando…',       'gray'],
    sincronizado: ['☁ Guardado',         'ok'],
    conflicto:    ['⚠ Revisar',           'warn'],
    configurar:   ['⚠ Falta configurar',  'bad'],
    error:        ['⚠ Sin conexión',      'bad']
  }[e] || ['', 'gray'];
  el.className = 'pill ' + txt[1];
  el.textContent = txt[0];
  el.title = e === 'error'
    ? 'No se pudo guardar en la nube. Los datos están guardados en esta computadora y se van a subir cuando vuelva internet.'
    : e === 'configurar'
      ? 'Hay internet, pero la base rechaza el pedido: falta correr supabase.sql o falta dar de alta esta cuenta en "miembros" (ver NUBE.md). Los datos están guardados en esta computadora.'
      : e === 'conflicto'
        ? 'Otra computadora guardó cambios. Cerrá y volvé a entrar para traer la versión más nueva.'
        : e === 'sincronizado' ? 'Los datos están guardados en la nube.' : '';
}

/* ---------- Revisión desde la consola ----------
   Escribiendo nubeRevisar() en la consola del navegador (F12) se ve, paso
   por paso, en cuál de las cinco cosas falla la nube.                    */
async function nubeRevisar(){
  const r = { configurada: nubeConfigurada() };
  console.log('1) Datos de conexión cargados:', r.configurada);
  if (!nubeIniciar()){ console.log('   Falta la librería de Supabase (¿sin internet?)'); return r; }
  const s = await nubeSesion();
  r.sesion = s && s.user ? s.user.email : null;
  console.log('2) Sesión iniciada como:', r.sesion || 'NADIE — hay que ingresar');
  const mi = await NUBE.cli.from('miembros').select('local_id, rol');
  r.miembros = mi.error ? ('ERROR ' + (mi.error.code || '') + ' ' + mi.error.message) : mi.data;
  console.log('3) Cafés de esta cuenta (tabla miembros):', r.miembros);
  const lo = await NUBE.cli.from('locales').select('id, version');
  r.locales = lo.error ? ('ERROR ' + (lo.error.code || '') + ' ' + lo.error.message) : lo.data;
  console.log('4) Cafés que puede leer (tabla locales):', r.locales);
  /* La versión -1 nunca coincide con la real: la función contesta "hay
     conflicto" y no pisa nada, así que probar es inofensivo. */
  const fn = await NUBE.cli.rpc('guardar_local', { p_local: LOCAL, p_datos: S || {}, p_version: -1 });
  r.funcion = fn.error ? ('ERROR ' + (fn.error.code || '') + ' ' + fn.error.message) : 'OK';
  console.log('5) Función guardar_local:', r.funcion);
  if (fn.error && fn.error.code === 'PGRST202')
    console.log('   >>> La función no existe en la base: hay que correr supabase.sql en el SQL Editor de Supabase.');
  return r;
}

/* Al volver la conexión: si ya estaba conectado, sube lo pendiente; si había
   arrancado sin internet, se conecta solo sin necesidad de recargar. */
window.addEventListener('online', () => {
  NUBE.fallos = 0;                              /* la espera vuelve a empezar corta */
  if (NUBE.activa){ nubeGuardar(500); return; }
  NUBE.reconecta = 0;                           /* volvió la red: probar ya, sin esperar */
  nubeReconectar();
});

/* Al minimizar o cambiar de pestaña se aprovecha para guardar ya:
   es el momento más confiable, "beforeunload" muchas veces no llega. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden'){
    if (NUBE.activa && NUBE.pendiente) nubeSubirAhora();
  } else {
    /* Al volver a la pantalla se mira enseguida si la otra computadora
       guardó algo, sin esperar los 8 segundos del control de fondo. */
    nubeMirarNovedades();
  }
});

/* El celular no siempre avisa con "visibilitychange": volviendo con el botón
   de atrás la página sale de la memoria del navegador (pageshow) y, al
   desbloquear la pantalla, a veces lo único que llega es el foco. Se mira en
   los tres casos; la consulta es solo el número de versión. */
window.addEventListener('pageshow', () => nubeMirarNovedades());
window.addEventListener('focus',    () => nubeMirarNovedades());
