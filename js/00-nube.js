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
  estado: 'local'   /* local | sincronizado | guardando | error | conflicto | configurar */
};

/* Errores que NO son falta de internet sino que la base todavía no está
   preparada: falta correr supabase.sql, faltan permisos o falta cargar la
   fila en "miembros". Con internet andando, reintentar no los arregla. */
const NUBE_ERRORES_DE_SETUP = [
  'PGRST202',  /* no existe la función guardar_local */
  'PGRST205',  /* no existe la tabla */
  'PGRST301',  /* la sesión no sirve / no autenticado */
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
    const { data, error } = await NUBE.cli.from('miembros').select('local_id');
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
    const { data, error } = await NUBE.cli
      .from('locales').select('datos, version').eq('id', localId).single();
    if (error || !data){
      /* Sin la versión de la nube, subir pisaría lo que haya del otro lado:
         se corta la subida hasta poder leer. */
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

/* ---------- Subir ----------
   Se llama solo, con un respiro de unos segundos, para no mandar
   una copia por cada toque en la pantalla.                        */
function nubeGuardar(demora){
  if (!NUBE.activa) return;
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
  if (!NUBE.activa || NUBE.guardando || !S) return;
  NUBE.guardando = true; NUBE.pendiente = false;
  let fallo = false;
  try{
    const { data, error } = await NUBE.cli.rpc('guardar_local', {
      p_local: LOCAL, p_datos: S, p_version: NUBE.version
    });
    const r = Array.isArray(data) ? data[0] : data;
    if (error){
      nubeFallo('guardando el café "' + LOCAL + '"', error);
      fallo = true;
    } else if (!r){
      nubeFallo('guardando el café "' + LOCAL + '"', { message: 'La base no devolvió respuesta' });
      fallo = true;
    } else if (r.ok === false){
      /* Otra computadora guardó primero */
      NUBE.version = r.version;
      NUBE.fallos = 0;
      nubeEstado('conflicto');
    } else {
      NUBE.version = r.version;
      NUBE.fallos = 0;
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
window.addEventListener('online', async () => {
  NUBE.fallos = 0;                              /* la espera vuelve a empezar corta */
  if (NUBE.activa){ nubeGuardar(500); return; }
  if (!nubeConfigurada()) return;
  if (!(await nubeCargarLibreria())) return;
  if (await nubeSesion()){ NUBE.activa = true; nubeGuardar(500); }
});

/* Al minimizar o cambiar de pestaña se aprovecha para guardar ya:
   es el momento más confiable, "beforeunload" muchas veces no llega. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && NUBE.activa && NUBE.pendiente) nubeSubirAhora();
});
