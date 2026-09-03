/* ============================================================
   CUENTAS CORRIENTES — consumos a cuenta y cobros
   ============================================================ */

let CT = { q: '', solo: 'todas' };

/* Movimientos de una cuenta ordenados en el tiempo, con saldo acumulado */
function movimientosCuenta(id){
  const mov = [];
  consumosCuenta(id).forEach(p => mov.push({
    t: 'consumo', fecha: p.cerrado, dia: dkey(p.cerrado), monto: montoEnCuenta(p, id), ped: p,
    detalle: (p.tipo === 'mesa' ? 'Mesa ' + p.mesaNum : 'Para llevar') + ' · ' +
             p.items.map(i => i.cant + '× ' + i.nombre).join(', ')
  }));
  pagosDeCuenta(id).forEach(x => mov.push({
    t: 'pago', fecha: x.fecha + 'T12:00:00', dia: x.fecha, monto: x.monto, pago: x,
    detalle: 'Pago recibido — ' + nombrePago(x.medio) + (x.nota ? ' · ' + x.nota : '')
  }));
  mov.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acum = 0;
  mov.forEach(m => { acum += (m.t === 'consumo' ? m.monto : -m.monto); m.saldo = redondear(acum); });
  return mov;
}

function renderCuentas(){
  setActions('<button class="btn" onclick="exportarCuentas()">⬇ CSV</button>' +
             '<button class="btn pri" onclick="formCuenta()">＋ Nueva cuenta</button>');

  let list = S.cuentas.slice();
  if (CT.q) list = list.filter(c => (c.nombre + ' ' + (c.contacto || '') + ' ' + (c.notas || '')).toLowerCase().includes(CT.q));
  if (CT.solo === 'deben') list = list.filter(c => saldoCuenta(c.id) > 0.004);
  if (CT.solo === 'aldia') list = list.filter(c => saldoCuenta(c.id) <= 0.004);
  list.sort((a, b) => saldoCuenta(b.id) - saldoCuenta(a.id) || a.nombre.localeCompare(b.nombre, 'es'));

  const saldoTotal = S.cuentas.reduce((a, c) => a + Math.max(0, saldoCuenta(c.id)), 0);
  const mes = hoy().slice(0, 7);
  const consumoMes = S.cuentas.reduce((a, c) => a + consumosCuenta(c.id)
    .filter(p => dkey(p.cerrado).startsWith(mes))
    .reduce((x, p) => x + montoEnCuenta(p, c.id), 0), 0);
  const cobradoMes = S.pagosCuenta.filter(x => x.fecha.startsWith(mes)).reduce((a, x) => a + x.monto, 0);

  let h = '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Cuentas', String(S.cuentas.length), cuentasConSaldo().length + ' con saldo pendiente') +
    kpi('Total adeudado', fmt(saldoTotal), 'Suma de todos los saldos', true) +
    kpi('Consumido este mes', fmt(consumoMes), 'Cargado a cuentas') +
    kpi('Cobrado este mes', fmt(cobradoMes), 'Pagos recibidos') +
  '</div>';

  if (!S.cuentas.length){
    h += '<div class="card"><div class="bd">' +
      vacio('📒', 'Todavía no hay cuentas', 'Creá una cuenta para poder cargarle consumos: sirve para clientes habituales, empleados, la oficina de al lado o el fiado de siempre.') +
      '<div style="text-align:center"><button class="btn pri" onclick="formCuenta()">＋ Crear la primera cuenta</button></div>' +
    '</div></div>';
    $('#v-cuentas').innerHTML = h;
    return;
  }

  h += '<div class="card"><div class="hd"><h3>Listado de cuentas</h3>' +
    '<div class="tabs">' +
      ['todas','deben','aldia'].map(k => '<button class="' + (CT.solo === k ? 'on' : '') + '" onclick="CT.solo=\'' + k + '\';refresh()">' +
        ({todas:'Todas', deben:'Con saldo', aldia:'Al día'})[k] + '</button>').join('') +
    '</div>' +
    '<div class="sp" style="flex:1"></div>' +
    '<input type="search" id="ctq" value="' + esc(CT.q) + '" placeholder="Buscar cuenta…" style="width:210px"></div>';

  if (!list.length){
    h += vacio('📒', 'No hay cuentas que coincidan', 'Probá con otro filtro o búsqueda.');
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>Cuenta</th><th>Contacto</th><th class="num">Consumido</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Último movimiento</th><th></th>' +
      '</tr></thead><tbody>' +
      list.map(c => {
        const cons = consumidoCuenta(c.id), pag = pagadoCuenta(c.id), sal = saldoCuenta(c.id);
        const mov = movimientosCuenta(c.id);
        const ult = mov.length ? mov[mov.length - 1] : null;
        const tope = c.limite > 0 && sal >= c.limite;
        return '<tr>' +
          '<td><b>' + esc(c.nombre) + '</b>' +
            (c.notas ? '<div class="small muted">' + esc(c.notas) + '</div>' : '') +
            (tope ? '<div class="small" style="color:var(--bad)">⚠ Superó el límite de ' + fmt(c.limite) + '</div>' : '') + '</td>' +
          '<td class="small">' + esc(c.contacto || '—') + (c.tel ? '<div class="small muted mono">' + esc(c.tel) + '</div>' : '') + '</td>' +
          '<td class="num">' + fmt(cons) + '<div class="small muted">' + consumosCuenta(c.id).length + ' pedido(s)</div></td>' +
          '<td class="num muted">' + fmt(pag) + '</td>' +
          '<td class="num"><span class="pill ' + (sal > 0.004 ? 'bad' : sal < -0.004 ? 'info' : 'ok') + '" style="font-size:13px">' +
            fmt(sal) + '</span></td>' +
          '<td class="small mono muted">' + (ult ? fechaCorta(ult.fecha) : '—') + '</td>' +
          '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
            '<button class="btn xs" onclick="verCuenta(\'' + c.id + '\')">Ver consumos</button>' +
            '<button class="btn xs ok" onclick="formPagoCuenta(\'' + c.id + '\')">Cobrar</button>' +
            '<button class="btn xs" onclick="formCuenta(\'' + c.id + '\')">Editar</button>' +
            '<button class="btn xs dan" onclick="borrarCuenta(\'' + c.id + '\')">Borrar</button>' +
          '</td></tr>';
      }).join('') +
      '<tr><td colspan="4"><b>Total adeudado</b></td>' +
      '<td class="num"><b>' + fmt(saldoTotal) + '</b></td><td colspan="2"></td></tr>' +
      '</tbody></table></div>';
  }
  h += '</div>';
  $('#v-cuentas').innerHTML = h;

  const q = $('#ctq');
  if (q) q.oninput = e => { CT.q = e.target.value.toLowerCase(); clearTimeout(q._t); q._t = setTimeout(() => { refresh(); const n = $('#ctq'); if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
}

/* ---------- Alta / edición ---------- */
function formCuenta(id){
  const c = id ? cuenta(id) : null;
  modal({
    title: c ? 'Editar cuenta' : 'Nueva cuenta',
    body:
      '<div class="field" style="margin-bottom:12px"><label>Nombre de la cuenta *</label>' +
        '<input type="text" id="ctNom" value="' + esc(c ? c.nombre : '') + '" placeholder="Ej: Estudio contable, Juan Pérez, Personal"></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Persona de contacto</label><input type="text" id="ctCon" value="' + esc(c ? c.contacto : '') + '"></div>' +
        '<div class="field"><label>Teléfono</label><input type="text" id="ctTel" value="' + esc(c ? c.tel : '') + '"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Límite de crédito (0 = sin límite)</label>' +
        '<input type="number" min="0" step="any" id="ctLim" value="' + (c ? c.limite || 0 : 0) + '"></div>' +
      '<div class="field" style="margin-top:12px"><label>Notas</label>' +
        '<textarea id="ctNot" placeholder="Ej: cierra a fin de mes, factura a nombre de…">' + esc(c ? c.notas : '') + '</textarea></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="ctOk">' + (c ? 'Guardar' : 'Crear cuenta') + '</button>'
  });
  $('#ctOk').onclick = () => {
    const n = $('#ctNom').value.trim(); if (!n) return toast('Poné un nombre a la cuenta');
    const o = { nombre: n, contacto: $('#ctCon').value.trim(), tel: $('#ctTel').value.trim(),
                limite: Math.max(0, num($('#ctLim').value)), notas: $('#ctNot').value.trim() };
    if (c) Object.assign(c, o);
    else S.cuentas.push(Object.assign({ id: uid(), creado: new Date().toISOString() }, o));
    save(); closeModal(); refresh(); toast(c ? 'Cuenta actualizada' : 'Cuenta creada');
  };
}

function borrarCuenta(id){
  const c = cuenta(id); if (!c) return;
  const nc = consumosCuenta(id).length, np = pagosDeCuenta(id).length;
  if (nc || np){
    return modal({
      title: 'No se puede borrar', nofocus: true,
      body: '<p style="margin:0;line-height:1.6">La cuenta <b>' + esc(c.nombre) + '</b> tiene ' + nc + ' consumo(s) y ' + np +
            ' pago(s) registrados, así que borrarla dejaría el historial incompleto.<br><br>' +
            'Si ya no la usás, lo mejor es cobrarle el saldo pendiente (' + fmt(saldoCuenta(id)) + ') y dejarla en cero.</p>',
      footer: '<button class="btn" data-close>Entendido</button>' +
              '<button class="btn ok" onclick="closeModal();formPagoCuenta(\'' + id + '\')">Registrar pago</button>'
    });
  }
  confirmar('¿Borrar la cuenta <b>' + esc(c.nombre) + '</b>?', () => {
    S.cuentas = S.cuentas.filter(x => x.id !== id);
    save(); refresh(); toast('Cuenta borrada');
  }, 'Borrar');
}

/* ---------- Detalle de consumos ---------- */
function verCuenta(id){
  const c = cuenta(id); if (!c) return;
  const mov = movimientosCuenta(id).slice().reverse();
  const sal = saldoCuenta(id);
  modal({
    size: 'lg', nofocus: true,
    title: '📒 ' + esc(c.nombre) +
      ' <span class="pill ' + (sal > 0.004 ? 'bad' : 'ok') + '" style="margin-left:6px">Saldo ' + fmt(sal) + '</span>',
    body:
      '<div class="kpis" style="margin-bottom:14px">' +
        kpi('Consumido', fmt(consumidoCuenta(id)), consumosCuenta(id).length + ' pedido(s) a cuenta') +
        kpi('Pagado', fmt(pagadoCuenta(id)), pagosDeCuenta(id).length + ' pago(s) recibidos') +
        kpi('Saldo actual', fmt(sal), sal > 0.004 ? 'Pendiente de cobro' : 'Cuenta al día', true) +
      '</div>' +
      (c.contacto || c.tel || c.notas
        ? '<div class="small muted" style="margin-bottom:12px">' +
          [c.contacto, c.tel, c.notas].filter(Boolean).map(esc).join(' · ') + '</div>'
        : '') +
      (mov.length
        ? '<div class="tbl-wrap" style="max-height:46vh;overflow:auto"><table><thead><tr>' +
            '<th>Fecha</th><th>Movimiento</th><th>Detalle</th><th class="num">Consumo</th><th class="num">Pago</th><th class="num">Saldo</th>' +
          '</tr></thead><tbody>' +
          mov.map(m => '<tr>' +
            '<td class="mono small">' + fechaCorta(m.fecha) + '<div class="small muted">' + (m.t === 'consumo' ? hora(m.fecha) : '') + '</div></td>' +
            '<td>' + (m.t === 'consumo'
                ? '<span class="pill gray">Pedido #' + m.ped.num + '</span>'
                : '<span class="pill ok">Pago</span>') + '</td>' +
            '<td class="small muted" style="max-width:300px">' + esc(m.detalle) + '</td>' +
            '<td class="num">' + (m.t === 'consumo' ? fmt(m.monto) : '—') + '</td>' +
            '<td class="num">' + (m.t === 'pago' ? fmt(m.monto) : '—') + '</td>' +
            '<td class="num mono"><b>' + fmt(m.saldo) + '</b></td>' +
          '</tr>').join('') +
          '</tbody></table></div>'
        : vacio('🧾', 'Sin movimientos', 'Cargá un consumo desde una mesa eligiendo “Cuenta” como forma de pago.')),
    footer:
      '<button class="btn" data-close>Cerrar</button>' +
      '<button class="btn" onclick="imprimirResumenCuenta(\'' + id + '\')">🖨 Imprimir resumen</button>' +
      '<button class="btn ok" onclick="closeModal();formPagoCuenta(\'' + id + '\')">💵 Registrar pago</button>'
  });
}

/* ---------- Cobro ---------- */
function formPagoCuenta(id){
  const c = cuenta(id); if (!c) return;
  const sal = saldoCuenta(id);
  modal({
    title: 'Registrar pago — ' + esc(c.nombre),
    body:
      '<div class="tot-row big" style="margin-bottom:12px"><span>Saldo actual</span><span class="mono">' + fmt(sal) + '</span></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Monto recibido</label><input type="number" step="any" min="0" id="pcMonto" value="' + (sal > 0 ? sal : 0) + '"></div>' +
        '<div class="field"><label>Fecha</label><input type="date" id="pcFecha" value="' + hoy() + '"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Forma de pago</label><select id="pcMedio">' +
        Object.keys(PAGOS).filter(k => k !== 'cuenta').map(k => '<option value="' + k + '">' + PAGOS[k] + '</option>').join('') +
      '</select></div>' +
      '<div class="field" style="margin-top:12px"><label>Observaciones</label>' +
        '<input type="text" id="pcNota" placeholder="Ej: pago parcial, transferencia del 05/08"></div>' +
      '<div class="alert info small" style="margin-top:12px"><span>ℹ</span><div>El pago se suma a la caja del día elegido. Si es en efectivo, entra en el efectivo esperado del cierre.</div></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn ok" id="pcOk">💵 Registrar pago</button>'
  });
  $('#pcOk').onclick = () => {
    const m = num($('#pcMonto').value);
    if (m <= 0) return toast('Poné un monto mayor a cero');
    S.pagosCuenta.push({
      id: uid(), cuentaId: id, fecha: $('#pcFecha').value || hoy(),
      monto: redondear(m), medio: $('#pcMedio').value, nota: $('#pcNota').value.trim(),
      creado: new Date().toISOString()
    });
    save(); closeModal(); refresh();
    toast('Pago de ' + fmt(m) + ' registrado — saldo: ' + fmt(saldoCuenta(id)));
  };
}

function borrarPagoCuenta(pid, cid){
  confirmar('¿Borrar este pago? El saldo de la cuenta vuelve a subir.', () => {
    S.pagosCuenta = S.pagosCuenta.filter(x => x.id !== pid);
    save(); closeModal(); refresh(); verCuenta(cid); toast('Pago borrado');
  }, 'Borrar pago');
}

/* ---------- Impresión y exportación ---------- */
function imprimirResumenCuenta(id){
  const c = cuenta(id); if (!c) return;
  const mov = movimientosCuenta(id);
  $('#tk').innerHTML =
    tkHead() + '<div class="l"></div>' +
    '<div class="c"><b>RESUMEN DE CUENTA</b></div>' +
    '<div class="c">' + esc(c.nombre) + '</div>' +
    '<div class="c">' + fechaCorta(new Date()) + ' ' + hora(new Date()) + '</div>' +
    '<div class="l"></div>' +
    '<table>' + mov.map(m =>
      '<tr><td>' + fechaCorta(m.fecha) + ' ' + (m.t === 'consumo' ? 'Ped.#' + m.ped.num : 'PAGO') + '</td>' +
      '<td align="right">' + (m.t === 'consumo' ? '' : '-') + fmt(m.monto) + '</td></tr>').join('') +
    '</table>' +
    '<div class="l"></div>' +
    '<table>' +
      '<tr><td>Consumido</td><td align="right">' + fmt(consumidoCuenta(id)) + '</td></tr>' +
      '<tr><td>Pagado</td><td align="right">-' + fmt(pagadoCuenta(id)) + '</td></tr>' +
      '<tr><td><b>SALDO</b></td><td align="right"><b>' + fmt(saldoCuenta(id)) + '</b></td></tr>' +
    '</table>' +
    '<div class="l"></div>' +
    '<div class="c s">Documento no v&aacute;lido como factura</div>';
  tkImprimir();
}

function exportarCuentas(){
  if (!S.cuentas.length) return toast('No hay cuentas para exportar');
  const rows = [['Cuenta','Fecha','Movimiento','Detalle','Consumo','Pago','Saldo']];
  S.cuentas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach(c => {
    const mov = movimientosCuenta(c.id);
    if (!mov.length) rows.push([c.nombre, '', 'Sin movimientos', '', 0, 0, 0]);
    mov.forEach(m => rows.push([
      c.nombre, fechaCorta(m.fecha),
      m.t === 'consumo' ? 'Pedido #' + m.ped.num : 'Pago ' + nombrePago(m.pago.medio),
      m.detalle, m.t === 'consumo' ? m.monto : '', m.t === 'pago' ? m.monto : '', m.saldo
    ]));
    rows.push([c.nombre, '', 'SALDO FINAL', '', consumidoCuenta(c.id), pagadoCuenta(c.id), saldoCuenta(c.id)]);
  });
  descargar('﻿' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n'),
    'cuentas_' + hoy() + '.csv', 'text/csv;charset=utf-8');
  toast('CSV descargado');
}
