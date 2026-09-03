/* ============================================================
   PEDIDOS — historial con filtros
   ============================================================ */

let F = { desde: '', hasta: '', estado: 'todos', pago: 'todos', mesa: 'todas', mozo: 'todos', q: '', limit: 100 };
F.desde = F.hasta = hoy();

function fechaPedido(p){ return dkey(p.cerrado || p.abierto); }

function pedidosFiltrados(){
  return S.pedidos.filter(p => {
    const f = fechaPedido(p);
    if (F.desde && f < F.desde) return false;
    if (F.hasta && f > F.hasta) return false;
    if (F.estado !== 'todos' && p.estado !== F.estado) return false;
    if (F.pago !== 'todos' && !usaMedio(p, F.pago)) return false;
    if (F.mozo !== 'todos' && p.mozoId !== F.mozo) return false;
    if (F.mesa === 'mostrador'){ if (p.tipo !== 'mostrador') return false; }
    else if (F.mesa !== 'todas' && String(p.mesaNum) !== F.mesa) return false;
    if (F.q){
      const t = F.q.toLowerCase();
      const hit = ('#' + p.num).includes(t) ||
        (p.mesaNum && ('mesa ' + p.mesaNum).includes(t)) ||
        p.items.some(i => i.nombre.toLowerCase().includes(t)) ||
        (p.mozoNombre || '').toLowerCase().includes(t) ||
        (p.notas || '').toLowerCase().includes(t);
      if (!hit) return false;
    }
    return true;
  }).sort((a, b) => (b.cerrado || b.abierto).localeCompare(a.cerrado || a.abierto));
}

function setRango(d, h){ F.desde = d; F.hasta = h; F.limit = 100; refresh(); }
function presetHoy(){ setRango(hoy(), hoy()); }
function presetAyer(){ const d = new Date(); d.setDate(d.getDate() - 1); setRango(dkey(d), dkey(d)); }
function presetSemana(){ const d = new Date(); d.setDate(d.getDate() - 6); setRango(dkey(d), hoy()); }
function presetMes(){ const n = new Date(); setRango(dkey(new Date(n.getFullYear(), n.getMonth(), 1)), hoy()); }
function presetAnio(){ const n = new Date(); setRango(n.getFullYear() + '-01-01', hoy()); }
function presetTodo(){ setRango('', ''); }
function setMes(v){
  if (!v) return;
  const [y, m] = v.split('-').map(Number);
  setRango(v + '-01', dkey(new Date(y, m, 0)));
}
function setAnio(v){ if (!v){ presetTodo(); return; } setRango(v + '-01-01', v + '-12-31'); }

function aniosDisponibles(){
  const s = new Set(S.pedidos.map(p => fechaPedido(p).slice(0, 4)));
  s.add(String(new Date().getFullYear()));
  return [...s].sort().reverse();
}

function renderPedidos(){
  setActions('<button class="btn" onclick="exportarCSV()">⬇ Exportar CSV</button>' +
             '<button class="btn pri" onclick="go(\'mesas\')">＋ Nuevo pedido</button>');

  const list = pedidosFiltrados();
  const cerr = list.filter(p => p.estado === 'cerrado');
  const facturado = cerr.reduce((a, p) => a + totalCobrado(p), 0);
  const unidades = cerr.reduce((a, p) => a + p.items.reduce((x, i) => x + i.cant, 0), 0);
  const mesActual = new Date().getFullYear() + '-' + pad(new Date().getMonth() + 1);

  let h = '<div class="card" style="margin-bottom:16px"><div class="bd">' +
    '<div class="row" style="margin-bottom:12px">' +
      '<b class="small">Períodos rápidos:</b>' +
      '<button class="btn sm" onclick="presetHoy()">Hoy</button>' +
      '<button class="btn sm" onclick="presetAyer()">Ayer</button>' +
      '<button class="btn sm" onclick="presetSemana()">Últimos 7 días</button>' +
      '<button class="btn sm" onclick="presetMes()">Este mes</button>' +
      '<button class="btn sm" onclick="presetAnio()">Este año</button>' +
      '<button class="btn sm" onclick="presetTodo()">Todo</button>' +
    '</div>' +
    '<div class="grid4">' +
      '<div class="field"><label>Desde</label><input type="date" value="' + F.desde + '" onchange="F.desde=this.value;refresh()"></div>' +
      '<div class="field"><label>Hasta</label><input type="date" value="' + F.hasta + '" onchange="F.hasta=this.value;refresh()"></div>' +
      '<div class="field"><label>Mes completo</label><input type="month" value="' + (F.desde ? F.desde.slice(0, 7) : mesActual) + '" onchange="setMes(this.value)"></div>' +
      '<div class="field"><label>Año completo</label><select onchange="setAnio(this.value)"><option value="">— elegir —</option>' +
        aniosDisponibles().map(a => '<option ' + (F.desde === a + '-01-01' && F.hasta === a + '-12-31' ? 'selected' : '') + '>' + a + '</option>').join('') +
      '</select></div>' +
    '</div>' +
    '<div class="grid4" style="margin-top:12px">' +
      '<div class="field"><label>Estado</label><select onchange="F.estado=this.value;refresh()">' +
        ['todos','cerrado','abierto','anulado'].map(e => '<option value="' + e + '" ' + (F.estado === e ? 'selected' : '') + '>' +
          ({todos:'Todos', cerrado:'Cobrados', abierto:'Abiertos', anulado:'Anulados'})[e] + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Medio de pago</label><select onchange="F.pago=this.value;refresh()">' +
        '<option value="todos">Todos</option>' +
        mediosUsados().map(k => '<option value="' + k + '" ' + (F.pago === k ? 'selected' : '') + '>' + nombrePago(k) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Mesa</label><select onchange="F.mesa=this.value;refresh()">' +
        '<option value="todas">Todas</option><option value="mostrador" ' + (F.mesa === 'mostrador' ? 'selected' : '') + '>Para llevar</option>' +
        S.mesas.slice().sort((a, b) => a.num - b.num).map(m => '<option value="' + m.num + '" ' + (F.mesa === String(m.num) ? 'selected' : '') + '>Mesa ' + m.num + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Mozo</label><select onchange="F.mozo=this.value;refresh()">' +
        '<option value="todos">Todos</option>' +
        S.usuarios.map(u => '<option value="' + u.id + '" ' + (F.mozo === u.id ? 'selected' : '') + '>' + esc(u.nombre) + '</option>').join('') +
      '</select></div>' +
    '</div>' +
    '<div class="grid4" style="margin-top:12px">' +
      '<div class="field"><label>Buscar</label><input type="search" id="fq" value="' + esc(F.q) + '" placeholder="N° de pedido, producto o mozo…"></div>' +
    '</div>' +
  '</div></div>';

  h += '<div class="kpis" style="margin-bottom:16px">' +
    kpi('Pedidos cobrados', String(cerr.length), rangoTexto()) +
    kpi('Facturado', fmt(facturado), 'Neto de descuentos', true) +
    kpi('Ticket promedio', fmt(cerr.length ? facturado / cerr.length : 0), 'Por pedido cobrado') +
    kpi('Unidades vendidas', String(unidades), 'Ítems servidos') +
  '</div>';

  h += '<div class="card"><div class="hd"><h3>Listado</h3><span class="pill gray">' + list.length + ' resultado(s)</span></div>';
  if (!list.length){
    h += vacio('🧾', 'No hay pedidos en este período', 'Probá ampliar el rango de fechas o quitar filtros.');
  } else {
    const vis = list.slice(0, F.limit);
    h += '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>N°</th><th>Fecha</th><th>Hora</th><th>Origen</th><th>Mozo</th><th>Detalle</th><th>Pago</th><th>Estado</th><th class="num">Total</th><th></th>' +
      '</tr></thead><tbody>' +
      vis.map(p => {
        const ests = { cerrado: 'ok', abierto: 'warn', anulado: 'bad' };
        const estn = { cerrado: 'Cobrado', abierto: 'Abierto', anulado: 'Anulado' };
        const det = p.items.map(i => i.cant + '× ' + i.nombre).join(', ');
        return '<tr>' +
          '<td><b>#' + p.num + '</b></td>' +
          '<td class="mono">' + fechaCorta(p.cerrado || p.abierto) + '</td>' +
          '<td class="mono muted">' + hora(p.cerrado || p.abierto) + '</td>' +
          '<td>' + (p.tipo === 'mesa' ? 'Mesa ' + p.mesaNum : '🥡 Para llevar') + '</td>' +
          '<td class="small">' + esc(p.mozoNombre || '—') + '</td>' +
          '<td class="small muted" style="max-width:240px">' + esc(det || '—') + '</td>' +
          '<td class="small">' + textoPago(p) +
            (p.cuentaId && cuenta(p.cuentaId) ? '<div class="small muted">' + esc(cuenta(p.cuentaId).nombre) + '</div>' : '') + '</td>' +
          '<td><span class="pill ' + ests[p.estado] + '">' + estn[p.estado] + '</span></td>' +
          '<td class="num"><b>' + fmt(totalCobrado(p)) + '</b>' +
            (recargoDe(p) > 0 ? '<div class="small muted">c/recargo</div>' : '') + '</td>' +
          '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
            '<button class="btn xs" onclick="verPedido(\'' + p.id + '\')">Ver</button>' +
            '<button class="btn xs" onclick="imprimirTicket(\'' + p.id + '\')" title="Imprimir ticket">🖨</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
    if (list.length > F.limit)
      h += '<div class="bd" style="text-align:center"><button class="btn" onclick="F.limit+=200;refresh()">Mostrar más (' + (list.length - F.limit) + ' restantes)</button></div>';
  }
  h += '</div>';
  $('#v-pedidos').innerHTML = h;

  const q = $('#fq');
  if (q){
    q.oninput = e => { F.q = e.target.value; clearTimeout(q._t); q._t = setTimeout(() => { refresh(); const n = $('#fq'); if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 260); };
  }
}

function rangoTexto(){
  if (!F.desde && !F.hasta) return 'Historial completo';
  if (F.desde === F.hasta) return cap(fechaLarga(F.desde));
  return (F.desde ? fechaCorta(F.desde + 'T12:00') : 'inicio') + ' → ' + (F.hasta ? fechaCorta(F.hasta + 'T12:00') : 'hoy');
}

function verPedido(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  if (p.estado === 'abierto') return abrirPedido(id);
  modal({
    size: '', nofocus: true,
    title: 'Pedido #' + p.num + ' <span class="pill ' + (p.estado === 'cerrado' ? 'ok' : 'bad') + '">' + cap(p.estado) + '</span>',
    body:
      '<div class="row small muted" style="margin-bottom:12px">' +
        '<span>📅 ' + fechaCorta(p.cerrado || p.abierto) + ' ' + hora(p.cerrado || p.abierto) + '</span>' +
        '<span>' + (p.tipo === 'mesa' ? '🍽 Mesa ' + p.mesaNum : '🥡 Para llevar') + '</span>' +
        '<span>💳 ' + textoPago(p) + (p.cuentaId && cuenta(p.cuentaId) ? ' — ' + esc(cuenta(p.cuentaId).nombre) : '') + '</span>' +
        (p.mozoNombre ? '<span>🧑‍🍳 ' + esc(p.mozoNombre) + '</span>' : '') +
      '</div>' +
      '<table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>' +
      p.items.map(i => '<tr><td>' + esc(i.nombre) + (i.nota ? '<div class="small muted">📝 ' + esc(i.nota) + '</div>' : '') + '</td>' +
        '<td class="num">' + i.cant + '</td><td class="num">' + fmt(i.precio) + '</td><td class="num"><b>' + fmt(i.precio * i.cant) + '</b></td></tr>').join('') +
      '</tbody></table>' +
      '<div class="sep"></div>' +
      '<div class="tot-row"><span class="muted">Subtotal</span><b>' + fmt(subtotal(p)) + '</b></div>' +
      (p.descuento ? '<div class="tot-row"><span class="muted">' + textoDescuento(p) + '</span><b>− ' + fmt(p.descuento) + '</b></div>' : '') +
      '<div class="tot-row big"><span>Total</span><span>' + fmt(total(p)) + '</span></div>' +
      (recargoDe(p) > 0
        ? '<div class="tot-row"><span class="muted">Recargo crédito (' + S.config.recargoCredito + '%)</span><b>+ ' + fmt(recargoDe(p)) + '</b></div>' +
          '<div class="tot-row" style="font-weight:700"><span>Total cobrado</span><span>' + fmt(totalCobrado(p)) + '</span></div>'
        : '') +
      (esMixto(p)
        ? '<div class="sep"></div>' + lineasPago(p).map(l =>
            '<div class="tot-row small"><span class="muted">' + nombrePago(l.medio) +
            (l.cuentaId && cuenta(l.cuentaId) ? ' · ' + esc(cuenta(l.cuentaId).nombre) : '') + '</span>' +
            '<span>' + fmt(cobradoLinea(l)) + '</span></div>').join('')
        : '') +
      (propinaDe(p) > 0
        ? '<div class="tot-row small muted"><span>Propina sugerida (' + S.config.propina + '%)</span><span>' + fmt(propinaDe(p)) + '</span></div>' +
          '<div class="tot-row small" style="font-weight:650"><span>Total con propina</span><span>' + fmt(totalConPropina(p)) + '</span></div>'
        : ''),
    footer:
      (p.estado === 'cerrado' && esAdmin()
        ? '<button class="btn dan" onclick="anularCobrado(\'' + p.id + '\')">Anular pedido</button>'
        : '') +
      '<button class="btn" data-close>Cerrar</button>' +
      '<button class="btn pri" onclick="imprimirTicket(\'' + p.id + '\')">🖨 Ticket</button>'
  });
}

function anularCobrado(id){
  if (!soloAdmin('anular un pedido ya cobrado')) return;
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  confirmar('¿Anular el <b>pedido #' + p.num + '</b> ya cobrado? Se descuenta de la caja y se devuelve el stock.', () => {
    if (S.config.descontarStock) descontarStock(p, +1);
    p.estado = 'anulado';
    save(); closeModal(); refresh(); toast('Pedido #' + p.num + ' anulado');
  }, 'Anular');
}

function exportarCSV(){
  const list = pedidosFiltrados();
  if (!list.length) return toast('No hay pedidos para exportar');
  const rows = [['Pedido','Fecha','Hora','Origen','Mozo','Estado','Medio de pago','Cuenta','Producto','Cantidad','Precio unitario','Importe','Descuento pedido','Total pedido','Recargo','Total cobrado']];
  list.forEach(p => {
    const org = p.tipo === 'mesa' ? 'Mesa ' + p.mesaNum : 'Para llevar';
    const cta = p.cuentaId && cuenta(p.cuentaId) ? cuenta(p.cuentaId).nombre : '';
    const base = [p.num, fechaCorta(p.cerrado || p.abierto), hora(p.cerrado || p.abierto), org, p.mozoNombre || '', p.estado, textoPago(p), cta];
    const fin = [p.descuento || 0, total(p), recargoDe(p), totalCobrado(p)];
    if (!p.items.length) rows.push(base.concat(['', '', '', ''], fin));
    p.items.forEach(i => rows.push(base.concat([i.nombre, i.cant, i.precio, i.precio * i.cant], fin)));
  });
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
  descargar(csv, 'pedidos_' + (F.desde || 'inicio') + '_a_' + (F.hasta || hoy()) + '.csv', 'text/csv;charset=utf-8');
  toast('CSV descargado');
}

function descargar(contenido, nombre, tipo){
  const b = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
