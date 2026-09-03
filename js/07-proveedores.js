/* ============================================================
   PROVEEDORES Y COMPRAS
   ============================================================ */

let PV = { tab: 'proveedores', q: '', desde: '', hasta: '', prov: 'todos' };
let COMPRA = { items: [] };

function comprasDeProv(id){ return S.compras.filter(c => c.provId === id); }

function renderProveedores(){
  setActions('<button class="btn" onclick="formCompra()">＋ Registrar compra</button>' +
             '<button class="btn pri" onclick="formProv()">＋ Nuevo proveedor</button>');

  let h = '<div class="tabs" style="margin-bottom:16px;display:inline-flex">' +
    '<button class="' + (PV.tab === 'proveedores' ? 'on' : '') + '" onclick="PV.tab=\'proveedores\';refresh()">🚚 Proveedores</button>' +
    '<button class="' + (PV.tab === 'compras' ? 'on' : '') + '" onclick="PV.tab=\'compras\';refresh()">📦 Compras</button>' +
  '</div>';

  h += PV.tab === 'proveedores' ? htmlProveedores() : htmlCompras();
  $('#v-proveedores').innerHTML = h;

  const q = $('#vq');
  if (q) q.oninput = e => { PV.q = e.target.value.toLowerCase(); clearTimeout(q._t); q._t = setTimeout(() => { refresh(); const n = $('#vq'); if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
}

function htmlProveedores(){
  let list = S.proveedores.slice();
  if (PV.q) list = list.filter(p => (p.nombre + ' ' + p.rubro + ' ' + p.contacto).toLowerCase().includes(PV.q));
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const totalCompras = S.compras.reduce((a, c) => a + c.total, 0);
  let h = '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Proveedores', String(S.proveedores.length), 'Contactos cargados') +
    kpi('Compras registradas', String(S.compras.length), 'Historial completo') +
    kpi('Total comprado', fmt(totalCompras), 'Suma de todas las compras') +
  '</div>';

  h += '<div class="card"><div class="hd"><h3>Listado de proveedores</h3><div class="sp" style="flex:1"></div>' +
       '<input type="search" id="vq" value="' + esc(PV.q) + '" placeholder="Buscar proveedor…" style="width:220px"></div>';

  if (!list.length){
    h += vacio('🚚', 'Todavía no hay proveedores', 'Agregá el primero con “＋ Nuevo proveedor”.');
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>Proveedor</th><th>Rubro</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th class="num">Compras</th><th>Última</th><th></th>' +
      '</tr></thead><tbody>' +
      list.map(p => {
        const cs = comprasDeProv(p.id);
        const tot = cs.reduce((a, c) => a + c.total, 0);
        const ult = cs.length ? cs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0].fecha : null;
        return '<tr>' +
          '<td><b>' + esc(p.nombre) + '</b>' + (p.notas ? '<div class="small muted">' + esc(p.notas) + '</div>' : '') + '</td>' +
          '<td class="small">' + esc(p.rubro || '—') + '</td>' +
          '<td class="small">' + esc(p.contacto || '—') + '</td>' +
          '<td class="small mono">' + esc(p.tel || '—') + '</td>' +
          '<td class="small">' + (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '—') + '</td>' +
          '<td class="num"><b>' + fmt(tot) + '</b><div class="small muted">' + cs.length + ' compra(s)</div></td>' +
          '<td class="small mono">' + (ult ? fechaCorta(ult + 'T12:00') : '—') + '</td>' +
          '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
            '<button class="btn xs" onclick="formCompra(\'' + p.id + '\')">＋ Compra</button>' +
            '<button class="btn xs" onclick="formProv(\'' + p.id + '\')">Editar</button>' +
            '<button class="btn xs dan" onclick="borrarProv(\'' + p.id + '\')">Borrar</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  return h + '</div>';
}

function formProv(id){
  const p = id ? prov(id) : null;
  modal({
    title: p ? 'Editar proveedor' : 'Nuevo proveedor',
    body:
      '<div class="grid2">' +
        '<div class="field"><label>Nombre / Razón social *</label><input type="text" id="vNom" value="' + esc(p ? p.nombre : '') + '"></div>' +
        '<div class="field"><label>Rubro</label><input type="text" id="vRub" value="' + esc(p ? p.rubro : '') + '" placeholder="Ej: Panificados"></div>' +
      '</div>' +
      '<div class="grid2" style="margin-top:12px">' +
        '<div class="field"><label>Persona de contacto</label><input type="text" id="vCon" value="' + esc(p ? p.contacto : '') + '"></div>' +
        '<div class="field"><label>Teléfono</label><input type="text" id="vTel" value="' + esc(p ? p.tel : '') + '"></div>' +
      '</div>' +
      '<div class="grid2" style="margin-top:12px">' +
        '<div class="field"><label>Email</label><input type="text" id="vMail" value="' + esc(p ? p.email : '') + '"></div>' +
        '<div class="field"><label>Dirección</label><input type="text" id="vDir" value="' + esc(p ? p.dir : '') + '"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Notas</label><textarea id="vNot" placeholder="Días de entrega, condiciones de pago…">' + esc(p ? p.notas : '') + '</textarea></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="vOk">' + (p ? 'Guardar' : 'Crear proveedor') + '</button>'
  });
  $('#vOk').onclick = () => {
    const n = $('#vNom').value.trim(); if (!n) return toast('Poné el nombre del proveedor');
    const o = { nombre: n, rubro: $('#vRub').value.trim(), contacto: $('#vCon').value.trim(),
                tel: $('#vTel').value.trim(), email: $('#vMail').value.trim(), dir: $('#vDir').value.trim(), notas: $('#vNot').value.trim() };
    if (p) Object.assign(p, o); else S.proveedores.push(Object.assign({ id: uid() }, o));
    save(); closeModal(); refresh(); toast(p ? 'Proveedor actualizado' : 'Proveedor creado');
  };
}

function borrarProv(id){
  const p = prov(id); if (!p) return;
  const n = comprasDeProv(id).length;
  confirmar('¿Borrar el proveedor <b>' + esc(p.nombre) + '</b>?' +
    (n ? '<br><span class="small muted">Tiene ' + n + ' compra(s) registradas; quedarán sin proveedor asignado.</span>' : ''), () => {
      S.proveedores = S.proveedores.filter(x => x.id !== id);
      save(); refresh(); toast('Proveedor borrado');
    }, 'Borrar');
}

/* ---------- Compras ---------- */
function htmlCompras(){
  let list = S.compras.slice();
  if (PV.prov !== 'todos') list = list.filter(c => c.provId === PV.prov);
  if (PV.desde) list = list.filter(c => c.fecha >= PV.desde);
  if (PV.hasta) list = list.filter(c => c.fecha <= PV.hasta);
  list.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));
  const tot = list.reduce((a, c) => a + c.total, 0);

  let h = '<div class="card" style="margin-bottom:16px"><div class="bd"><div class="grid4">' +
    '<div class="field"><label>Desde</label><input type="date" value="' + PV.desde + '" onchange="PV.desde=this.value;refresh()"></div>' +
    '<div class="field"><label>Hasta</label><input type="date" value="' + PV.hasta + '" onchange="PV.hasta=this.value;refresh()"></div>' +
    '<div class="field"><label>Proveedor</label><select onchange="PV.prov=this.value;refresh()"><option value="todos">Todos</option>' +
      S.proveedores.map(p => '<option value="' + p.id + '" ' + (PV.prov === p.id ? 'selected' : '') + '>' + esc(p.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="field"><label>&nbsp;</label><button class="btn" onclick="PV.desde=\'\';PV.hasta=\'\';PV.prov=\'todos\';refresh()">Limpiar filtros</button></div>' +
  '</div></div></div>';

  h += '<div class="kpis" style="margin-bottom:16px">' +
    kpi('Compras', String(list.length), 'En el período filtrado') +
    kpi('Total', fmt(tot), 'Egresos por mercadería', true) +
  '</div>';

  h += '<div class="card"><div class="hd"><h3>Historial de compras</h3></div>';
  if (!list.length){
    h += vacio('📦', 'Sin compras registradas', 'Usá “＋ Registrar compra” para cargar la primera.');
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th>Pago</th><th class="num">Total</th><th></th></tr></thead><tbody>' +
      list.map(c => {
        const p = prov(c.provId);
        const det = c.items.map(i => i.cant + '× ' + i.nombre).join(', ');
        return '<tr><td class="mono">' + fechaCorta(c.fecha + 'T12:00') + '</td>' +
          '<td><b>' + esc(p ? p.nombre : 'Sin proveedor') + '</b></td>' +
          '<td class="small muted" style="max-width:340px">' + esc(det) + (c.nota ? '<div class="small">📝 ' + esc(c.nota) + '</div>' : '') + '</td>' +
          '<td class="small">' + nombrePago(c.pago) + '</td>' +
          '<td class="num"><b>' + fmt(c.total) + '</b></td>' +
          '<td><button class="btn xs dan" onclick="borrarCompra(\'' + c.id + '\')">Borrar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  return h + '</div>';
}

function formCompra(provId){
  if (!S.proveedores.length){ toast('Primero cargá un proveedor'); return formProv(); }
  COMPRA = { items: [{ pid: '', desc: '', cant: 1, costo: 0 }] };
  modal({
    size: 'lg', title: 'Registrar compra', nofocus: true,
    body:
      '<div class="grid4">' +
        '<div class="field"><label>Proveedor *</label><select id="cProv">' +
          S.proveedores.map(p => '<option value="' + p.id + '" ' + (provId === p.id ? 'selected' : '') + '>' + esc(p.nombre) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Fecha</label><input type="date" id="cFecha" value="' + hoy() + '"></div>' +
        '<div class="field"><label>Medio de pago</label><select id="cPago">' +
          Object.keys(PAGOS).filter(k => k !== 'cuenta').map(k => '<option value="' + k + '">' + PAGOS[k] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>N° de remito / factura</label><input type="text" id="cNota" placeholder="Opcional"></div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="row" style="margin-bottom:8px"><b>Detalle de la compra</b><div class="sp" style="flex:1"></div>' +
        '<button class="btn sm" onclick="addFilaCompra()">＋ Agregar ítem</button></div>' +
      '<div id="cItems"></div>' +
      '<div class="tot-row big" style="justify-content:flex-end;gap:18px"><span>Total</span><span id="cTot">—</span></div>' +
      '<label class="chk" style="margin-top:10px"><input type="checkbox" id="cUpd" checked> Actualizar el costo de los productos con el de esta compra</label>' +
      '<div class="alert info small" style="margin-top:10px"><span>ℹ</span><div>Los ítems asociados a un producto con control de stock suman unidades automáticamente.</div></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="cOk">💾 Guardar compra</button>'
  });
  pintarFilasCompra();
  $('#cOk').onclick = guardarCompra;
}

function addFilaCompra(){ COMPRA.items.push({ pid: '', desc: '', cant: 1, costo: 0 }); pintarFilasCompra(); }
function quitarFilaCompra(i){ COMPRA.items.splice(i, 1); if (!COMPRA.items.length) addFilaCompra(); else pintarFilasCompra(); }
function setFila(i, campo, v){
  const it = COMPRA.items[i];
  if (campo === 'pid'){
    it.pid = v;
    const p = prod(v);
    if (p && !it.costo) it.costo = p.costo;
  } else if (campo === 'cant' || campo === 'costo') it[campo] = num(v);
  else it[campo] = v;
  pintarFilasCompra();
}
function totalCompra(){ return COMPRA.items.reduce((a, i) => a + i.cant * i.costo, 0); }

function pintarFilasCompra(){
  const cont = $('#cItems'); if (!cont) return;
  const ops = S.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  cont.innerHTML = COMPRA.items.map((it, i) =>
    '<div class="row" style="flex-wrap:nowrap;gap:8px;margin-bottom:8px;align-items:flex-end">' +
      '<div class="field grow"><label>' + (i === 0 ? 'Producto' : '') + '</label>' +
        '<select onchange="setFila(' + i + ',\'pid\',this.value)">' +
          '<option value="">— Otro concepto (sin stock) —</option>' +
          ops.map(p => '<option value="' + p.id + '" ' + (it.pid === p.id ? 'selected' : '') + '>' + esc(p.nombre) + (p.ctrl ? ' · stock ' + p.stock : '') + '</option>').join('') +
        '</select></div>' +
      (it.pid ? '' :
        '<div class="field grow"><label>' + (i === 0 ? 'Descripción' : '') + '</label>' +
          '<input type="text" value="' + esc(it.desc) + '" placeholder="Ej: Servilletas, gas" onchange="setFila(' + i + ',\'desc\',this.value)"></div>') +
      '<div class="field" style="width:96px"><label>' + (i === 0 ? 'Cantidad' : '') + '</label>' +
        '<input type="number" step="any" min="0" value="' + it.cant + '" onchange="setFila(' + i + ',\'cant\',this.value)"></div>' +
      '<div class="field" style="width:120px"><label>' + (i === 0 ? 'Costo unit.' : '') + '</label>' +
        '<input type="number" step="any" min="0" value="' + it.costo + '" onchange="setFila(' + i + ',\'costo\',this.value)"></div>' +
      '<div class="field" style="width:110px"><label>' + (i === 0 ? 'Importe' : '') + '</label>' +
        '<div class="mono" style="padding:8px 0;text-align:right;font-weight:600">' + fmt(it.cant * it.costo) + '</div></div>' +
      '<button class="btn sm dan" style="margin-bottom:6px" onclick="quitarFilaCompra(' + i + ')">×</button>' +
    '</div>').join('');
  $('#cTot').textContent = fmt(totalCompra());
}

function guardarCompra(){
  const items = COMPRA.items
    .filter(i => (i.pid || i.desc.trim()) && i.cant > 0)
    .map(i => ({ pid: i.pid || null, nombre: i.pid ? (prod(i.pid) || {}).nombre || 'Producto' : i.desc.trim(), cant: i.cant, costo: i.costo }));
  if (!items.length) return toast('Cargá al menos un ítem con cantidad');
  const c = {
    id: uid(), provId: $('#cProv').value, fecha: $('#cFecha').value || hoy(),
    pago: $('#cPago').value, nota: $('#cNota').value.trim(),
    items: items, total: items.reduce((a, i) => a + i.cant * i.costo, 0),
    creado: new Date().toISOString()
  };
  const upd = $('#cUpd').checked;
  items.forEach(i => {
    if (!i.pid) return;
    const p = prod(i.pid); if (!p) return;
    if (p.ctrl) p.stock = Math.round((p.stock + i.cant) * 100) / 100;
    if (upd && i.costo > 0) p.costo = i.costo;
  });
  S.compras.push(c); save(); closeModal(); PV.tab = 'compras'; refresh();
  toast('Compra registrada por ' + fmt(c.total));
}

function borrarCompra(id){
  const c = S.compras.find(x => x.id === id); if (!c) return;
  confirmar('¿Borrar esta compra de <b>' + fmt(c.total) + '</b>? Se descuenta del stock lo que había sumado.', () => {
    c.items.forEach(i => { if (!i.pid) return; const p = prod(i.pid); if (p && p.ctrl) p.stock = Math.round((p.stock - i.cant) * 100) / 100; });
    S.compras = S.compras.filter(x => x.id !== id);
    save(); refresh(); toast('Compra borrada');
  }, 'Borrar compra');
}
