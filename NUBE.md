# Guardar los datos en la nube (Supabase)

Con esto los datos dejan de vivir solo en la computadora del café: se guardan
también en internet. Si la computadora se rompe, no se pierde nada, y la dueña
puede entrar a ver los dos cafés desde otra computadora.

El sistema **sigue funcionando sin internet**: guarda en la computadora como
siempre y sube la copia cuando vuelve la conexión.

---

## 1. Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta (es gratis).
2. **New project**. Ponele de nombre `cafes`, elegí una contraseña para la base
   y como región **South America (São Paulo)**, que es la más cercana.

   > La contraseña de la base **no se escribe acá ni en ningún archivo del
   > sistema**: este repositorio es público. Guardala en el administrador de
   > claves del navegador o en un papel.
3. Esperá unos minutos a que termine de crearse.

## 2. Crear las tablas

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Abrí el archivo `supabase.sql` de esta carpeta, copiá **todo** el contenido y
   pegalo ahí.
3. Botón **Run**. Tiene que decir *Success*.

## 3. Crear los usuarios de cada computadora

En **Authentication** → **Users** → **Add user** → *Create new user*.
Creá tres, con la contraseña que quieras (anotalas):

| Correo                | Para qué                                  |
|-----------------------|-------------------------------------------|
| `valdez@tucafe.com`   | la computadora de Lo de Valdez            |
| `eva@tucafe.com`      | la computadora de Evacafé                 |
| `duena@tucafe.com`    | la dueña, para ver los dos desde su casa  |

> Marcá **Auto Confirm User** para que no pidan confirmar por mail.

## 4. Decir quién entra a qué café

Volvé a **SQL Editor** → **New query**, pegá esto y dale **Run**:

```sql
-- La computadora de Lo de Valdez entra solo a Lo de Valdez
insert into public.miembros (user_id, local_id, rol)
select id, 'valdez', 'cafe' from auth.users where email = 'valdez@tucafe.com';

-- La computadora de Evacafé entra solo a Evacafé
insert into public.miembros (user_id, local_id, rol)
select id, 'eva', 'cafe' from auth.users where email = 'eva@tucafe.com';

-- La dueña entra a los dos
insert into public.miembros (user_id, local_id, rol)
select id, 'valdez', 'duena' from auth.users where email = 'duena@tucafe.com';
insert into public.miembros (user_id, local_id, rol)
select id, 'eva', 'duena' from auth.users where email = 'duena@tucafe.com';
```

Cambiá los correos por los que hayas usado.

## 5. Conectar el sistema

1. En Supabase: **Project Settings** (el engranaje) → **API**.
2. Copiá **Project URL** y la clave **anon public**.
3. Abrí `js/00-nube.js` y pegalas en las dos primeras líneas:

```js
const NUBE_URL  = 'https://xxxxxxxxxxxx.supabase.co';
const NUBE_KEY  = 'eyJhbGciOi...';   // la clave anon public, larga
```

Esa clave **no es secreta**: sola no sirve para nada. Lo que protege los datos
son las reglas de seguridad del paso 2, que corren en el servidor de Supabase.

## 6. Subir los datos que ya tenés

En cada café, la primera vez:

1. Entrá al sistema con el correo y contraseña de esa computadora.
2. **Ajustes → ⬆ Restaurar respaldo** y cargá el `.json` de ese café.
3. Listo: se sube solo. En Ajustes vas a ver **☁ Guardado en la nube**.

---

## Cómo saber que está funcionando

Abajo de todo en la barra lateral hay un cartelito:

- **☁ Guardado** — todo subido
- **⏳ Guardando…** — está mandando los cambios
- **⚠ Sin conexión** — se cortó internet. Se sigue trabajando normal y se sube solo cuando vuelve
- **⚠ Falta configurar** — hay internet, pero la base rechaza el pedido (ver abajo)
- **⚠ Solo en esta PC** — falta configurar los pasos de arriba

---

## Si dice "Falta configurar" (o no se guarda nada en la base)

Quiere decir que el sistema entró bien pero la base no acepta lo que le manda.
Casi siempre es una de estas dos:

1. **El paso 2 no se corrió, o se cortó por la mitad.** Es lo más común.
   Volvé a **SQL Editor → New query**, pegá todo `supabase.sql` de nuevo y dale
   **Run**. Se puede correr las veces que haga falta, no rompe nada ni borra
   datos. Al final tiene que mostrar una fila con:

   | tablas | funciones | politicas |
   |--------|-----------|-----------|
   | 3      | 2         | 5         |

   Si algún número es menor, mirá el mensaje de error rojo: el script se cortó ahí.

2. **Falta el paso 4**: la cuenta con la que entraste no está en la tabla
   `miembros`, así que la base no le deja ver ningún café.

### Para ver exactamente qué falla

En la computadora del café, con el sistema abierto: **F12** → pestaña
**Console** → escribí `nubeRevisar()` y Enter. Va a listar los cinco puntos
(conexión, sesión, `miembros`, `locales`, función `guardar_local`) y marcar en
cuál se traba. Los errores de la nube también quedan escritos ahí solos.

> Mientras tanto **no se pierde nada**: todo se sigue guardando en la
> computadora y se sube apenas la base quede bien.

---

## Seguridad

Lo que quedó protegido:

- **Los datos no son públicos.** Sin usuario y contraseña, Supabase no entrega
  nada. Aunque alguien tenga la dirección del sistema y la clave `anon`, la base
  le responde vacío.
- **Cada café ve solo lo suyo.** Está puesto en el servidor, no en el navegador:
  aunque alguien toque el código desde la computadora del café, la base rechaza
  el pedido de los datos del otro café.
- **Nadie puede borrar un café** desde el sistema: no existe el permiso.
- **Los respaldos no se pueden alterar.** Cada guardado deja una copia (se
  conservan las últimas 200). Si algo se rompe, se puede volver atrás.
- **Las claves de los usuarios ya no se guardan escritas**, se guarda una huella
  imposible de revertir. Al editar un usuario, el campo aparece vacío: si lo
  dejás así, la clave no cambia.

Lo que conviene tener claro:

- El PIN de 4 números sirve para separar mozo de encargado en el día a día, no
  para frenar a alguien decidido: son 10.000 combinaciones. Lo que de verdad
  protege los datos es la contraseña de la nube.
- Quien tenga la computadora del café con la sesión abierta puede ver y cambiar
  los datos **de ese café**. Por eso conviene que la computadora tenga clave de
  Windows y que la sesión de la dueña no quede abierta ahí.
