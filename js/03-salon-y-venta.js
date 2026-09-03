/* ============================================================
   SALÓN — plano del local, mesas y punto de venta
   ============================================================ */

const TIPOS_EL = {
  barra:    { n: 'Barra',        w: 400, h: 90,  ico: '🍸' },
  cocina:   { n: 'Cocina',       w: 170, h: 150, ico: '🍳' },
  bano:     { n: 'Baños',        w: 160, h: 130, ico: '🚻' },
  deposito: { n: 'Depósito',     w: 160, h: 120, ico: '📦' },
  puerta:   { n: 'Entrada',      w: 160, h: 34,  ico: '🚪' },
  ventana:  { n: 'Ventana',      w: 18,  h: 300, ico: '' },
  pared:    { n: 'Pared',        w: 300, h: 14,  ico: '' },
  escalera: { n: 'Escalera',     w: 150, h: 90,  ico: '🪜' },
  planta:   { n: 'Planta',       w: 60,  h: 60,  ico: '🪴' },
  sector:   { n: 'Nombre de sector', w: 220, h: 40, ico: '' }
};
const FORMAS = { redonda: 'Redonda', cuadrada: 'Cuadrada', rect: 'Rectangular' };

let ED = { on: false, kind: null, id: null, zoom: 1, backup: null };

function elem(id){ return S.salon.elementos.find(e => e.id === id); }
function mesa(id){ return S.mesas.find(m => m.id === id); }
function selObj(){ return ED.kind === 'mesa' ? mesa(ED.id) : ED.kind === 'el' ? elem(ED.id) : null; }

/* ------------------------------------------------------------
   Vista principal
   ------------------------------------------------------------ */
function renderMesas(){
  const plano = S.config.vistaMesas !== 'lista';
  setActions(ED.on
    ? '<span class="pill warn">Editando el plano</span>' +
      '<button class="btn dan" onclick="cancelarEdit()">✗ Cancelar cambios</button>' +
      '<button class="btn ok" onclick="confirmarEdit()">✓ Confirmar cambios</button>'
    : (plano && esAdmin() ? '<button class="btn" onclick="entrarEdit()">✏ Editar plano</button>' : '') +
      '<button class="btn" onclick="agregarMesa()">＋ Mesa</button>' +
      '<button class="btn" onclick="quitarMesa()">－ Mesa</button>' +
      '<button class="btn pri" onclick="nuevoMostrador()">＋ Para llevar</button>'
  );

  const abiertos = S.pedidos.filter(p => p.estado === 'abierto');
  const ocupadas = abiertos.filter(p => p.tipo === 'mesa').length;
  const enSalon  = abiertos.reduce((a, p) => a + total(p), 0);
  const delDia   = S.pedidos.filter(p => p.estado === 'cerrado' && dkey(p.cerrado) === hoy());
  const ventaDia = delDia.reduce((a, p) => a + total(p), 0);

  let h = '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Mesas ocupadas', ocupadas + ' / ' + S.mesas.length, 'Cuentas abiertas en el salón') +
    kpi('En curso', fmt(enSalon), abiertos.length + ' cuenta(s) sin cobrar') +
    kpi('Ventas de hoy', fmt(ventaDia), delDia.length + ' pedido(s) cobrados', true) +
    kpi('Ticket promedio', fmt(delDia.length ? ventaDia / delDia.length : 0), 'Sobre los pedidos de hoy') +
  '</div>';

  const bs = bajoStock();
  if (bs.length){
    h += '<div class="alert warn" style="margin-bottom:16px">' +
      '<span>⚠</span><div><b>' + bs.length + ' producto(s) con stock bajo:</b> ' +
      esc(bs.slice(0, 6).map(p => p.nombre + ' (' + p.stock + ')').join(', ')) +
      (bs.length > 6 ? ' y ' + (bs.length - 6) + ' más' : '') +
      ' — <a href="#" onclick="go(\'productos\');return false">ver productos</a></div></div>';
  }

  const paraLlevar = abiertos.filter(p => p.tipo === 'mostrador');
  if (paraLlevar.length){
    h += '<div class="card" style="margin-bottom:18px"><div class="hd"><h3>🥡 Para llevar / mostrador</h3>' +
      '<span class="pill info">' + paraLlevar.length + ' abierto(s)</span></div><div class="bd">' +
      '<div class="mesas-grid">' + paraLlevar.map(p =>
        '<div class="mesa ' + estadoMesa(p) + '" onclick="abrirPedido(\'' + p.id + '\')">' +
          '<span class="dot"></span>' +
          '<div class="mn">Mostrador</div><div class="mt">#' + p.num + '</div>' +
          '<div class="mi">' + p.items.length + ' ítem(s) · ' + hora(p.abierto) +
            (p.mozoNombre ? ' · ' + esc(p.mozoNombre) : '') + '</div>' +
          '<div class="mtot">' + fmt(total(p)) + '</div>' +
        '</div>').join('') +
      '</div></div></div>';
  }

  h += '<div class="card"><div class="hd">' +
    '<h3>' + (plano ? '🗺️ Plano del salón' : 'Salón') + '</h3>' +
    '<div class="tabs">' +
      '<button class="' + (plano ? 'on' : '') + '" onclick="setVista(\'plano\')">Plano</button>' +
      '<button class="' + (plano ? '' : 'on') + '" onclick="setVista(\'lista\')">Lista</button>' +
    '</div>' +
    '<div class="sp" style="flex:1"></div>' +
    (plano
      ? '<div class="pl-tools">' +
          '<button class="btn xs" onclick="zoomPlano(-1)" title="Alejar">−</button>' +
          '<span class="small muted mono">' + Math.round(ED.zoom * 100) + '%</span>' +
          '<button class="btn xs" onclick="zoomPlano(1)" title="Acercar">＋</button>' +
        '</div>'
      : '<span class="small muted">Tocá una mesa para abrir o continuar su cuenta</span>') +
  '</div><div class="bd">';

  h += plano ? htmlPlano() : htmlLista();
  h += '</div></div>';
  $('#v-mesas').innerHTML = h;
  if (plano) $('#plano').addEventListener('pointerdown', planoDown);
}

function setVista(v){ S.config.vistaMesas = v; ED.on = false; ED.backup = null; save(); refresh(); }

/* Al entrar en edición se guarda una copia para poder volver atrás */
function fotoPlano(){ return JSON.stringify({ mesas: S.mesas, salon: S.salon }); }
function entrarEdit(){
  if (!soloAdmin('editar el plano del salón')) return;
  ED.backup = fotoPlano();
  ED.on = true; ED.kind = null; ED.id = null;
  refresh();
  toast('Modo edición: arrastrá las mesas y después confirmá o cancelá');
}
function hayCambiosEdit(){ return ED.backup && ED.backup !== fotoPlano(); }
function salirEdit(){ ED.on = false; ED.backup = null; ED.kind = null; ED.id = null; }
function confirmarEdit(){
  const hubo = hayCambiosEdit();
  salirEdit(); save(); refresh();
  toast(hubo ? '✓ Plano guardado' : 'Sin cambios en el plano');
}
function cancelarEdit(){
  if (!hayCambiosEdit()){ salirEdit(); refresh(); return; }
  confirmar('¿Descartar los cambios del plano? Las mesas y los elementos vuelven a como estaban antes de empezar a editar.', () => {
    const b = JSON.parse(ED.backup);
    S.mesas = b.mesas; S.salon = b.salon;
    salirEdit(); save(); closeModal(); refresh();
    toast('Cambios descartados — el plano volvió a la normalidad');
  }, 'Sí, descartar');
}
function zoomPlano(d){ ED.zoom = Math.min(3, Math.max(0.6, Math.round((ED.zoom + d * 0.2) * 10) / 10)); refresh(); }

/* ------------------------------------------------------------
   Plano
   ------------------------------------------------------------ */
function htmlPlano(){
  let h = '<div class="row" style="align-items:flex-start;flex-wrap:wrap;gap:14px">';
  h += '<div class="grow" style="min-width:280px">' +
       '<div class="plano-wrap"><div id="plano" class="plano' + (ED.on ? ' edit' : '') + '" style="width:' + (ED.zoom * 100) + '%">' +
       cuerpoPlano() + '</div></div>' +
       '<div class="pl-leyenda">' +
         Object.keys(ESTADOS_MESA).map(k =>
           '<span><i style="background:' + ESTADOS_MESA[k].c + '"></i>' + ESTADOS_MESA[k].t + '</span>').join('') +
         (ED.on ? '<span>✋ Arrastrá para mover · tirá de la esquina ◢ para agrandar · después <b>Confirmar</b> o <b>Cancelar</b> arriba</span>'
                : '<span>Tocá una mesa para abrir o continuar su cuenta</span>') +
       '</div></div>';
  if (ED.on) h += '<div class="pl-side">' + htmlPanelEdit() + '</div>';
  return h + '</div>';
}

function cuerpoPlano(){
  const W = S.salon.w, H = S.salon.h;
  const pc = (v, base) => (v / base * 100) + '%';
  let h = '';

  S.salon.elementos.forEach(e => {
    const t = TIPOS_EL[e.tipo] || TIPOS_EL.pared;
    const sel = ED.on && ED.kind === 'el' && ED.id === e.id;
    h += '<div class="pl-item pl-el ' + e.tipo + (sel ? ' sel' : '') + '" data-kind="el" data-id="' + e.id + '" title="' + esc(e.texto || t.n) + '"' +
      ' style="left:' + pc(e.x, W) + ';top:' + pc(e.y, H) + ';width:' + pc(e.w, W) + ';height:' + pc(e.h, H) + '">' +
      contenidoEl(e, t) +
      (sel ? '<span class="rz"></span>' : '') + '</div>';
  });

  S.mesas.slice().sort((a, b) => a.num - b.num).forEach(m => {
    const p = pedidoAbiertoDeMesa(m.id);
    const est = estadoMesa(p);
    const sel = ED.on && ED.kind === 'mesa' && ED.id === m.id;
    h += '<div class="pl-item pl-mesa ' + (m.forma || 'cuadrada') + ' ' + est + (sel ? ' sel' : '') + '"' +
      ' data-kind="mesa" data-id="' + m.id + '" title="Mesa ' + m.num + ' · ' + ESTADOS_MESA[est].t +
        (p ? ' · ' + fmt(total(p)) + (p.mozoNombre ? ' · atiende ' + p.mozoNombre : '') : '') + '"' +
      ' style="left:' + pc(m.x, W) + ';top:' + pc(m.y, H) + ';width:' + pc(m.w, W) + ';height:' + pc(m.h, H) + '">' +
      '<span class="pl-dot"></span>' +
      '<div class="pl-num">' + m.num + '</div>' +
      (p ? '<div class="pl-tot">' + fmt(total(p)) + '</div>' +
           '<div class="pl-est">' + (est === 'cocina' ? '✓ en cocina' : '⏳ sin enviar') + '</div>' +
           (p.mozoNombre ? '<div class="pl-mozo">' + esc(p.mozoNombre.split(' ')[0]) + '</div>' : '')
         : '') +
      (sel ? '<span class="rz"></span>' : '') + '</div>';
  });
  return h;
}

/* Texto/ícono de un elemento: se oculta si no entra en su tamaño */
function contenidoEl(e, t){
  if (e.tipo === 'sector') return esc(e.texto || '');
  if (e.tipo === 'ventana' || e.tipo === 'pared') return '';
  const anchoPx = e.w / S.salon.w * 1000;   // ancho aproximado en pantalla
  const ico = t.ico ? '<span>' + t.ico + '</span>' : '';
  if (anchoPx < 70) return ico;
  return ico + '<span>' + esc(e.texto || t.n) + '</span>';
}

function htmlPanelEdit(){
  const o = selObj();
  let h = '<div class="card"><div class="hd"><h3>✏ Editar plano</h3></div><div class="bd">' +
    '<div class="alert info small" style="margin-bottom:12px"><span>ℹ</span><div>Probá los cambios que quieras: con <b>✓ Confirmar</b> quedan guardados y con <b>✗ Cancelar</b> el plano vuelve a como estaba.</div></div>';
  h += '<div class="field" style="margin-bottom:10px"><label>Agregar al plano</label>' +
    '<select onchange="agregarElemento(this.value);this.value=\'\'">' +
      '<option value="">— elegir —</option>' +
      Object.keys(TIPOS_EL).map(k => '<option value="' + k + '">' + (TIPOS_EL[k].ico ? TIPOS_EL[k].ico + ' ' : '') + TIPOS_EL[k].n + '</option>').join('') +
    '</select></div>';
  h += '<button class="btn blk sm" onclick="agregarMesa()">＋ Agregar mesa</button>';
  h += '<div class="field" style="margin-top:10px"><label>Proporción del salón</label>' +
    '<select onchange="setProporcion(this.value)">' +
      [['1200x760','Ancho (apaisado)'],['1000x1000','Cuadrado'],['1400x700','Largo y angosto'],['760x1200','Alto (vertical)']]
        .map(o2 => '<option value="' + o2[0] + '" ' + (S.salon.w + 'x' + S.salon.h === o2[0] ? 'selected' : '') + '>' + o2[1] + '</option>').join('') +
    '</select></div>';
  h += '<button class="btn blk sm" style="margin-top:10px" onclick="autoOrdenar()">⛶ Acomodar mesas en filas</button>';
  h += '<div class="sep"></div>';

  if (!o){
    h += '<div class="small muted">Tocá una mesa o un elemento del plano para cambiar su número, capacidad, forma o tamaño.</div>';
  } else if (ED.kind === 'mesa'){
    h += '<div class="small muted" style="margin-bottom:8px">Seleccionado: <b>Mesa ' + o.num + '</b></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Número</label><input type="number" min="1" value="' + o.num + '" onchange="setMesaProp(\'num\',this.value)"></div>' +
        '<div class="field"><label>Capacidad</label><input type="number" min="1" value="' + (o.cap || 4) + '" onchange="setMesaProp(\'cap\',this.value)"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:10px"><label>Forma</label><select onchange="setMesaProp(\'forma\',this.value)">' +
        Object.keys(FORMAS).map(k => '<option value="' + k + '" ' + (o.forma === k ? 'selected' : '') + '>' + FORMAS[k] + '</option>').join('') +
      '</select></div>' +
      '<div class="field" style="margin-top:10px"><label>Tamaño</label><div class="row" style="gap:6px">' +
        '<button class="btn sm grow" onclick="setTam(90)">Chica</button>' +
        '<button class="btn sm grow" onclick="setTam(120)">Media</button>' +
        '<button class="btn sm grow" onclick="setTam(160)">Grande</button>' +
      '</div></div>' +
      '<div class="field" style="margin-top:10px"><label>Sector / zona (opcional)</label>' +
        '<input type="text" value="' + esc(o.zona || '') + '" placeholder="Ej: Vereda" onchange="setMesaProp(\'zona\',this.value)"></div>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn sm grow" onclick="duplicarSel()">⧉ Duplicar</button>' +
        '<button class="btn sm dan grow" onclick="eliminarMesa(\'' + o.id + '\')">Eliminar</button>' +
      '</div>';
  } else {
    const t = TIPOS_EL[o.tipo] || {};
    h += '<div class="small muted" style="margin-bottom:8px">Seleccionado: <b>' + esc(t.n || o.tipo) + '</b></div>' +
      '<div class="field"><label>Tipo</label><select onchange="setElProp(\'tipo\',this.value)">' +
        Object.keys(TIPOS_EL).map(k => '<option value="' + k + '" ' + (o.tipo === k ? 'selected' : '') + '>' + TIPOS_EL[k].n + '</option>').join('') +
      '</select></div>' +
      '<div class="field" style="margin-top:10px"><label>Texto que se muestra</label>' +
        '<input type="text" value="' + esc(o.texto || '') + '" placeholder="' + esc(t.n || '') + '" onchange="setElProp(\'texto\',this.value)"></div>' +
      '<div class="grid2" style="margin-top:10px">' +
        '<div class="field"><label>Ancho</label><input type="number" min="10" value="' + Math.round(o.w) + '" onchange="setElProp(\'w\',this.value)"></div>' +
        '<div class="field"><label>Alto</label><input type="number" min="10" value="' + Math.round(o.h) + '" onchange="setElProp(\'h\',this.value)"></div>' +
      '</div>' +
      '<button class="btn sm blk" style="margin-top:10px" onclick="rotarSel()">⟳ Girar 90°</button>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm grow" onclick="duplicarSel()">⧉ Duplicar</button>' +
        '<button class="btn sm dan grow" onclick="eliminarElemento()">Eliminar</button>' +
      '</div>';
  }
  return h + '</div></div>';
}

/* ---------- Propiedades ---------- */
function setMesaProp(k, v){
  const m = selObj(); if (!m) return;
  if (k === 'num'){
    const n = Math.max(1, parseInt(v, 10) || 1);
    if (S.mesas.some(x => x.id !== m.id && x.num === n)) return toast('Ya existe la mesa ' + n);
    m.num = n;
  } else if (k === 'cap') m.cap = Math.max(1, parseInt(v, 10) || 1);
  else m[k] = v;
  save(); refresh();
}
function setTam(l){
  const m = selObj(); if (!m) return;
  if (m.forma === 'rect'){ m.w = Math.round(l * 1.9); m.h = l; } else { m.w = l; m.h = l; }
  clampObj(m); save(); refresh();
}
function setElProp(k, v){
  const e = selObj(); if (!e) return;
  if (k === 'w' || k === 'h') e[k] = Math.max(10, num(v, 10));
  else if (k === 'tipo'){ e.tipo = v; if (!e.texto) e.texto = TIPOS_EL[v].n; }
  else e[k] = v;
  clampObj(e); save(); refresh();
}
function rotarSel(){
  const e = selObj(); if (!e) return;
  const w = e.w; e.w = e.h * (S.salon.w / S.salon.h); e.h = w * (S.salon.h / S.salon.w);
  e.w = Math.round(e.w); e.h = Math.round(e.h);
  clampObj(e); save(); refresh();
}
function duplicarSel(){
  const o = selObj(); if (!o) return;
  const c = Object.assign({}, o, { id: uid(), x: Math.min(S.salon.w - o.w, o.x + 30), y: Math.min(S.salon.h - o.h, o.y + 30) });
  if (ED.kind === 'mesa'){ c.num = S.mesas.reduce((a, m) => Math.max(a, m.num), 0) + 1; S.mesas.push(c); }
  else S.salon.elementos.push(c);
  ED.id = c.id; save(); refresh();
}
function agregarElemento(tipo){
  if (!tipo) return;
  const t = TIPOS_EL[tipo];
  const pos = lugarLibre(t.w, t.h);
  const e = { id: uid(), tipo: tipo, x: pos.x, y: pos.y, w: t.w, h: t.h, texto: tipo === 'sector' ? 'Sector' : t.n };
  S.salon.elementos.push(e);
  ED.kind = 'el'; ED.id = e.id; save(); refresh(); toast('Se agregó: ' + t.n + ' — arrastralo a su lugar');
}
function eliminarElemento(){
  const e = selObj(); if (!e) return;
  S.salon.elementos = S.salon.elementos.filter(x => x.id !== e.id);
  ED.kind = null; ED.id = null; save(); refresh(); toast('Elemento eliminado');
}
function setProporcion(v){
  const [w, h] = v.split('x').map(Number);
  S.salon.w = w; S.salon.h = h;
  S.mesas.forEach(clampObj); S.salon.elementos.forEach(clampObj);
  save(); refresh();
}
function clampObj(o){
  o.w = Math.min(o.w, S.salon.w); o.h = Math.min(o.h, S.salon.h);
  o.x = Math.max(0, Math.min(o.x, S.salon.w - o.w));
  o.y = Math.max(0, Math.min(o.y, S.salon.h - o.h));
}

/* ---------- Arrastrar y redimensionar ---------- */
function planoDown(e){
  const it = e.target.closest('.pl-item');
  const box = $('#plano');
  if (!it){ if (ED.on && e.target === box){ ED.kind = null; ED.id = null; refresh(); } return; }
  const kind = it.dataset.kind, id = it.dataset.id;

  if (!ED.on){
    if (kind === 'mesa') clickMesa(id);
    return;
  }
  e.preventDefault();
  const yaSel = (ED.kind === kind && ED.id === id);
  ED.kind = kind; ED.id = id;
  const o = selObj(); if (!o) return;
  if (!yaSel) refresh();

  const rz = e.target.classList.contains('rz');
  const cont = $('#plano');                       // puede haberse re-dibujado
  const el = $('[data-id="' + id + '"]', cont);
  if (!el) return;
  const r = cont.getBoundingClientRect();
  const W = S.salon.w, H = S.salon.h;
  const sx = e.clientX, sy = e.clientY, ox = o.x, oy = o.y, ow = o.w, oh = o.h;
  let movido = false;
  const snap = v => Math.round(v / 10) * 10;

  const move = ev => {
    const dx = (ev.clientX - sx) / r.width * W, dy = (ev.clientY - sy) / r.height * H;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movido = true;
    if (rz){ o.w = Math.max(30, Math.min(W - o.x, snap(ow + dx))); o.h = Math.max(24, Math.min(H - o.y, snap(oh + dy))); }
    else { o.x = Math.max(0, Math.min(W - o.w, snap(ox + dx))); o.y = Math.max(0, Math.min(H - o.h, snap(oy + dy))); }
    el.style.left = (o.x / W * 100) + '%'; el.style.top = (o.y / H * 100) + '%';
    el.style.width = (o.w / W * 100) + '%'; el.style.height = (o.h / H * 100) + '%';
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (movido){ save(); setTimeout(refresh, 0); }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/* ---------- Vista lista (alternativa simple) ---------- */
function htmlLista(){
  if (!S.mesas.length) return vacio('🍽️', 'Todavía no hay mesas', 'Usá el botón “＋ Mesa” para crear la primera.');
  const ms = S.mesas.slice().sort((a, b) => a.num - b.num);
  return '<div class="mesas-grid">' + ms.map(m => {
    const p = pedidoAbiertoDeMesa(m.id);
    const est = estadoMesa(p);
    return '<div class="mesa ' + est + '" onclick="clickMesa(\'' + m.id + '\')">' +
      '<span class="dot"></span>' +
      '<button class="del" title="Eliminar mesa" onclick="event.stopPropagation();eliminarMesa(\'' + m.id + '\')">×</button>' +
      '<div class="mn">Mesa</div><div class="mt">' + m.num + '</div>' +
      (p ? '<div class="mi">' + (p.personas ? '👥 ' + p.personas + ' · ' : '') + (est === 'cocina' ? '✓ Comanda en cocina' : '⏳ Pedido sin enviar') +
           (p.mozoNombre ? ' · ' + esc(p.mozoNombre) : '') + '</div>' +
           '<div class="mtot">' + fmt(total(p)) + '</div>'
         : '<div class="mi muted">Libre</div>') +
    '</div>';
  }).join('') +
  '<div class="mesa add" onclick="agregarMesa()"><span class="plus">＋</span><span class="small">Agregar mesa</span></div></div>';
}

function kpi(k, v, d, accent){
  return '<div class="kpi' + (accent ? ' accent' : '') + '"><div class="k">' + k + '</div>' +
         '<div class="v">' + v + '</div><div class="d">' + d + '</div></div>';
}

/* ------------------------------------------------------------
   Alta / baja de mesas
   ------------------------------------------------------------ */
function ocupa(a, b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function lugarLibre(w, h){
  const obst = S.mesas.concat(S.salon.elementos.filter(e => e.tipo !== 'sector'));
  for (let y = 20; y <= S.salon.h - h; y += 20)
    for (let x = 20; x <= S.salon.w - w; x += 20){
      const c = { x: x, y: y, w: w + 16, h: h + 16 };
      if (!obst.some(o => ocupa(c, o))) return { x: x, y: y };
    }
  return { x: 20, y: 20 };
}

function agregarMesa(){
  const max = S.mesas.reduce((a, m) => Math.max(a, m.num), 0);
  const pos = lugarLibre(120, 120);
  S.mesas.push({ id: uid(), num: max + 1, x: pos.x, y: pos.y, w: 120, h: 120, forma: 'cuadrada', cap: 4, zona: '' });
  save(); refresh(); toast('Mesa ' + (max + 1) + ' agregada' + (ED.on ? ' — arrastrala a su lugar' : ''));
}
function quitarMesa(){
  if (!S.mesas.length) return toast('No hay mesas para quitar');
  const ms = S.mesas.slice().sort((a, b) => a.num - b.num);
  eliminarMesa(ms[ms.length - 1].id);
}
function eliminarMesa(id){
  const m = mesa(id); if (!m) return;
  if (pedidoAbiertoDeMesa(id)) return toast('La mesa ' + m.num + ' tiene una cuenta abierta');
  confirmar('¿Eliminar la <b>mesa ' + m.num + '</b>? Los pedidos ya cobrados no se pierden.', () => {
    S.mesas = S.mesas.filter(x => x.id !== id);
    if (ED.id === id){ ED.kind = null; ED.id = null; }
    save(); refresh(); toast('Mesa ' + m.num + ' eliminada');
  }, 'Eliminar mesa');
}

/* ------------------------------------------------------------
   Apertura de pedidos
   ------------------------------------------------------------ */
function nuevoPedido(tipo, m, personas){
  const p = {
    id: uid(), num: S.config.nextNum++, tipo: tipo,
    mesaId: m ? m.id : null, mesaNum: m ? m.num : null, personas: personas || null,
    mozoId: USUARIO ? USUARIO.id : null, mozoNombre: USUARIO ? USUARIO.nombre : '',
    items: [], estado: 'abierto', abierto: new Date().toISOString(),
    cerrado: null, comanda: null, pago: null, pagos: [], cuentaId: null, descuento: 0, descTipo: 'pct', descVal: 0, notas: ''
  };
  S.pedidos.push(p); save();
  return p;
}
/* Al abrir una mesa libre se pregunta primero cuántas personas se sientan.
   Recién después se crea el pedido y se entra a cargar productos.        */
let PAX_OK = null;

function pedirPersonas(m, onOk){
  const sug = Math.max(1, m.cap || 4);
  const max = Math.max(10, sug + 2);
  let nums = '';
  for (let n = 1; n <= max; n++)
    nums += '<button class="pax' + (n === sug ? ' sug' : '') + '" onclick="confirmarPersonas(' + n + ')">' + n + '</button>';
  PAX_OK = onOk;
  modal({
    title: 'Mesa ' + m.num + ' · ¿Cuántas personas?',
    nofocus: true,
    body:
      '<div class="small muted" style="margin-bottom:10px">Esta mesa es para ' + sug + ' persona' + (sug > 1 ? 's' : '') +
        '. Tocá la cantidad que se sentó.</div>' +
      '<div class="pax-grid">' + nums + '</div>' +
      '<div class="row" style="margin-top:14px;flex-wrap:nowrap;align-items:flex-end">' +
        '<div class="field grow"><label>Otra cantidad</label>' +
          '<input type="number" id="paxIn" min="1" step="1" placeholder="Ej: 14" ' +
          'onkeydown="if(event.key===\'Enter\')confirmarPersonas(this.value)"></div>' +
        '<button class="btn pri" onclick="confirmarPersonas($(\'#paxIn\').value)">Continuar</button>' +
      '</div>',
    footer: '<button class="btn" data-close>Cancelar</button>'
  });
}

function confirmarPersonas(n){
  const q = Math.max(0, parseInt(n, 10) || 0);
  if (!q) return toast('Elegí cuántas personas se sientan en la mesa');
  const seguir = PAX_OK; PAX_OK = null;
  closeModal();
  if (seguir) seguir(q);
}

function clickMesa(mid){
  const m = mesa(mid); if (!m) return;
  const abierto = pedidoAbiertoDeMesa(mid);
  if (abierto) return abrirPedido(abierto.id);
  pedirPersonas(m, q => abrirPedido(nuevoPedido('mesa', m, q).id));
}
function nuevoMostrador(){ abrirPedido(nuevoPedido('mostrador', null).id); }

/* ------------------------------------------------------------
   Punto de venta
   ------------------------------------------------------------ */
let POS = { id: null, cat: 'Todas', q: '', nota: -1, split: false, lineas: [], paga: 0 };

function abrirPedido(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  POS = { id: id, cat: 'Todas', q: '', nota: -1, split: false, lineas: [], paga: 0 };
  const m = p.mesaId ? mesa(p.mesaId) : null;
  const tit = (p.tipo === 'mesa' ? 'Mesa ' + p.mesaNum + (m && m.zona ? ' · ' + esc(m.zona) : '') : 'Para llevar') +
              ' <span class="pill gray" style="margin-left:6px">Pedido #' + p.num + '</span>' +
              (p.personas ? ' <span class="pill info">👥 ' + p.personas + '</span>' : '') +
              (p.mozoNombre ? ' <span class="pill gray">' + esc(p.mozoNombre) + '</span>' : '') +
              (p.estado !== 'abierto' ? ' <span class="pill ' + (p.estado === 'cerrado' ? 'ok' : 'bad') + '">' + cap(p.estado) + '</span>' : '');
  modal({
    size: 'lg', title: tit, nofocus: true,
    body: '<div class="pos">' +
      '<div class="pos-l">' +
        '<input type="search" id="posQ" placeholder="🔎 Buscar producto…" style="margin-bottom:10px" autocomplete="off">' +
        '<div class="cats" id="posCats"></div>' +
        '<div class="prods" id="posProds"></div>' +
      '</div>' +
      '<div class="pos-r"><div class="cart" id="posCart"></div><div class="cart-foot" id="posFoot"></div></div>' +
    '</div>'
  });
  $('#ovl .mb').style.padding = '0';
  $('#posQ').oninput = e => { POS.q = e.target.value.toLowerCase(); pintarProds(); };
  pintarCats(); pintarProds(); pintarCart();
}

function pedidoPOS(){ return S.pedidos.find(x => x.id === POS.id); }

function pintarCats(){
  const cats = ['Todas'].concat([...new Set(S.productos.filter(p => p.activo).map(p => p.cat || 'Sin categoría'))].sort());
  $('#posCats').innerHTML = cats.map(c =>
    '<button class="' + (POS.cat === c ? 'on' : '') + '" onclick="POS.cat=' + JSON.stringify(c).replace(/"/g, '&quot;') + ';pintarCats();pintarProds()">' + esc(c) + '</button>'
  ).join('');
}

function pintarProds(){
  let list = S.productos.filter(p => p.activo);
  if (POS.cat !== 'Todas') list = list.filter(p => (p.cat || 'Sin categoría') === POS.cat);
  if (POS.q) list = list.filter(p => p.nombre.toLowerCase().includes(POS.q) || (p.cat || '').toLowerCase().includes(POS.q));
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const el = $('#posProds'); if (!el) return;
  if (!list.length){ el.innerHTML = '<div class="empty small">Sin resultados. <a href="#" onclick="closeModal();go(\'productos\');return false">Crear productos</a></div>'; return; }
  el.innerHTML = list.map(p =>
    '<button class="prod' + (p.ctrl && p.stock <= 0 ? ' sinstock' : '') + '" onclick="addItem(\'' + p.id + '\')">' +
      '<div class="pn">' + esc(p.nombre) + '</div>' +
      '<div class="ps">' + esc(p.cat || '') + (p.ctrl ? ' · stock ' + p.stock : '') + '</div>' +
      '<div class="pp">' + fmt(p.precio) + '</div>' +
    '</button>').join('');
}

function addItem(pid){
  const p = pedidoPOS(), pr = prod(pid); if (!p || !pr) return;
  if (p.estado !== 'abierto') return toast('El pedido ya está cerrado');
  const it = p.items.find(i => i.pid === pid && !i.nota && !i.enviado);
  if (it) it.cant++;
  else p.items.push({ pid: pid, nombre: pr.nombre, precio: pr.precio, cant: 1, nota: '', enviado: false });
  aplicarDescuento(p); save(); pintarCart(); pintarProds();
}
function cambiarCant(idx, d){
  const p = pedidoPOS(); if (!p || p.estado !== 'abierto') return;
  p.items[idx].cant += d;
  if (p.items[idx].cant <= 0) p.items.splice(idx, 1);
  aplicarDescuento(p); save(); pintarCart();
}
function quitarItem(idx){
  const p = pedidoPOS(); if (!p || p.estado !== 'abierto') return;
  p.items.splice(idx, 1); aplicarDescuento(p); save(); pintarCart();
}
function editarNota(idx){ POS.nota = (POS.nota === idx ? -1 : idx); pintarCart(); }
function guardarNota(idx, v){
  const p = pedidoPOS(); if (!p) return;
  p.items[idx].nota = v; POS.nota = -1; save(); pintarCart();
}

function pintarCart(){
  const p = pedidoPOS(); if (!p) return;
  const c = $('#posCart'), f = $('#posFoot'); if (!c) return;
  const cerrado = p.estado !== 'abierto';

  c.innerHTML = p.items.length
    ? p.items.map((i, idx) => POS.nota === idx
        ? '<div class="ci"><div class="cn"><b>' + esc(i.nombre) + '</b>' +
            '<input type="text" id="notaIn" value="' + esc(i.nota) + '" placeholder="Ej: sin azúcar, para llevar…" style="margin-top:4px" ' +
            'onkeydown="if(event.key===\'Enter\')guardarNota(' + idx + ',this.value);if(event.key===\'Escape\'){POS.nota=-1;pintarCart()}" ' +
            'onblur="guardarNota(' + idx + ',this.value)"></div></div>'
        : '<div class="ci">' +
            '<div class="cn"><b>' + esc(i.nombre) + '</b><span>' + fmt(i.precio) + ' c/u' + (i.nota ? ' · 📝 ' + esc(i.nota) : '') + '</span></div>' +
            (cerrado ? '<span class="mono small">x' + i.cant + '</span>'
                     : '<div class="qty"><button onclick="cambiarCant(' + idx + ',-1)">−</button><span>' + i.cant + '</span><button onclick="cambiarCant(' + idx + ',1)">＋</button></div>') +
            '<div class="cl">' + fmt(i.precio * i.cant) + '</div>' +
            (cerrado ? '' : '<button class="btn xs" title="Nota" onclick="editarNota(' + idx + ')">✎</button>' +
                            '<button class="btn xs dan" title="Quitar" onclick="quitarItem(' + idx + ')">×</button>') +
          '</div>').join('')
    : '<div class="empty small" style="padding:30px 10px">🧺<br>Carrito vacío<br><span class="small">Tocá un producto para agregarlo</span></div>';
  if (POS.nota >= 0){ const n = $('#notaIn'); if (n){ n.focus(); n.select(); } }

  const st = subtotal(p), tt = total(p);
  const rec = recargoDe(p), aCobrar = totalCobrado(p);
  f.innerHTML =
    '<div class="tot-row"><span class="muted">Subtotal</span><b class="mono">' + fmt(st) + '</b></div>' +
    (cerrado
      ? (p.descuento ? '<div class="tot-row"><span class="muted">' + textoDescuento(p) + '</span><b class="mono">− ' + fmt(p.descuento) + '</b></div>' : '')
      : '<div class="tot-row"><span class="muted">Descuento</span>' +
        '<span class="row" style="gap:4px;flex-wrap:nowrap">' +
          '<button class="btn xs' + (p.descTipo === 'pct' ? ' pri' : '') + '" title="Descuento en porcentaje" onclick="setDescTipo(\'pct\')">%</button>' +
          '<button class="btn xs' + (p.descTipo === 'monto' ? ' pri' : '') + '" title="Descuento en pesos" onclick="setDescTipo(\'monto\')">' + esc(S.config.simbolo) + '</button>' +
          '<input type="number" min="0" step="any" value="' + (p.descVal || 0) + '" style="width:82px;text-align:right;padding:4px 8px" ' +
          'onchange="setDescVal(this.value)">' +
        '</span></div>' +
        (p.descuento > 0
          ? '<div class="tot-row small" style="color:var(--bad)"><span>' +
            (p.descTipo === 'pct' ? p.descVal + '% de descuento' : 'Descuento aplicado') +
            '</span><span class="mono">− ' + fmt(p.descuento) + '</span></div>'
          : '') +
        (p.descTipo === 'pct'
          ? '<div class="row" style="gap:4px;margin:4px 0 2px;justify-content:flex-end">' +
            [5, 10, 15, 20].map(x => '<button class="btn xs" onclick="setDescVal(' + x + ')">' + x + '%</button>').join('') +
            '<button class="btn xs" onclick="setDescVal(0)">Quitar</button></div>'
          : '')) +
    '<div class="tot-row big"><span>Total</span><span class="mono">' + fmt(tt) + '</span></div>' +
    (propinaDe(p) > 0
      ? '<div class="tot-row small" style="color:var(--ink-3)"><span>Propina sugerida (' + S.config.propina + '%)</span>' +
        '<span class="mono">' + fmt(propinaDe(p)) + '</span></div>' +
        '<div class="tot-row small" style="color:var(--ink-2);font-weight:650"><span>Total con propina</span>' +
        '<span class="mono">' + fmt(total(p) + propinaDe(p)) + '</span></div>'
      : '') +
    (cerrado ? htmlPagoCerrado(p) : POS.split ? htmlSplit(p) : htmlCobroSimple(p, rec, aCobrar));
}

/* ---------- Pedido ya cerrado ---------- */
function htmlPagoCerrado(p){
  return '<div class="row" style="margin-top:10px"><span class="pill ' + (p.estado === 'cerrado' ? 'ok' : 'bad') + '">' +
      (p.estado === 'cerrado' ? '✓ Cobrado · ' + textoPago(p) : 'Anulado') + '</span>' +
      (p.mozoNombre ? '<span class="pill gray">Atendió ' + esc(p.mozoNombre) + '</span>' : '') + '</div>' +
    (p.estado === 'cerrado' && esMixto(p)
      ? '<div style="margin-top:8px">' + lineasPago(p).map(l =>
          '<div class="tot-row small"><span class="muted">' + nombrePago(l.medio) +
          (l.cuentaId && cuenta(l.cuentaId) ? ' · ' + esc(cuenta(l.cuentaId).nombre) : '') + '</span>' +
          '<span class="mono">' + fmt(cobradoLinea(l)) + '</span></div>').join('') + '</div>'
      : '') +
    (recargoDe(p) > 0
      ? '<div class="tot-row small" style="color:var(--warn)"><span>Recargo crédito</span><span class="mono">' + fmt(recargoDe(p)) + '</span></div>' +
        '<div class="tot-row" style="font-weight:700"><span>Total cobrado</span><span class="mono">' + fmt(totalCobrado(p)) + '</span></div>'
      : '') +
    '<button class="btn blk" style="margin-top:10px" onclick="imprimirTicket(\'' + p.id + '\')">🖨 Imprimir ticket</button>';
}

/* ---------- Cobro con un solo medio ---------- */
function htmlCobroSimple(p, rec, aCobrar){
  const vuelto = POS.paga - aCobrar;
  return '<div class="pays">' + Object.keys(PAGOS).map(k =>
      '<button class="' + (p.pago === k ? 'on' : '') + '" onclick="setPago(\'' + k + '\')">' + PAGOS[k] + '</button>').join('') +
    '</div>' +
    (p.pago === 'cuenta'
      ? '<div class="field" style="margin:2px 0 8px">' +
          '<label>¿A qué cuenta se carga?</label>' +
          '<select onchange="setCuenta(this.value)">' +
            '<option value="">— elegir cuenta —</option>' +
            S.cuentas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c =>
              '<option value="' + c.id + '" ' + (p.cuentaId === c.id ? 'selected' : '') + '>' + esc(c.nombre) +
              (saldoCuenta(c.id) > 0 ? ' · debe ' + fmt(saldoCuenta(c.id)) : '') + '</option>').join('') +
          '</select>' +
          (esAdmin() ? '<button class="btn xs" style="margin-top:6px" onclick="closeModal();go(\'cuentas\')">＋ Crear una cuenta nueva</button>' : '') +
        '</div>'
      : '') +
    (rec > 0
      ? '<div class="tot-row small" style="color:var(--warn)"><span>Recargo crédito (' + S.config.recargoCredito + '%)</span>' +
        '<span class="mono">+ ' + fmt(rec) + '</span></div>' +
        '<div class="tot-row" style="font-weight:700"><span>Total a cobrar</span><span class="mono">' + fmt(aCobrar) + '</span></div>'
      : '') +
    (p.pago === 'efectivo'
      ? '<div class="tot-row"><span class="muted small">Paga con</span>' +
          '<input type="number" min="0" step="any" value="' + (POS.paga || '') + '" placeholder="0" ' +
          'style="width:110px;text-align:right;padding:4px 8px" onchange="setPaga(this.value)"></div>' +
        (POS.paga > 0
          ? '<div class="tot-row" style="font-weight:700;color:' + (vuelto >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' +
            '<span>' + (vuelto >= 0 ? 'Vuelto' : 'Falta') + '</span><span class="mono">' + fmt(Math.abs(vuelto)) + '</span></div>'
          : '') +
        '<div class="row" style="gap:4px;justify-content:flex-end;margin-bottom:5px">' +
          [1000, 2000, 5000, 10000, 20000].map(x => '<button class="btn xs" onclick="setPaga(' + x + ')">' + (x / 1000) + 'k</button>').join('') +
          '<button class="btn xs" onclick="setPaga(' + aCobrar + ')" title="Paga justo">=</button>' +
          '<button class="btn xs" onclick="setPaga(0)">×</button></div>'
      : '') +
    htmlBotonComanda(p) +
    '<button class="btn ok blk" style="margin-top:4px" onclick="cobrar()"' + (p.items.length ? '' : ' disabled') + '>💵 Cobrar ' + fmt(aCobrar) + '</button>' +
    '<button class="btn blk" style="margin-top:6px" onclick="abrirSplit()"' + (p.items.length ? '' : ' disabled') + '>🧮 Pago mixto / dividir la cuenta</button>' +
    '<div class="row" style="margin-top:8px;flex-wrap:nowrap">' +
      '<button class="btn sm grow" onclick="cerrarPOS()">Guardar y salir</button>' +
      '<button class="btn sm dan" onclick="anularPedido()">Anular</button>' +
    '</div>';
}

/* Botón del ticket: cambia según haya ítems sin imprimir */
function htmlBotonComanda(p){
  const n = pendientes(p);
  if (!p.items.length) return '';
  return n
    ? '<button class="btn blk" style="margin:6px 0 8px;background:#D89B2C;border-color:#D89B2C;color:#fff" ' +
      'onclick="enviarComanda()">🖨 Imprimir pedido (' + n + ' ítem' + (n > 1 ? 's' : '') + ')</button>'
    : '<div class="row" style="margin:6px 0 8px;flex-wrap:nowrap;gap:6px">' +
        '<span class="pill ok grow" style="justify-content:center;padding:7px">✓ Pedido impreso ' +
        (p.comanda ? hora(p.comanda) : '') + '</span>' +
        '<button class="btn sm" onclick="enviarComanda()" title="Volver a imprimir">🖨 Reimprimir</button>' +
      '</div>';
}

/* ---------- Pago mixto / dividir la cuenta ---------- */
function sumaSplit(){ return redondear(POS.lineas.reduce((a, l) => a + (l.base || 0), 0)); }
function cobradoSplit(){ return redondear(POS.lineas.reduce((a, l) => a + cobradoLinea(l), 0)); }

function htmlSplit(p){
  const falta = redondear(total(p) - sumaSplit());
  const rec = redondear(cobradoSplit() - sumaSplit());
  return '<div class="sep"></div>' +
    '<div class="row" style="justify-content:space-between;margin-bottom:8px">' +
      '<b>Repartir el pago</b>' +
      '<button class="btn xs" onclick="cerrarSplit()">← Volver</button></div>' +
    '<div class="row" style="gap:5px;margin-bottom:9px">' +
      '<span class="small muted">Dividir en</span>' +
      [2, 3, 4].map(n => '<button class="btn xs" onclick="splitDividir(' + n + ')">' + n + '</button>').join('') +
      '<input type="number" min="1" max="20" placeholder="N" style="width:56px;padding:3px 6px" ' +
      'onchange="splitDividir(this.value)"><span class="small muted">partes iguales</span>' +
    '</div>' +
    POS.lineas.map((l, i) =>
      '<div class="row" style="gap:5px;flex-wrap:nowrap;margin-bottom:6px">' +
        '<select style="flex:1;padding:5px 7px;font-size:13px" onchange="splitSet(' + i + ',\'medio\',this.value)">' +
          Object.keys(PAGOS).map(k => '<option value="' + k + '" ' + (l.medio === k ? 'selected' : '') + '>' + PAGOS[k] + '</option>').join('') +
        '</select>' +
        '<input type="number" min="0" step="any" value="' + l.base + '" style="width:96px;text-align:right;padding:5px 7px;font-size:13px" ' +
        'onchange="splitSet(' + i + ',\'base\',this.value)">' +
        '<button class="btn xs dan" onclick="splitDel(' + i + ')">×</button>' +
      '</div>' +
      (l.medio === 'cuenta'
        ? '<select style="margin:0 0 8px;padding:5px 7px;font-size:13px" onchange="splitSet(' + i + ',\'cuentaId\',this.value)">' +
            '<option value="">— elegir cuenta —</option>' +
            S.cuentas.map(c => '<option value="' + c.id + '" ' + (l.cuentaId === c.id ? 'selected' : '') + '>' + esc(c.nombre) + '</option>').join('') +
          '</select>'
        : '') +
      (recargoLinea(l) > 0
        ? '<div class="tot-row small" style="color:var(--warn);margin:-2px 0 6px"><span>+ recargo crédito</span>' +
          '<span class="mono">' + fmt(recargoLinea(l)) + ' → ' + fmt(cobradoLinea(l)) + '</span></div>'
        : '')).join('') +
    '<button class="btn sm blk" onclick="splitAdd()">＋ Agregar forma de pago</button>' +
    '<div class="sep" style="margin:10px 0"></div>' +
    '<div class="tot-row"><span class="muted">Total del pedido</span><b class="mono">' + fmt(total(p)) + '</b></div>' +
    '<div class="tot-row"><span class="muted">Repartido</span><b class="mono">' + fmt(sumaSplit()) + '</b></div>' +
    (Math.abs(falta) > 0.004
      ? '<div class="tot-row" style="font-weight:700;color:var(--bad)"><span>' + (falta > 0 ? 'Falta asignar' : 'Asignaste de más') + '</span>' +
        '<span class="mono">' + fmt(Math.abs(falta)) + '</span></div>'
      : '<div class="tot-row" style="font-weight:700;color:var(--ok)"><span>✓ Repartido completo</span><span></span></div>') +
    (rec > 0 ? '<div class="tot-row small" style="color:var(--warn)"><span>Recargo crédito</span><span class="mono">' + fmt(rec) + '</span></div>' : '') +
    '<div class="tot-row big"><span>A cobrar</span><span class="mono">' + fmt(cobradoSplit()) + '</span></div>' +
    '<button class="btn ok blk" style="margin-top:6px" onclick="cobrarSplit()"' +
      (Math.abs(falta) > 0.004 ? ' disabled' : '') + '>💵 Cobrar ' + fmt(cobradoSplit()) + '</button>';
}

function abrirSplit(){
  const p = pedidoPOS(); if (!p || !p.items.length) return;
  POS.split = true;
  POS.lineas = [{ medio: 'efectivo', base: total(p), cuentaId: null }];
  pintarCart();
}
function cerrarSplit(){ POS.split = false; pintarCart(); }
function splitAdd(){
  const p = pedidoPOS();
  POS.lineas.push({ medio: 'efectivo', base: Math.max(0, redondear(total(p) - sumaSplit())), cuentaId: null });
  pintarCart();
}
function splitDel(i){
  POS.lineas.splice(i, 1);
  if (!POS.lineas.length) POS.lineas.push({ medio: 'efectivo', base: 0, cuentaId: null });
  pintarCart();
}
function splitSet(i, campo, v){
  const l = POS.lineas[i]; if (!l) return;
  if (campo === 'base') l.base = Math.max(0, num(v));
  else if (campo === 'cuentaId') l.cuentaId = v || null;
  else { l.medio = v; if (v !== 'cuenta') l.cuentaId = null; }
  pintarCart();
}
function splitDividir(n){
  const p = pedidoPOS(); if (!p) return;
  n = Math.max(1, Math.min(20, parseInt(n, 10) || 1));
  const parte = redondear(total(p) / n);
  POS.lineas = Array.from({ length: n }, (_, i) => ({
    medio: 'efectivo', cuentaId: null,
    base: i === n - 1 ? redondear(total(p) - parte * (n - 1)) : parte
  }));
  pintarCart();
}
function cobrarSplit(){
  const p = pedidoPOS(); if (!p) return;
  if (Math.abs(total(p) - sumaSplit()) > 0.004) return toast('Repartí el total exacto antes de cobrar');
  const lineas = POS.lineas.filter(l => l.base > 0);
  if (!lineas.length) return toast('Cargá al menos una forma de pago');
  const sinCta = lineas.find(l => l.medio === 'cuenta' && !l.cuentaId);
  if (sinCta) return toast('Elegí a qué cuenta se carga esa parte');
  finalizarCobro(p, lineas);
}

function setDescVal(v){
  const p = pedidoPOS(); if (!p) return;
  p.descVal = Math.max(0, num(v));
  if (p.descTipo === 'pct') p.descVal = Math.min(100, p.descVal);
  aplicarDescuento(p); save(); pintarCart();
}
function setDescTipo(t){
  const p = pedidoPOS(); if (!p) return;
  if (p.descTipo === t) return;
  p.descTipo = t; p.descVal = 0;
  aplicarDescuento(p); save(); pintarCart();
}
function setPago(k){
  const p = pedidoPOS(); if (!p) return;
  p.pago = (p.pago === k ? null : k);
  if (p.pago !== 'cuenta') p.cuentaId = null;
  save(); pintarCart();
}
function setCuenta(id){ const p = pedidoPOS(); if (!p) return; p.cuentaId = id || null; save(); pintarCart(); }

function cerrarPOS(){
  const p = pedidoPOS();
  if (p && p.estado === 'abierto' && !p.items.length){
    S.pedidos = S.pedidos.filter(x => x.id !== p.id);
    if (S.config.nextNum === p.num + 1) S.config.nextNum = p.num;
    save();
  }
  closeModal(); refresh();
}

function anularPedido(){
  const p = pedidoPOS(); if (!p) return;
  confirmar('¿Anular el <b>pedido #' + p.num + '</b>? Se libera la mesa y no se contabiliza la venta.', () => {
    if (!p.items.length){
      S.pedidos = S.pedidos.filter(x => x.id !== p.id);
      if (S.config.nextNum === p.num + 1) S.config.nextNum = p.num;
    } else {
      p.estado = 'anulado'; p.cerrado = new Date().toISOString();
    }
    save(); closeModal(); refresh(); toast('Pedido anulado');
  }, 'Anular pedido');
}

function setPaga(v){ POS.paga = Math.max(0, num(v)); pintarCart(); }

/* Marca los ítems como enviados a cocina y (si corresponde) imprime la comanda */
function enviarComanda(){
  const p = pedidoPOS(); if (!p || !p.items.length) return toast('El pedido está vacío');
  const nuevos = p.items.filter(i => !i.enviado);
  const reimprime = nuevos.length === 0;
  const paraImprimir = reimprime ? p.items : nuevos;
  p.items.forEach(i => i.enviado = true);
  p.comanda = new Date().toISOString();
  save(); pintarCart();
  if (!S.config.comandaImprime)
    return toast(reimprime ? 'El pedido ya estaba enviado' : 'Pedido enviado a cocina');
  imprimirPedido(p, nuevos, reimprime);
}

function cobrar(){
  const p = pedidoPOS(); if (!p || !p.items.length) return;
  if (!p.pago) p.pago = 'efectivo';
  if (p.pago === 'cuenta'){
    if (!S.cuentas.length){ closeModal(); if (esAdmin()) go('cuentas'); return toast('Creá primero la cuenta a la que se carga'); }
    if (!p.cuentaId) return toast('Elegí a qué cuenta se carga el consumo');
  }
  const l = { medio: p.pago, base: total(p), cuentaId: p.pago === 'cuenta' ? p.cuentaId : null };
  if (p.pago === 'efectivo' && POS.paga > 0){
    if (POS.paga < totalCobrado(p)) return toast('El efectivo recibido es menor al total');
    l.recibido = POS.paga; l.vuelto = redondear(POS.paga - totalCobrado(p));
  }
  finalizarCobro(p, [l]);
}

function finalizarCobro(p, lineas){
  p.pagos = lineas.map(l => ({
    medio: l.medio, base: redondear(l.base), cuentaId: l.cuentaId || null,
    recibido: l.recibido || 0, vuelto: l.vuelto || 0
  }));
  p.pago = p.pagos.length === 1 ? p.pagos[0].medio : 'mixto';
  const lc = p.pagos.find(l => l.medio === 'cuenta');
  p.cuentaId = lc ? lc.cuentaId : null;
  if (S.config.descontarStock) descontarStock(p, -1);
  p.estado = 'cerrado';
  p.cerrado = new Date().toISOString();
  p.cobradoPor = USUARIO ? USUARIO.nombre : '';
  const vuelto = p.pagos.reduce((a, l) => a + (l.vuelto || 0), 0);
  POS.split = false; POS.paga = 0; POS.lineas = [];
  save(); closeModal(); refresh();
  modal({
    title: '✓ Pedido cobrado', nofocus: true,
    body: '<div style="text-align:center;padding:6px 0">' +
      '<div style="font-size:34px;font-weight:700;letter-spacing:-.02em">' + fmt(totalCobrado(p)) + '</div>' +
      '<div class="muted small" style="margin-top:4px">Pedido #' + p.num + ' · ' + textoPago(p) +
        (p.cuentaId && cuenta(p.cuentaId) ? ' — ' + esc(cuenta(p.cuentaId).nombre) : '') +
        (p.tipo === 'mesa' ? ' · Mesa ' + p.mesaNum : ' · Para llevar') + '</div></div>' +
      (esMixto(p)
        ? '<div class="sep"></div>' + p.pagos.map(l =>
            '<div class="tot-row"><span class="muted">' + nombrePago(l.medio) +
            (l.cuentaId && cuenta(l.cuentaId) ? ' · ' + esc(cuenta(l.cuentaId).nombre) : '') + '</span>' +
            '<b class="mono">' + fmt(cobradoLinea(l)) + '</b></div>').join('')
        : '') +
      (recargoDe(p) > 0
        ? '<div class="tot-row small" style="color:var(--warn)"><span>Incluye recargo de crédito</span>' +
          '<span class="mono">' + fmt(recargoDe(p)) + '</span></div>'
        : '') +
      (vuelto > 0
        ? '<div class="alert info" style="margin-top:12px;font-size:17px;justify-content:center">' +
          '<span>💵</span><div><b>Vuelto: ' + fmt(vuelto) + '</b></div></div>'
        : ''),
    footer: '<button class="btn" data-close>Listo</button>' +
            '<button class="btn pri" onclick="imprimirTicket(\'' + p.id + '\')">🖨 Imprimir ticket</button>'
  });
}

function descontarStock(p, signo){
  p.items.forEach(i => {
    const pr = prod(i.pid);
    if (pr && pr.ctrl) pr.stock = Math.round((pr.stock + signo * i.cant) * 100) / 100;
  });
}
