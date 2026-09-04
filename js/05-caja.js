/* ============================================================
   CAJA — resumen diario, cierre y tickets
   ============================================================ */

let CAJA = { fecha: hoy() };

/* ============================================================
   TURNOS
   ------------------------------------------------------------
   La caja se puede cerrar más de una vez por día: mañana y tarde,
   o las veces que haga falta. Cada cierre abarca desde el cierre
   anterior hasta el momento en que se hace, que es lo que pasa de
   verdad cuando alguien cuenta la caja y se la entrega al que
   sigue. Así no hay que configurar ningún horario de corte y el
   día que cierran antes o después, sale bien igual.
   ============================================================ */

function msDe(iso){ const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? 0 : t; }

/* Todos los turnos de un día: los que ya se cerraron, más el que está
   abierto (el último, que va desde el cierre anterior hasta ahora). */
function turnosDelDia(f){
  const cerrados = S.cierres.filter(c => c.fecha === f)
    .slice().sort((a, b) => msDe(a.hasta) - msDe(b.hasta));
  const out = [];
  let desde = new Date(f + 'T00:00:00').getTime();
  cerrados.forEach((c, i) => {
    out.push({ nombre: c.turno || ('Turno ' + (i + 1)), desde: desde, hasta: msDe(c.hasta),
               primero: i === 0, cierre: c });
    desde = msDe(c.hasta);
  });
  out.push({ nombre: null, desde: desde, hasta: null, primero: !cerrados.length, cierre: null });
  return out;
}
function turnoAbierto(f){ const t = turnosDelDia(f); return t[t.length - 1]; }

function enTurno(iso, t){
  const x = msDe(iso);
  if (!x) return false;
  if (t.desde && x < t.desde) return false;
  if (t.hasta && x >= t.hasta) return false;
  return true;
}
/* Los gastos, compras y cobros se cargan a mano y llevan la fecha que quiera
   quien los carga. Para saber a qué turno pertenecen se usa la hora en que
   se cargaron. Si se cargaron otro día (porque la fecha se puso a mano),
   caen en el primer turno, para que no queden afuera de todos. */
function enTurnoManual(creado, f, t){
  if (!creado || String(creado).slice(0, 10) !== f) return !!t.primero;
  return enTurno(creado, t);
}

function nombreTurnoSugerido(){
  const h = new Date().getHours();
  return h < 15 ? 'Mañana' : h < 21 ? 'Tarde' : 'Noche';
}

/* Los números de un turno: solo lo que pasó dentro de su rango */
function numerosTurno(f, t){
  const pedidos = S.pedidos.filter(p => p.estado === 'cerrado' && dkey(p.cerrado) === f && enTurno(p.cerrado, t));
  const cobros  = S.pagosCuenta.filter(x => x.fecha === f && enTurnoManual(x.creado, f, t));
  const movs    = S.movimientos.filter(m => m.fecha === f && enTurnoManual(m.creado, f, t));
  const compras = S.compras.filter(c => c.fecha === f && enTurnoManual(c.creado, f, t));
  const porPago = {};
  pedidos.forEach(p => { const m = porMedio(p); Object.keys(m).forEach(k => porPago[k] = redondear((porPago[k] || 0) + m[k])); });
  const efectivo   = redondear(porPago.efectivo || 0);
  const cobrosEfe  = redondear(cobros.filter(x => x.medio === 'efectivo').reduce((a, x) => a + x.monto, 0));
  const extraEfe   = redondear(movs.filter(m => m.tipo === 'ingreso' && m.medio === 'efectivo').reduce((a, m) => a + m.monto, 0));
  const gastosEfe  = redondear(movs.filter(m => m.tipo !== 'ingreso' && m.medio === 'efectivo').reduce((a, m) => a + m.monto, 0));
  const comprasEfe = redondear(compras.filter(c => c.pago === 'efectivo').reduce((a, c) => a + c.total, 0));
  return {
    pedidos: pedidos, porPago: porPago,
    ventas: redondear(pedidos.reduce((a, p) => a + totalCobrado(p), 0)),
    efectivo: efectivo, cobrosEfe: cobrosEfe, extraEfe: extraEfe,
    gastosEfe: gastosEfe, comprasEfe: comprasEfe,
    entra: redondear(efectivo + cobrosEfe + extraEfe),
    sale: redondear(comprasEfe + gastosEfe)
  };
}

function moverDia(d){
  const x = new Date(CAJA.fecha + 'T12:00:00');
  x.setDate(x.getDate() + d);
  CAJA.fecha = dkey(x); refresh();
}

function renderCaja(){
  const f = CAJA.fecha;
  setActions(
    '<button class="btn sm" onclick="moverDia(-1)">←</button>' +
    '<input type="date" value="' + f + '" style="width:auto" onchange="CAJA.fecha=this.value;refresh()">' +
    '<button class="btn sm" onclick="moverDia(1)">→</button>' +
    '<button class="btn" onclick="CAJA.fecha=hoy();refresh()">Hoy</button>'
  );

  const dia = S.pedidos.filter(p => p.estado === 'cerrado' && dkey(p.cerrado) === f);
  const anul = S.pedidos.filter(p => p.estado === 'anulado' && p.cerrado && dkey(p.cerrado) === f);
  const ventas = dia.reduce((a, p) => a + totalCobrado(p), 0);
  const recargos = dia.reduce((a, p) => a + recargoDe(p), 0);
  const movs = S.movimientos.filter(m => m.fecha === f);
  const egresosMov = movs.filter(m => m.tipo !== 'ingreso').reduce((a, m) => a + m.monto, 0);
  const egresosMovEfe = movs.filter(m => m.tipo !== 'ingreso' && m.medio === 'efectivo').reduce((a, m) => a + m.monto, 0);
  const ingresosMovEfe = movs.filter(m => m.tipo === 'ingreso' && m.medio === 'efectivo').reduce((a, m) => a + m.monto, 0);
  const unidades = dia.reduce((a, p) => a + p.items.reduce((x, i) => x + i.cant, 0), 0);
  const descuentos = dia.reduce((a, p) => a + (p.descuento || 0), 0);
  const costo = dia.reduce((a, p) => a + p.items.reduce((x, i) => { const pr = prod(i.pid); return x + (pr ? pr.costo * i.cant : 0); }, 0), 0);
  const comprasDia = S.compras.filter(c => c.fecha === f);
  const egresos = comprasDia.reduce((a, c) => a + c.total, 0);

  let h = '<div class="row" style="margin-bottom:14px"><h3 style="font-size:17px">' + cap(fechaLarga(f)) + '</h3>' +
          (f === hoy() ? '<span class="pill ok">Hoy</span>' : '') + '</div>';

  h += '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Ventas del día', fmt(ventas), dia.length + ' pedido(s) cobrados', true) +
    kpi('Ticket promedio', fmt(dia.length ? ventas / dia.length : 0), unidades + ' unidades vendidas') +
    kpi('Margen estimado', fmt(ventas - costo), (ventas ? Math.round((ventas - costo) / ventas * 100) : 0) + '% sobre la venta') +
    kpi('Salidas del día', fmt(egresos + egresosMov), comprasDia.length + ' compra(s) · ' + movs.filter(m => m.tipo !== 'ingreso').length + ' gasto(s)') +
  '</div>';

  /* --- Medios de pago --- */
  const porPago = {};
  const medios = mediosUsados();
  medios.forEach(k => porPago[k] = { n: 0, m: 0 });
  dia.forEach(p => {
    const m = porMedio(p);
    Object.keys(m).forEach(k => { if (!porPago[k]) porPago[k] = { n: 0, m: 0 }; porPago[k].n++; porPago[k].m += m[k]; });
  });
  const cobros = S.pagosCuenta.filter(x => x.fecha === f);
  const cobrosTot = cobros.reduce((a, x) => a + x.monto, 0);
  const cobrosEfe = cobros.filter(x => x.medio === 'efectivo').reduce((a, x) => a + x.monto, 0);
  const maxPago = Math.max(1, ...Object.values(porPago).map(v => v.m));

  h += '<div class="grid2" style="margin-bottom:18px;align-items:start">';

  h += '<div class="card"><div class="hd"><h3>💳 Medios de pago</h3></div><div class="tbl-wrap"><table><tbody>' +
    medios.map(k => {
      const v = porPago[k];
      return '<tr><td style="width:32%"><b>' + nombrePago(k) + '</b><div class="small muted">' + v.n + ' pedido(s)</div></td>' +
        '<td><div class="bar"><i style="width:' + (v.m / maxPago * 100) + '%"></i></div></td>' +
        '<td class="num" style="width:110px"><b>' + fmt(v.m) + '</b></td></tr>';
    }).join('') +
    '<tr><td><b>Total</b></td><td></td><td class="num"><b>' + fmt(ventas) + '</b></td></tr>' +
    (recargos ? '<tr><td class="small muted">Incluye recargo por crédito</td><td></td>' +
      '<td class="num small muted">' + fmt(recargos) + '</td></tr>' : '') +
    (cobrosTot ? '<tr><td><b>Cobros de cuentas</b><div class="small muted">' + cobros.length + ' pago(s) recibidos</div></td><td></td>' +
      '<td class="num"><b>' + fmt(cobrosTot) + '</b></td></tr>' : '') +
    '</tbody></table></div>' +
    (porPago.cuenta && porPago.cuenta.m
      ? '<div class="bd" style="padding-top:0"><div class="alert info small"><span>ℹ</span><div>' + fmt(porPago.cuenta.m) +
        ' se cargaron a cuenta corriente: son ventas del día pero todavía no entraron a la caja. ' +
        '<a href="#" onclick="go(\'cuentas\');return false">Ver cuentas</a></div></div></div>'
      : '') + '</div>';

  /* --- Ventas por hora --- */
  const horas = {};
  dia.forEach(p => { const hh = new Date(p.cerrado).getHours(); horas[hh] = (horas[hh] || 0) + total(p); });
  const hk = Object.keys(horas).map(Number).sort((a, b) => a - b);
  const maxH = Math.max(1, ...Object.values(horas));
  h += '<div class="card"><div class="hd"><h3>🕐 Ventas por hora</h3></div><div class="bd">' +
    (hk.length
      ? hk.map(x => '<div class="row" style="margin-bottom:7px;flex-wrap:nowrap">' +
          '<span class="mono small" style="width:52px">' + pad(x) + ':00</span>' +
          '<div class="bar grow"><i style="width:' + (horas[x] / maxH * 100) + '%"></i></div>' +
          '<span class="mono small" style="width:92px;text-align:right">' + fmt(horas[x]) + '</span></div>').join('')
      : '<div class="muted small">Sin ventas registradas en este día.</div>') +
  '</div></div>';

  h += '</div>';

  /* --- Top productos --- */
  const top = {};
  dia.forEach(p => p.items.forEach(i => {
    if (!top[i.nombre]) top[i.nombre] = { c: 0, m: 0 };
    top[i.nombre].c += i.cant; top[i.nombre].m += i.precio * i.cant;
  }));
  const tl = Object.entries(top).sort((a, b) => b[1].m - a[1].m).slice(0, 10);
  const maxT = Math.max(1, ...tl.map(t => t[1].m));

  h += '<div class="grid2" style="align-items:start">';
  h += '<div class="card"><div class="hd"><h3>⭐ Más vendidos del día</h3></div>' +
    (tl.length
      ? '<div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th>Participación</th><th class="num">Importe</th></tr></thead><tbody>' +
        tl.map(t => '<tr><td>' + esc(t[0]) + '</td><td class="num">' + t[1].c + '</td>' +
          '<td><div class="bar"><i style="width:' + (t[1].m / maxT * 100) + '%"></i></div></td>' +
          '<td class="num"><b>' + fmt(t[1].m) + '</b></td></tr>').join('') + '</tbody></table></div>'
      : vacio('⭐', 'Sin ventas', 'Todavía no se cobraron pedidos este día.')) +
  '</div>';

  /* --- Cierre de caja --- */
  const cierre = S.cierres.find(c => c.fecha === f);
  const efectivo = porPago.efectivo ? porPago.efectivo.m : 0;
  const efeCompras = comprasDia.filter(c => c.pago === 'efectivo').reduce((a, c) => a + c.total, 0);
  const ingresoEfe = redondear(efectivo + cobrosEfe + ingresosMovEfe);
  const salidasEfe = redondear(efeCompras + egresosMovEfe);

  h += '<div class="card"><div class="hd"><h3>🧮 Cierre de caja</h3>' +
       (cierre ? '<span class="pill ok">Cerrada</span>' : '<span class="pill warn">Pendiente</span>') + '</div><div class="bd">' +
    '<div class="tot-row"><span class="muted">Fondo inicial</span><b class="mono" id="ceFondoTxt">' + fmt(cierre ? cierre.fondo : 0) + '</b></div>' +
    '<div class="tot-row"><span class="muted">+ Ventas en efectivo</span><b class="mono">' + fmt(efectivo) + '</b></div>' +
    (cobrosEfe ? '<div class="tot-row"><span class="muted">+ Cobros de cuentas en efectivo</span><b class="mono">' + fmt(cobrosEfe) + '</b></div>' : '') +
    (ingresosMovEfe ? '<div class="tot-row"><span class="muted">+ Ingresos extra en efectivo</span><b class="mono">' + fmt(ingresosMovEfe) + '</b></div>' : '') +
    '<div class="tot-row"><span class="muted">− Compras pagadas en efectivo</span><b class="mono">' + fmt(efeCompras) + '</b></div>' +
    (egresosMovEfe ? '<div class="tot-row"><span class="muted">− Gastos y retiros en efectivo</span><b class="mono">' + fmt(egresosMovEfe) + '</b></div>' : '') +
    '<div class="tot-row big"><span>Efectivo esperado</span><span class="mono" id="ceEsp">' + fmt((cierre ? cierre.fondo : 0) + ingresoEfe - salidasEfe) + '</span></div>' +
    '<div class="sep"></div>' +
    '<div class="grid3">' +
      '<div class="field"><label>Fondo inicial de caja</label><input type="number" step="any" id="ceFondo" value="' + (cierre ? cierre.fondo : 0) + '" oninput="calcCierre(' + ingresoEfe + ',' + salidasEfe + ')"></div>' +
      '<div class="field"><label>💵 Cambio</label><input type="number" step="any" id="ceCambio" value="' + (cierre && cierre.cambio ? cierre.cambio : '') + '" placeholder="0" oninput="calcCierre(' + ingresoEfe + ',' + salidasEfe + ')"></div>' +
      '<div class="field"><label>💰 Efectivo</label><input type="number" step="any" id="ceEfe" value="' + (cierre && cierre.efectivoCont ? cierre.efectivoCont : '') + '" placeholder="0" oninput="calcCierre(' + ingresoEfe + ',' + salidasEfe + ')"></div>' +
    '</div>' +
    '<div class="tot-row" style="margin-top:8px"><span class="muted">Total contado (cambio + efectivo)</span>' +
      '<b class="mono" id="ceContTxt">' + fmt(cierre ? cierre.contado : 0) + '</b></div>' +
    '<div id="ceDif" class="alert info" style="margin-top:12px">Ingresá el efectivo contado para ver la diferencia.</div>' +
    '<div class="field" style="margin-top:10px"><label>Observaciones</label><input type="text" id="ceNota" value="' + esc(cierre ? cierre.nota : '') + '" placeholder="Ej: retiro de $10.000 al mediodía"></div>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn pri grow" onclick="guardarCierre(' + ingresoEfe + ',' + salidasEfe + ',' + ventas + ')">💾 ' + (cierre ? 'Actualizar cierre' : 'Guardar cierre') + '</button>' +
      '<button class="btn" onclick="imprimirCierre()">🖨 Imprimir</button>' +
    '</div>' +
    (descuentos ? '<div class="small muted" style="margin-top:10px">Descuentos otorgados: ' + fmt(descuentos) + '</div>' : '') +
    (anul.length ? '<div class="small muted" style="margin-top:4px">' + anul.length + ' pedido(s) anulados este día.</div>' : '') +
  '</div></div>';
  h += '</div>';

  h += htmlMozosYGastos(dia, movs, f);
  $('#v-caja').innerHTML = h;
  calcCierre(ingresoEfe, salidasEfe);
}

/* ---------- Ventas por mozo y gastos del día ---------- */
function htmlMozosYGastos(dia, movs, f){
  const porMozo = {};
  dia.forEach(p => {
    const k = p.mozoNombre || 'Sin asignar';
    if (!porMozo[k]) porMozo[k] = { n: 0, m: 0, u: 0 };
    porMozo[k].n++; porMozo[k].m += totalCobrado(p);
    porMozo[k].u += p.items.reduce((a, i) => a + i.cant, 0);
  });
  const ml = Object.entries(porMozo).sort((a, b) => b[1].m - a[1].m);
  const maxM = Math.max(1, ...ml.map(x => x[1].m));

  let h = '<div class="grid2" style="margin-top:18px;align-items:start">';

  h += '<div class="card"><div class="hd"><h3>🧑‍🍳 Ventas por mozo</h3></div>' +
    (ml.length
      ? '<div class="tbl-wrap"><table><thead><tr><th>Mozo</th><th class="num">Pedidos</th><th>Participación</th><th class="num">Vendido</th></tr></thead><tbody>' +
        ml.map(x => '<tr><td><b>' + esc(x[0]) + '</b><div class="small muted">' + x[1].u + ' unidades</div></td>' +
          '<td class="num">' + x[1].n + '</td>' +
          '<td><div class="bar"><i style="width:' + (x[1].m / maxM * 100) + '%"></i></div></td>' +
          '<td class="num"><b>' + fmt(x[1].m) + '</b></td></tr>').join('') +
        '</tbody></table></div>'
      : vacio('🧑‍🍳', 'Sin ventas', 'No hay pedidos cobrados este día.')) +
  '</div>';

  const totMov = movs.filter(m => m.tipo !== 'ingreso').reduce((a, m) => a + m.monto, 0);
  h += '<div class="card"><div class="hd"><h3>💸 Gastos y retiros</h3>' +
      '<span class="pill gray">' + fmt(totMov) + '</span>' +
      '<div class="sp" style="flex:1"></div>' +
      '<button class="btn sm pri" onclick="formMovimiento()">＋ Registrar</button></div>';
  if (!movs.length){
    h += '<div class="bd"><div class="muted small">Sin gastos ni retiros cargados este día. Usá “＋ Registrar” para anotar sueldos, servicios, un retiro de caja o un ingreso extra: así el efectivo esperado del cierre da exacto.</div></div>';
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Tipo</th><th>Concepto</th><th>Forma</th><th class="num">Monto</th><th></th></tr></thead><tbody>' +
      movs.map(m => '<tr>' +
        '<td><span class="pill ' + (m.tipo === 'ingreso' ? 'ok' : m.tipo === 'retiro' ? 'warn' : 'bad') + '">' + TIPOS_MOV[m.tipo] + '</span></td>' +
        '<td><b>' + esc(m.concepto) + '</b>' + (m.nota ? '<div class="small muted">' + esc(m.nota) + '</div>' : '') +
          (m.usuario ? '<div class="small muted">' + esc(m.usuario) + '</div>' : '') + '</td>' +
        '<td class="small">' + nombrePago(m.medio) + '</td>' +
        '<td class="num"><b>' + (m.tipo === 'ingreso' ? '+ ' : '− ') + fmt(m.monto) + '</b></td>' +
        '<td><button class="btn xs dan" onclick="borrarMovimiento(\'' + m.id + '\')">×</button></td>' +
      '</tr>').join('') + '</tbody></table></div>';
  }
  h += '</div>';
  return h + '</div>';
}

const CONCEPTOS = ['Sueldos', 'Servicios (luz, gas, internet)', 'Alquiler', 'Limpieza', 'Mantenimiento',
                   'Retiro de caja', 'Delivery / fletes', 'Impuestos', 'Varios'];

function formMovimiento(id){
  if (!soloAdmin('registrar gastos de caja')) return;
  const m = id ? S.movimientos.find(x => x.id === id) : null;
  modal({
    title: m ? 'Editar movimiento' : 'Registrar gasto o retiro',
    body:
      '<div class="grid2">' +
        '<div class="field"><label>Tipo</label><select id="mvTipo">' +
          Object.keys(TIPOS_MOV).map(k => '<option value="' + k + '" ' + (m && m.tipo === k ? 'selected' : '') + '>' + TIPOS_MOV[k] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Fecha</label><input type="date" id="mvFecha" value="' + (m ? m.fecha : CAJA.fecha) + '"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Concepto *</label>' +
        '<input type="text" id="mvConc" list="concList" value="' + esc(m ? m.concepto : '') + '" placeholder="Ej: Sueldo Lucía, luz, retiro">' +
        '<datalist id="concList">' + CONCEPTOS.map(c => '<option value="' + c + '">').join('') + '</datalist></div>' +
      '<div class="grid2" style="margin-top:12px">' +
        '<div class="field"><label>Monto *</label><input type="number" min="0" step="any" id="mvMonto" value="' + (m ? m.monto : '') + '"></div>' +
        '<div class="field"><label>Salió de</label><select id="mvMedio">' +
          Object.keys(PAGOS).filter(k => k !== 'cuenta').map(k => '<option value="' + k + '" ' + (m && m.medio === k ? 'selected' : '') + '>' + PAGOS[k] + '</option>').join('') +
        '</select></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Observaciones</label>' +
        '<input type="text" id="mvNota" value="' + esc(m ? m.nota : '') + '" placeholder="Opcional"></div>' +
      '<div class="alert info small" style="margin-top:12px"><span>ℹ</span><div>Lo que sale en efectivo se descuenta del efectivo esperado en el cierre de caja.</div></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="mvOk">Guardar</button>'
  });
  $('#mvOk').onclick = () => {
    const c = $('#mvConc').value.trim(), mo = num($('#mvMonto').value);
    if (!c) return toast('Poné un concepto');
    if (mo <= 0) return toast('Poné un monto mayor a cero');
    const o = { tipo: $('#mvTipo').value, fecha: $('#mvFecha').value || hoy(), concepto: c,
                monto: redondear(mo), medio: $('#mvMedio').value, nota: $('#mvNota').value.trim() };
    if (m) Object.assign(m, o);
    else S.movimientos.push(Object.assign({ id: uid(), creado: new Date().toISOString(),
      usuario: USUARIO ? USUARIO.nombre : '' }, o));
    CAJA.fecha = o.fecha;
    save(); closeModal(); refresh(); toast('Movimiento registrado');
  };
}

function borrarMovimiento(id){
  if (!soloAdmin('borrar movimientos de caja')) return;
  const m = S.movimientos.find(x => x.id === id); if (!m) return;
  confirmar('¿Borrar <b>' + esc(m.concepto) + '</b> por ' + fmt(m.monto) + '?', () => {
    S.movimientos = S.movimientos.filter(x => x.id !== id);
    save(); refresh(); toast('Movimiento borrado');
  }, 'Borrar');
}

/* El efectivo contado sale de sumar lo que se dejó de cambio más el efectivo */
function contadoCierre(){
  const c = $('#ceCambio'), e = $('#ceEfe');
  const vacio = (!c || c.value === '') && (!e || e.value === '');
  return { vacio: vacio, total: num(c ? c.value : 0) + num(e ? e.value : 0) };
}

function calcCierre(efectivo, efeCompras){
  const fondo = num($('#ceFondo') ? $('#ceFondo').value : 0);
  const espN = fondo + efectivo - efeCompras;
  const esp = $('#ceEsp'); if (esp) esp.textContent = fmt(espN);
  const ft = $('#ceFondoTxt'); if (ft) ft.textContent = fmt(fondo);
  const cont = contadoCierre();
  const ct = $('#ceContTxt'); if (ct) ct.textContent = fmt(cont.total);
  const d = $('#ceDif'); if (!d) return;
  if (cont.vacio){ d.className = 'alert info'; d.innerHTML = 'Cargá el cambio y el efectivo para ver la diferencia.'; return; }
  const dif = cont.total - espN;
  if (Math.abs(dif) < 0.005){ d.className = 'alert info'; d.innerHTML = '<span>✓</span><div><b>Caja justa.</b> El efectivo contado coincide con lo esperado.</div>'; }
  else if (dif > 0){ d.className = 'alert info'; d.innerHTML = '<span>▲</span><div><b>Sobrante de ' + fmt(dif) + '</b> respecto de lo esperado.</div>'; }
  else { d.className = 'alert warn'; d.innerHTML = '<span>▼</span><div><b>Faltante de ' + fmt(-dif) + '</b> respecto de lo esperado.</div>'; }
}

function guardarCierre(efectivo, efeCompras, ventas){
  const f = CAJA.fecha;
  const fondo = num($('#ceFondo').value);
  const cambio = num($('#ceCambio').value), efeCont = num($('#ceEfe').value);
  const cont = cambio + efeCont;
  const esp = fondo + efectivo - efeCompras;
  const reg = { id: uid(), fecha: f, fondo: fondo, contado: cont, esperado: esp, dif: cont - esp,
                cambio: cambio, efectivoCont: efeCont,
                ventas: ventas, efectivo: efectivo, nota: $('#ceNota').value, creado: new Date().toISOString() };
  const i = S.cierres.findIndex(c => c.fecha === f);
  if (i >= 0) S.cierres[i] = reg; else S.cierres.push(reg);
  save(); refresh(); toast('Cierre de caja guardado');
}

/* ============================================================
   IMPRESIÓN
   ============================================================ */
/* ---------- Ancho del papel ----------
   Cada café tiene su impresora: la de Lo de Valdez es de 80 mm y la de
   Evacafé más angosta. En papel chico, con la letra de 80 mm el nombre del
   producto empujaba al precio fuera del papel y no se veía. Acá se ajustan
   el tamaño de página, el ancho útil y la letra al papel de este café. */
/* Medidas de cada papel.
   NO se fija el ancho en milímetros: el área que el cabezal puede marcar es
   más angosta que el papel y cambia según el modelo, así que cualquier
   medida que pongamos acá puede pasarse y cortar el borde derecho, que es
   justo donde va el precio. El ticket ocupa el 100% de la página que
   informa el driver, y lo único que se ajusta por papel es el tamaño de
   letra y cuánto del renglón se le reserva al precio. */
const TK_PAPEL = {
  80: { margen: 4, fuente: 15, precio: '34%' },
  58: { margen: 4, fuente: 10, precio: '42%' }
};
function anchoTicket(){
  return Number(S.config.anchoTicket) === 58 ? 58 : 80;
}
function tkAplicarAncho(){
  const a = anchoTicket();
  const p = TK_PAPEL[a];
  let st = document.getElementById('tkEstilo');
  if (!st){ st = document.createElement('style'); st.id = 'tkEstilo'; document.head.appendChild(st); }
  st.textContent = ':root{--tk-fuente:' + p.fuente + 'px;--tk-precio:' + p.precio + '}' +
                   '@media print{@page{margin:' + p.margen + 'mm;size:' + a + 'mm auto}}';
}
/* Único lugar desde donde se manda a imprimir */
function tkImprimir(){
  tkAplicarAncho();
  window.print();      /* el ÚNICO window.print() del sistema */
}

function tkHead(){
  const c = S.config;
  return '<div class="c"><b>' + esc(c.nombre) + '</b></div>' +
    (c.direccion ? '<div class="c">' + esc(c.direccion) + '</div>' : '') +
    (c.telefono ? '<div class="c">Tel: ' + esc(c.telefono) + '</div>' : '');
}

/* Filas de productos con precio unitario e importe */
function tkItems(p){
  return '<table>' + p.items.map(i =>
    '<tr><td>' + i.cant + ' x ' + esc(i.nombre) + '</td><td align="right">' + fmt(i.precio * i.cant) + '</td></tr>' +
    (i.cant > 1 ? '<tr><td colspan="2" class="s">&nbsp;&nbsp;&nbsp;' + fmt(i.precio) + ' c/u</td></tr>' : '') +
    (i.nota ? '<tr><td colspan="2" class="s">&nbsp;&nbsp;&nbsp;* ' + esc(i.nota) + '</td></tr>' : '')
  ).join('') + '</table>';
}

/* Bloque de totales + propina sugerida */
function tkTotales(p, conPago){
  const prop = propinaDe(p);
  const rec = recargoDe(p);
  const vuelto = lineasPago(p).reduce((a, l) => a + (l.vuelto || 0), 0);
  const recibido = lineasPago(p).reduce((a, l) => a + (l.recibido || 0), 0);
  return '<table>' +
      '<tr><td>Subtotal</td><td align="right">' + fmt(subtotal(p)) + '</td></tr>' +
      (p.descuento ? '<tr><td>' + textoDescuento(p) + '</td><td align="right">- ' + fmt(p.descuento) + '</td></tr>' : '') +
      '<tr><td><b>TOTAL</b></td><td align="right"><b>' + fmt(total(p)) + '</b></td></tr>' +
      (rec ? '<tr><td>Recargo cr&eacute;dito (' + S.config.recargoCredito + '%)</td><td align="right">+' + fmt(rec) + '</td></tr>' +
             '<tr><td><b>TOTAL A PAGAR</b></td><td align="right"><b>' + fmt(totalCobrado(p)) + '</b></td></tr>' : '') +
      (conPago
        ? lineasPago(p).map(l => '<tr><td>' + nombrePago(l.medio) +
            (l.cuentaId && cuenta(l.cuentaId) ? ' ' + esc(cuenta(l.cuentaId).nombre) : '') +
            '</td><td align="right">' + fmt(cobradoLinea(l)) + '</td></tr>').join('') +
          (recibido ? '<tr><td>Recibido</td><td align="right">' + fmt(recibido) + '</td></tr>' : '') +
          (vuelto ? '<tr><td><b>Vuelto</b></td><td align="right"><b>' + fmt(vuelto) + '</b></td></tr>' : '')
        : '') +
    '</table>' +
    (prop > 0
      ? '<div class="l"></div><table>' +
          '<tr><td>Propina sugerida (' + S.config.propina + '%)</td><td align="right">' + fmt(prop) + '</td></tr>' +
          '<tr><td><b>TOTAL CON PROPINA</b></td><td align="right"><b>' + fmt(total(p) + prop) + '</b></td></tr>' +
        '</table>' +
        '<div class="c s" style="margin-top:2px">La propina es voluntaria</div>'
      : '');
}

/* Ticket único: sirve para preparar el pedido y para dejar en la mesa */
function imprimirPedido(p, nuevos, reimpresion){
  if (!p || !p.items.length) return toast('El pedido está vacío');
  const cobrado = p.estado === 'cerrado';
  const marcar = Array.isArray(nuevos) && nuevos.length && nuevos.length < p.items.length;
  const esNuevo = i => marcar && nuevos.indexOf(i) >= 0;
  $('#tk').innerHTML =
    tkHead() +
    '<div class="l"></div>' +
    '<div class="c"><b>' + (cobrado ? 'TICKET' : 'PEDIDO') + ' N&deg; ' + p.num + (reimpresion ? ' (COPIA)' : '') + '</b></div>' +
    '<div class="c"><b>' +
      (p.tipo === 'mesa' ? 'MESA ' + p.mesaNum : 'PARA LLEVAR') + '</b></div>' +
    '<div>' + (cobrado ? fechaCorta(p.cerrado) + ' ' + hora(p.cerrado) : fechaCorta(new Date()) + ' ' + hora(new Date())) + '</div>' +
    (p.personas ? '<div>Personas: ' + p.personas + '</div>' : '') +
    (p.mozoNombre ? '<div>Atendi&oacute;: ' + esc(p.mozoNombre) + '</div>' : '') +
    (marcar ? '<div class="l"></div><div class="c"><b>** AGREGADO AL PEDIDO **</b></div>' : '') +
    '<div class="l"></div>' +
    '<table>' + p.items.map(i =>
      '<tr><td>' + (esNuevo(i) ? '&gt;&gt; ' : '') + '<b>' + i.cant + ' x ' + esc(i.nombre) + '</b>' +
        (esNuevo(i) ? ' *NUEVO*' : '') + '</td>' +
      '<td align="right">' + fmt(i.precio * i.cant) + '</td></tr>' +
      (i.cant > 1 ? '<tr><td colspan="2" class="s">&nbsp;&nbsp;&nbsp;' + fmt(i.precio) + ' c/u</td></tr>' : '') +
      (i.nota ? '<tr><td colspan="2" class="s">&nbsp;&nbsp;&nbsp;* ' + esc(i.nota) + '</td></tr>' : '')
    ).join('') + '</table>' +
    '<div class="l"></div>' +
    tkTotales(p, cobrado) +
    '<div class="l"></div>' +
    '<div class="c">' + esc(S.config.pieTicket) + '</div>' +
    '<div class="c s" style="margin-top:4px">Documento no v&aacute;lido como factura</div>';
  tkImprimir();
  toast(reimpresion ? 'Pedido reimpreso' : 'Pedido impreso y enviado');
}

/* Reimpresión del mismo ticket, desde el historial de pedidos */
function imprimirTicket(id){
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  imprimirPedido(p, null, true);
}

function imprimirCierre(){
  const f = CAJA.fecha;
  const dia = S.pedidos.filter(p => p.estado === 'cerrado' && dkey(p.cerrado) === f);
  const ventas = dia.reduce((a, p) => a + totalCobrado(p), 0);
  const porPago = {};
  dia.forEach(p => { const m = porMedio(p); Object.keys(m).forEach(k => porPago[k] = (porPago[k] || 0) + m[k]); });
  const fondo = num($('#ceFondo') ? $('#ceFondo').value : 0);
  const ctd = contadoCierre();
  const cont = ctd.vacio ? null : ctd.total;
  const cambio = num($('#ceCambio') ? $('#ceCambio').value : 0);
  const efeCont = num($('#ceEfe') ? $('#ceEfe').value : 0);
  const efeCompras = S.compras.filter(c => c.fecha === f && c.pago === 'efectivo').reduce((a, c) => a + c.total, 0);
  const cobrosEfe = S.pagosCuenta.filter(x => x.fecha === f && x.medio === 'efectivo').reduce((a, x) => a + x.monto, 0);
  const movsEfe = S.movimientos.filter(m => m.fecha === f && m.medio === 'efectivo');
  const gastosEfe = movsEfe.filter(m => m.tipo !== 'ingreso').reduce((a, m) => a + m.monto, 0);
  const extraEfe = movsEfe.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const esp = fondo + (porPago.efectivo || 0) + cobrosEfe + extraEfe - efeCompras - gastosEfe;
  $('#tk').innerHTML =
    tkHead() + '<div class="l"></div>' +
    '<div class="c"><b>CIERRE DE CAJA</b></div>' +
    '<div class="c">' + fechaCorta(f + 'T12:00') + '</div>' +
    '<div class="l"></div>' +
    '<table>' +
      mediosUsados().map(k => '<tr><td>' + nombrePago(k) + '</td><td align="right">' + fmt(porPago[k] || 0) + '</td></tr>').join('') +
      '<tr><td><b>TOTAL VENTAS</b></td><td align="right"><b>' + fmt(ventas) + '</b></td></tr>' +
      '<tr><td>Pedidos</td><td align="right">' + dia.length + '</td></tr>' +
    '</table><div class="l"></div>' +
    '<table>' +
      '<tr><td>Fondo inicial</td><td align="right">' + fmt(fondo) + '</td></tr>' +
      (cobrosEfe ? '<tr><td>Cobros cuentas</td><td align="right">' + fmt(cobrosEfe) + '</td></tr>' : '') +
      (extraEfe ? '<tr><td>Ingresos extra</td><td align="right">' + fmt(extraEfe) + '</td></tr>' : '') +
      (gastosEfe ? '<tr><td>Gastos y retiros</td><td align="right">-' + fmt(gastosEfe) + '</td></tr>' : '') +
      '<tr><td>Compras efectivo</td><td align="right">-' + fmt(efeCompras) + '</td></tr>' +
      '<tr><td><b>Efectivo esperado</b></td><td align="right"><b>' + fmt(esp) + '</b></td></tr>' +
      (cont !== null ? '<tr><td>Cambio</td><td align="right">' + fmt(cambio) + '</td></tr>' +
        '<tr><td>Efectivo</td><td align="right">' + fmt(efeCont) + '</td></tr>' +
        '<tr><td><b>Efectivo contado</b></td><td align="right"><b>' + fmt(cont) + '</b></td></tr>' +
        '<tr><td><b>Diferencia</b></td><td align="right"><b>' + fmt(cont - esp) + '</b></td></tr>' : '') +
    '</table>' +
    '<div class="l"></div><div style="height:26px"></div><div class="c">Firma responsable</div>';
  tkImprimir();
}
