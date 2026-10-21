/* ============================================================
   ESTADÍSTICAS — cómo viene el café en un período
   ------------------------------------------------------------
   Solo lee: no guarda nada. Todo sale de los pedidos cobrados, los
   cierres de caja, los gastos y las compras que ya están cargados.
   ============================================================ */

/* preset: qué botón de período está elegido ('manual' si se puso a mano) */
let ST = { preset: 'mes', desde: '', hasta: '', orden: 'importe', tab: 'ventas' };

/* Cada pestaña es un apartado aparte, para no tener todo en una sola
   página larga. El período elegido arriba vale para todas. */
const ST_TABS = [
  ['ventas', '📈 Ventas'], ['productos', '⭐ Productos'],
  ['atencion', '💳 Pagos y mozos'], ['caja', '🧮 Caja y gastos']
];

const ST_PRESETS = [
  ['hoy', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'],
  ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['anio', 'Este año']
];
const ST_DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ST_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function stMasDias(k, n){ const x = new Date(k + 'T12:00:00'); x.setDate(x.getDate() + n); return dkey(x); }
function stCantDias(d, h){ return Math.round((new Date(h + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5) + 1; }
function stInicio(k){ return new Date(k + 'T00:00:00').getTime(); }

/* Los botones de período se recalculan en cada dibujado: la computadora del
   café no se apaga y "Hoy" tiene que seguir siendo hoy a la mañana
   siguiente (lo mismo que pasaba con la caja, ver alDiaCAJA). */
function stRango(){
  const h = hoy();
  const x = new Date(h + 'T12:00:00');
  const r = {
    hoy:       [h, h],
    '7d':      [stMasDias(h, -6), h],
    '30d':     [stMasDias(h, -29), h],
    mes:       [h.slice(0, 8) + '01', h],
    mesPasado: (() => { const a = new Date(x.getFullYear(), x.getMonth() - 1, 1, 12);
                        const b = new Date(x.getFullYear(), x.getMonth(), 0, 12);
                        return [dkey(a), dkey(b)]; })(),
    anio:      [h.slice(0, 4) + '-01-01', h]
  }[ST.preset];
  if (r){ ST.desde = r[0]; ST.hasta = r[1]; }
  if (!ST.desde) ST.desde = h;
  if (!ST.hasta) ST.hasta = h;
  if (ST.hasta < ST.desde){ const t = ST.desde; ST.desde = ST.hasta; ST.hasta = t; }
}
function stPreset(p){ ST.preset = p; refresh(); }
function stFecha(cual, v){ if (!v) return; ST[cual] = v; ST.preset = 'manual'; refresh(); }
function stOrden(o){ ST.orden = o; refresh(); }
function stTab(t){ ST.tab = t; refresh(); }

/* ---------- Medidas de un grupo de pedidos cobrados ---------- */
function stMedir(lista, prods){
  let ventas = 0, neto = 0, costo = 0, unidades = 0, desc = 0;
  lista.forEach(p => {
    ventas += totalCobrado(p);
    neto += total(p);
    desc += p.descuento || 0;
    p.items.forEach(i => {
      unidades += i.cant;
      const pr = prods[i.pid];
      if (pr) costo += (pr.costo || 0) * i.cant;
    });
  });
  return { n: lista.length, ventas: redondear(ventas), neto: redondear(neto),
           costo: redondear(costo), unidades: unidades, desc: redondear(desc) };
}

/* "▲ 12% vs. período anterior". Sube = bien en todo lo que se mide acá. */
function stDelta(cur, ant){
  if (!ant) return cur ? 'Sin datos del período anterior' : '';
  const pct = Math.round((cur - ant) / ant * 100);
  if (pct === 0) return '<span class="st-igual">= igual que el período anterior</span>';
  return '<span class="' + (pct > 0 ? 'st-sube' : 'st-baja') + '">' + (pct > 0 ? '▲ ' : '▼ ') +
         Math.abs(pct) + '%</span> vs. período anterior';
}

/* ---------- Gráfico de columnas (una sola serie) ----------
   serie: [{ et: etiqueta del eje, v: valor, tip: texto al pasar el mouse }]
   Se rotula solo la columna más alta; el resto se lee en el eje, en el
   cartelito del mouse y en la tabla de abajo. */
function stColumnas(serie, titulo){
  const max = Math.max(0, ...serie.map(s => s.v));
  const iMax = serie.findIndex(s => s.v === max);
  const cada = Math.max(1, Math.ceil(serie.length / 10));
  return '<div class="stc" role="img" aria-label="' + esc(titulo) + '">' +
    '<div class="stc-plot">' + serie.map((s, i) =>
      '<div class="stc-col" title="' + esc(s.tip) + '">' +
        (i === iMax && max > 0 ? '<span class="stc-lbl">' + fmt(s.v) + '</span>' : '') +
        '<i style="height:' + (max ? Math.max(s.v > 0 ? 1.5 : 0, s.v / max * 100) : 0) + '%"></i>' +
      '</div>').join('') + '</div>' +
    '<div class="stc-x">' + serie.map((s, i) =>
      '<span>' + (i % cada === 0 ? esc(s.et) : '') + '</span>').join('') + '</div>' +
  '</div>';
}

/* Barras horizontales en tabla: el nombre, la barra y el importe a la vista */
function stFilasBarra(filas, max){
  return filas.map(f =>
    '<tr><td style="width:34%"><b>' + f.nombre + '</b>' + (f.sub ? '<div class="small muted">' + f.sub + '</div>' : '') + '</td>' +
      '<td><div class="bar" title="' + esc(f.tip || '') + '"><i style="width:' + (max ? f.v / max * 100 : 0) + '%"></i></div></td>' +
      '<td class="num" style="width:120px"><b>' + f.txt + '</b>' + (f.txt2 ? '<div class="small muted">' + f.txt2 + '</div>' : '') + '</td></tr>'
  ).join('');
}
function stPct(a, b){ return b ? Math.round(a / b * 100) + '%' : '0%'; }
function stCard(titulo, cuerpo, extra){
  return '<div class="card"><div class="hd"><h3>' + titulo + '</h3>' + (extra || '') + '</div>' + cuerpo + '</div>';
}

function renderEstadisticas(){
  stRango();
  const D = ST.desde, H = ST.hasta;
  setActions(
    '<div class="tabs">' + ST_PRESETS.map(p =>
      '<button class="' + (ST.preset === p[0] ? 'on' : '') + '" onclick="stPreset(\'' + p[0] + '\')">' + p[1] + '</button>').join('') +
    '</div>' +
    '<input type="date" value="' + D + '" style="width:auto" onchange="stFecha(\'desde\',this.value)" title="Desde">' +
    '<input type="date" value="' + H + '" style="width:auto" onchange="stFecha(\'hasta\',this.value)" title="Hasta">'
  );

  /* El período va de las 0 h de "desde" hasta las 24 h de "hasta", pero
     nunca más allá de ahora. El período anterior es igual de largo y corta
     a la misma altura: un "hoy" a las 11 se compara con ayer hasta las 11,
     no con ayer entero. */
  const nDias = stCantDias(D, H);
  const ini = stInicio(D);
  const fin = Math.min(stInicio(stMasDias(H, 1)), Date.now());
  const iniAnt = stInicio(stMasDias(D, -nDias));
  const finAnt = iniAnt + Math.max(0, fin - ini);

  const prods = {};
  S.productos.forEach(p => prods[p.id] = p);
  const cobrados = [], anteriores = [];
  S.pedidos.forEach(p => {
    if (p.estado !== 'cerrado') return;
    const t = msDe(p.cerrado);
    if (t >= ini && t < fin) cobrados.push(p);
    else if (t >= iniAnt && t < finAnt) anteriores.push(p);
  });
  const anulados = S.pedidos.filter(p => {
    if (p.estado !== 'anulado' || !p.items.length) return false;
    const t = msDe(p.cerrado || p.abierto);
    return t >= ini && t < fin;
  });
  const enRango = x => x.fecha >= D && x.fecha <= H;

  const A = stMedir(cobrados, prods), B = stMedir(anteriores, prods);
  const diasConVenta = new Set(cobrados.map(p => dkey(p.cerrado))).size;

  let h = '<div class="row" style="margin-bottom:14px;gap:10px"><h3 style="font-size:17px">' +
    (D === H ? cap(fechaLarga(D)) : fechaCorta(D + 'T12:00') + ' al ' + fechaCorta(H + 'T12:00')) + '</h3>' +
    '<span class="pill gray">' + nDias + (nDias === 1 ? ' día' : ' días') + '</span></div>' +
    '<div class="tabs st-tabs" style="margin-bottom:16px">' + ST_TABS.map(t =>
      '<button class="' + (ST.tab === t[0] ? 'on' : '') + '" onclick="stTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') +
    '</div>';

  if (!cobrados.length && ST.tab !== 'caja'){
    h += '<div class="card">' + vacio('📊', 'Sin ventas en este período',
      'Elegí otro período arriba. Las estadísticas salen de los pedidos cobrados.') + '</div>';
    $('#v-estadisticas').innerHTML = h;
    return;
  }

  /* ================= Ventas ================= */
  const margen = A.neto - A.costo;
  if (ST.tab === 'ventas') h += '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Ventas', fmt(A.ventas), stDelta(A.ventas, B.ventas), true) +
    kpi('Pedidos cobrados', A.n.toLocaleString('es-AR'), stDelta(A.n, B.n)) +
    kpi('Ticket promedio', fmt(A.ventas / A.n), stDelta(A.ventas / A.n, B.n ? B.ventas / B.n : 0)) +
    kpi('Promedio por día', fmt(A.ventas / Math.max(1, diasConVenta)), diasConVenta + ' día(s) con ventas') +
    kpi('Margen estimado', fmt(margen), stPct(margen, A.neto) + ' sobre la venta, con el costo de hoy') +
    kpi('Descuentos', fmt(A.desc), anulados.length + ' pedido(s) anulados por ' +
      fmt(anulados.reduce((a, p) => a + total(p), 0))) +
  '</div>';

  /* --- Ventas a lo largo del período: por día, o por mes si es largo --- */
  const porMes = nDias > 62;
  const grupos = {};
  cobrados.forEach(p => {
    const k = porMes ? dkey(p.cerrado).slice(0, 7) : dkey(p.cerrado);
    if (!grupos[k]) grupos[k] = { v: 0, n: 0 };
    grupos[k].v += totalCobrado(p); grupos[k].n++;
  });
  const serie = [];
  if (porMes){
    let k = D.slice(0, 7);
    while (k <= H.slice(0, 7)){
      const g = grupos[k] || { v: 0, n: 0 };
      const nom = ST_MESES[Number(k.slice(5)) - 1] + ' ' + k.slice(2, 4);
      serie.push({ k: k, et: nom, v: redondear(g.v), n: g.n, tip: nom + ': ' + fmt(g.v) + ' · ' + g.n + ' pedido(s)' });
      const y = Number(k.slice(0, 4)), m = Number(k.slice(5));
      k = m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1);
    }
  } else {
    for (let k = D; k <= H; k = stMasDias(k, 1)){
      const g = grupos[k] || { v: 0, n: 0 };
      const x = new Date(k + 'T12:00:00');
      const nom = ST_DIAS_SEMANA[x.getDay()].slice(0, 3) + ' ' + x.getDate() + '/' + (x.getMonth() + 1);
      serie.push({ k: k, et: x.getDate() + '/' + (x.getMonth() + 1), v: redondear(g.v), n: g.n,
                   tip: nom + ': ' + fmt(g.v) + ' · ' + g.n + ' pedido(s)' });
    }
  }
  const tituloSerie = porMes ? 'Ventas por mes' : 'Ventas por día';
  if (ST.tab === 'ventas') h += '<div class="card" style="margin-bottom:18px"><div class="hd"><h3>📈 ' + tituloSerie + '</h3>' +
      '<span class="small muted">Pasá el mouse por una columna para ver el detalle</span></div><div class="bd">' +
      stColumnas(serie, tituloSerie) +
      '<details class="st-tabla"><summary>Ver en tabla</summary><div class="tbl-wrap"><table><thead><tr>' +
        '<th>' + (porMes ? 'Mes' : 'Día') + '</th><th class="num">Pedidos</th><th class="num">Ventas</th></tr></thead><tbody>' +
        serie.slice().reverse().map(s => '<tr><td>' + esc(s.tip.split(':')[0]) + '</td><td class="num">' + s.n +
          '</td><td class="num">' + fmt(s.v) + '</td></tr>').join('') +
      '</tbody></table></div></details>' +
    '</div></div>';

  /* --- Días de la semana y horas --- */
  const sem = ST_DIAS_SEMANA.map(() => ({ v: 0, dias: new Set() }));
  const horas = {};
  cobrados.forEach(p => {
    const x = new Date(p.cerrado);
    sem[x.getDay()].v += totalCobrado(p);
    sem[x.getDay()].dias.add(dkey(x));
    const hh = x.getHours();
    if (!horas[hh]) horas[hh] = { v: 0, n: 0 };
    horas[hh].v += totalCobrado(p); horas[hh].n++;
  });
  /* De lunes a domingo, que es como se piensa la semana en el café */
  const semFilas = [1, 2, 3, 4, 5, 6, 0].map(i => {
    const d = sem[i].dias.size, prom = d ? sem[i].v / d : 0;
    return { nombre: ST_DIAS_SEMANA[i], v: prom, sub: d ? d + ' día(s) con ventas' : 'sin ventas',
             txt: d ? fmt(prom) : '—', txt2: d ? 'promedio' : '', tip: ST_DIAS_SEMANA[i] + ': total ' + fmt(sem[i].v) };
  });
  const hk = Object.keys(horas).map(Number).sort((a, b) => a - b);
  const horaFilas = hk.map(x => ({ nombre: pad(x) + ':00', v: horas[x].v, sub: horas[x].n + ' pedido(s)',
    txt: fmt(horas[x].v), txt2: stPct(horas[x].v, A.ventas),
    tip: 'Promedio por día con ventas: ' + fmt(horas[x].v / Math.max(1, diasConVenta)) }));
  if (ST.tab === 'ventas') h += '<div class="grid2" style="margin-bottom:18px;align-items:start">' +
    stCard('📅 Por día de la semana', '<div class="tbl-wrap"><table><tbody>' +
      stFilasBarra(semFilas, Math.max(...semFilas.map(f => f.v))) + '</tbody></table></div>' +
      '<div class="bd small muted" style="padding-top:6px">Venta promedio de cada día en que hubo ventas.</div>') +
    stCard('🕐 Por hora de cobro', '<div class="tbl-wrap"><table><tbody>' +
      stFilasBarra(horaFilas, Math.max(...horaFilas.map(f => f.v))) + '</tbody></table></div>') +
  '</div>';

  /* --- Productos --- */
  const pr = {}, cats = {};
  cobrados.forEach(p => p.items.forEach(i => {
    const k = i.nombre;
    if (!pr[k]) pr[k] = { c: 0, m: 0 };
    pr[k].c += i.cant; pr[k].m += i.precio * i.cant;
    const cat = (prods[i.pid] && prods[i.pid].cat) || 'Sin categoría';
    if (!cats[cat]) cats[cat] = { c: 0, m: 0 };
    cats[cat].c += i.cant; cats[cat].m += i.precio * i.cant;
  }));
  const campo = ST.orden === 'cantidad' ? 'c' : 'm';
  const todos = Object.entries(pr).sort((a, b) => b[1][campo] - a[1][campo]);
  const totProd = todos.reduce((a, x) => a + x[1].m, 0);
  const top = todos.slice(0, 15);
  const resto = todos.slice(15);
  const maxP = Math.max(1, ...top.map(x => x[1][campo]));
  const vendidos = new Set(Object.keys(pr));
  const sinVenta = nDias >= 7
    ? S.productos.filter(p => p.activo !== false && !vendidos.has(p.nombre)).map(p => p.nombre).sort((a, b) => a.localeCompare(b, 'es'))
    : [];
  /* ================= Productos ================= */
  if (ST.tab === 'productos') h += '<div class="grid2" style="margin-bottom:18px;align-items:start">' +
    stCard('⭐ Productos más vendidos',
      '<div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th></th>' +
        '<th class="num">Importe</th></tr></thead><tbody>' +
        top.map(x => '<tr><td>' + esc(x[0]) + '</td><td class="num">' + x[1].c.toLocaleString('es-AR') + '</td>' +
          '<td style="width:30%"><div class="bar"><i style="width:' + (x[1][campo] / maxP * 100) + '%"></i></div></td>' +
          '<td class="num"><b>' + fmt(x[1].m) + '</b><div class="small muted">' + stPct(x[1].m, totProd) + '</div></td></tr>').join('') +
        (resto.length
          ? '<tr><td class="muted">Otros ' + resto.length + ' producto(s)</td>' +
            '<td class="num muted">' + resto.reduce((a, x) => a + x[1].c, 0).toLocaleString('es-AR') + '</td><td></td>' +
            '<td class="num muted">' + fmt(resto.reduce((a, x) => a + x[1].m, 0)) + '</td></tr>'
          : '') +
      '</tbody></table></div>' +
      '<div class="bd small muted" style="padding-top:6px">Importe a precio de carta, antes de los descuentos del pedido.' +
        (sinVenta.length
          ? '<div style="margin-top:6px"><b>Sin ventas en el período:</b> ' + sinVenta.map(esc).join(', ') + '.</div>'
          : '') +
      '</div>',
      '<div class="tabs" style="margin-left:auto">' +
        '<button class="' + (campo === 'm' ? 'on' : '') + '" onclick="stOrden(\'importe\')">Por importe</button>' +
        '<button class="' + (campo === 'c' ? 'on' : '') + '" onclick="stOrden(\'cantidad\')">Por cantidad</button>' +
      '</div>') +
    (() => {
      const cl = Object.entries(cats).sort((a, b) => b[1].m - a[1].m);
      const mx = Math.max(1, ...cl.map(x => x[1].m));
      return stCard('🗂 Por categoría', '<div class="tbl-wrap"><table><tbody>' +
        stFilasBarra(cl.map(x => ({ nombre: esc(x[0]), sub: x[1].c.toLocaleString('es-AR') + ' unidades', v: x[1].m,
          txt: fmt(x[1].m), txt2: stPct(x[1].m, totProd) })), mx) + '</tbody></table></div>');
    })() +
  '</div>';

  /* --- Medios de pago y origen --- */
  const med = {};
  cobrados.forEach(p => { const m = porMedio(p); Object.keys(m).forEach(k => {
    if (!med[k]) med[k] = { v: 0, n: 0 };
    med[k].v += m[k]; med[k].n++;
  }); });
  const ml = Object.entries(med).sort((a, b) => b[1].v - a[1].v);
  const mesas = cobrados.filter(p => p.tipo === 'mesa'), llevar = cobrados.filter(p => p.tipo !== 'mesa');
  const vMesas = mesas.reduce((a, p) => a + totalCobrado(p), 0), vLlevar = A.ventas - vMesas;
  const conPers = cobrados.filter(p => p.personas > 0);
  const pers = conPers.reduce((a, p) => a + p.personas, 0);
  const porMesa = {};
  mesas.forEach(p => { const k = p.mesaNum; if (!porMesa[k]) porMesa[k] = { v: 0, n: 0 }; porMesa[k].v += totalCobrado(p); porMesa[k].n++; });
  const topMesas = Object.entries(porMesa).sort((a, b) => b[1].v - a[1].v).slice(0, 5);
  /* ================= Pagos y mozos ================= */
  if (ST.tab === 'atencion') h += '<div class="grid2" style="margin-bottom:18px;align-items:start">' +
    stCard('💳 Medios de pago', '<div class="tbl-wrap"><table><tbody>' +
      stFilasBarra(ml.map(x => ({ nombre: nombrePago(x[0]), sub: x[1].n + ' pedido(s)', v: x[1].v,
        txt: fmt(x[1].v), txt2: stPct(x[1].v, A.ventas) })), Math.max(1, ...ml.map(x => x[1].v))) +
      '</tbody></table></div>' +
      (med.cuenta ? '<div class="bd small muted" style="padding-top:6px">' + fmt(med.cuenta.v) +
        ' quedaron en cuenta corriente: son ventas, pero la plata entra cuando se cobra la cuenta.</div>' : '')) +
    stCard('🍽 Mesas y para llevar', '<div class="tbl-wrap"><table><tbody>' +
      stFilasBarra([
        { nombre: 'En mesas', sub: mesas.length + ' pedido(s)', v: vMesas, txt: fmt(vMesas), txt2: stPct(vMesas, A.ventas) },
        { nombre: 'Para llevar', sub: llevar.length + ' pedido(s)', v: vLlevar, txt: fmt(vLlevar), txt2: stPct(vLlevar, A.ventas) }
      ], Math.max(vMesas, vLlevar)) +
      (topMesas.length
        ? '<tr><td colspan="3" class="small muted" style="padding-top:12px"><b>Mesas que más vendieron</b></td></tr>' +
          topMesas.map(x => '<tr><td>Mesa ' + esc(x[0]) + '</td><td class="small muted">' + x[1].n + ' pedido(s)</td>' +
            '<td class="num">' + fmt(x[1].v) + '</td></tr>').join('')
        : '') +
      '</tbody></table></div>' +
      (pers ? '<div class="bd small muted" style="padding-top:6px">' + pers.toLocaleString('es-AR') + ' personas atendidas en ' +
        conPers.length + ' pedido(s) con personas cargadas: ' +
        fmt(conPers.reduce((a, p) => a + totalCobrado(p), 0) / pers) + ' por persona.</div>' : '')) +
  '</div>';

  /* --- Mozos --- */
  const mz = {};
  cobrados.forEach(p => {
    const k = p.mozoNombre || 'Sin asignar';
    if (!mz[k]) mz[k] = { v: 0, n: 0 };
    mz[k].v += totalCobrado(p); mz[k].n++;
  });
  const mzl = Object.entries(mz).sort((a, b) => b[1].v - a[1].v);

  /* --- Caja: arqueos del período --- */
  const cierres = S.cierres.filter(enRango).sort((a, b) => msDe(b.hasta) - msDe(a.hasta));
  const sobr = redondear(cierres.filter(c => c.dif > 0.004).reduce((a, c) => a + c.dif, 0));
  const falt = redondear(cierres.filter(c => c.dif < -0.004).reduce((a, c) => a + c.dif, 0));
  const conDif = cierres.filter(c => Math.abs(c.dif || 0) >= 0.005);
  /* Días con ventas que terminaron con un turno abierto (hoy no cuenta:
     el turno de hoy está abierto porque todavía se está trabajando) */
  const diasSinCerrar = [];
  [...new Set(cobrados.map(p => dkey(p.cerrado)))].sort().forEach(d => {
    if (d >= hoy()) return;
    const t = numerosTurno(d, turnoAbierto(d));
    if (t.pedidos.length || t.entra || t.sale) diasSinCerrar.push({ d: d, n: t.pedidos.length, v: t.ventas });
  });
  const pillDif = x => '<span class="pill ' + (Math.abs(x) < 0.005 ? 'ok' : x > 0 ? 'info' : 'bad') + '">' + fmt(x) + '</span>';

  const cMozos =
    stCard('🧑‍🍳 Ventas por mozo', '<div class="tbl-wrap"><table><tbody>' +
      stFilasBarra(mzl.map(x => ({ nombre: esc(x[0]), sub: x[1].n + ' pedido(s) · ticket ' + fmt(x[1].v / x[1].n), v: x[1].v,
        txt: fmt(x[1].v), txt2: stPct(x[1].v, A.ventas) })), Math.max(1, ...mzl.map(x => x[1].v))) +
      '</tbody></table></div>');
  const cArqueos =
    stCard('🧮 Arqueos de caja',
      '<div class="bd">' +
        '<div class="tot-row"><span class="muted">Turnos cerrados</span><b class="mono">' + cierres.length + '</b></div>' +
        '<div class="tot-row"><span class="muted">Sobrantes</span><b class="mono">' + fmt(sobr) + '</b></div>' +
        '<div class="tot-row"><span class="muted">Faltantes</span><b class="mono">' + fmt(falt) + '</b></div>' +
        '<div class="tot-row big"><span>Diferencia neta</span><span class="mono">' + fmt(redondear(sobr + falt)) + '</span></div>' +
        (diasSinCerrar.length
          ? '<div class="alert warn small" style="margin-top:12px"><span>⚠</span><div><b>' + diasSinCerrar.length +
            ' día(s) quedaron con un turno sin cerrar:</b> ' +
            diasSinCerrar.slice(-8).map(x => '<a href="#" onclick="irACaja(\'' + x.d + '\');return false">' +
              fechaCorta(x.d + 'T12:00') + '</a>').join(', ') +
            (diasSinCerrar.length > 8 ? ' y ' + (diasSinCerrar.length - 8) + ' más' : '') +
            '. Lo vendido en esos turnos no pasó por ningún arqueo.</div></div>'
          : (cierres.length ? '<div class="small muted" style="margin-top:10px">✓ Todos los días con ventas tienen su caja cerrada.</div>' : '')) +
      '</div>' +
      (conDif.length
        ? '<div class="tbl-wrap"><table><thead><tr><th>Día</th><th>Turno</th><th>Cerró</th><th class="num">Diferencia</th></tr></thead><tbody>' +
          conDif.slice(0, 12).map(c => '<tr><td class="mono small"><a href="#" onclick="irACaja(\'' + c.fecha + '\');return false">' +
            fechaCorta(c.fecha + 'T12:00') + '</a></td><td>' + esc(c.turno || '') + '</td>' +
            '<td class="small">' + esc(c.usuarioNombre || '—') + '</td><td class="num">' + pillDif(c.dif) + '</td></tr>').join('') +
          '</tbody></table></div>' +
          (conDif.length > 12 ? '<div class="bd small muted" style="padding-top:6px">Y ' + (conDif.length - 12) + ' turno(s) más con diferencia.</div>' : '')
        : ''));

  /* --- Gastos, compras y resultado --- */
  const movs = S.movimientos.filter(enRango);
  const gastos = movs.filter(m => m.tipo === 'gasto');
  const retiros = movs.filter(m => m.tipo === 'retiro').reduce((a, m) => a + m.monto, 0);
  const extras = movs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const compras = S.compras.filter(enRango);
  const totCompras = compras.reduce((a, c) => a + c.total, 0);
  const porConc = {};
  gastos.forEach(m => { const k = (m.concepto || 'Varios').trim(); porConc[k] = (porConc[k] || 0) + m.monto; });
  const gl = Object.entries(porConc).sort((a, b) => b[1] - a[1]);
  const totGastos = gl.reduce((a, x) => a + x[1], 0);
  const resultado = redondear(A.ventas + extras - totGastos - totCompras);
  const cGastos =
    stCard('💸 Gastos por concepto', gl.length
      ? '<div class="tbl-wrap"><table><tbody>' +
        stFilasBarra(gl.slice(0, 10).map(x => ({ nombre: esc(x[0]), v: x[1], txt: fmt(x[1]), txt2: stPct(x[1], totGastos) })),
          Math.max(1, ...gl.map(x => x[1]))) +
        (gl.length > 10 ? '<tr><td class="muted">Otros ' + (gl.length - 10) + ' concepto(s)</td><td></td><td class="num muted">' +
          fmt(gl.slice(10).reduce((a, x) => a + x[1], 0)) + '</td></tr>' : '') +
        '</tbody></table></div>'
      : '<div class="bd muted small">Sin gastos cargados en el período.</div>');
  const cResultado =
    stCard('📒 Resultado del período',
      '<div class="bd">' +
        '<div class="tot-row"><span class="muted">Ventas</span><b class="mono">' + fmt(A.ventas) + '</b></div>' +
        (extras ? '<div class="tot-row"><span class="muted">+ Ingresos extra</span><b class="mono">' + fmt(extras) + '</b></div>' : '') +
        '<div class="tot-row"><span class="muted">− Gastos</span><b class="mono">' + fmt(totGastos) + '</b></div>' +
        '<div class="tot-row"><span class="muted">− Compras a proveedores (' + compras.length + ')</span><b class="mono">' + fmt(totCompras) + '</b></div>' +
        '<div class="tot-row big"><span>Queda</span><span class="mono">' + fmt(resultado) + '</span></div>' +
        (retiros ? '<div class="tot-row" style="margin-top:6px"><span class="muted">Retiros de efectivo (no se restan)</span><b class="mono">' + fmt(retiros) + '</b></div>' : '') +
        '<div class="small muted" style="margin-top:10px;line-height:1.5">Es una cuenta simple de lo que entró menos lo que salió en el período. ' +
          'No tiene en cuenta la mercadería que quedó en stock ni lo que falta cobrar de las cuentas corrientes.</div>' +
      '</div>');

  if (ST.tab === 'atencion')
    h += '<div class="grid2" style="align-items:start">' + cMozos + '</div>';
  /* ================= Caja y gastos ================= */
  if (ST.tab === 'caja')
    h += '<div class="grid2" style="margin-bottom:18px;align-items:start">' + cArqueos + cResultado + '</div>' +
         '<div class="grid2" style="align-items:start">' + cGastos + '</div>';

  $('#v-estadisticas').innerHTML = h;
}
