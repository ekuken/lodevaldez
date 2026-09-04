/* ============================================================
   SISTEMA DE CAFÉ — archivo único, datos en el navegador
   ============================================================ */
'use strict';

/* ---------- Locales ----------
   Los dos cafés comparten el sistema pero NO los datos: cada uno tiene su
   propia caja, sus mesas, sus productos y sus usuarios, guardados aparte. */
const LOCALES = [
  { id: 'valdez', nombre: 'Lo de Valdez', ico: '☕' },
  { id: 'eva',    nombre: 'Evacafé',      ico: '🍰' }
];
const LOCAL_KEY  = 'cafe_local_v1';
const KEY_LEGADO = 'cafe_sistema_v1';      /* datos de antes de dividir el sistema */

let LOCAL = null;
function local(){ return LOCALES.find(l => l.id === LOCAL) || null; }
function KEY(){ return 'cafe_sistema_v1_' + LOCAL; }
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ---------- Estado ---------- */
const DEFAULT_STATE = {
  config: {
    nombre: 'Mi Café',
    simbolo: '$',
    decimales: 0,
    direccion: '',
    telefono: '',
    pieTicket: '¡Gracias por su visita!',
    nextNum: 1,
    descontarStock: true,
    comandaImprime: true,
    anchoTicket: 80,       /* mm de papel de la impresora de ESTE café */

    propinaOn: true,
    propina: 10,
    recargoOn: true,
    recargoCredito: 25,
    loginOn: true,
    vistaMesas: 'plano'
  },
  salon: { w: 1200, h: 760, elementos: [] },
  mesas: [],
  productos: [],
  proveedores: [],
  pedidos: [],
  compras: [],
  cierres: [],
  cuentas: [],
  pagosCuenta: [],
  usuarios: [],
  movimientos: []
};

let S = null;
let VIEW = 'mesas';
/* Se prende cuando esta computadora arrancó en blanco y tuvo que armar el
   café de ejemplo. Lo mira cargarDesdeNube(): un café de ejemplo no tiene
   nada que conservar, así que se descarta entero y se toma el de la nube.
   Sin esto, el ejemplo se sumaba al café real y quedaban dos juegos de
   mesas y dos veces cada usuario. */
let SEMBRADO_AHORA = false;

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function load(){
  try{
    const raw = localStorage.getItem(KEY());
    if (raw){
      const d = JSON.parse(raw);
      S = Object.assign({}, structuredClone(DEFAULT_STATE), d);
      S.config = Object.assign({}, DEFAULT_STATE.config, d.config || {});
      S.salon  = Object.assign({}, DEFAULT_STATE.salon, d.salon || {});
      migrar();
      return;
    }
  }catch(e){ console.warn('No se pudo leer el guardado:', e); }
  S = structuredClone(DEFAULT_STATE);
  if (local()) S.config.nombre = local().nombre;
  SEMBRADO_AHORA = true;
  seed();
  save();
}

/* Guarda en la computadora al instante (así anda sin internet) y
   programa la copia a la nube. */
function save(){
  S.guardado = new Date().toISOString();
  try{ localStorage.setItem(KEY(), JSON.stringify(S)); }
  catch(e){ toast('⚠ No se pudo guardar (¿almacenamiento lleno?)'); console.error(e); }
  if (typeof nubeGuardar === 'function') nubeGuardar();
}

/* Trae lo que hay en la nube y lo junta con lo de esta computadora.
   Antes se elegía "todo lo de la nube" o "todo lo de acá" comparando fechas
   y cantidad de pedidos; con dos computadoras eso borraba el trabajo de una.
   Ahora se combina registro por registro (ver nubeCombinar en 00-nube.js). */
async function cargarDesdeNube(){
  if (typeof nubeBajar !== 'function') return;
  const remoto = await nubeBajar(LOCAL);
  if (!NUBE.activa) return;                  /* no se pudo leer: ya avisó nubeBajar */
  if (!remoto){                              /* café vacío en la nube: subir lo de acá */
    nubeBaseEscribir({});
    nubeGuardar();
    SEMBRADO_AHORA = false;
    return;
  }
  /* Si acá se acaba de armar el café de ejemplo, no se combina: se toma el
     de la nube tal cual (ver SEMBRADO_AHORA arriba). */
  nubeJuntarConLaNube(remoto, SEMBRADO_AHORA);
  SEMBRADO_AHORA = false;
}

/* Completa los campos del plano en datos guardados con versiones anteriores */
function migrar(){
  if (!Array.isArray(S.salon.elementos)) S.salon.elementos = [];
  if (!Array.isArray(S.cuentas)) S.cuentas = [];
  if (!Array.isArray(S.pagosCuenta)) S.pagosCuenta = [];
  if (!Array.isArray(S.movimientos)) S.movimientos = [];
  if (!Array.isArray(S.usuarios) || !S.usuarios.length) S.usuarios = usuariosPorDefecto();
  /* Lo repetido que haya quedado guardado NO se saca solo al abrir: borrar
     registros sin que nadie lo pida es peligroso. Se hace a mano desde
     Ajustes → "Sacar duplicados", que muestra qué va a sacar y pide
     confirmación. */
  if (!S.usuarios.some(u => u.rol === 'admin' && u.activo)) S.usuarios.push(usuariosPorDefecto()[0]);
  S.pedidos.forEach(p => {
    if (p.pago === 'mp') p.pago = 'qr';
    if (!Array.isArray(p.pagos)) p.pagos = [];
    if (p.personas === undefined) p.personas = null;
    if (p.mozoNombre === undefined){ p.mozoId = null; p.mozoNombre = ''; }
    if (p.comanda === undefined) p.comanda = p.estado === 'abierto' ? null : p.abierto;
    p.items.forEach(i => { if (i.enviado === undefined) i.enviado = p.estado !== 'abierto' || !!p.comanda; });
    if (p.cuentaId === undefined) p.cuentaId = null;
    if (p.descTipo === undefined){ p.descTipo = 'pct'; p.descVal = 0; }
    if (p.descuento && !p.descVal){ p.descTipo = 'monto'; p.descVal = p.descuento; }
  });
  let hayQueAcomodar = false;
  S.mesas.forEach(m => {
    if (typeof m.x !== 'number'){ hayQueAcomodar = true; }
    if (typeof m.cap !== 'number') m.cap = 4;
    if (!m.forma) m.forma = 'cuadrada';
    if (typeof m.w !== 'number'){ m.w = 120; m.h = 120; }
  });
  if (hayQueAcomodar) autoOrdenar(true);
}

/* Acomoda las mesas en filas prolijas dentro del salón */
function autoOrdenar(silencioso){
  const ms = S.mesas.slice().sort((a, b) => a.num - b.num);
  const cols = Math.max(1, Math.ceil(Math.sqrt(ms.length * (S.salon.w / S.salon.h))));
  const padX = 70, padY = 150;
  const dispX = S.salon.w - padX * 2, dispY = S.salon.h - padY - 70;
  const filas = Math.max(1, Math.ceil(ms.length / cols));
  const pasoX = dispX / cols, pasoY = dispY / filas;
  const lado = Math.max(70, Math.min(140, Math.min(pasoX, pasoY) * 0.68));
  ms.forEach((m, i) => {
    const c = i % cols, f = Math.floor(i / cols);
    m.w = m.w || lado; m.h = m.h || lado;
    m.w = lado; m.h = lado;
    m.x = Math.round(padX + c * pasoX + (pasoX - lado) / 2);
    m.y = Math.round(padY + f * pasoY + (pasoY - lado) / 2);
  });
  if (!silencioso){ save(); refresh(); toast('Mesas acomodadas en filas'); }
}

function seed(){
  S.usuarios = usuariosPorDefecto();
  const MS = [
    [1,  80, 170, 110, 110, 'redonda',  2],
    [2,  80, 320, 110, 110, 'redonda',  2],
    [3,  80, 470, 110, 110, 'redonda',  2],
    [4, 300, 190, 130, 130, 'cuadrada', 4],
    [5, 520, 190, 130, 130, 'cuadrada', 4],
    [6, 740, 190, 130, 130, 'cuadrada', 4],
    [7, 300, 420, 130, 130, 'cuadrada', 4],
    [8, 520, 420, 280, 110, 'rect',     6]
  ];
  MS.forEach(m => S.mesas.push({ id: uid(), num: m[0], x: m[1], y: m[2], w: m[3], h: m[4], forma: m[5], cap: m[6], zona: '' }));
  S.salon.elementos = [
    { id: uid(), tipo: 'barra',    x: 700, y: 40,  w: 460, h: 90,  texto: 'Barra' },
    { id: uid(), tipo: 'cocina',   x: 990, y: 170, w: 170, h: 150, texto: 'Cocina' },
    { id: uid(), tipo: 'bano',     x: 990, y: 570, w: 170, h: 140, texto: 'Baños' },
    { id: uid(), tipo: 'puerta',   x: 90,  y: 700, w: 160, h: 34,  texto: 'Entrada' },
    { id: uid(), tipo: 'ventana',  x: 16,  y: 150, w: 18,  h: 440, texto: '' },
    { id: uid(), tipo: 'sector',   x: 60,  y: 90,  w: 200, h: 40,  texto: 'Ventana' },
    { id: uid(), tipo: 'sector',   x: 420, y: 90,  w: 260, h: 40,  texto: 'Salón' }
  ];
  const P = [
    ['Café espresso','Cafetería',1800,600,0,0,false],
    ['Café con leche','Cafetería',2200,750,0,0,false],
    ['Cortado','Cafetería',1900,650,0,0,false],
    ['Capuchino','Cafetería',2600,900,0,0,false],
    ['Submarino','Cafetería',2900,1100,0,0,false],
    ['Té / Mate cocido','Cafetería',1600,400,0,0,false],
    ['Medialuna','Panadería',900,350,40,12,true],
    ['Tostado J&Q','Panadería',3800,1500,20,6,true],
    ['Budín de limón','Panadería',2400,900,12,4,true],
    ['Alfajor de maicena','Panadería',1500,600,25,8,true],
    ['Agua mineral 500ml','Bebidas',1500,600,36,12,true],
    ['Gaseosa línea Coca','Bebidas',2000,850,30,12,true],
    ['Jugo exprimido','Bebidas',2600,1000,0,0,false],
    ['Cerveza artesanal','Bebidas',4200,1900,18,6,true]
  ];
  P.forEach(p => S.productos.push({
    id: uid(), nombre: p[0], cat: p[1], precio: p[2], costo: p[3],
    stock: p[4], stockMin: p[5], ctrl: p[6], activo: true
  }));
  S.proveedores.push({ id: uid(), nombre: 'Café Torrado S.A.', rubro: 'Café en grano', contacto: 'Marcela Ruiz', tel: '11 4455-6677', email: 'ventas@cafetorrado.com', dir: '', notas: 'Entrega los martes' });
  S.proveedores.push({ id: uid(), nombre: 'Panadería El Trigal', rubro: 'Facturas y panificados', contacto: 'Jorge Díaz', tel: '11 5566-7788', email: 'pedidos@eltrigal.com', dir: '', notas: 'Pedido antes de las 18 h' });
}

/* ---------- Formato ---------- */
function fmt(n){
  const d = S.config.decimales;
  const v = (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  return S.config.simbolo + ' ' + v;
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pad(n){ return String(n).padStart(2, '0'); }
function dkey(d){ const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth()+1) + '-' + pad(x.getDate()); }
function hoy(){ return dkey(new Date()); }
function fechaCorta(d){ const x = new Date(d); return pad(x.getDate()) + '/' + pad(x.getMonth()+1) + '/' + x.getFullYear(); }
function hora(d){ const x = new Date(d); return pad(x.getHours()) + ':' + pad(x.getMinutes()); }
function fechaLarga(d){
  const x = new Date(d + 'T12:00:00');
  return x.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function num(v, def){ const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? (def || 0) : n; }

/* ---------- Cálculos de pedido ---------- */
function redondear(n){ const f = Math.pow(10, S.config.decimales); return Math.round(n * f) / f; }
function subtotal(p){ return p.items.reduce((a, i) => a + i.precio * i.cant, 0); }
/* El descuento se guarda siempre como importe; descTipo/descVal es lo que se carga */
function aplicarDescuento(p){
  const v = Math.max(0, p.descVal || 0);
  p.descuento = p.descTipo === 'pct'
    ? redondear(subtotal(p) * Math.min(100, v) / 100)
    : Math.min(subtotal(p), v);
  return p.descuento;
}
function textoDescuento(p){
  return p.descTipo === 'pct' && p.descVal ? 'Descuento (' + p.descVal + '%)' : 'Descuento';
}
function propinaDe(p){ return S.config.propinaOn ? redondear(total(p) * (S.config.propina || 0) / 100) : 0; }
function totalConPropina(p){ return total(p) + propinaDe(p); }
function total(p){ return Math.max(0, subtotal(p) - (p.descuento || 0)); }
/* Estado de una mesa: libre / abierta (pedido sin enviar) / cocina (comanda enviada) */
function pendientes(p){ return p ? p.items.filter(i => !i.enviado).length : 0; }
function estadoMesa(p){
  if (!p) return 'libre';
  if (!p.items.length || pendientes(p) > 0) return 'abierta';
  return 'cocina';
}
const ESTADOS_MESA = {
  libre:   { t: 'Libre',            c: '#CFC7BC' },
  abierta: { t: 'Tomando pedido',   c: '#D89B2C' },
  cocina:  { t: 'Comanda en cocina',c: '#2F7D5D' }
};

function pedidoAbiertoDeMesa(mid){ return S.pedidos.find(p => p.estado === 'abierto' && p.mesaId === mid); }
function prod(id){ return S.productos.find(p => p.id === id); }
function prov(id){ return S.proveedores.find(p => p.id === id); }
function bajoStock(){ return S.productos.filter(p => p.activo && p.ctrl && p.stock <= p.stockMin); }

/* ---------- Usuarios y permisos ---------- */
function usuariosPorDefecto(){
  return [
    { id: uid(), nombre: 'Encargado', rol: 'admin', pin: '1234', activo: true, creado: new Date().toISOString() },
    { id: uid(), nombre: 'Mozo 1',    rol: 'mozo',  pin: '1111', activo: true, creado: new Date().toISOString() }
  ];
}
let USUARIO = null;
const ROLES = { admin: 'Administrador', mozo: 'Mozo' };
function esAdmin(){ return !!USUARIO && USUARIO.rol === 'admin'; }
function usuario(id){ return S.usuarios.find(u => u.id === id); }
function mozosActivos(){ return S.usuarios.filter(u => u.activo); }
/* Secciones que ve cada rol */
const VISTAS_MOZO = ['mesas', 'pedidos'];
function puedeVer(v){ return esAdmin() || VISTAS_MOZO.includes(v); }
function soloAdmin(accion){
  if (esAdmin()) return true;
  toast('Solo un administrador puede ' + (accion || 'hacer esto'));
  return false;
}

const PAGOS = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  qr:            'QR',
  debito:        'Débito',
  credito:       'Crédito',
  cuenta:        'Cuenta'
};
/* Medios usados en versiones anteriores: se siguen mostrando en el historial */
const PAGOS_VIEJOS = { tarjeta:'Tarjeta', mp:'Mercado Pago', otro:'Otro', mixto:'Mixto' };
const TIPOS_MOV = { gasto:'Gasto', retiro:'Retiro de efectivo', ingreso:'Ingreso extra' };
function nombrePago(k){ return PAGOS[k] || PAGOS_VIEJOS[k] || '—'; }
/* Todos los medios presentes en los datos, para armar listas y filtros */
function mediosUsados(){
  const set = new Set(Object.keys(PAGOS));
  S.pedidos.forEach(p => lineasPago(p).forEach(l => set.add(l.medio)));
  S.compras.forEach(c => { if (c.pago) set.add(c.pago); });
  return [...set];
}

/* ---------- Formas de pago de un pedido ----------
   Un pedido puede pagarse con un solo medio o repartido entre varios.
   Cada línea guarda cuánto del pedido cubre (base); el recargo de crédito
   se calcula encima de esa base.                                        */
function lineasPago(p){
  if (Array.isArray(p.pagos) && p.pagos.length) return p.pagos;
  if (p.pago) return [{ medio: p.pago, base: total(p), cuentaId: p.cuentaId || null }];
  return [];
}
function recargoLinea(l){
  return (l.medio === 'credito' && S.config.recargoOn)
    ? redondear(l.base * (S.config.recargoCredito || 0) / 100) : 0;
}
function cobradoLinea(l){ return redondear(l.base + recargoLinea(l)); }
function recargoDe(p){ return redondear(lineasPago(p).reduce((a, l) => a + recargoLinea(l), 0)); }
function totalCobrado(p){ return redondear(total(p) + recargoDe(p)); }
function esMixto(p){ return lineasPago(p).length > 1; }
function textoPago(p){
  const l = lineasPago(p);
  if (!l.length) return '—';
  if (l.length === 1) return nombrePago(l[0].medio);
  return 'Mixto: ' + l.map(x => nombrePago(x.medio)).join(' + ');
}
/* Importe cobrado por cada medio (incluye el recargo de crédito) */
function porMedio(p){
  const m = {};
  lineasPago(p).forEach(l => { m[l.medio] = redondear((m[l.medio] || 0) + cobradoLinea(l)); });
  return m;
}
function usaMedio(p, k){ return lineasPago(p).some(l => l.medio === k); }

/* ---------- Cuentas corrientes ---------- */
function cuenta(id){ return S.cuentas.find(c => c.id === id); }
function montoEnCuenta(p, cid){
  return redondear(lineasPago(p).filter(l => l.medio === 'cuenta' && l.cuentaId === cid)
    .reduce((a, l) => a + l.base, 0));
}
function consumosCuenta(id){ return S.pedidos.filter(p => p.estado === 'cerrado' && montoEnCuenta(p, id) > 0); }
function pagosDeCuenta(id){ return S.pagosCuenta.filter(x => x.cuentaId === id); }
function consumidoCuenta(id){ return redondear(consumosCuenta(id).reduce((a, p) => a + montoEnCuenta(p, id), 0)); }
function pagadoCuenta(id){ return pagosDeCuenta(id).reduce((a, x) => a + x.monto, 0); }
function saldoCuenta(id){ return redondear(consumidoCuenta(id) - pagadoCuenta(id)); }
function cuentasConSaldo(){ return S.cuentas.filter(c => saldoCuenta(c.id) > 0.004); }

/* ---------- Toast ---------- */
let toastT = null;
function toast(msg){
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastT);
  toastT = setTimeout(() => el.remove(), 2600);
}

/* ---------- Modal ---------- */
function modal(opts){
  const o = $('#ovl');
  o.innerHTML =
    '<div class="modal ' + (opts.size || '') + '">' +
      '<div class="mh"><h3>' + opts.title + '</h3><button class="x" data-close>&times;</button></div>' +
      '<div class="mb">' + opts.body + '</div>' +
      (opts.footer ? '<div class="mf">' + opts.footer + '</div>' : '') +
    '</div>';
  o.hidden = false;
  o.onclick = e => { if (e.target === o) closeModal(); };
  $$('[data-close]', o).forEach(b => b.onclick = closeModal);
  const f = $('input,select,textarea', o); if (f && !opts.nofocus) f.focus();
  return o;
}
function closeModal(){ const o = $('#ovl'); o.hidden = true; o.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ovl').hidden) closeModal(); });

function confirmar(txt, onOk, okLabel){
  modal({
    title: 'Confirmar',
    body: '<p style="margin:0;line-height:1.55">' + txt + '</p>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn dan" id="cfOk">' + (okLabel || 'Sí, continuar') + '</button>',
    nofocus: true
  });
  $('#cfOk').onclick = () => { closeModal(); onOk(); };
}

/* ---------- Vistas ---------- */
const VISTAS = {
  mesas:       { t:'Mesas',       s:'Estado del salón' },
  pedidos:     { t:'Pedidos',     s:'Historial y filtros' },
  caja:        { t:'Caja',        s:'Ventas y cierre del día' },
  cuentas:     { t:'Cuentas',     s:'Cuentas corrientes y consumos' },
  productos:   { t:'Productos',   s:'Carta y control de stock' },
  proveedores: { t:'Proveedores', s:'Contactos y compras' },
  ajustes:     { t:'Ajustes',     s:'Configuración y respaldos' }
};

function go(v){
  if (!puedeVer(v)){ toast('Tu usuario no tiene acceso a esa sección'); return; }
  VIEW = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $$('.wrap > section').forEach(s => s.classList.toggle('hide', s.id !== 'v-' + v));
  $('#vTitle').textContent = VISTAS[v].t;
  $('#vSub').textContent   = VISTAS[v].s;
  refresh();
}

function refresh(){
  $$('#nav button').forEach(b => b.classList.toggle('hide', !puedeVer(b.dataset.v)));
  $('#usrChip').innerHTML = USUARIO
    ? '<b>' + esc(USUARIO.nombre) + '</b><div class="small muted">' + ROLES[USUARIO.rol] + '</div>'
    : '';
  const ocup = S.pedidos.filter(p => p.estado === 'abierto').length;
  const bMesas = $('#badgeMesas'); bMesas.textContent = ocup; bMesas.classList.toggle('hide', ocup === 0);
  const bs = bajoStock().length;
  const bStock = $('#badgeStock'); bStock.textContent = bs; bStock.classList.toggle('hide', bs === 0);
  $('#brandName').textContent = S.config.nombre;
  const bsub = $('#brandSub'); if (bsub && local()) bsub.textContent = local().nombre;
  $('#footDate').textContent = cap(fechaLarga(hoy()));
  document.title = S.config.nombre + ' — Sistema';
  const bc = cuentasConSaldo().length;
  const bCta = $('#badgeCuentas'); bCta.textContent = bc; bCta.classList.toggle('hide', bc === 0);
  ({ mesas: renderMesas, pedidos: renderPedidos, caja: renderCaja, cuentas: renderCuentas,
     productos: renderProductos, proveedores: renderProveedores, ajustes: renderAjustes })[VIEW]();
}

function setActions(html){ $('#topActions').innerHTML = html; }

function vacio(icono, titulo, sub){
  return '<div class="empty"><span class="em">' + icono + '</span><b>' + titulo + '</b>' +
         (sub ? '<div class="small" style="margin-top:4px">' + sub + '</div>' : '') + '</div>';
}
