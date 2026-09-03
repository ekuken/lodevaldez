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
      if (!window.supabase) console.error('[nube] no cargó la librería de Supabase (' + motivo +
        '). Sin ella el sistema trabaja solo en esta computadora. Dirección: ' + NUBE_LIB);
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
function nubeElegir(b, m, s, cuenta){
  const fb = b === undefined ? null : nubeFirma(b);
  const fm = m === undefined ? null : nubeFirma(m);
  const fs = s === undefined ? null : nubeFirma(s);
  if (fm === null && fs === null) return undefined;
  /* Está de un solo lado: o lo agregó ese lado, o el otro lo borró */
  if (fs === null) return (fb !== null && fb === fm) ? undefined : m;
  if (fm === null) return (fb !== null && fb === fs) ? undefined : s;
  if (fm === fs) return m;                    /* iguales, no hay nada que decidir */
  if (fb !== null && fb === fm) return s;     /* acá no se tocó: el cambio es de la otra */
  if (fb !== null && fb === fs) return m;     /* la otra no lo tocó: el cambio es nuestro */
  cuenta.choques++;                           /* las dos lo editaron: no hay forma de adivinar */
  return s;                                   /* queda el que ya está guardado en la nube */
}

function nubeCombinarLista(base, mio, suyo, cuenta){
  const ib = nubeIndice(base), im = nubeIndice(mio), is = nubeIndice(suyo);
  const salida = [], puestas = {};
  /* Primero en el orden que tiene la nube, después lo que solo está acá */
  const orden = (Array.isArray(suyo) ? suyo : []).map(nubeClave)
          .concat((Array.isArray(mio) ? mio : []).map(nubeClave));
  orden.forEach(k => {
    if (puestas[k]) return;
    puestas[k] = 1;
    const r = nubeElegir(ib[k], im[k], is[k], cuenta);
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

/* Junta los tres estados y devuelve uno solo */
function nubeCombinar(base, mio, suyo){
  const cuenta = { choques: 0 };
  base = base || {}; mio = mio || {}; suyo = suyo || {};
  const out = nubeCombinarObjeto(base, mio, suyo, cuenta, NUBE_APARTE);
  NUBE_LISTAS.forEach(k => { out[k] = nubeCombinarLista(base[k], mio[k], suyo[k], cuenta); });
  out.config = nubeCombinarObjeto(base.config, mio.config, suyo.config, cuenta);
  /* El número de pedido es un contador compartido: se toma el más alto
     para no repetir. Aun así, dos pedidos abiertos en el mismo instante
     pueden salir con el mismo número. */
  out.config.nextNum = Math.max(nubeProximoNum(mio.config), nubeProximoNum(suyo.config));
  out.salon = nubeCombinarObjeto(base.salon, mio.salon, suyo.salon, cuenta, ['elementos']);
  out.salon.elementos = nubeCombinarLista((base.salon || {}).elementos,
                                          (mio.salon  || {}).elementos,
                                          (suyo.salon || {}).elementos, cuenta);
  /* Solo se pone la fecha si alguno la tenía: dejar la clave con "undefined"
     haría que el estado combinado nunca parezca igual al de la nube, y las
     dos computadoras se estarían subiendo cambios la una a la otra sin fin. */
  const g = (mio.guardado || '') > (suyo.guardado || '') ? mio.guardado : suyo.guardado;
  if (g !== undefined) out.guardado = g;
  return { estado: out, choques: cuenta.choques };
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
function nubeJuntarConLaNube(remoto){
  remoto = (remoto && Object.keys(remoto).length) ? remoto : null;
  if (!remoto){ nubeBaseEscribir({}); nubeGuardar(300); return; }
  const base = nubeBaseLeer();
  const res = nubeCombinar(base, S, remoto);
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
  if (!NUBE.activa || NUBE.guardando || NUBE.pendiente || !S) return;
  if (document.visibilityState !== 'visible') return;
  if (!nubeIniciar() || !LOCAL) return;
  try{
    const { data, error } = await NUBE.cli
      .from('locales').select('version').eq('id', LOCAL).single();
    if (error || !data || data.version === NUBE.version) return;
    const full = await NUBE.cli
      .from('locales').select('datos, version').eq('id', LOCAL).single();
    if (full.error || !full.data) return;
    NUBE.version = full.data.version;
    nubeJuntarConLaNube(full.data.datos);
  }catch(e){ /* es un chequeo de fondo: si falla, se reintenta en la próxima */ }
}
setInterval(nubeMirarNovedades, 8000);

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
  /* Se manda una copia congelada: S puede cambiar mientras se espera la
     respuesta, y la referencia tiene que ser exactamente lo que se subió. */
  let enviado;
  try{ enviado = JSON.parse(JSON.stringify(S)); }
  catch(e){ NUBE.guardando = false; nubeFallo('preparando los datos', e); return; }
  try{
    const { data, error } = await NUBE.cli.rpc('guardar_local', {
      p_local: LOCAL, p_datos: enviado, p_version: NUBE.version
    });
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
  if (document.visibilityState === 'hidden'){
    if (NUBE.activa && NUBE.pendiente) nubeSubirAhora();
  } else {
    /* Al volver a la pantalla se mira enseguida si la otra computadora
       guardó algo, sin esperar los 8 segundos del control de fondo. */
    nubeMirarNovedades();
  }
});
