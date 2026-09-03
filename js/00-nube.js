/* ============================================================
   NUBE — guardado en Supabase
   ------------------------------------------------------------
   El sistema sigue guardando en la computadora (para que funcione
   sin internet) y además manda una copia a la nube. Al abrir, si
   la nube tiene algo más nuevo, se trae eso.
   ============================================================ */

/* --- Datos del proyecto de Supabase (ver NUBE.md) --- */
const NUBE_URL  = '';   /* https://xxxxxxxx.supabase.co  */
const NUBE_KEY  = '';   /* clave "anon public"           */

const NUBE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

let NUBE = {
  cli: null,        /* cliente de Supabase */
  activa: false,    /* hay conexión configurada y sesión iniciada */
  version: null,    /* versión del último dato bajado */
  guardando: false,
  pendiente: false,
  timer: null,
  estado: 'local'   /* local | sincronizado | guardando | error | conflicto */
};

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
    const fin = () => { if (!listo){ listo = true; resolve(!!window.supabase); } };
    const s = document.createElement('script');
    s.src = NUBE_LIB;
    s.onload = fin;
    s.onerror = fin;
    document.head.appendChild(s);
    setTimeout(fin, 6000);          /* no esperar para siempre */
  });
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
  }catch(e){ return null; }
}

async function nubeEntrar(email, clave){
  if (!nubeIniciar()) return { ok: false, msg: 'La nube no está configurada' };
  try{
    const { error } = await NUBE.cli.auth.signInWithPassword({ email: email, password: clave });
    if (error) return { ok: false, msg: 'Usuario o contraseña incorrectos' };
    return { ok: true };
  }catch(e){ return { ok: false, msg: 'No se pudo conectar con la nube' }; }
}

async function nubeSalir(){
  if (NUBE.cli) { try{ await NUBE.cli.auth.signOut(); }catch(e){} }
  NUBE.activa = false; NUBE.version = null;
}

/* Cafés a los que tiene acceso la cuenta que inició sesión */
async function nubeMisLocales(){
  if (!nubeIniciar()) return [];
  try{
    const { data, error } = await NUBE.cli.from('miembros').select('local_id');
    if (error || !data) return [];
    return data.map(x => x.local_id);
  }catch(e){ return []; }
}

/* ---------- Bajar ---------- */
async function nubeBajar(localId){
  if (!nubeIniciar()) return null;
  try{
    const { data, error } = await NUBE.cli
      .from('locales').select('datos, version').eq('id', localId).single();
    if (error || !data) return null;
    NUBE.version = data.version;
    NUBE.activa = true;
    return data.datos && Object.keys(data.datos).length ? data.datos : null;
  }catch(e){ return null; }
}

/* ---------- Subir ----------
   Se llama solo, con un respiro de unos segundos, para no mandar
   una copia por cada toque en la pantalla.                        */
function nubeGuardar(){
  if (!NUBE.activa) return;
  NUBE.pendiente = true;
  nubeEstado('guardando');
  clearTimeout(NUBE.timer);
  NUBE.timer = setTimeout(nubeSubirAhora, 4000);
}

async function nubeSubirAhora(){
  if (!NUBE.activa || NUBE.guardando || !S) return;
  NUBE.guardando = true; NUBE.pendiente = false;
  try{
    const { data, error } = await NUBE.cli.rpc('guardar_local', {
      p_local: LOCAL, p_datos: S, p_version: NUBE.version
    });
    const r = Array.isArray(data) ? data[0] : data;
    if (error){ nubeEstado('error'); }
    else if (r && r.ok === false){
      /* Otra computadora guardó primero */
      NUBE.version = r.version;
      nubeEstado('conflicto');
    } else if (r){
      NUBE.version = r.version;
      nubeEstado('sincronizado');
    }
  }catch(e){ nubeEstado('error'); }
  NUBE.guardando = false;
  if (NUBE.pendiente) nubeGuardar();
}

/* Guarda ya mismo, sin esperar: al cerrar caja o al salir */
async function nubeGuardarYa(){
  clearTimeout(NUBE.timer);
  if (NUBE.activa) await nubeSubirAhora();
}

/* ---------- Cartelito de estado ---------- */
function nubeEstado(e){
  NUBE.estado = e;
  const el = document.getElementById('nubeEstado');
  if (!el) return;
  const txt = {
    local:        ['⚠ Solo en esta PC', 'warn'],
    guardando:    ['⏳ Guardando…',      'gray'],
    sincronizado: ['☁ Guardado',        'ok'],
    conflicto:    ['⚠ Revisar',          'warn'],
    error:        ['⚠ Sin conexión',     'bad']
  }[e] || ['', 'gray'];
  el.className = 'pill ' + txt[1];
  el.textContent = txt[0];
  el.title = e === 'error'
    ? 'No se pudo guardar en la nube. Los datos están guardados en esta computadora y se van a subir cuando vuelva internet.'
    : e === 'conflicto'
      ? 'Otra computadora guardó cambios. Cerrá y volvé a entrar para traer la versión más nueva.'
      : e === 'sincronizado' ? 'Los datos están guardados en la nube.' : '';
}

/* Al volver la conexión: si ya estaba conectado, sube lo pendiente; si había
   arrancado sin internet, se conecta solo sin necesidad de recargar. */
window.addEventListener('online', async () => {
  if (NUBE.activa){ nubeGuardar(); return; }
  if (!nubeConfigurada()) return;
  if (!(await nubeCargarLibreria())) return;
  if (await nubeSesion()){ NUBE.activa = true; nubeGuardar(); }
});

/* Al minimizar o cambiar de pestaña se aprovecha para guardar ya:
   es el momento más confiable, "beforeunload" muchas veces no llega. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && NUBE.activa && NUBE.pendiente) nubeSubirAhora();
});
