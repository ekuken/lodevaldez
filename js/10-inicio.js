/* ============================================================
   INICIO
   ============================================================ */

/* Arranca el sistema con los datos del local ya elegido */
async function arrancarLocal(){
  load();                                   /* lo guardado en esta computadora */
  if (typeof cargarDesdeNube === 'function') await cargarDesdeNube();
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
    nubeEstado(nubeConfigurada() ? 'error' : 'local');
  }
  if (!LOCALES.some(l => l.id === LOCAL)){ LOCAL = null; return mostrarLocales(); }
  try{ localStorage.setItem(LOCAL_KEY, LOCAL); }catch(e){}
  await arrancarLocal();
}

(function init(){
  try{ LOCAL = localStorage.getItem(LOCAL_KEY); }catch(e){}
  arrancarSistema();
  window.addEventListener('beforeprint', () => { const o = $('#ovl'); if (o) o._wasOpen = !o.hidden; });
})();
