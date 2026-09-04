/* ============================================================
   AJUSTES — configuración, respaldos y ayuda
   ============================================================ */

function renderAjustes(){
  setActions('<button class="btn" onclick="cambiarLocal()">⇄ Cambiar de local</button>' +
             '<button class="btn pri" onclick="exportarBackup()">⬇ Descargar respaldo</button>');
  const c = S.config;

  let h = '<div class="grid2" style="align-items:start">';

  h += '<div class="card"><div class="hd"><h3>🏪 Datos del negocio</h3></div><div class="bd">' +
    '<div class="field" style="margin-bottom:12px"><label>Nombre del café</label><input type="text" id="cfNom" value="' + esc(c.nombre) + '"></div>' +
    '<div class="grid2">' +
      '<div class="field"><label>Símbolo de moneda</label><input type="text" id="cfSim" value="' + esc(c.simbolo) + '"></div>' +
      '<div class="field"><label>Decimales en los precios</label><select id="cfDec">' +
        [0, 1, 2].map(d => '<option value="' + d + '" ' + (c.decimales === d ? 'selected' : '') + '>' + d + '</option>').join('') +
      '</select></div>' +
    '</div>' +
    '<div class="grid2" style="margin-top:12px">' +
      '<div class="field"><label>Dirección</label><input type="text" id="cfDir" value="' + esc(c.direccion) + '"></div>' +
      '<div class="field"><label>Teléfono</label><input type="text" id="cfTel" value="' + esc(c.telefono) + '"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:12px"><label>Pie del ticket</label><input type="text" id="cfPie" value="' + esc(c.pieTicket) + '"></div>' +
    '<div class="grid2" style="margin-top:12px">' +
      '<div class="field"><label>Próximo N° de pedido</label><input type="number" id="cfNum" value="' + c.nextNum + '" min="1"></div>' +
      '<div class="field"><label>&nbsp;</label><label class="chk"><input type="checkbox" id="cfStk" ' + (c.descontarStock ? 'checked' : '') + '> Descontar stock al cobrar</label>' +
        '<label class="chk" style="margin-top:8px"><input type="checkbox" id="cfCom" ' + (c.comandaImprime ? 'checked' : '') + '> Imprimir al enviar el pedido</label></div>' +
    '</div>' +
    '<div class="field" style="margin-top:12px"><label>Ancho del papel de la impresora</label>' +
      '<select id="cfPapel">' +
        [[80, '80 mm — el tamaño normal'], [58, '58 mm — impresora chica']]
          .map(o => '<option value="' + o[0] + '" ' + (anchoTicket() === o[0] ? 'selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></div>' +
    '<div class="small muted" style="margin-top:6px">Es la impresora de <b>' + esc(local() ? local().nombre : 'este café') +
      '</b>: cada local tiene la suya, y cambiarlo acá no afecta al otro. ' +
      'En papel de 58 mm el ticket sale con letra más chica para que entre el precio.</div>' +
    '<div class="sep"></div>' +
    '<label class="chk"><input type="checkbox" id="cfPropOn" ' + (c.propinaOn ? 'checked' : '') + '> Mostrar propina sugerida en la cuenta y el ticket</label>' +
    '<div class="field" style="margin-top:10px"><label>Porcentaje de propina sugerida</label>' +
      '<input type="number" id="cfProp" min="0" max="100" step="any" value="' + c.propina + '"></div>' +
    '<div class="small muted" style="margin-top:6px">La propina es informativa: se imprime como sugerencia y no se suma a las ventas de la caja.</div>' +
    '<div class="sep"></div>' +
    '<label class="chk"><input type="checkbox" id="cfRecOn" ' + (c.recargoOn ? 'checked' : '') + '> Cobrar recargo cuando pagan con tarjeta de crédito</label>' +
    '<div class="field" style="margin-top:10px"><label>Recargo por crédito (%)</label>' +
      '<input type="number" id="cfRec" min="0" max="100" step="any" value="' + c.recargoCredito + '"></div>' +
    '<div class="small muted" style="margin-top:6px">Se suma al total solo en la parte que se paga con crédito, y aparece detallado en el ticket.</div>' +
    '<div class="sep"></div>' +
    '<label class="chk"><input type="checkbox" id="cfLogin" ' + (c.loginOn ? 'checked' : '') + '> Pedir usuario y clave al abrir el sistema</label>' +
    '<button class="btn pri blk" style="margin-top:16px" onclick="guardarConfig()">💾 Guardar configuración</button>' +
  '</div></div>';

  h += '<div class="card"><div class="hd"><h3>💾 Respaldo de datos</h3></div><div class="bd">' +
    '<div class="alert info" style="margin-bottom:14px"><span>ℹ</span><div>Todo se guarda en <b>este navegador y esta computadora</b>. Descargá un respaldo cada tanto: si cambiás de equipo o limpiás el navegador, lo recuperás con “Restaurar”.</div></div>' +
    '<div class="row">' +
      '<button class="btn pri" onclick="exportarBackup()">⬇ Descargar respaldo (.json)</button>' +
      '<button class="btn" onclick="document.getElementById(\'impFile\').click()">⬆ Restaurar respaldo</button>' +
      '<input type="file" id="impFile" accept=".json,application/json" class="hide" onchange="importarBackup(this)">' +
    '</div>' +
    htmlDuplicados() +
    '<div class="sep"></div>' +
    htmlNube() +
    '<div class="sep"></div>' +
    '<div class="small muted" style="margin-bottom:10px">Datos guardados actualmente:</div>' +
    '<div class="row small">' +
      '<span class="pill gray">' + S.productos.length + ' productos</span>' +
      '<span class="pill gray">' + S.proveedores.length + ' proveedores</span>' +
      '<span class="pill gray">' + S.mesas.length + ' mesas</span>' +
      '<span class="pill gray">' + S.pedidos.length + ' pedidos</span>' +
      '<span class="pill gray">' + S.compras.length + ' compras</span>' +
      '<span class="pill gray">' + S.cuentas.length + ' cuentas</span>' +
      '<span class="pill gray">' + S.movimientos.length + ' movimientos de caja</span>' +
    '</div>' +
    '<div class="sep"></div>' +
    '<button class="btn dan blk" onclick="borrarTodo()">🗑 Borrar todos los datos</button>' +
  '</div></div>';

  h += '</div>';

  h += '<div style="margin-top:16px">' + htmlUsuarios() + '</div>';

  /* Historial de cierres */
  const cierres = S.cierres.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  h += '<div class="card" style="margin-top:16px"><div class="hd"><h3>🧮 Cierres de caja guardados</h3></div>';
  if (!cierres.length){
    h += vacio('🧮', 'Sin cierres guardados', 'Se registran desde la sección Caja.');
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Observaciones</th></tr></thead><tbody>' +
      cierres.map(x => '<tr><td class="mono">' + fechaCorta(x.fecha + 'T12:00') + '</td>' +
        '<td class="num">' + fmt(x.ventas) + '</td><td class="num">' + fmt(x.esperado) + '</td><td class="num">' + fmt(x.contado) + '</td>' +
        '<td class="num"><span class="pill ' + (Math.abs(x.dif) < 0.005 ? 'ok' : x.dif > 0 ? 'info' : 'bad') + '">' + fmt(x.dif) + '</span></td>' +
        '<td class="small muted">' + esc(x.nota || '—') + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  h += '</div>';

  h += '<div class="card" style="margin-top:16px"><div class="hd"><h3>❓ Cómo se usa</h3></div><div class="bd small" style="line-height:1.7">' +
    '<p style="margin:0 0 8px"><b>Plano del salón.</b> La pantalla de Mesas muestra el local visto desde arriba, con la barra, la entrada, la cocina y los baños en su lugar, así alguien que recién entra ubica cualquier mesa de una. Con “✏ Editar plano” arrastrás cada mesa a donde está de verdad, la agrandás tirando de la esquina ◢, elegís si es redonda, cuadrada o rectangular, cuántas personas entran y de qué sector es. También podés agregar paredes, ventanas, plantas, escaleras y carteles de sector. Cuando terminás tocás “✓ Confirmar cambios” y queda guardado; si no te gustó cómo quedó, “✗ Cancelar cambios” devuelve el plano exactamente a como estaba antes de empezar a editar.</p>' +
    '<p style="margin:0 0 8px"><b>El ticket del pedido.</b> Cuando tocás “🖨 Imprimir pedido” sale <b>un solo comprobante</b> que sirve para las dos cosas: arriba, bien grande, el número de mesa y el detalle de qué preparar con las notas de cada ítem, y abajo los precios, el total y la propina sugerida. Con ese mismo papel se arma el pedido y después queda en la mesa. Si el cliente agrega algo, la reimpresión trae el pedido completo actualizado con lo nuevo marcado como “*NUEVO*” y el cartel “AGREGADO AL PEDIDO”, así la cocina ve de una qué falta hacer. En Ajustes podés cambiarlo a la modalidad de dos comprobantes separados (comanda sin precios para la cocina y cuenta aparte) si algún día lo preferís.</p>' +
    '<p style="margin:0 0 8px"><b>Colores de las mesas.</b> En el plano cada mesa cambia de color según cómo viene: <b>gris</b> es libre, <b>amarilla</b> es que hay una cuenta abierta con pedido todavía sin mandar a la cocina, y <b>verde</b> es que la comanda ya se envió. Dentro del pedido, el botón naranja “Imprimir pedido” lo manda y saca el ticket (se puede apagar la impresión en la casilla de acá arriba); una vez enviado queda el cartelito verde con la hora y un botón para reimprimir. Si después agregás algo más a esa mesa, vuelve a ponerse amarilla hasta que mandes lo nuevo.</p>' +
    '<p style="margin:0 0 8px"><b>Mesas.</b> Tocás una mesa y se abre su cuenta. Agregás productos con un toque, podés poner una nota por ítem (“sin azúcar”), aplicar un descuento en porcentaje (con atajos de 5, 10, 15 y 20%) o en pesos, imprimir la comanda para la cocina y, al final, elegir el medio de pago y cobrar. Con “＋ Mesa” y “－ Mesa” cambiás la cantidad de mesas cuando quieras.</p>' +
    '<p style="margin:0 0 8px"><b>Imprimir la cuenta.</b> Con el pedido abierto, el botón “🧾 Imprimir cuenta para la mesa” saca el detalle con el precio unitario de cada producto, el importe por línea, el total y, al final, la propina sugerida del ' + S.config.propina + '% con el total ya sumado. Eso es lo que le llevás al cliente. El botón 👨‍🍳 imprime la comanda para la cocina, sin precios. Una vez cobrado, el ticket sale con los mismos datos más el medio de pago. El porcentaje de propina se cambia acá arriba, en los datos del negocio.</p>' +
    '<p style="margin:0 0 8px"><b>Pedidos.</b> Queda todo el historial. Filtrás por período rápido (hoy, ayer, últimos 7 días, mes, año), por rango de fechas exacto, por mes completo o por año, y además por mesa, medio de pago y estado. Podés exportar lo filtrado a CSV para abrirlo en Excel.</p>' +
    '<p style="margin:0 0 8px"><b>Usuarios y mozos.</b> Al abrir el sistema cada uno elige su nombre y pone su clave de 4 números. El <b>administrador</b> ve todo; el <b>mozo</b> solo entra a Mesas y Pedidos, no puede ver la caja, tocar precios, editar el plano ni anular pedidos cobrados. Cada mesa ocupada muestra qué mozo la está atendiendo, el dato queda guardado en el pedido y en el ticket, y en la Caja hay un resumen de cuánto vendió cada uno. Los usuarios se administran acá abajo; vienen dos de ejemplo (Encargado con clave 1234 y Mozo 1 con 1111): cambiá esas claves antes de usarlo en serio.</p>' +
    '<p style="margin:0 0 8px"><b>Formas de cobro.</b> Tocando un medio de pago se cobra todo con ese. Si pagan con <b>efectivo</b> podés escribir con cuánto te pagan y el sistema calcula el vuelto (hay botones rápidos de 1k, 2k, 5k, 10k y 20k). Si pagan con <b>crédito</b> se suma automáticamente el recargo configurado. Y con <b>“Pago mixto / dividir la cuenta”</b> repartís el total entre varias formas de pago o lo dividís en partes iguales entre 2, 3, 4 o las personas que quieras, cada parte con su propio medio; el botón de cobrar se habilita recién cuando el reparto cubre el total exacto.</p>' +
    '<p style="margin:0 0 8px"><b>Gastos y retiros.</b> En la Caja, abajo, registrás lo que sale del día que no es compra a proveedor: sueldos, servicios, alquiler, un retiro de efectivo o un ingreso extra. Lo que sale en efectivo se descuenta del efectivo esperado, así el arqueo cierra bien.</p>' +
    '<p style="margin:0 0 8px"><b>Cuentas.</b> Sirve para el fiado y los clientes habituales. Creás una cuenta con el nombre que quieras (una persona, una oficina, el personal) y, al cobrar una mesa, elegís “Cuenta” como forma de pago y seleccionás cuál: el consumo queda cargado ahí en lugar de entrar a la caja. En la sección Cuentas ves el listado completo con lo consumido, lo pagado y el saldo de cada una, y entrando en “Ver consumos” tenés el detalle pedido por pedido con el saldo acumulado, que se puede imprimir o exportar. Cuando te pagan, usás “Cobrar”: elegís el monto (viene el saldo completo por defecto) y la forma de pago, y ese ingreso sí entra en la caja del día. También podés ponerle un límite de crédito a cada cuenta para que avise cuando lo supera.</p>' +
    '<p style="margin:0 0 8px"><b>Caja.</b> Muestra las ventas del día elegido, el desglose por medio de pago, las ventas por hora y los más vendidos. Abajo cargás el fondo inicial y el efectivo contado: el sistema calcula el esperado y la diferencia, y podés imprimir el cierre.</p>' +
    '<p style="margin:0 0 8px"><b>Productos.</b> Alta, edición y baja. Si marcás “controlar stock”, cada venta descuenta unidades y el sistema avisa cuando llega al mínimo. Con el botón “±” ajustás stock por mermas o roturas.</p>' +
    '<p style="margin:0"><b>Proveedores.</b> Agenda de contactos y registro de compras. Al cargar una compra asociada a un producto, el stock sube solo y podés actualizar el costo con el precio pagado.</p>' +
  '</div></div>';

  $('#v-ajustes').innerHTML = h;
}

function guardarConfig(){
  S.config.nombre = $('#cfNom').value.trim() || 'Mi Café';
  S.config.simbolo = $('#cfSim').value.trim() || '$';
  S.config.decimales = parseInt($('#cfDec').value, 10);
  S.config.direccion = $('#cfDir').value.trim();
  S.config.telefono = $('#cfTel').value.trim();
  S.config.pieTicket = $('#cfPie').value.trim();
  S.config.nextNum = Math.max(1, parseInt($('#cfNum').value, 10) || 1);
  S.config.descontarStock = $('#cfStk').checked;
  S.config.comandaImprime = $('#cfCom').checked;
  S.config.propinaOn = $('#cfPropOn').checked;
  S.config.propina = Math.max(0, num($('#cfProp').value));
  S.config.recargoOn = $('#cfRecOn').checked;
  S.config.recargoCredito = Math.max(0, Math.min(100, num($('#cfRec').value)));
  S.config.loginOn = $('#cfLogin').checked;
  S.config.anchoTicket = Number($('#cfPapel').value) === 58 ? 58 : 80;
  save(); refresh(); toast('Configuración guardada');
}

function exportarBackup(){
  descargar(JSON.stringify(S, null, 2), 'respaldo_' + (LOCAL || 'cafe') + '_' + hoy() + '.json', 'application/json');
  toast('Respaldo descargado');
}

function importarBackup(inp){
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try{
      const d = JSON.parse(e.target.result);
      if (!d || !Array.isArray(d.productos)) throw new Error('formato');
      confirmar('Se van a <b>reemplazar todos los datos actuales</b> por los del respaldo (' +
        (d.pedidos || []).length + ' pedidos, ' + d.productos.length + ' productos). ¿Continuar?', () => {
          S = Object.assign(structuredClone(DEFAULT_STATE), d);
          S.config = Object.assign({}, DEFAULT_STATE.config, d.config || {});
          save(); closeModal(); refresh(); toast('Respaldo restaurado');
        }, 'Restaurar');
    }catch(err){ toast('El archivo no es un respaldo válido'); }
    inp.value = '';
  };
  r.readAsText(f);
}

function borrarTodo(){
  confirmar('Esto borra <b>todos los pedidos, productos, proveedores y compras</b> de este equipo. No se puede deshacer.<br><br>Conviene descargar un respaldo antes.', () => {
    localStorage.removeItem(KEY());
    S = structuredClone(DEFAULT_STATE); seed(); save();
    closeModal(); go('mesas'); toast('Datos borrados — sistema reiniciado');
  }, 'Sí, borrar todo');
}

/* ---------- Duplicados ----------
   Aparecían cuando una computadora arrancaba sin datos: armaba el café de
   ejemplo y se sumaba al de la nube, dejando dos juegos de mesas y dos veces
   cada usuario. Eso ya no pasa más, pero lo que quedó guardado se saca desde
   acá: a mano, mostrando antes qué se va a sacar y pidiendo confirmación.
   Nunca solo, porque borra registros.                                      */
function contarDuplicados(){
  if (typeof nubeLimpiarCatalogos !== 'function') return null;
  const copia = JSON.parse(JSON.stringify({
    mesas: S.mesas, productos: S.productos, proveedores: S.proveedores,
    cuentas: S.cuentas, usuarios: S.usuarios,
    salon: { elementos: S.salon.elementos }, pedidos: S.pedidos
  }));
  const antes = { mesas: copia.mesas.length, productos: copia.productos.length,
                  proveedores: copia.proveedores.length, cuentas: copia.cuentas.length,
                  usuarios: copia.usuarios.length, elementos: copia.salon.elementos.length };
  nubeLimpiarCatalogos(copia);
  return {
    mesas: antes.mesas - copia.mesas.length,
    productos: antes.productos - copia.productos.length,
    proveedores: antes.proveedores - copia.proveedores.length,
    cuentas: antes.cuentas - copia.cuentas.length,
    usuarios: antes.usuarios - copia.usuarios.length,
    elementos: antes.elementos - copia.salon.elementos.length
  };
}

const NOMBRES_DUP = { mesas: 'mesas', productos: 'productos', proveedores: 'proveedores',
                      cuentas: 'cuentas corrientes', usuarios: 'usuarios',
                      elementos: 'elementos del salón (barra, cocina, baños…)' };

function htmlDuplicados(){
  const d = contarDuplicados();
  if (!d) return '';
  const total = Object.keys(d).reduce((a, k) => a + d[k], 0);
  if (!total) return '';
  return '<div class="alert warn" style="margin-top:14px"><span>⚠</span><div>' +
    '<b>Hay ' + total + ' registro(s) repetidos.</b> Quedaron de cuando una computadora ' +
    'arrancaba en blanco y su café de ejemplo se sumaba al de verdad: ' +
    Object.keys(d).filter(k => d[k] > 0).map(k => d[k] + ' ' + NOMBRES_DUP[k]).join(', ') + '.' +
    '<div style="margin-top:9px"><button class="btn sm dan" onclick="sacarDuplicados()">Sacar los repetidos</button></div>' +
    '</div></div>';
}

function sacarDuplicados(){
  if (!soloAdmin('limpiar los repetidos')) return;
  const d = contarDuplicados();
  const total = d ? Object.keys(d).reduce((a, k) => a + d[k], 0) : 0;
  if (!total) return toast('No hay repetidos: está todo limpio');
  confirmar(
    'Se van a sacar:<ul style="margin:8px 0 0 18px;line-height:1.6">' +
      Object.keys(d).filter(k => d[k] > 0).map(k => '<li><b>' + d[k] + '</b> ' + NOMBRES_DUP[k] + '</li>').join('') +
    '</ul>' +
    '<p style="margin:12px 0 0;line-height:1.55">De cada repetido queda <b>uno solo</b>: el que tiene una ' +
    'cuenta abierta o el usuario con el que estás trabajando; si no, el primero.</p>' +
    '<p style="margin:8px 0 0;line-height:1.55"><b>Descargá el respaldo antes de seguir.</b> Esto no se puede deshacer.</p>',
    () => {
      const n = nubeLimpiarCatalogos(S);
      /* Si el usuario con el que se está trabajando era uno de los repetidos,
         se lo vuelve a apuntar al que quedó. */
      if (USUARIO && !S.usuarios.some(u => u.id === USUARIO.id))
        USUARIO = S.usuarios.find(u => u.nombre === USUARIO.nombre) ||
                  S.usuarios.find(u => u.rol === 'admin' && u.activo) || USUARIO;
      save(); closeModal(); refresh();
      toast('Se sacaron ' + n + ' registro(s) repetidos');
    }, 'Sí, sacar los repetidos');
}

/* ---------- Estado de la nube dentro de Ajustes ---------- */
function htmlNube(){
  if (!nubeConfigurada())
    return '<div class="sep"></div>' +
      '<div class="alert warn small"><span>⚠</span><div><b>Los datos están solo en esta computadora.</b> ' +
      'La conexión con la nube todavía no está configurada: si se rompe o se limpia el navegador, se pierde todo. ' +
      'Descargá el respaldo seguido y guardalo en Drive o en un pendrive.</div></div>';
  const est = {
    sincronizado: ['ok',   '☁ Guardado en la nube'],
    guardando:    ['gray', '⏳ Guardando en la nube…'],
    conflicto:    ['warn', '⚠ Otra computadora guardó cambios'],
    error:        ['bad',  '⚠ Sin conexión con la nube'],
    configurar:   ['bad',  '⚠ La base todavía no está preparada'],
    local:        ['warn', '⚠ Solo en esta computadora']
  }[NUBE.estado] || ['gray', '—'];
  return '<div class="sep"></div>' +
    '<div class="row" style="margin-bottom:10px">' +
      '<b class="small">Nube:</b><span class="pill ' + est[0] + '">' + est[1] + '</span>' +
    '</div>' +
    (NUBE.estado === 'configurar'
      ? '<div class="alert warn small" style="margin-bottom:10px"><span>⚠</span><div>' +
        'Hay internet y la sesión está iniciada, pero la base rechaza el pedido, ' +
        'así que <b>los datos se están guardando solo en esta computadora</b>.<br>' +
        'Falta correr <b>supabase.sql</b> en Supabase (SQL Editor → New query → Run) ' +
        'o dar de alta esta cuenta en la tabla <b>miembros</b> (paso 4 de NUBE.md).' +
        (NUBE.ultimoError ? '<br><span class="mono small muted">' +
           esc(String(NUBE.ultimoError.code || '') + ' ' + String(NUBE.ultimoError.message || '')) +
           '</span>' : '') +
        '</div></div>'
      : '') +
    '<div class="row">' +
      '<button class="btn sm" onclick="guardarEnNubeAhora()">☁ Guardar en la nube ahora</button>' +
      '<button class="btn sm dan" onclick="salirDeLaNube()">Cerrar sesión de esta computadora</button>' +
    '</div>' +
    '<div class="small muted" style="margin-top:8px">Los datos se guardan solos cada pocos segundos. ' +
      'Si no hay internet quedan en la computadora y se suben cuando vuelve.</div>';
}

async function guardarEnNubeAhora(){
  if (!NUBE.activa) return toast('La nube no está conectada');
  await nubeGuardarYa();
  refresh();
  toast(NUBE.estado === 'sincronizado' ? 'Guardado en la nube' : 'No se pudo guardar, se reintenta solo');
}

function salirDeLaNube(){
  confirmar('Esta computadora va a dejar de guardar en la nube hasta que vuelvas a ingresar.<br><br>' +
    'Los datos que ya están subidos no se borran.', async () => {
      await nubeGuardarYa();
      await nubeSalir();
      closeModal();
      location.reload();
    }, 'Cerrar sesión');
}
