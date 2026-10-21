/* ============================================================
   CAJA — resumen diario, cierre y tickets
   ============================================================ */

/* "dia" es el hoy() que corría cuando se fijó la fecha; sirve para saber si
   la pantalla se quedó dormida de un día para el otro (ver alDiaCAJA). */
let CAJA = { fecha: hoy(), dia: hoy(), borrador: null, mostrado: null };

/* ---------- La pantalla amanece con la fecha de anoche ----------
   En el café nadie cierra el navegador: la computadora sigue mostrando la
   página de ayer. CAJA.fecha se fijaba una sola vez al cargar, así que
   pasada la medianoche la caja seguía parada en el día anterior mientras
   la pantalla de Mesas —que recalcula hoy() en cada dibujado— ya mostraba
   el día nuevo. Las ventas del día estaban cargadas, pero en la caja no
   aparecían, y la única forma de destrabarlo era apretar F5. Pasó el
   8/9/2026 con una sola computadora en uso.
   Si se eligió otra fecha a mano, se la respeta: solo se mueve sola la
   pantalla que estaba mirando "hoy". */
function alDiaCAJA(){
  if (CAJA.fecha === CAJA.dia && CAJA.dia !== hoy()) CAJA.fecha = hoy();
  CAJA.dia = hoy();
}

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
   caen en el primer turno, para que no queden afuera de todos.
   El día de carga se saca con dkey(), en hora de acá. Antes se cortaban
   los primeros 10 caracteres de "creado", que está en hora universal (3
   horas adelante): lo que se cargaba después de las 21 figuraba como del
   día siguiente y caía en el turno de la mañana, ya cerrado. El gasto
   desaparecía del turno de la tarde y su arqueo daba faltante. */
function enTurnoManual(creado, f, t){
  if (!msDe(creado) || dkey(creado) !== f) return !!t.primero;
  return enTurno(creado, t);
}

/* En el café se hacen dos turnos, mañana y tarde, así que el nombre se
   sugiere por el orden en que se cierra: el primer arqueo del día es el de
   la mañana y el segundo el de la tarde. Antes se miraba la hora, y el día
   que la mañana cerraba tarde el turno salía anotado como "Tarde". El
   nombre se puede escribir a mano igual. */
function nombreTurnoSugerido(cerrados){
  const n = cerrados != null ? cerrados : turnosDelDia(CAJA.fecha).length - 1;
  return n === 0 ? 'Mañana' : n === 1 ? 'Tarde' : 'Turno ' + (n + 1);
}

/* ---------- El fondo con el que arranca un turno ----------
   La plata que queda en el cajón al cerrar es el cambio para el que sigue:
   ese mismo cambio es el fondo inicial del próximo turno. Antes se sugería
   el fondo del turno anterior —el número con el que ese turno había
   arrancado, no lo que dejó— y el primer turno del día empezaba siempre en
   cero, aunque la tarde anterior hubiera dejado el cambio en la caja.    */
function cambioQueDejo(c){
  if (!c) return 0;
  /* Los arqueos viejos no anotaban el cambio aparte: se usa su fondo */
  return typeof c.cambio === 'number' ? c.cambio : (c.fondo || 0);
}
/* El último cierre hecho antes de este turno, sea de hoy o de días pasados */
function cierreAnterior(f, cerrados){
  if (cerrados.length) return cerrados[cerrados.length - 1].cierre;
  return S.cierres.filter(c => c.fecha < f)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || msDe(a.hasta) - msDe(b.hasta))
    .pop() || null;
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
    pedidos: pedidos, porPago: porPago, cobros: cobros, movs: movs, compras: compras,
    ventas: redondear(pedidos.reduce((a, p) => a + totalCobrado(p), 0)),
    efectivo: efectivo, cobrosEfe: cobrosEfe, extraEfe: extraEfe,
    gastosEfe: gastosEfe, comprasEfe: comprasEfe,
    entra: redondear(efectivo + cobrosEfe + extraEfe),
    sale: redondear(comprasEfe + gastosEfe)
  };
}

/* ---------- Lo que se guarda del turno al cerrarlo ----------
   El ticket del arqueo se reimprime con lo que había al cerrar, no con lo
   que da hoy recalculando: si después se anuló un pedido o se cambió una
   forma de pago, el ticket viejo tiene que seguir sumando igual que el
   papel que se firmó. */
function detalleTurno(t){
  return { porPago: Object.assign({}, t.porPago), pedidos: t.pedidos.length,
           efectivo: t.efectivo, cobrosEfe: t.cobrosEfe, extraEfe: t.extraEfe,
           gastosEfe: t.gastosEfe, comprasEfe: t.comprasEfe };
}

/* ---------- Un turno cerrado al que después le cambiaron los números ----------
   Si la otra computadora estuvo sin internet y cobró antes del cierre,
   esas ventas llegan después y caen en un turno que ya se contó: no
   aparecen en ningún arqueo. Lo mismo un pedido anulado o una forma de
   pago corregida después de cerrar. No se toca el cierre (es lo que se
   contó en su momento); se avisa cuánto daría el esperado hoy. */
function cambioDesdeElCierre(c, turno){
  if (!c || typeof c.efectivo !== 'number' || typeof c.salidas !== 'number') return null;
  const t = numerosTurno(c.fecha, turno);
  const dEnt = redondear(t.entra - c.efectivo), dSal = redondear(t.sale - c.salidas);
  const dVen = typeof c.ventas === 'number' ? redondear(t.ventas - c.ventas) : 0;
  if (Math.abs(dEnt) < 0.5 && Math.abs(dSal) < 0.5 && Math.abs(dVen) < 0.5) return null;
  return { ventas: dVen, entra: dEnt, sale: dSal,
           esperadoHoy: redondear((c.fondo || 0) + t.entra - t.sale) };
}

/* ---------- El turno anterior quedó sin cerrar ----------
   El fondo de hoy se sugiere con el cambio que dejó el último cierre. Si
   el último día con ventas terminó con un turno abierto, ese cambio es de
   antes y no es lo que hay en el cajón. Se mira el último día con algo
   cobrado antes de f. */
function turnoSinCerrarAntes(f){
  let ult = '';
  S.pedidos.forEach(p => {
    if (p.estado !== 'cerrado' || !p.cerrado) return;
    const d = dkey(p.cerrado);
    if (d < f && d > ult) ult = d;
  });
  if (!ult) return null;
  const t = numerosTurno(ult, turnoAbierto(ult));
  if (!t.pedidos.length && !t.entra && !t.sale) return null;
  return { fecha: ult, n: t.pedidos.length, ventas: t.ventas, efectivo: redondear(t.entra - t.sale) };
}

function irACaja(f){ CAJA.fecha = f; if (VIEW === 'caja') refresh(); else go('caja'); }

function moverDia(d){
  const x = new Date(CAJA.fecha + 'T12:00:00');
  x.setDate(x.getDate() + d);
  CAJA.fecha = dkey(x); refresh();
}

function renderCaja(){
  alDiaCAJA();
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
  /* El margen se mide sin el recargo de crédito: ese recargo cubre la
     comisión de la tarjeta, no es ganancia del café. */
  const neto = ventas - recargos;
  const comprasDia = S.compras.filter(c => c.fecha === f);
  const egresos = comprasDia.reduce((a, c) => a + c.total, 0);

  let h = '<div class="row" style="margin-bottom:14px"><h3 style="font-size:17px">' + cap(fechaLarga(f)) + '</h3>' +
          (f === hoy() ? '<span class="pill ok">Hoy</span>' : '') + '</div>';

  h += '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Ventas del día', fmt(ventas), dia.length + ' pedido(s) cobrados', true) +
    kpi('Ticket promedio', fmt(dia.length ? ventas / dia.length : 0), unidades + ' unidades vendidas') +
    kpi('Margen estimado', fmt(neto - costo), (neto ? Math.round((neto - costo) / neto * 100) : 0) + '% sobre la venta') +
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
  /* Con el recargo incluido, igual que "Ventas del día": si no, las horas
     no sumaban el total de arriba los días con pagos con crédito. */
  dia.forEach(p => { const hh = new Date(p.cerrado).getHours(); horas[hh] = (horas[hh] || 0) + totalCobrado(p); });
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

  /* --- Cierre de caja por turno ---
     La caja se puede cerrar varias veces por día. Los turnos ya cerrados se
     listan arriba con quién los cerró; abajo se arquea el que está abierto,
     que abarca desde el último cierre hasta ahora. */
  const turnos = turnosDelDia(f);
  const abierto = turnos[turnos.length - 1];
  const cerrados = turnos.slice(0, -1);
  const t = numerosTurno(f, abierto);
  /* Se arranca con el cambio que dejó el turno anterior (ver cambioQueDejo) */
  const previo = cierreAnterior(f, cerrados);
  const fondoSug = cambioQueDejo(previo);
  const origenFondo = previo
    ? 'Es el cambio que dejó ' + esc(previo.turno || 'el turno anterior') +
      (previo.fecha !== f ? ', del ' + fechaCorta(previo.fecha + 'T12:00') : '') + '.'
    : 'No hay ningún cierre anterior: poné el cambio con el que abrieron la caja.';
  const hayMovimiento = t.pedidos.length || t.entra || t.sale;

  h += '<div class="card" style="min-width:0"><div class="hd"><h3>🧮 Cierre de caja</h3>' +
    (cerrados.length
      ? '<span class="pill ok">' + cerrados.length + ' turno(s) cerrado(s)</span>'
      : '<span class="pill warn">Sin cerrar</span>') +
    '</div><div class="bd">';

  if (cerrados.length){
    const cambiados = [];
    h += '<div class="tbl-wrap" style="margin-bottom:16px"><table><thead><tr>' +
        '<th>Turno</th><th>Hasta</th><th>Cerró</th><th class="num">Ventas</th>' +
        '<th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th>' +
        '<th class="num">Dejó de cambio</th><th></th>' +
      '</tr></thead><tbody>' +
      cerrados.map((x, i) => { const c = x.cierre;
        const cambio = cambioDesdeElCierre(c, x);
        if (cambio) cambiados.push({ c: c, d: cambio });
        /* Solo se reabre el último: si se reabría uno del medio, sus ventas
           pasaban al turno siguiente, que ya estaba cerrado y contado, y no
           volvían a aparecer en ningún arqueo. */
        const ultimo = i === cerrados.length - 1;
        return '<tr>' +
        '<td><b>' + esc(c.turno || 'Turno') + '</b>' + (cambio ? ' <span class="pill warn" title="Cambió después de cerrar">⚠</span>' : '') + '</td>' +
        '<td class="mono small">' + hora(c.hasta) + '</td>' +
        '<td class="small">' + esc(c.usuarioNombre || '—') + '</td>' +
        '<td class="num">' + fmt(c.ventas) + '</td>' +
        '<td class="num">' + fmt(c.esperado) + '</td>' +
        '<td class="num">' + fmt(c.contado) + '</td>' +
        '<td class="num"><span class="pill ' + (Math.abs(c.dif) < 0.005 ? 'ok' : c.dif > 0 ? 'info' : 'bad') + '">' +
          fmt(c.dif) + '</span></td>' +
        '<td class="num mono">' + fmt(cambioQueDejo(c)) + '</td>' +
        '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
          '<button class="btn xs" onclick="imprimirCierre(\'' + c.id + '\')" title="Imprimir este arqueo">🖨</button>' +
          (esAdmin() && ultimo ? '<button class="btn xs dan" onclick="reabrirTurno(\'' + c.id + '\')" title="Reabrir el turno">×</button>' : '') +
        '</td></tr>'; }).join('') +
      (cerrados.length > 1
        ? (() => {
            const v = cerrados.reduce((a, x) => a + (x.cierre.ventas || 0), 0);
            const d = redondear(cerrados.reduce((a, x) => a + (x.cierre.dif || 0), 0));
            return '<tr><td colspan="3"><b>Total de los turnos cerrados</b></td>' +
              '<td class="num"><b>' + fmt(v) + '</b></td><td></td><td></td>' +
              '<td class="num"><span class="pill ' + (Math.abs(d) < 0.005 ? 'ok' : d > 0 ? 'info' : 'bad') + '">' + fmt(d) + '</span></td>' +
              '<td></td><td></td></tr>';
          })()
        : '') +
      '</tbody></table></div>';
    h += cambiados.map(x =>
      '<div class="alert warn small" style="margin-bottom:12px"><span>⚠</span><div>' +
        '<b>' + esc(x.c.turno || 'Un turno') + ' cambió después de cerrarse.</b> ' +
        (x.d.ventas ? 'Ventas ' + (x.d.ventas > 0 ? '+' : '−') + ' ' + fmt(Math.abs(x.d.ventas)) + '. ' : '') +
        (x.d.entra || x.d.sale
          ? 'Con los datos de ahora, el efectivo esperado daría ' + fmt(x.d.esperadoHoy) +
            ' (al cerrar dio ' + fmt(x.c.esperado) + '). '
          : '') +
        'Puede ser una venta de la otra computadora que llegó tarde, un pedido anulado o una forma de pago corregida. ' +
        'El arqueo guardado no se toca.</div></div>').join('');
  }

  /* Lo que se está tipeando en el arqueo sobrevive al repintado: cada vez
     que la otra computadora cobra algo, la caja se vuelve a dibujar, y antes
     se borraban el cambio y el efectivo que se estaban contando. */
  const b = (CAJA.borrador && CAJA.borrador.fecha === f && CAJA.borrador.desde === abierto.desde) ? CAJA.borrador : null;
  if (!b) CAJA.borrador = null;
  const val = (k, def) => esc(b && b[k] != null ? b[k] : def);
  /* Con esto se compara al cerrar, por si entró algo entre que se dibujó y
     se apretó el botón (ver guardarCierre) */
  CAJA.mostrado = { fecha: f, desde: abierto.desde, entra: t.entra, sale: t.sale, ventas: t.ventas };

  const sinCerrar = !cerrados.length ? turnoSinCerrarAntes(f) : null;
  if (sinCerrar)
    h += '<div class="alert warn small" style="margin-bottom:12px"><span>⚠</span><div>' +
      '<b>El ' + fechaCorta(sinCerrar.fecha + 'T12:00') + ' quedó un turno sin cerrar</b> (' +
      sinCerrar.n + ' pedido(s), ' + fmt(sinCerrar.ventas) + ' en ventas). ' +
      'El fondo inicial sugerido sale del último cierre, así que puede no ser lo que hay en el cajón: contalo. ' +
      '<a href="#" onclick="irACaja(\'' + sinCerrar.fecha + '\');return false">Ir a ese día</a></div></div>';

  h += '<div class="row" style="justify-content:space-between;margin-bottom:8px">' +
      '<b>' + (cerrados.length ? 'Turno abierto' : 'Arqueo del día') + '</b>' +
      '<span class="small muted">desde ' + (cerrados.length ? hora(new Date(abierto.desde).toISOString()) : 'la apertura') + '</span>' +
    '</div>' +
    '<div class="tot-row"><span class="muted">Fondo inicial</span><b class="mono" id="ceFondoTxt">' + fmt(fondoSug) + '</b></div>' +
    '<div class="tot-row"><span class="muted">+ Ventas en efectivo</span><b class="mono">' + fmt(t.efectivo) + '</b></div>' +
    (t.cobrosEfe ? '<div class="tot-row"><span class="muted">+ Cobros de cuentas en efectivo</span><b class="mono">' + fmt(t.cobrosEfe) + '</b></div>' : '') +
    (t.extraEfe ? '<div class="tot-row"><span class="muted">+ Ingresos extra en efectivo</span><b class="mono">' + fmt(t.extraEfe) + '</b></div>' : '') +
    '<div class="tot-row"><span class="muted">− Compras pagadas en efectivo</span><b class="mono">' + fmt(t.comprasEfe) + '</b></div>' +
    (t.gastosEfe ? '<div class="tot-row"><span class="muted">− Gastos y retiros en efectivo</span><b class="mono">' + fmt(t.gastosEfe) + '</b></div>' : '') +
    '<div class="tot-row big"><span>Efectivo esperado</span><span class="mono" id="ceEsp">' + fmt(fondoSug + t.entra - t.sale) + '</span></div>' +
    '<div class="sep"></div>' +
    '<div class="grid2" style="margin-bottom:12px">' +
      '<div class="field"><label>Nombre del turno</label>' +
        '<input type="text" id="ceTurno" value="' + val('turno', nombreTurnoSugerido(cerrados.length)) + '" placeholder="Mañana, Tarde…" oninput="calcCierre()"></div>' +
      '<div class="field"><label>Lo cierra</label>' +
        '<input type="text" value="' + esc(USUARIO ? USUARIO.nombre : '—') + '" disabled></div>' +
    '</div>' +
    '<div class="grid3">' +
      '<div class="field"><label>Fondo inicial de caja</label><input type="number" min="0" step="any" id="ceFondo" value="' + val('fondo', fondoSug) + '" oninput="calcCierre()"></div>' +
      '<div class="field"><label>💵 Cambio que queda</label><input type="number" min="0" step="any" id="ceCambio" placeholder="0" value="' + val('cambio', '') + '" oninput="calcCierre()"></div>' +
      '<div class="field"><label>💰 Efectivo que se saca</label><input type="number" min="0" step="any" id="ceEfe" placeholder="0" value="' + val('efe', '') + '" oninput="calcCierre()"></div>' +
    '</div>' +
    '<div class="small muted" style="margin-top:6px;line-height:1.5">' + origenFondo +
      ' El <b>cambio que queda</b> en el cajón es el fondo inicial del turno que sigue.</div>' +
    '<div class="tot-row" style="margin-top:8px"><span class="muted">Total contado (cambio + efectivo)</span>' +
      '<b class="mono" id="ceContTxt">' + fmt(0) + '</b></div>' +
    '<div id="ceDif" class="alert info" style="margin-top:12px">Cargá el cambio y el efectivo para ver la diferencia.</div>' +
    '<div class="field" style="margin-top:10px"><label>Observaciones</label>' +
      '<input type="text" id="ceNota" value="' + val('nota', '') + '" placeholder="Ej: retiro de $10.000 al mediodía" oninput="calcCierre()"></div>' +
    '<div class="row" style="margin-top:12px">' +
      '<button class="btn pri grow" onclick="guardarCierre()"' +
        (hayMovimiento ? '' : ' disabled') + '>🧮 Cerrar turno</button>' +
    '</div>' +
    (hayMovimiento ? '' : '<div class="small muted" style="margin-top:8px">Todavía no hubo ventas ni movimientos en este turno.</div>') +
    (descuentos ? '<div class="small muted" style="margin-top:10px">Descuentos otorgados en el día: ' + fmt(descuentos) + '</div>' : '') +
    (anul.length ? '<div class="small muted" style="margin-top:4px">' + anul.length + ' pedido(s) anulados este día.</div>' : '') +
  '</div></div>';
  h += '</div>';

  h += htmlMozosYGastos(dia, movs, f);
  $('#v-caja').innerHTML = h;
  calcCierre(true);
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
    nubeAnotarBorrado('movimientos', id);
    save(); refresh(); toast('Movimiento borrado');
  }, 'Borrar');
}

/* El efectivo contado sale de sumar lo que se dejó de cambio más el efectivo */
function contadoCierre(){
  const c = $('#ceCambio'), e = $('#ceEfe');
  const vacio = (!c || c.value === '') && (!e || e.value === '');
  const cambio = num(c ? c.value : 0), efe = num(e ? e.value : 0);
  const fondo = num($('#ceFondo') ? $('#ceFondo').value : 0);
  return { vacio: vacio, cambio: cambio, efe: efe, total: redondear(cambio + efe),
           negativo: cambio < 0 || efe < 0 || fondo < 0 };
}

/* Se llama al tipear (guarda el borrador) y después de dibujar (solo
   recalcula: lo que hay en los campos ya salió del borrador). */
function calcCierre(soloCalcular){
  const m = CAJA.mostrado; if (!m) return;
  const v = id => { const el = $('#' + id); return el ? el.value : ''; };
  if (soloCalcular !== true && $('#ceCambio'))
    CAJA.borrador = { fecha: m.fecha, desde: m.desde, turno: v('ceTurno'), fondo: v('ceFondo'),
                      cambio: v('ceCambio'), efe: v('ceEfe'), nota: v('ceNota') };
  const fondo = num(v('ceFondo'));
  const espN = redondear(fondo + m.entra - m.sale);
  const esp = $('#ceEsp'); if (esp) esp.textContent = fmt(espN);
  const ft = $('#ceFondoTxt'); if (ft) ft.textContent = fmt(fondo);
  const cont = contadoCierre();
  const ct = $('#ceContTxt'); if (ct) ct.textContent = fmt(cont.total);
  const d = $('#ceDif'); if (!d) return;
  if (cont.vacio){ d.className = 'alert info'; d.innerHTML = 'Cargá el cambio y el efectivo para ver la diferencia.'; return; }
  const dif = redondear(cont.total - espN);
  if (cont.negativo){ d.className = 'alert warn'; d.innerHTML = '<span>⚠</span><div>Hay un importe en negativo: revisá los números.</div>'; return; }
  if (Math.abs(dif) < 0.005){ d.className = 'alert info'; d.innerHTML = '<span>✓</span><div><b>Caja justa.</b> El efectivo contado coincide con lo esperado.</div>'; }
  else if (dif > 0){ d.className = 'alert info'; d.innerHTML = '<span>▲</span><div><b>Sobrante de ' + fmt(dif) + '</b> respecto de lo esperado.</div>'; }
  else { d.className = 'alert warn'; d.innerHTML = '<span>▼</span><div><b>Faltante de ' + fmt(-dif) + '</b> respecto de lo esperado.</div>'; }
}

function guardarCierre(){
  if (!soloAdmin('cerrar la caja')) return;
  const f = CAJA.fecha;
  const abierto = turnoAbierto(f);
  /* Los números se vuelven a sacar ahora, no se toman de cuando se dibujó
     la pantalla. Si en el medio entró una venta (de la otra computadora, o
     un cobro hecho con la caja abierta atrás), el cierre la abarcaba por
     horario pero no la sumaba al esperado, y esa plata no figuraba en
     ningún arqueo. Si cambió algo, se repinta y se pide confirmar de nuevo. */
  const t = numerosTurno(f, abierto);
  const m = CAJA.mostrado;
  if (!m || m.fecha !== f || m.desde !== abierto.desde ||
      m.entra !== t.entra || m.sale !== t.sale || m.ventas !== t.ventas){
    refresh();
    return toast('Entraron movimientos nuevos mientras contabas: revisá el efectivo esperado y volvé a cerrar');
  }
  const cont = contadoCierre();
  if (cont.vacio) return toast('Cargá el cambio que queda y el efectivo que se saca');
  if (cont.negativo) return toast('Hay un importe en negativo: revisá los números');
  const nombre = ($('#ceTurno').value || '').trim() || nombreTurnoSugerido();
  const fondo = num($('#ceFondo').value);
  const esp = redondear(fondo + t.entra - t.sale);
  const ahora = new Date();
  /* El turno termina ahora si se está cerrando el día de hoy; si es un día
     anterior, termina cuando terminó ese día (hasta el último milisegundo,
     para que no quede afuera un cobro de las 23:59:59). */
  let hasta = (f === hoy()) ? ahora : new Date(f + 'T23:59:59.999');
  /* Con el reloj de esta computadora atrasado respecto de la que cerró el
     turno anterior, el cierre quedaba antes de su propio comienzo */
  if (hasta.getTime() <= abierto.desde) hasta = new Date(abierto.desde + 1);
  const reg = {
    id: uid(), fecha: f, turno: nombre,
    desde: new Date(abierto.desde).toISOString(),
    hasta: hasta.toISOString(),
    fondo: fondo, contado: cont.total, esperado: esp, dif: redondear(cont.total - esp),
    cambio: cont.cambio, efectivoCont: cont.efe,
    ventas: t.ventas, efectivo: t.entra, salidas: t.sale,
    detalle: detalleTurno(t),
    nota: $('#ceNota').value,
    usuarioId: USUARIO ? USUARIO.id : null,
    usuarioNombre: USUARIO ? USUARIO.nombre : '',
    creado: ahora.toISOString()
  };
  const cambio = cont.cambio;
  S.cierres.push(reg);
  CAJA.borrador = null;
  save(); refresh();
  toast('Turno "' + nombre + '" cerrado' + (Math.abs(reg.dif) < 0.005 ? ' — caja justa' : '') +
        ' · quedan ' + fmt(cambio) + ' de cambio');
}

/* Reabrir un turno: se borra el cierre y lo que abarcaba vuelve al turno
   abierto. Sirve para corregir un arqueo mal cargado sin tocar las ventas. */
function reabrirTurno(id){
  if (!soloAdmin('reabrir un turno')) return;
  const c = S.cierres.find(x => x.id === id); if (!c) return;
  /* Solo el último del día: ver la tabla de turnos en renderCaja */
  const delDia = turnosDelDia(c.fecha).filter(x => x.cierre);
  if (delDia.length && delDia[delDia.length - 1].cierre.id !== id)
    return toast('Primero reabrí los turnos que se cerraron después de este');
  confirmar('¿Reabrir el turno <b>' + esc(c.turno || '') + '</b> del ' + fechaCorta(c.fecha + 'T12:00') + '?<br><br>' +
    'Se borra ese arqueo y sus ventas vuelven al turno abierto. Los pedidos no se tocan.', () => {
      S.cierres = S.cierres.filter(x => x.id !== id);
      nubeAnotarBorrado('cierres', id);
      save(); closeModal(); refresh(); toast('Turno reabierto');
    }, 'Sí, reabrir');
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
/* El lugar del precio se mide en importes, no a ojo: tiene que entrar un
   importe de 8 cifras, que es el techo con el que puede salir el TOTAL de un
   cierre de caja. Con el "34%" que tenía el de 80 no entraban ni 7: medido,
   "$ 1.234.567" necesita 103 px y la columna le daba 94, así que se salía del
   renglón. Justo el papel más ancho era el que menos lugar le daba al precio.
   Al 42% entran las 8 cifras en los dos papeles.
   Cuesta dos caracteres del nombre del producto en el de 80 mm (de 19 a 17).
   Los nombres largos ya se parten solos en dos renglones; el importe no se
   puede partir: o entra o se sale del papel. */
const TK_PAPEL = {
  80: { margen: 4, fuente: 15, precio: '42%' },
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

/* Imprime un arqueo YA GUARDADO. Antes esta función leía el fondo y el
   efectivo contado de los campos de la pantalla: si se la llamaba parado en
   otra vista, num() devolvía cero y el ticket salía con datos falsos sin dar
   ningún error. Ahora todo sale del cierre guardado. */
function imprimirCierre(id){
  const c = S.cierres.find(x => x.id === id);
  if (!c) return toast('No encontré ese arqueo');
  /* Desde el 21/10/2026 el cierre guarda su detalle (ver detalleTurno). Los
     de antes se rearman a partir de su rango, como se hacía siempre. */
  let t = null;
  if (c.detalle) t = Object.assign({}, c.detalle, { pedidos: { length: c.detalle.pedidos } });
  else {
    const suyo = turnosDelDia(c.fecha).filter(x => x.cierre && x.cierre.id === c.id)[0];
    t = suyo ? numerosTurno(c.fecha, suyo) : null;
  }
  const porPago = t ? t.porPago : {};
  const medios = Object.keys(porPago).filter(k => porPago[k]);
  $('#tk').innerHTML =
    tkHead() + '<div class="l"></div>' +
    '<div class="c"><b>CIERRE DE CAJA</b></div>' +
    '<div class="c"><b>' + esc(c.turno || '') + '</b></div>' +
    '<div class="c">' + fechaCorta(c.fecha + 'T12:00') +
      (c.hasta ? ' &middot; ' + hora(c.hasta) : '') + '</div>' +
    (c.usuarioNombre ? '<div class="c">Cerr&oacute;: ' + esc(c.usuarioNombre) + '</div>' : '') +
    '<div class="l"></div>' +
    '<table>' +
      (medios.length
        ? medios.map(k => '<tr><td>' + nombrePago(k) + '</td><td align="right">' + fmt(porPago[k]) + '</td></tr>').join('')
        : '') +
      '<tr><td><b>TOTAL VENTAS</b></td><td align="right"><b>' + fmt(c.ventas) + '</b></td></tr>' +
      (t ? '<tr><td>Pedidos</td><td align="right">' + t.pedidos.length + '</td></tr>' : '') +
    '</table><div class="l"></div>' +
    '<table>' +
      '<tr><td>Fondo inicial</td><td align="right">' + fmt(c.fondo) + '</td></tr>' +
      (t && t.cobrosEfe ? '<tr><td>Cobros cuentas</td><td align="right">' + fmt(t.cobrosEfe) + '</td></tr>' : '') +
      (t && t.extraEfe ? '<tr><td>Ingresos extra</td><td align="right">' + fmt(t.extraEfe) + '</td></tr>' : '') +
      (t && t.gastosEfe ? '<tr><td>Gastos y retiros</td><td align="right">-' + fmt(t.gastosEfe) + '</td></tr>' : '') +
      (t && t.comprasEfe ? '<tr><td>Compras efectivo</td><td align="right">-' + fmt(t.comprasEfe) + '</td></tr>' : '') +
      '<tr><td><b>Efectivo esperado</b></td><td align="right"><b>' + fmt(c.esperado) + '</b></td></tr>' +
      '<tr><td>Cambio que queda</td><td align="right">' + fmt(c.cambio || 0) + '</td></tr>' +
      '<tr><td>Efectivo que se saca</td><td align="right">' + fmt(c.efectivoCont || 0) + '</td></tr>' +
      '<tr><td><b>Efectivo contado</b></td><td align="right"><b>' + fmt(c.contado) + '</b></td></tr>' +
      '<tr><td><b>Diferencia</b></td><td align="right"><b>' + fmt(c.dif) + '</b></td></tr>' +
    '</table>' +
    (c.nota ? '<div class="l"></div><div class="s">' + esc(c.nota) + '</div>' : '') +
    '<div class="l"></div><div style="height:26px"></div><div class="c">Firma responsable</div>';
  tkImprimir();
}
