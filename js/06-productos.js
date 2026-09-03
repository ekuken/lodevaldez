/* ============================================================
   PRODUCTOS — alta, edición, baja y stock
   ============================================================ */

let PF = { q: '', cat: 'Todas', solo: 'todos' };

function renderProductos(){
  setActions('<button class="btn" onclick="exportarProductos()">⬇ CSV</button>' +
             '<button class="btn" onclick="importarProductos()">⬆ Importar archivo</button>' +
             '<button class="btn pri" onclick="formProducto()">＋ Nuevo producto</button>');

  const bs = bajoStock();
  const cats = ['Todas'].concat([...new Set(S.productos.map(p => p.cat || 'Sin categoría'))].sort());

  let list = S.productos.slice();
  if (PF.cat !== 'Todas') list = list.filter(p => (p.cat || 'Sin categoría') === PF.cat);
  if (PF.q) list = list.filter(p => p.nombre.toLowerCase().includes(PF.q) || (p.cat || '').toLowerCase().includes(PF.q));
  if (PF.solo === 'bajo') list = list.filter(p => p.ctrl && p.stock <= p.stockMin);
  if (PF.solo === 'inactivos') list = list.filter(p => !p.activo);
  if (PF.solo === 'activos') list = list.filter(p => p.activo);
  list.sort((a, b) => (a.cat || '').localeCompare(b.cat || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));

  const valorStock = S.productos.filter(p => p.ctrl).reduce((a, p) => a + p.stock * p.costo, 0);

  let h = '<div class="kpis" style="margin-bottom:18px">' +
    kpi('Productos', String(S.productos.length), S.productos.filter(p => p.activo).length + ' activos en la carta') +
    kpi('Categorías', String(cats.length - 1), 'Agrupaciones de la carta') +
    kpi('Stock bajo', String(bs.length), 'Productos a reponer') +
    kpi('Valor del stock', fmt(valorStock), 'Valuado a costo') +
  '</div>';

  if (bs.length){
    h += '<div class="alert warn" style="margin-bottom:16px"><span>⚠</span><div><b>Reponer:</b> ' +
      bs.map(p => esc(p.nombre) + ' <span class="mono">(' + p.stock + ' / mín. ' + p.stockMin + ')</span>').join(' · ') +
      '</div></div>';
  }

  h += '<div class="card"><div class="hd">' +
    '<h3>Carta</h3>' +
    '<div class="tabs">' +
      ['todos','activos','bajo','inactivos'].map(k => '<button class="' + (PF.solo === k ? 'on' : '') + '" onclick="PF.solo=\'' + k + '\';refresh()">' +
        ({todos:'Todos', activos:'Activos', bajo:'Stock bajo', inactivos:'Inactivos'})[k] + '</button>').join('') +
    '</div>' +
    '<div class="sp" style="flex:1"></div>' +
    '<select style="width:auto" onchange="PF.cat=this.value;refresh()">' +
      cats.map(c => '<option ' + (PF.cat === c ? 'selected' : '') + '>' + esc(c) + '</option>').join('') +
    '</select>' +
    '<input type="search" id="pq" value="' + esc(PF.q) + '" placeholder="Buscar…" style="width:190px">' +
  '</div>';

  if (!list.length){
    h += vacio('☕', 'No hay productos que coincidan', 'Creá uno con el botón “＋ Nuevo producto”.');
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">Margen</th><th>Stock</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      list.map(p => {
        const mg = p.precio ? Math.round((p.precio - p.costo) / p.precio * 100) : 0;
        const bajo = p.ctrl && p.stock <= p.stockMin;
        return '<tr>' +
          '<td><b>' + esc(p.nombre) + '</b></td>' +
          '<td class="small muted">' + esc(p.cat || '—') + '</td>' +
          '<td class="num"><b>' + fmt(p.precio) + '</b></td>' +
          '<td class="num muted">' + fmt(p.costo) + '</td>' +
          '<td class="num"><span class="pill ' + (mg >= 50 ? 'ok' : mg >= 25 ? 'warn' : 'bad') + '">' + mg + '%</span></td>' +
          '<td>' + (p.ctrl
              ? '<span class="mono ' + (bajo ? 'pill bad' : '') + '">' + p.stock + '</span> <span class="small muted">mín. ' + p.stockMin + '</span>' +
                ' <button class="btn xs" onclick="formStock(\'' + p.id + '\')">±</button>'
              : '<span class="small muted">sin control</span>') + '</td>' +
          '<td>' + (p.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill gray">Inactivo</span>') + '</td>' +
          '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
            '<button class="btn xs" onclick="formProducto(\'' + p.id + '\')">Editar</button>' +
            '<button class="btn xs dan" onclick="borrarProducto(\'' + p.id + '\')">Borrar</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  h += '</div>';
  $('#v-productos').innerHTML = h;

  const q = $('#pq');
  if (q) q.oninput = e => { PF.q = e.target.value.toLowerCase(); clearTimeout(q._t); q._t = setTimeout(() => { refresh(); const n = $('#pq'); if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
}

function formProducto(id){
  const p = id ? prod(id) : null;
  const cats = [...new Set(S.productos.map(x => x.cat).filter(Boolean))].sort();
  modal({
    title: p ? 'Editar producto' : 'Nuevo producto',
    body:
      '<div class="field" style="margin-bottom:12px"><label>Nombre *</label>' +
        '<input type="text" id="fNom" value="' + esc(p ? p.nombre : '') + '" placeholder="Ej: Café con leche"></div>' +
      '<div class="field" style="margin-bottom:12px"><label>Categoría</label>' +
        '<input type="text" id="fCat" list="catList" value="' + esc(p ? p.cat : '') + '" placeholder="Ej: Cafetería">' +
        '<datalist id="catList">' + cats.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Precio de venta *</label><input type="number" step="any" min="0" id="fPre" value="' + (p ? p.precio : '') + '"></div>' +
        '<div class="field"><label>Costo</label><input type="number" step="any" min="0" id="fCos" value="' + (p ? p.costo : 0) + '"></div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<label class="chk"><input type="checkbox" id="fCtrl" ' + (!p || p.ctrl ? 'checked' : '') + ' onchange="document.getElementById(\'stkBox\').classList.toggle(\'hide\',!this.checked)">' +
        ' Controlar stock de este producto</label>' +
      '<div class="grid2 ' + (p && !p.ctrl ? 'hide' : '') + '" id="stkBox" style="margin-top:12px">' +
        '<div class="field"><label>Stock actual</label><input type="number" step="any" id="fStk" value="' + (p ? p.stock : 0) + '"></div>' +
        '<div class="field"><label>Stock mínimo (aviso)</label><input type="number" step="any" id="fMin" value="' + (p ? p.stockMin : 5) + '"></div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<label class="chk"><input type="checkbox" id="fAct" ' + (!p || p.activo ? 'checked' : '') + '> Mostrar en la pantalla de venta</label>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="fOk">' + (p ? 'Guardar cambios' : 'Crear producto') + '</button>'
  });
  $('#fOk').onclick = () => {
    const nom = $('#fNom').value.trim();
    if (!nom) return toast('Poné un nombre al producto');
    const o = {
      nombre: nom, cat: $('#fCat').value.trim() || 'Sin categoría',
      precio: num($('#fPre').value), costo: num($('#fCos').value),
      ctrl: $('#fCtrl').checked, stock: num($('#fStk').value), stockMin: num($('#fMin').value),
      activo: $('#fAct').checked
    };
    if (p) Object.assign(p, o);
    else S.productos.push(Object.assign({ id: uid() }, o));
    save(); closeModal(); refresh(); toast(p ? 'Producto actualizado' : 'Producto creado');
  };
}

function borrarProducto(id){
  const p = prod(id); if (!p) return;
  const usos = S.pedidos.filter(x => x.items.some(i => i.pid === id)).length;
  confirmar('¿Borrar <b>' + esc(p.nombre) + '</b>?' +
    (usos ? '<br><span class="small muted">Aparece en ' + usos + ' pedido(s); esos pedidos conservan el nombre y el precio con el que se vendieron.</span>' : '') +
    '<br><span class="small muted">Si solo querés sacarlo de la carta, editalo y desmarcá “Mostrar en la pantalla de venta”.</span>', () => {
      S.productos = S.productos.filter(x => x.id !== id);
      save(); refresh(); toast('Producto borrado');
    }, 'Borrar producto');
}

function formStock(id){
  const p = prod(id); if (!p) return;
  modal({
    title: 'Ajustar stock — ' + esc(p.nombre),
    body:
      '<div class="row" style="margin-bottom:12px"><span class="muted">Stock actual:</span> <b class="mono" style="font-size:19px">' + p.stock + '</b></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Operación</label><select id="sOp">' +
          '<option value="sumar">Sumar (ingreso)</option><option value="restar">Restar (merma / rotura)</option><option value="fijar">Fijar valor exacto</option>' +
        '</select></div>' +
        '<div class="field"><label>Cantidad</label><input type="number" step="any" id="sCant" value="1"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>Stock mínimo</label><input type="number" step="any" id="sMin" value="' + p.stockMin + '"></div>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="sOk">Aplicar</button>'
  });
  $('#sOk').onclick = () => {
    const c = num($('#sCant').value), op = $('#sOp').value;
    p.stock = op === 'sumar' ? p.stock + c : op === 'restar' ? p.stock - c : c;
    p.stock = Math.round(p.stock * 100) / 100;
    p.stockMin = num($('#sMin').value);
    save(); closeModal(); refresh(); toast('Stock actualizado: ' + p.stock);
  };
}

function exportarProductos(){
  const rows = [['Producto','Categoria','Precio','Costo','Margen %','Controla stock','Stock','Stock minimo','Activo']];
  S.productos.forEach(p => rows.push([p.nombre, p.cat, p.precio, p.costo,
    p.precio ? Math.round((p.precio - p.costo) / p.precio * 100) : 0, p.ctrl ? 'Si' : 'No', p.stock, p.stockMin, p.activo ? 'Si' : 'No']));
  descargar('﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n'),
    'productos_' + hoy() + '.csv', 'text/csv;charset=utf-8');
  toast('CSV descargado');
}

/* ============================================================
   IMPORTAR PRODUCTOS desde un archivo (.csv o .txt)
   Acepta separador coma, punto y coma o tabulación, y reconoce
   las columnas por el nombre del encabezado.
   ============================================================ */
let IMP = { todos: [], nuevos: [], repetidos: 0, vacias: 0, cabecera: false };

/* Texto comparable: sin mayúsculas ni acentos */
function normal(s){
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/* Divide una línea respetando las comillas: "Baguette jamon,rucula" queda entero */
function partirLinea(linea, sep){
  const out = []; let act = '', dentro = false;
  for (let i = 0; i < linea.length; i++){
    const c = linea[i];
    if (c === '"'){
      if (dentro && linea[i + 1] === '"'){ act += '"'; i++; }
      else dentro = !dentro;
    }
    else if (c === sep && !dentro){ out.push(act); act = ''; }
    else act += c;
  }
  out.push(act);
  return out.map(x => x.trim());
}

/* El separador es el que mas aparece fuera de comillas */
function separadorDe(linea){
  const cont = { ';': 0, ',': 0, '\t': 0 };
  let dentro = false;
  for (const ch of linea){
    if (ch === '"') dentro = !dentro;
    else if (!dentro && cont[ch] !== undefined) cont[ch]++;
  }
  return Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
}

/* Numeros escritos de cualquier forma: 1234 - 1.234 - 1.234,50 - 1234.50 */
function numArchivo(v){
  let s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function boolArchivo(v, porDefecto){
  const s = normal(v);
  if (s === '') return porDefecto;
  return ['si', 's', 'true', 'verdadero', '1', 'x', 'activo'].includes(s);
}

function importarProductos(){
  if (!soloAdmin('importar productos')) return;
  modal({
    size: 'lg', title: 'Importar productos desde un archivo', nofocus: true,
    body:
      '<p style="margin:0 0 12px;line-height:1.55">Elegí un archivo <b>.csv</b> o <b>.txt</b> con la lista de productos. ' +
        'Sirve el que descarga este sistema y también el que exportan otros sistemas.</p>' +
      '<input type="file" id="impProd" accept=".csv,.txt,text/csv,text/plain">' +
      '<div class="alert info small" style="margin-top:12px"><span>i</span><div>' +
        'Conviene que la primera fila sea el encabezado con el nombre de cada columna. Se reconocen ' +
        '<b>nombre</b> (o producto), <b>categoría</b>, <b>precio</b>, <b>costo</b>, <b>stock</b>, ' +
        '<b>control de stock</b> y <b>activo</b>; las demás columnas se ignoran. ' +
        'Si el archivo no tiene encabezado se toman las tres primeras columnas como nombre, categoría y precio.' +
      '</div></div>' +
      '<div id="impPrev"></div>',
    footer: '<button class="btn" data-close>Cancelar</button>'
  });
  $('#impProd').onchange = e => leerArchivoProductos(e.target.files[0]);
}

function leerArchivoProductos(f){
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const txt = String(r.result || '');
    /* Los archivos que salen de Excel suelen venir en Windows-1252: si
       aparecen caracteres raros se vuelve a leer con esa codificación. */
    if (/\u00c3[\u0080-\u00bf]|\ufffd/.test(txt)){
      const r2 = new FileReader();
      r2.onload = () => procesarArchivoProductos(String(r2.result || ''));
      r2.onerror = () => toast('No se pudo leer el archivo');
      r2.readAsText(f, 'windows-1252');
      return;
    }
    procesarArchivoProductos(txt);
  };
  r.onerror = () => toast('No se pudo leer el archivo');
  r.readAsText(f, 'utf-8');
}

function procesarArchivoProductos(txt){
  const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  const prev = $('#impPrev'); if (!prev) return;
  if (!lineas.length){
    prev.innerHTML = '<div class="alert warn" style="margin-top:12px"><span>!</span><div>El archivo está vacío.</div></div>';
    return;
  }
  const sep = separadorDe(lineas[0]);
  const filas = lineas.map(l => partirLinea(l, sep));
  const cab = filas[0].map(normal);
  const buscar = function(){
    for (let i = 0; i < arguments.length; i++){
      const k = cab.indexOf(arguments[i]);
      if (k >= 0) return k;
    }
    return -1;
  };

  let iNom = buscar('nombre', 'producto', 'articulo', 'detalle', 'descripcion');
  const cabecera = iNom >= 0;
  let iCat, iPre, iCos, iStk, iCtl, iAct, datos;
  if (cabecera){
    iCat = buscar('categoria', 'rubro', 'familia', 'grupo');
    iPre = buscar('precio', 'precio venta', 'precio de venta', 'pvp', 'importe', 'precio unitario');
    iCos = buscar('costo', 'precio costo', 'precio de costo');
    iStk = buscar('stock', 'cantidad', 'existencia', 'existencias');
    iCtl = buscar('control de stock', 'controla stock', 'controlar stock');
    iAct = buscar('activo', 'habilitado', 'estado');
    datos = filas.slice(1);
  } else {
    iNom = 0; iCat = 1; iPre = 2; iCos = -1; iStk = -1; iCtl = -1; iAct = -1;
    datos = filas;
  }
  const dato = (f, i) => (i >= 0 && i < f.length ? f[i] : '');

  const yaEstan = new Set(S.productos.map(p => normal(p.nombre)));
  const enArchivo = new Set();
  IMP = { todos: [], nuevos: [], repetidos: 0, vacias: 0, cabecera: cabecera };

  datos.forEach(f => {
    const nom = dato(f, iNom).trim();
    if (!nom){ IMP.vacias++; return; }
    const clave = normal(nom);
    if (enArchivo.has(clave)) return;
    enArchivo.add(clave);
    const p = {
      nombre: nom,
      cat: dato(f, iCat).trim() || 'Sin categoría',
      precio: numArchivo(dato(f, iPre)),
      costo: numArchivo(dato(f, iCos)),
      stock: Math.max(0, numArchivo(dato(f, iStk))),
      stockMin: 0,
      ctrl: boolArchivo(dato(f, iCtl), false),
      activo: boolArchivo(dato(f, iAct), true)
    };
    IMP.todos.push(p);
    if (yaEstan.has(clave)) IMP.repetidos++;
    else IMP.nuevos.push(p);
  });

  pintarPrevioImportacion();
}

function pintarPrevioImportacion(){
  const prev = $('#impPrev'); if (!prev) return;
  if (!IMP.todos.length){
    prev.innerHTML = '<div class="alert warn" style="margin-top:12px"><span>!</span><div>' +
      'No se encontró ningún producto. Revisá que el archivo tenga una columna con el nombre.</div></div>';
    return;
  }
  const muestra = IMP.todos.slice(0, 8);
  prev.innerHTML =
    '<div class="sep"></div>' +
    '<div class="row" style="margin-bottom:10px">' +
      '<span class="pill ok">' + IMP.todos.length + ' producto(s) en el archivo</span>' +
      (IMP.repetidos ? '<span class="pill warn">' + IMP.repetidos + ' ya existen por nombre</span>' : '') +
      (IMP.vacias ? '<span class="pill gray">' + IMP.vacias + ' fila(s) sin nombre</span>' : '') +
      (IMP.cabecera ? '' : '<span class="pill info">Sin encabezado: se leyó nombre, categoría y precio</span>') +
    '</div>' +
    '<div class="tbl-wrap" style="border:1px solid var(--line);border-radius:var(--r)">' +
      '<table><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Precio</th>' +
      '<th class="num">Stock</th><th>Activo</th></tr></thead><tbody>' +
      muestra.map(p => '<tr><td><b>' + esc(p.nombre) + '</b></td><td>' + esc(p.cat) + '</td>' +
        '<td class="num">' + fmt(p.precio) + '</td>' +
        '<td class="num">' + (p.ctrl ? p.stock : '—') + '</td>' +
        '<td>' + (p.activo ? '<span class="pill ok">Sí</span>' : '<span class="pill gray">No</span>') + '</td></tr>').join('') +
      '</tbody></table></div>' +
    (IMP.todos.length > muestra.length
      ? '<div class="small muted" style="margin-top:6px">Se muestran los primeros ' + muestra.length + ', se importan todos.</div>'
      : '') +
    '<div class="row" style="margin-top:14px">' +
      '<button class="btn pri grow" onclick="confirmarImportacion(false)">Agregar ' + IMP.nuevos.length + ' producto(s) nuevo(s)</button>' +
      '<button class="btn dan" onclick="reemplazarPorImportacion()">Reemplazar los ' + S.productos.length + ' actuales</button>' +
    '</div>' +
    '<div class="small muted" style="margin-top:8px">Agregar deja los productos que ya tenés y suma solo los que faltan. ' +
      'Reemplazar borra la lista actual y deja únicamente los del archivo.</div>';
}

function reemplazarPorImportacion(){
  confirmar('Esto <b>borra los ' + S.productos.length + ' productos actuales</b> y deja solo los ' +
    IMP.todos.length + ' del archivo.<br><br>Los pedidos ya cobrados no se tocan.',
    () => confirmarImportacion(true), 'Sí, reemplazar');
}

function confirmarImportacion(reemplazar){
  const lista = reemplazar ? IMP.todos : IMP.nuevos;
  if (!lista.length){ toast('No hay productos nuevos para agregar'); return; }
  if (reemplazar) S.productos = [];
  lista.forEach(p => S.productos.push(Object.assign({ id: uid() }, p)));
  save(); closeModal(); refresh();
  toast(lista.length + ' producto(s) importados');
}
