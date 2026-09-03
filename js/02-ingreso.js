/* ============================================================
   INGRESO — local, usuarios, PIN y sesión
   ============================================================ */

/* La sesión también es por local: entrar en uno no te deja adentro del otro */
function SESION_KEY(){ return 'cafe_sesion_v1_' + LOCAL; }
let LOGIN = { id: null, pin: '' };

function iniciales(n){
  return n.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

/* ---------- Paso 1: ¿en qué café estamos? ---------- */
function mostrarLocales(){
  const o = $('#login');
  o.hidden = false;
  o.innerHTML = '<div class="login-card">' +
    '<div class="lg">&#9749;</div>' +
    '<h2>¿En qué local estás?</h2>' +
    '<div class="muted small">Cada café tiene sus propias mesas, productos, pedidos y caja.</div>' +
    '<div class="local-list">' +
      LOCALES.map(l =>
        '<button class="local-btn" onclick="elegirLocal(\'' + l.id + '\')">' +
          '<span class="lico">' + l.ico + '</span>' +
          '<span class="lnm">' + esc(l.nombre) + '</span>' +
          '<span class="muted">›</span>' +
        '</button>').join('') +
    '</div></div>';
}

function elegirLocal(id){
  const l = LOCALES.find(x => x.id === id); if (!l) return;
  LOCAL = id;
  try{ localStorage.setItem(LOCAL_KEY, id); }catch(e){}

  /* Si es la primera vez que se usa este local y quedaron datos del sistema
     de antes de la división, se pregunta si son de acá.                    */
  let propios = null, legado = null;
  try{ propios = localStorage.getItem(KEY()); legado = localStorage.getItem(KEY_LEGADO); }catch(e){}
  if (!propios && legado) return preguntarLegado(l, legado);

  arrancarLocal();
}

function preguntarLegado(l, legado){
  $('#login').hidden = true;
  modal({
    title: 'Datos del sistema anterior',
    nofocus: true,
    body: '<p style="margin:0 0 10px;line-height:1.55">Encontré los datos que ya venías usando: productos, mesas, pedidos, caja e historial.</p>' +
          '<p style="margin:0;line-height:1.55">¿Son de <b>' + esc(l.nombre) + '</b>?</p>',
    footer:
      '<button class="btn" onclick="resolverLegado(false)">No, empezar de cero</button>' +
      '<button class="btn pri" onclick="resolverLegado(true)">Sí, son de ' + esc(l.nombre) + '</button>'
  });
}

function resolverLegado(usar){
  if (usar){
    try{
      localStorage.setItem(KEY(), localStorage.getItem(KEY_LEGADO));
      localStorage.removeItem(KEY_LEGADO);
    }catch(e){ toast('No se pudieron copiar los datos anteriores'); }
  }
  closeModal();
  arrancarLocal();
  if (usar) toast('Datos anteriores cargados en ' + local().nombre);
}

/* Vuelve a la pantalla de elección de local */
function cambiarLocal(){
  USUARIO = null;
  try{ localStorage.removeItem(LOCAL_KEY); }catch(e){}
  LOCAL = null;
  closeModal();
  mostrarLocales();
}

/* ---------- Paso 2: ¿quién trabaja? ---------- */
function mostrarLogin(){
  LOGIN = { id: null, pin: '' };
  const o = $('#login');
  o.hidden = false;
  pintarLogin();
}
function pintarLogin(){
  const o = $('#login');
  const u = LOGIN.id ? usuario(LOGIN.id) : null;
  o.innerHTML = '<div class="login-card">' +
    '<div class="lg">&#9749;</div>' +
    '<h2>' + esc(S.config.nombre) + '</h2>' +
    (!u
      ? '<div class="muted small">¿Quién está trabajando?</div>' +
        '<div class="usr-list">' +
          mozosActivos().map(x =>
            '<button class="usr-btn ' + x.rol + '" onclick="elegirUsuario(\'' + x.id + '\')">' +
              '<span class="av">' + esc(iniciales(x.nombre)) + '</span>' +
              '<span style="flex:1"><b>' + esc(x.nombre) + '</b><span>' + ROLES[x.rol] + '</span></span>' +
              '<span class="muted">›</span>' +
            '</button>').join('') +
        '</div>'
      : '<div class="muted small">Clave de <b>' + esc(u.nombre) + '</b></div>' +
        '<div class="pin-dots">' + [0,1,2,3].map(i => '<i class="' + (LOGIN.pin.length > i ? 'on' : '') + '"></i>').join('') + '</div>' +
        '<div class="pin-err" id="pinErr"></div>' +
        '<div class="pin-pad">' +
          [1,2,3,4,5,6,7,8,9].map(n => '<button onclick="tecla(' + n + ')">' + n + '</button>').join('') +
          '<button onclick="volverLogin()" style="font-size:14px">Volver</button>' +
          '<button onclick="tecla(0)">0</button>' +
          '<button onclick="borrarTecla()">⌫</button>' +
        '</div>') +
    (!u ? '<button class="btn sm" style="margin-top:16px" onclick="cambiarLocal()">⇄ Cambiar de local</button>' : '') +
  '</div>';
}

function elegirUsuario(id){ LOGIN.id = id; LOGIN.pin = ''; pintarLogin(); }
function volverLogin(){ LOGIN = { id: null, pin: '' }; pintarLogin(); }
function borrarTecla(){ LOGIN.pin = LOGIN.pin.slice(0, -1); pintarLogin(); }
function tecla(n){
  LOGIN.pin += String(n);
  pintarLogin();
  if (LOGIN.pin.length >= 4) setTimeout(verificarPin, 130);
}

/* ---------- Claves ----------
   No se guarda el PIN escrito sino su huella. Aunque alguien mire
   los datos guardados, no ve la clave de nadie. */
async function huellaPin(pin, semilla){
  const txt = 'cafe:' + (semilla || '') + ':' + String(pin);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verificarPin(){
  const u = usuario(LOGIN.id);
  let ok = false;
  if (u){
    if (u.pinHash) ok = (await huellaPin(LOGIN.pin, u.id)) === u.pinHash;
    else if (u.pin !== undefined){
      /* Usuario de antes del cambio: se compara y se guarda la huella */
      ok = String(u.pin) === LOGIN.pin;
      if (ok){ u.pinHash = await huellaPin(LOGIN.pin, u.id); delete u.pin; save(); }
    }
  }
  if (ok){ entrar(u); return; }
  LOGIN.pin = '';
  pintarLogin();
  const e = $('#pinErr'); if (e) e.textContent = 'Clave incorrecta';
}

function entrar(u){
  USUARIO = u;
  try{ localStorage.setItem(SESION_KEY(), u.id); }catch(e){}
  $('#login').hidden = true;
  go(puedeVer('mesas') ? 'mesas' : 'pedidos');
  toast('Hola, ' + u.nombre.split(' ')[0]);
}

function cerrarSesion(){
  USUARIO = null;
  try{ localStorage.removeItem(SESION_KEY()); }catch(e){}
  closeModal();
  mostrarLogin();
}

/* Teclado físico en la pantalla de ingreso */
document.addEventListener('keydown', e => {
  if ($('#login').hidden || !LOGIN.id) return;
  if (/^[0-9]$/.test(e.key)) tecla(Number(e.key));
  else if (e.key === 'Backspace') borrarTecla();
  else if (e.key === 'Escape') volverLogin();
});

/* ---------- Administración de usuarios (solo admin) ---------- */
function htmlUsuarios(){
  return '<div class="card"><div class="hd"><h3>👥 Usuarios</h3>' +
    '<div class="sp" style="flex:1"></div>' +
    '<button class="btn sm pri" onclick="formUsuario()">＋ Nuevo usuario</button></div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Clave</th><th>Estado</th><th></th></tr></thead><tbody>' +
    S.usuarios.map(u => '<tr>' +
      '<td><b>' + esc(u.nombre) + '</b>' + (USUARIO && u.id === USUARIO.id ? ' <span class="pill info">vos</span>' : '') + '</td>' +
      '<td>' + (u.rol === 'admin' ? '<span class="pill bad">Administrador</span>' : '<span class="pill gray">Mozo</span>') + '</td>' +
      '<td class="mono muted">••••</td>' +
      '<td>' + (u.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill gray">Inactivo</span>') + '</td>' +
      '<td class="row" style="flex-wrap:nowrap;gap:4px">' +
        '<button class="btn xs" onclick="formUsuario(\'' + u.id + '\')">Editar</button>' +
        '<button class="btn xs dan" onclick="borrarUsuario(\'' + u.id + '\')">Borrar</button>' +
      '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="bd"><div class="alert info small"><span>ℹ</span><div>El <b>administrador</b> ve todo el sistema. El <b>mozo</b> solo entra a Mesas y Pedidos: no puede ver la caja, tocar precios, editar el plano ni anular pedidos ya cobrados. Cada pedido queda registrado con el nombre de quien lo abrió.</div></div></div>' +
  '</div>';
}

function formUsuario(id){
  if (!soloAdmin('administrar usuarios')) return;
  const u = id ? usuario(id) : null;
  modal({
    title: u ? 'Editar usuario' : 'Nuevo usuario',
    body:
      '<div class="field" style="margin-bottom:12px"><label>Nombre *</label>' +
        '<input type="text" id="uNom" value="' + esc(u ? u.nombre : '') + '" placeholder="Ej: Lucía"></div>' +
      '<div class="grid2">' +
        '<div class="field"><label>Rol</label><select id="uRol">' +
          Object.keys(ROLES).map(r => '<option value="' + r + '" ' + (u && u.rol === r ? 'selected' : '') + '>' + ROLES[r] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Clave de 4 números' + (u ? ' <span class="muted">(vacío = no cambiar)</span>' : '') + '</label>' +
          '<input type="password" id="uPin" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="' + (u ? '••••' : '1234') + '"></div>' +
      '</div>' +
      '<label class="chk" style="margin-top:14px"><input type="checkbox" id="uAct" ' + (!u || u.activo ? 'checked' : '') + '> Puede ingresar al sistema</label>',
    footer: '<button class="btn" data-close>Cancelar</button><button class="btn pri" id="uOk">' + (u ? 'Guardar' : 'Crear usuario') + '</button>'
  });
  $('#uOk').onclick = async () => {
    const n = $('#uNom').value.trim(), pin = $('#uPin').value.trim();
    if (!n) return toast('Poné un nombre');
    if (!u && !/^\d{4}$/.test(pin)) return toast('La clave tiene que ser de 4 números');
    if (pin && !/^\d{4}$/.test(pin)) return toast('La clave tiene que ser de 4 números');
    const rol = $('#uRol').value, act = $('#uAct').checked;
    if (u && u.rol === 'admin' && (rol !== 'admin' || !act) &&
        S.usuarios.filter(x => x.rol === 'admin' && x.activo && x.id !== u.id).length === 0)
      return toast('Tiene que quedar al menos un administrador activo');
    if (u){
      Object.assign(u, { nombre: n, rol: rol, activo: act });
      if (pin){ u.pinHash = await huellaPin(pin, u.id); delete u.pin; }
      if (USUARIO && USUARIO.id === u.id) USUARIO = u;
    } else {
      const id = uid();
      S.usuarios.push({ id: id, nombre: n, rol: rol, pinHash: await huellaPin(pin, id),
                        activo: act, creado: new Date().toISOString() });
    }
    save(); closeModal(); refresh(); toast(u ? 'Usuario actualizado' : 'Usuario creado');
  };
}

function borrarUsuario(id){
  if (!soloAdmin('administrar usuarios')) return;
  const u = usuario(id); if (!u) return;
  if (USUARIO && USUARIO.id === id) return toast('No podés borrar el usuario con el que estás trabajando');
  if (u.rol === 'admin' && S.usuarios.filter(x => x.rol === 'admin' && x.activo && x.id !== id).length === 0)
    return toast('Tiene que quedar al menos un administrador');
  confirmar('¿Borrar el usuario <b>' + esc(u.nombre) + '</b>? Los pedidos que atendió conservan su nombre.', () => {
    S.usuarios = S.usuarios.filter(x => x.id !== id);
    save(); refresh(); toast('Usuario borrado');
  }, 'Borrar');
}

/* ---------- Paso 0: ingreso a la nube ----------
   Una sola vez por computadora: después la sesión queda guardada. */
function mostrarIngresoNube(msg){
  const o = $('#login');
  o.hidden = false;
  o.innerHTML = '<div class="login-card">' +
    '<div class="lg">&#9749;</div>' +
    '<h2>Ingresar al sistema</h2>' +
    '<div class="muted small">Esta computadora se conecta a los datos del café.<br>' +
      'Se pide una sola vez.</div>' +
    (msg ? '<div class="pin-err" style="margin-top:12px">' + esc(msg) + '</div>' : '') +
    '<div class="field" style="margin-top:18px;text-align:left"><label>Correo</label>' +
      '<input type="email" id="nbMail" autocomplete="username" placeholder="cafe@ejemplo.com"></div>' +
    '<div class="field" style="margin-top:10px;text-align:left"><label>Contraseña</label>' +
      '<input type="password" id="nbPass" autocomplete="current-password" ' +
      'onkeydown="if(event.key===\'Enter\')entrarNube()"></div>' +
    '<button class="btn pri blk" style="margin-top:16px" id="nbBtn" onclick="entrarNube()">Entrar</button>' +
  '</div>';
  const m = $('#nbMail'); if (m) m.focus();
}

async function entrarNube(){
  const mail = ($('#nbMail') || {}).value || '';
  const pass = ($('#nbPass') || {}).value || '';
  if (!mail || !pass) return mostrarIngresoNube('Completá el correo y la contraseña');
  const b = $('#nbBtn'); if (b){ b.disabled = true; b.textContent = 'Entrando…'; }
  const r = await nubeEntrar(mail.trim(), pass);
  if (!r.ok) return mostrarIngresoNube(r.msg);
  arrancarSistema();
}
