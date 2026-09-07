/* ============================================================
   INICIO
   ============================================================ */

/* Arranca el sistema con los datos del local ya elegido */
async function arrancarLocal(){
  load();                                   /* lo guardado en esta computadora */
  /* La nube NO frena el dibujo. Antes se esperaba su respuesta para recién
     ahí mostrar el salón, y esa espera no tenía límite: con el internet del
     café lento o a medio caer, la pantalla se quedaba en blanco hasta que
     contestara —ese es el rato en que hay que apretar F5, porque recargar
     vuelve a intentar y la segunda vez suele entrar—. Ahora se pinta con lo
     que hay guardado en esta computadora y lo de la nube entra cuando llega:
     nubeJuntarConLaNube() repinta solo al combinarlo.
     La excepción es el arranque en blanco: si esta computadora nunca vio el
     café, lo único que hay para mostrar es el ejemplo recién armado, así que
     ahí sí se espera a la nube, pero con un límite. */
  const enBlanco = SEMBRADO_AHORA;
  const trayendo = (typeof cargarDesdeNube === 'function')
    ? cargarDesdeNube().catch(e => console.error('[nube] trayendo el café:', e))
    : null;
  if (trayendo && enBlanco)
    await Promise.race([trayendo, new Promise(r => setTimeout(r, 8000))]);
  if (window.innerWidth < 760) ED.zoom = 2.2;   // en el celular el plano arranca ampliado
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.v));
  let sesion = null;
  try{ sesion = usuario(localStorage.getItem(SESION_KEY())); }catch(e){}
  if (!S.config.loginOn){
    USUARIO = S.usuarios.find(u => u.rol === 'admin' && u.activo) || S.usuarios[0];
    $('#login').hidden = true;
    go('mesas');
  } else if (sesion && sesion.activo){
    USUARIO = sesion;
    $('#login').hidden = true;
    go(puedeVer('mesas') ? 'mesas' : 'pedidos');
  } else {
    mostrarLogin();
  }
}

/* Decide en qué pantalla arrancar. La nube nunca frena el arranque:
   si no está configurada o no hay internet, se abre con los datos
   guardados en esta computadora. */
async function arrancarSistema(){
  if (nubeConfigurada() && await nubeCargarLibreria()){
    const sesion = await nubeSesion();
    if (!sesion) return mostrarIngresoNube();
    NUBE.activa = true;
    nubeEstado('guardando');                  /* conectando… */
    /* Si la cuenta entra a un solo café, se elige solo */
    const mios = await nubeMisLocales();
    if (!mios.length){
      /* Entró pero la base no le devuelve ningún café: falta el paso 4 de
         NUBE.md o faltan los permisos. Se trabaja igual en la computadora,
         pero no se intenta subir: el cartelito ya avisa "Falta configurar". */
      NUBE.activa = false;
    }
    else if (mios.length === 1) LOCAL = mios[0];
    else if (LOCAL && !mios.includes(LOCAL)) LOCAL = null;
  } else {
    /* Acá se llega solo si la nube no está configurada o si no se pudo bajar
       la librería de Supabase. En el segundo caso el motivo ya quedó escrito
       en la consola por nubeCargarLibreria(). */
    if (nubeConfigurada())
      console.error('[nube] arrancando sin nube: no se pudo cargar la librería. ' +
                    'Los datos quedan solo en esta computadora.');
    nubeEstado(nubeConfigurada() ? 'error' : 'local');
  }
  if (!LOCALES.some(l => l.id === LOCAL)){ LOCAL = null; return mostrarLocales(); }
  try{ localStorage.setItem(LOCAL_KEY, LOCAL); }catch(e){}
  await arrancarLocal();
}

(function init(){
  try{ LOCAL = localStorage.getItem(LOCAL_KEY); }catch(e){}
  /* Si el arranque se cae, hasta ahora la pantalla quedaba en blanco y sin
     una sola pista de por qué: el error se perdía en la consola, que nadie
     mira en el mostrador. Ahora se ve el motivo y un botón para reintentar. */
  arrancarSistema().catch(e => {
    console.error('[inicio] no se pudo abrir el sistema:', e);
    const w = document.querySelector('.wrap');
    if (!w) return;
    w.innerHTML = '<div class="alert warn" style="margin:20px"><span>⚠</span><div>' +
      '<b>No se pudo abrir el sistema.</b>' +
      '<div class="small" style="margin:4px 0 10px">' +
        (typeof esc === 'function' ? esc(String(e && e.message || e)) : '') + '</div>' +
      '<button class="btn" onclick="location.reload()">Reintentar</button>' +
      '</div></div>';
  });
  window.addEventListener('beforeprint', () => { const o = $('#ovl'); if (o) o._wasOpen = !o.hidden; });
})();
