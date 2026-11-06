/* ---------------------------------------------------------------------------
   Panel de administración · RAM Martial Arts
   Vanilla + supabase-js. Todo el contenido vive en el schema "ram".
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var CFG = window.RAM_CONFIG || {};
  var supa = null;
  var estado = { seccion: 'disciplinas', editando: null, instructores: [], disciplinas: [] };

  // Secciones que muestran listado y abren un detalle al editar
  var CON_LISTADO = ['disciplinas', 'instructores', 'horarios', 'galeria', 'eventos'];

  /* ---------------------------------- utilidades --------------------------- */

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function mostrar(id) {
    ['cargando', 'pantalla-error', 'pantalla-login', 'pantalla-panel'].forEach(function (p) {
      $('#' + p).classList.toggle('oculto', p !== id);
    });
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function aviso(texto, tipo) {
    var d = document.createElement('div');
    d.className = 'aviso' + (tipo === 'ok' ? ' ok' : '');
    d.textContent = texto;
    $('#avisos').appendChild(d);
    setTimeout(function () { d.remove(); }, tipo === 'ok' ? 2600 : 6000);
  }
  function fallo(e, contexto) {
    console.error(contexto, e);
    var m = (e && (e.message || e.error_description)) || 'Error desconocido';
    if (/schema|does not exist|404/i.test(m)) {
      m += ' — ¿agregaste "ram" a PGRST_DB_SCHEMAS y reiniciaste el servicio rest?';
    }
    aviso((contexto ? contexto + ': ' : '') + m);
  }
  // Reemplaza al confirm() del navegador, que no se puede estilar
  function confirmar(titulo, texto, textoBoton) {
    return new Promise(function (resolver) {
      var cont = $('#modal');
      cont.innerHTML =
        '<div class="modal-fondo"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-tit">' +
          '<h2 id="modal-tit">' + esc(titulo) + '</h2>' +
          '<p>' + esc(texto) + '</p>' +
          '<div class="acciones">' +
            '<button class="btn fantasma" data-no>Cancelar</button>' +
            '<button class="btn peligro" data-si>' + esc(textoBoton || 'Eliminar') + '</button>' +
          '</div>' +
        '</div></div>';

      function cerrar(valor) {
        cont.innerHTML = '';
        document.removeEventListener('keydown', alTeclado);
        resolver(valor);
      }
      function alTeclado(e) { if (e.key === 'Escape') cerrar(false); }

      document.addEventListener('keydown', alTeclado);
      $('[data-si]', cont).addEventListener('click', function () { cerrar(true); });
      $('[data-no]', cont).addEventListener('click', function () { cerrar(false); });
      $('.modal-fondo', cont).addEventListener('click', function (e) {
        if (e.target === this) cerrar(false);
      });
      $('[data-si]', cont).focus();
    });
  }

  function ocupado(btn, si) {
    if (!btn) return;
    btn.disabled = !!si;
    if (si) { btn.dataset.txt = btn.textContent; btn.textContent = 'Guardando…'; }
    else if (btn.dataset.txt) { btn.textContent = btn.dataset.txt; }
  }

  // Las imágenes pueden ser una URL completa (Storage) o una ruta del sitio
  // (uploads/...) que quedó de la carga inicial.
  function urlImagen(v) {
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return '../' + v.split('/').map(encodeURIComponent).join('/');
  }
  function lineasAArray(txt) {
    return String(txt || '').split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
  }
  function arrayALineas(a) { return (a || []).join('\n'); }

  /* ---------------------------------- arranque ----------------------------- */

  function configIncompleta() {
    return !CFG.SUPABASE_URL || /TU-SUPABASE|TU_ANON_KEY/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY);
  }

  function pantallaConfig() {
    $('#pantalla-error').innerHTML =
      '<h1>Falta configurar la conexión</h1>' +
      '<p class="sub">Abrí <code>config.js</code> y completá los dos valores de tu Supabase:</p>' +
      '<pre>window.RAM_CONFIG = {\n  SUPABASE_URL: \'https://supabase.tudominio.com\',\n  SUPABASE_ANON_KEY: \'eyJhbGci...\'\n  ...\n};</pre>' +
      '<p class="sub">Además, tu Supabase tiene que exponer el schema <code>ram</code>. ' +
      'Agregá <code>ram</code> a la variable <code>PGRST_DB_SCHEMAS</code> y reiniciá el servicio <code>rest</code>:</p>' +
      '<pre>PGRST_DB_SCHEMAS=public,storage,graphql_public,ram</pre>' +
      '<p class="sub">Y corré <code>supabase/instalar.sql</code> en el SQL Editor si todavía no lo hiciste.</p>';
    mostrar('pantalla-error');
  }

  async function iniciar() {
    if (configIncompleta()) return pantallaConfig();
    if (!window.supabase || !window.supabase.createClient) {
      $('#pantalla-error').innerHTML =
        '<h1>No cargó supabase-js</h1><p class="sub">El panel necesita internet para traer la librería desde el CDN. ' +
        'Revisá la conexión y recargá.</p>';
      return mostrar('pantalla-error');
    }
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      db: { schema: CFG.SCHEMA || 'ram' },
      auth: { persistSession: true, autoRefreshToken: true }
    });

    var ses = null;
    try {
      ses = (await supa.auth.getSession()).data.session;
    } catch (e) { return fallo(e, 'Sesión'); }

    if (ses) { await entrarAlPanel(ses); } else { mostrar('pantalla-login'); }

    supa.auth.onAuthStateChange(function (evento) {
      if (evento === 'SIGNED_OUT') mostrar('pantalla-login');
    });
  }

  /* ---------------------------------- sesión ------------------------------- */

  // Mostrar / ocultar contraseña
  $('#ver-clave').addEventListener('click', function () {
    var campo = $('#clave');
    var visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    this.setAttribute('aria-pressed', visible ? 'false' : 'true');
    this.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    campo.focus();
  });

  // Los mensajes de Supabase vienen en inglés y son poco claros
  function enCastellano(e) {
    var m = (e && (e.message || e.error_description)) || '';
    if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(m)) return 'La cuenta todavía no está confirmada. Activala desde Authentication → Users en Supabase.';
    if (/failed to fetch|networkerror/i.test(m)) return 'No se pudo conectar con el servidor. Revisá la conexión.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Esperá un momento y probá de nuevo.';
    return m || 'No se pudo entrar.';
  }

  function errorLogin(texto) {
    var caja = $('#login-error');
    if (!caja) return;
    caja.textContent = texto || '';
    caja.classList.toggle('oculto', !texto);
  }

  $('#form-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var btn = $('#btn-entrar');
    var correo = $('#correo').value.trim();
    errorLogin('');
    if (!correo || !$('#clave').value) {
      return errorLogin('Completá el correo y la contraseña.');
    }
    ocupado(btn, true);
    try {
      var r = await supa.auth.signInWithPassword({ email: correo, password: $('#clave').value });
      if (r.error) throw r.error;
      $('#clave').value = '';
      await entrarAlPanel(r.data.session);
    } catch (e) {
      console.error('login', e);
      errorLogin(enCastellano(e));
    } finally { ocupado(btn, false); }
  });

  // Al corregir, se limpia el error
  ['correo', 'clave'].forEach(function (id) {
    $('#' + id).addEventListener('input', function () { errorLogin(''); });
  });

  $('#btn-salir').addEventListener('click', async function () {
    await supa.auth.signOut();
    mostrar('pantalla-login');
  });

  async function entrarAlPanel(ses) {
    var correo = ses.user && ses.user.email;
    if (CFG.ADMIN_EMAIL && correo !== CFG.ADMIN_EMAIL) {
      aviso('La cuenta ' + correo + ' no es la de administración, así que no vas a poder guardar cambios.');
    }
    $('#quien').textContent = correo || '';
    dibujarTabs();
    mostrar('pantalla-panel');
    await abrir(estado.seccion);
  }

  /* ---------------------------------- navegación --------------------------- */

  var SECCIONES = [
    { id: 'disciplinas',  nombre: 'Disciplinas' },
    { id: 'horarios',     nombre: 'Horarios' },
    { id: 'eventos',      nombre: 'Actividades' },
    { id: 'porque',       nombre: 'Por qué RAM' },
    { id: 'galeria',      nombre: 'Galería' },
    { id: 'instructores', nombre: 'Instructores' },
    { id: 'ajustes',      nombre: 'Configuración' }
  ];

  function dibujarTabs() {
    $('#tabs').innerHTML = SECCIONES.map(function (s) {
      return '<button role="tab" data-ir="' + s.id + '" aria-selected="' +
        (s.id === estado.seccion) + '">' + esc(s.nombre) + '</button>';
    }).join('');
  }

  $('#tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-ir]');
    if (b) { estado.editando = null; abrir(b.dataset.ir); }
  });

  async function abrir(id) {
    estado.seccion = id;
    dibujarTabs();
    $('#vista').innerHTML = '<p class="vacio">Cargando…</p>';
    window.scrollTo(0, 0);
    try {
      await ({
        disciplinas: vistaDisciplinas, horarios: vistaHorarios, porque: vistaPorque,
        galeria: vistaGaleria, instructores: vistaInstructores, ajustes: vistaAjustes,
        eventos: vistaActividades
      })[id]();
    } catch (e) {
      fallo(e, 'Cargando ' + id);
      $('#vista').innerHTML = '<p class="vacio">No se pudo cargar. Mirá el aviso de abajo.</p>';
    }
  }

  /* ---------------------------------- datos -------------------------------- */

  async function traer(tabla, orden) {
    var r = await supa.from(tabla).select('*').order(orden || 'orden', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function guardarFila(tabla, fila) {
    var r = fila.id
      ? await supa.from(tabla).update(fila).eq('id', fila.id).select()
      : await supa.from(tabla).insert(fila).select();
    if (r.error) throw r.error;
    return r.data && r.data[0];
  }
  async function borrarFila(tabla, id) {
    var r = await supa.from(tabla).delete().eq('id', id);
    if (r.error) throw r.error;
  }

  async function subirImagen(archivo) {
    var ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
    var nombre = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var r = await supa.storage.from(CFG.BUCKET).upload(nombre, archivo, {
      cacheControl: '31536000', upsert: false
    });
    if (r.error) throw r.error;
    return supa.storage.from(CFG.BUCKET).getPublicUrl(nombre).data.publicUrl;
  }

  /* ------------------------- campo de imagen reutilizable ------------------ */

  function campoImagen(etiqueta, valor, nombreCampo) {
    return '<label>' + esc(etiqueta) + '</label>' +
      '<div class="img-campo">' +
        '<img class="img-previa" data-previa="' + nombreCampo + '" src="' + esc(urlImagen(valor)) +
             '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="img-controles">' +
          '<input type="text" data-campo="' + nombreCampo + '" value="' + esc(valor || '') + '" placeholder="URL de la imagen">' +
          '<div class="acciones" style="margin-top:10px">' +
            '<label class="btn fantasma chico" style="margin:0;cursor:pointer;letter-spacing:.12em">' +
              'Subir imagen' +
              '<input type="file" accept="image/*" data-subir="' + nombreCampo + '" style="display:none">' +
            '</label>' +
          '</div>' +
          '<p class="ayuda">Subí una foto o pegá una URL. Las que dicen <code>uploads/…</code> son las que ya venían con el sitio.</p>' +
        '</div>' +
      '</div>';
  }

  // Delegado: cualquier input[data-subir] de la vista sube y completa su campo
  $('#vista').addEventListener('change', async function (ev) {
    var inp = ev.target.closest('[data-subir]');
    if (!inp || !inp.files || !inp.files[0]) return;
    var campo = inp.dataset.subir;
    var caja = inp.closest('.img-campo');
    var destino = $('[data-campo="' + campo + '"]', caja);
    var previa = $('[data-previa="' + campo + '"]', caja);
    var etiqueta = inp.closest('label');
    var textoPrevio = etiqueta.firstChild.textContent;
    etiqueta.firstChild.textContent = 'Subiendo…';
    try {
      var url = await subirImagen(inp.files[0]);
      destino.value = url;
      previa.src = url;
      previa.style.visibility = 'visible';
      aviso('Imagen subida. Acordate de guardar.', 'ok');
    } catch (e) {
      fallo(e, 'Subiendo imagen');
    } finally {
      etiqueta.firstChild.textContent = textoPrevio;
      inp.value = '';
    }
  });

  // La vista previa sigue lo que escribas en el campo de texto
  $('#vista').addEventListener('input', function (ev) {
    var inp = ev.target.closest('[data-campo]');
    if (!inp) return;
    var caja = inp.closest('.img-campo');
    if (!caja) return;
    var previa = $('[data-previa="' + inp.dataset.campo + '"]', caja);
    if (previa) { previa.src = urlImagen(inp.value); previa.style.visibility = 'visible'; }
  });

  function leerCampos(ficha) {
    var o = {};
    ficha.querySelectorAll('[data-campo]').forEach(function (el) {
      o[el.dataset.campo] = el.type === 'checkbox' ? el.checked
        : el.type === 'number' ? (parseInt(el.value, 10) || 0)
        : el.type === 'date' ? (el.value || null)
        : el.value.trim();
    });
    return o;
  }

  function cabecera(titulo, bajada) {
    return '<h1>' + esc(titulo) + '</h1><p class="sub">' + bajada + '</p>';
  }

  /* ---------------------------------- DISCIPLINAS -------------------------- */

  async function vistaDisciplinas() {
    var discs = await traer('disciplinas');
    var profes = await traer('instructores');
    var vinc = await supa.from('disciplina_instructores').select('*');
    if (vinc.error) throw vinc.error;
    estado.instructores = profes;

    var porDisc = {};
    (vinc.data || []).forEach(function (v) {
      (porDisc[v.disciplina_id] = porDisc[v.disciplina_id] || []).push(v.instructor_id);
    });

    // ---- detalle ----
    if (estado.editando) {
      var d = estado.editando === 'nuevo'
        ? { orden: (discs.length + 1) * 10, activo: true }
        : discs.find(function (x) { return x.id === estado.editando; });
      if (!d) { estado.editando = null; return vistaDisciplinas(); }

      $('#vista').innerHTML =
        botonVolver() +
        cabecera(estado.editando === 'nuevo' ? 'Nueva disciplina' : d.titulo,
          'La descripción corta es la que se ve en la tarjeta del inicio. La larga aparece al entrar a la disciplina.') +
        fichaDisciplina(d, profes, porDisc[d.id] || []);
      conectarVolver();
      return;
    }

    // ---- listado ----
    $('#vista').innerHTML =
      cabecera('Disciplinas', 'Tocá <strong>Editar</strong> para abrir el detalle de cada una.') +
      '<div class="barra-acciones">' +
        '<span class="ficha-meta">' + discs.length + ' disciplina(s)</span>' +
        '<button class="btn" id="btn-nueva">+ Agregar disciplina</button>' +
      '</div>' +
      (discs.length
        ? '<div class="lista">' + discs.map(itemDisciplina).join('') + '</div>'
        : '<p class="vacio">Todavía no hay disciplinas cargadas.</p>');

    $('#btn-nueva').addEventListener('click', function () {
      estado.editando = 'nuevo';
      abrir('disciplinas');
    });
  }

  function itemDisciplina(d) {
    return '<div class="item' + (d.activo === false ? ' inactivo' : '') + '" data-id="' + esc(d.id) + '" data-tabla="disciplinas">' +
      '<img class="item-img" src="' + esc(urlImagen(d.img)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="item-txt">' +
        '<div class="item-nombre">' + esc(d.titulo) +
          (d.activo === false ? '<span class="etiqueta-oculto">oculta</span>' : '') + '</div>' +
        '<div class="item-meta">' + esc(d.slug) + ' · orden ' + (d.orden || 0) + '</div>' +
      '</div>' +
      '<div class="item-botones">' +
        '<button class="btn fantasma chico" data-editar>Editar</button>' +
        '<button class="btn peligro chico" data-borrar-item>Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function botonVolver() {
    return '<button class="volver" id="btn-volver">← Volver al listado</button>';
  }
  function conectarVolver() {
    var b = $('#btn-volver');
    if (b) b.addEventListener('click', function () {
      estado.editando = null;
      abrir(estado.seccion);
    });
  }

  function fichaDisciplina(d, profes, vinculados) {
    var nuevo = !d.id;
    return '<section class="ficha" data-id="' + esc(d.id || '') + '">' +
      '<div class="ficha-cab"><div class="ficha-titulo">' + esc(d.titulo || 'Disciplina nueva') + '</div>' +
      '<div class="ficha-meta">' + esc(d.slug || 'sin identificador') + '</div></div>' +
      '<div class="fila">' +
        '<div><label>Título</label><input type="text" data-campo="titulo" value="' + esc(d.titulo || '') + '"></div>' +
        '<div><label>Identificador</label><input type="text" data-campo="slug" value="' + esc(d.slug || '') + '">' +
          '<p class="ayuda">Sin espacios ni acentos. No lo cambies si ya está publicado.</p></div>' +
      '</div>' +
      '<div class="fila">' +
        '<div><label>Antetítulo</label><input type="text" data-campo="kicker" value="' + esc(d.kicker || '') + '">' +
          '<p class="ayuda">El texto chico rojo. Ej: «Gi · Kimono».</p></div>' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (d.orden || 0) + '"></div>' +
      '</div>' +
      '<label>Descripción corta (tarjeta)</label>' +
      '<textarea data-campo="resumen" style="min-height:64px">' + esc(d.resumen || '') + '</textarea>' +
      campoImagen('Imagen de la tarjeta', d.img, 'img') +
      '<label>Descripción larga</label>' +
      '<textarea data-campo="lore" style="min-height:150px">' + esc(arrayALineas(d.lore)) + '</textarea>' +
      '<p class="ayuda">Un párrafo por línea. Las líneas en blanco se ignoran.</p>' +
      '<label>Qué se entrena</label>' +
      '<textarea data-campo="puntos">' + esc(arrayALineas(d.puntos)) + '</textarea>' +
      '<p class="ayuda">Un ítem por línea. Salen como lista.</p>' +
      '<div class="fila">' +
        '<div><label>Para quién es</label><input type="text" data-campo="para_quien" value="' + esc(d.para_quien || '') + '"></div>' +
        '<div><label>Equipo necesario</label><input type="text" data-campo="equipo" value="' + esc(d.equipo || '') + '"></div>' +
      '</div>' +
      '<label>Instructores de esta disciplina</label>' +
      (profes.length
        ? '<div style="display:flex;flex-wrap:wrap;gap:12px">' + profes.map(function (p) {
            return '<label style="display:flex;align-items:center;gap:7px;margin:0;text-transform:none;letter-spacing:0;font-size:13px;font-family:Poppins,sans-serif;color:var(--texto);cursor:pointer">' +
              '<input type="checkbox" data-profe="' + esc(p.id) + '"' +
              (vinculados.indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.nombre) + '</label>';
          }).join('') + '</div>'
        : '<p class="ayuda">Todavía no hay instructores cargados. Agregalos en la pestaña Instructores.</p>') +
      '<label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="activo"' + (d.activo !== false ? ' checked' : '') + '> Visible en el sitio</label>' +
      '<div class="acciones">' +
        '<button class="btn" data-guardar>' + (nuevo ? 'Crear disciplina' : 'Guardar cambios') + '</button>' +
        '<button class="btn fantasma" data-cancelar>Cancelar</button>' +
      '</div>' +
    '</section>';
  }

  async function guardarDisciplina(ficha, btn) {
    var o = leerCampos(ficha);
    if (!o.titulo) return aviso('Poné un título.');
    if (!o.slug) o.slug = o.titulo.toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    o.lore = lineasAArray(o.lore);
    o.puntos = lineasAArray(o.puntos);
    var id = ficha.dataset.id;
    if (id) o.id = id;

    ocupado(btn, true);
    try {
      var fila = await guardarFila('disciplinas', o);
      ficha.dataset.id = fila.id;
      // sincronizar instructores vinculados
      var marcados = [].slice.call(ficha.querySelectorAll('[data-profe]'))
        .filter(function (c) { return c.checked; })
        .map(function (c) { return c.dataset.profe; });
      var del = await supa.from('disciplina_instructores').delete().eq('disciplina_id', fila.id);
      if (del.error) throw del.error;
      if (marcados.length) {
        var ins = await supa.from('disciplina_instructores').insert(
          marcados.map(function (pid, i) {
            return { disciplina_id: fila.id, instructor_id: pid, orden: i * 10 };
          }));
        if (ins.error) throw ins.error;
      }
      aviso('Disciplina guardada.', 'ok');
      estado.editando = null;
      abrir('disciplinas');
    } catch (e) { fallo(e, 'Guardando disciplina'); }
    finally { ocupado(btn, false); }
  }

  /* ---------------------------------- HORARIOS ----------------------------- */

  async function vistaHorarios() {
    var filas = await traer('horarios');

    if (estado.editando) {
      var h = estado.editando === 'nuevo'
        ? { orden: (filas.length + 1) * 10, activo: true }
        : filas.find(function (x) { return x.id === estado.editando; });
      if (!h) { estado.editando = null; return vistaHorarios(); }
      $('#vista').innerHTML =
        botonVolver() +
        cabecera(estado.editando === 'nuevo' ? 'Nueva clase' : h.clase,
          'Así aparece la fila en la tabla de horarios del sitio.') +
        fichaHorario(h);
      conectarVolver();
      return;
    }

    $('#vista').innerHTML =
      cabecera('Horarios', 'Tocá <strong>Editar</strong> para cambiar una clase.') +
      '<div class="barra-acciones">' +
        '<span class="ficha-meta">' + filas.length + ' clase(s)</span>' +
        '<button class="btn" id="btn-nuevo">+ Agregar clase</button>' +
      '</div>' +
      (filas.length
        ? '<div class="lista">' + filas.map(itemHorario).join('') + '</div>'
        : '<p class="vacio">Todavía no hay horarios cargados.</p>');

    $('#btn-nuevo').addEventListener('click', function () {
      estado.editando = 'nuevo';
      abrir('horarios');
    });
  }

  function itemHorario(h) {
    var detalle = [h.dias, h.hora, h.nivel].filter(Boolean).join(' · ');
    return '<div class="item' + (h.activo === false ? ' inactivo' : '') + '" data-id="' + esc(h.id) + '" data-tabla="horarios">' +
      '<div class="item-txt">' +
        '<div class="item-nombre">' + esc(h.clase) +
          (h.activo === false ? '<span class="etiqueta-oculto">oculta</span>' : '') + '</div>' +
        '<div class="item-meta">' + esc(detalle || 'sin datos') + ' · orden ' + (h.orden || 0) + '</div>' +
      '</div>' +
      '<div class="item-botones">' +
        '<button class="btn fantasma chico" data-editar>Editar</button>' +
        '<button class="btn peligro chico" data-borrar-item>Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function fichaHorario(h) {
    return '<section class="ficha" data-id="' + esc(h.id || '') + '" data-tabla="horarios">' +
      '<div class="fila">' +
        '<div><label>Clase</label><input type="text" data-campo="clase" value="' + esc(h.clase || '') + '"></div>' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (h.orden || 0) + '"></div>' +
      '</div>' +
      '<div class="fila">' +
        '<div><label>Días</label><input type="text" data-campo="dias" value="' + esc(h.dias || '') + '">' +
          '<p class="ayuda">Ej: «Lun · Mié · Vie».</p></div>' +
        '<div><label>Hora</label><input type="text" data-campo="hora" value="' + esc(h.hora || '') + '">' +
          '<p class="ayuda">Ej: «19:00 – 20:30».</p></div>' +
      '</div>' +
      '<label>Nivel</label><input type="text" data-campo="nivel" value="' + esc(h.nivel || '') + '">' +
      '<p class="ayuda">Ej: «Todos», «Inicial», «Infantil».</p>' +
      '<label style="display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="activo"' + (h.activo !== false ? ' checked' : '') + '> Visible en el sitio</label>' +
      '<div class="acciones">' +
        '<button class="btn" data-guardar>' + (h.id ? 'Guardar cambios' : 'Crear clase') + '</button>' +
        '<button class="btn fantasma" data-cancelar>Cancelar</button>' +
      '</div>' +
    '</section>';
  }

  /* ---------------------------------- ACTIVIDADES -------------------------- */

  async function vistaActividades() {
    var filas = await traer('eventos', 'fecha');

    if (estado.editando) {
      var ev = estado.editando === 'nuevo'
        ? { orden: (filas.length + 1) * 10, activo: true }
        : filas.find(function (x) { return x.id === estado.editando; });
      if (!ev) { estado.editando = null; return vistaActividades(); }
      $('#vista').innerHTML =
        botonVolver() +
        cabecera(estado.editando === 'nuevo' ? 'Nueva actividad' : (ev.titulo || 'Actividad'),
          'Seminarios, graduaciones y eventos. Las reservas llegan por WhatsApp.') +
        fichaEvento(ev);
      conectarVolver();
      return;
    }

    $('#vista').innerHTML =
      cabecera('Actividades', 'Tocá <strong>Editar</strong> para cambiar una actividad.') +
      '<div class="barra-acciones">' +
        '<span class="ficha-meta">' + filas.length + ' actividad(es)</span>' +
        '<button class="btn" id="btn-nuevo">+ Agregar actividad</button>' +
      '</div>' +
      (filas.length
        ? '<div class="lista">' + filas.map(itemEvento).join('') + '</div>'
        : '<p class="vacio">Todavía no hay actividades cargadas.</p>');

    $('#btn-nuevo').addEventListener('click', function () {
      estado.editando = 'nuevo';
      abrir('eventos');
    });
  }

  function fechaLegible(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return 'sin fecha';
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function itemEvento(ev) {
    var detalle = [fechaLegible(ev.fecha), ev.hora, ev.lugar].filter(Boolean).join(' · ');
    return '<div class="item' + (ev.activo === false ? ' inactivo' : '') + '" data-id="' + esc(ev.id) + '" data-tabla="eventos">' +
      '<div class="item-txt">' +
        '<div class="item-nombre">' + esc(ev.titulo || '(sin título)') +
          (ev.activo === false ? '<span class="etiqueta-oculto">oculta</span>' : '') + '</div>' +
        '<div class="item-meta">' + esc(detalle || 'sin datos') + '</div>' +
      '</div>' +
      '<div class="item-botones">' +
        '<button class="btn fantasma chico" data-editar>Editar</button>' +
        '<button class="btn peligro chico" data-borrar-item>Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function fichaEvento(ev) {
    return '<section class="ficha" data-id="' + esc(ev.id || '') + '" data-tabla="eventos">' +
      '<label>Título</label><input type="text" data-campo="titulo" value="' + esc(ev.titulo || '') + '">' +
      '<p class="ayuda">Ej: «Seminario de guardia cerrada».</p>' +
      campoImagen('Afiche / flyer', ev.flyer, 'flyer') +
      '<div class="fila">' +
        '<div><label>Fecha</label><input type="date" data-campo="fecha" value="' + esc((ev.fecha || '').slice(0, 10)) + '"></div>' +
        '<div><label>Hora</label><input type="text" data-campo="hora" value="' + esc(ev.hora || '') + '">' +
          '<p class="ayuda">Ej: «19:00 – 21:00».</p></div>' +
      '</div>' +
      '<div class="fila">' +
        '<div><label>Lugar</label><input type="text" data-campo="lugar" value="' + esc(ev.lugar || '') + '">' +
          '<p class="ayuda">Opcional. Ej: «Sede RAM, Villa Morra».</p></div>' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (ev.orden || 0) + '">' +
          '<p class="ayuda">Desempata cuando dos actividades son el mismo día.</p></div>' +
      '</div>' +
      '<label>Descripción</label><textarea data-campo="descripcion" style="min-height:110px">' + esc(ev.descripcion || '') + '</textarea>' +
      '<label style="display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="activo"' + (ev.activo !== false ? ' checked' : '') + '> Visible en el sitio</label>' +
      '<div class="acciones">' +
        '<button class="btn" data-guardar>' + (ev.id ? 'Guardar cambios' : 'Crear actividad') + '</button>' +
        '<button class="btn fantasma" data-cancelar>Cancelar</button>' +
      '</div>' +
    '</section>';
  }

  /* ---------------------------------- POR QUÉ RAM -------------------------- */

  async function vistaPorque() {
    var bens = await traer('beneficios');
    var aj = await traerAjustes();
    $('#vista').innerHTML =
      cabecera('Por qué RAM', 'El encabezado, la imagen y los seis bloques de texto de esta sección.') +
      '<section class="ficha" id="cab-porque">' +
        '<div class="fila">' +
          '<div><label>Antetítulo</label><input type="text" data-campo="porque_kicker" value="' + esc(aj.porque_kicker || '') + '"></div>' +
          '<div><label>Título</label><input type="text" data-campo="porque_titulo" value="' + esc(aj.porque_titulo || '') + '"></div>' +
        '</div>' +
        campoImagen('Imagen de la sección', aj.porque_img, 'porque_img') +
        '<div class="acciones"><button class="btn" id="btn-cab">Guardar encabezado</button></div>' +
      '</section>' +
      '<div id="lista">' + bens.map(fichaBeneficio).join('') + '</div>' +
      '<div class="acciones"><button class="btn fantasma" id="btn-nuevo">Agregar bloque</button></div>';

    $('#btn-cab').addEventListener('click', async function () {
      ocupado(this, true);
      try { await guardarAjustes(leerCampos($('#cab-porque'))); aviso('Encabezado guardado.', 'ok'); }
      catch (e) { fallo(e, 'Guardando'); } finally { ocupado(this, false); }
    });
    $('#btn-nuevo').addEventListener('click', function () {
      var n = $('#lista').children.length;
      $('#lista').insertAdjacentHTML('beforeend', fichaBeneficio({ orden: (n + 1) * 10, activo: true }));
    });
  }

  function fichaBeneficio(b) {
    return '<section class="ficha" data-id="' + esc(b.id || '') + '" data-tabla="beneficios">' +
      '<div class="fila">' +
        '<div><label>Título</label><input type="text" data-campo="titulo" value="' + esc(b.titulo || '') + '"></div>' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (b.orden || 0) + '"></div>' +
      '</div>' +
      '<label>Texto</label><textarea data-campo="texto" style="min-height:70px">' + esc(b.texto || '') + '</textarea>' +
      '<div class="acciones"><button class="btn" data-guardar>Guardar</button>' +
      '<button class="btn peligro" data-borrar>Eliminar</button></div>' +
    '</section>';
  }

  /* ---------------------------------- GALERÍA ------------------------------ */

  async function vistaGaleria() {
    var fotos = await traer('galeria');

    if (estado.editando) {
      var f = fotos.find(function (x) { return x.id === estado.editando; });
      if (!f) { estado.editando = null; return vistaGaleria(); }
      $('#vista').innerHTML =
        botonVolver() +
        cabecera('Foto', 'La descripción se usa como texto alternativo, para accesibilidad y buscadores.') +
        fichaFoto(f);
      conectarVolver();
      return;
    }

    var destacadas = fotos.filter(function (x) { return x.destacada; }).length;
    $('#vista').innerHTML =
      cabecera('Galería',
        'Las <strong>destacadas</strong> aparecen en el inicio; el resto, en la página de galería. ' +
        'Con cuatro queda una fila pareja, pero podés marcar las que quieras.') +
      '<div class="barra-acciones">' +
        '<span class="ficha-meta" id="cuenta"></span>' +
        '<label class="btn" style="margin:0;cursor:pointer;display:inline-flex">+ Subir fotos' +
          '<input type="file" accept="image/*" multiple id="subir-varias" style="display:none"></label>' +
      '</div>' +
      (fotos.length
        ? '<div class="lista">' + fotos.map(itemFoto).join('') + '</div>'
        : '<p class="vacio">Todavía no hay fotos. Subí las primeras con el botón de arriba.</p>');
    pintarCuenta(destacadas);

    $('#subir-varias').addEventListener('change', async function () {
      var archivos = [].slice.call(this.files || []);
      if (!archivos.length) return;
      this.value = '';
      aviso('Subiendo ' + archivos.length + ' foto(s)…');
      var base = fotos.length;
      for (var i = 0; i < archivos.length; i++) {
        try {
          var url = await subirImagen(archivos[i]);
          await guardarFila('galeria', { img: url, alt: '', orden: (base + i + 1) * 10, destacada: false, activo: true });
        } catch (e) { fallo(e, 'Subiendo ' + archivos[i].name); }
      }
      aviso('Listo.', 'ok');
      vistaGaleria();
    });
  }

  function pintarCuenta(n) {
    var el = $('#cuenta');
    if (!el) return;
    el.textContent = n + ' destacada(s) en el inicio';
    el.style.color = n ? 'var(--apagado)' : 'var(--rojo)';
  }

  function itemFoto(f) {
    return '<div class="item' + (f.activo === false ? ' inactivo' : '') + '" data-id="' + esc(f.id) + '" data-tabla="galeria">' +
      '<img class="item-img" src="' + esc(urlImagen(f.img)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="item-txt">' +
        '<div class="item-nombre">' + esc(f.alt || 'Sin descripción') +
          (f.destacada ? '<span class="etiqueta-oculto" style="border-color:var(--rojo);color:var(--rojo)">destacada</span>' : '') + '</div>' +
        '<div class="item-meta">orden ' + (f.orden || 0) + '</div>' +
      '</div>' +
      '<div class="item-botones">' +
        '<button class="btn fantasma chico" data-editar>Editar</button>' +
        '<button class="btn peligro chico" data-borrar-item>Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function fichaFoto(f) {
    return '<section class="ficha" data-id="' + esc(f.id) + '" data-tabla="galeria">' +
      campoImagen('Imagen', f.img, 'img') +
      '<label>Descripción</label>' +
      '<input type="text" data-campo="alt" value="' + esc(f.alt || '') + '" placeholder="Qué se ve en la foto">' +
      '<div class="fila">' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (f.orden || 0) + '"></div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="destacada"' + (f.destacada ? ' checked' : '') + '> Destacada (sale en el inicio)</label>' +
      '<label style="display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="activo"' + (f.activo !== false ? ' checked' : '') + '> Visible en el sitio</label>' +
      '<div class="acciones">' +
        '<button class="btn" data-guardar>Guardar cambios</button>' +
        '<button class="btn fantasma" data-cancelar>Cancelar</button>' +
      '</div>' +
    '</section>';
  }

  /* ---------------------------------- INSTRUCTORES ------------------------- */

  async function vistaInstructores() {
    var profes = await traer('instructores');

    if (estado.editando) {
      var p = estado.editando === 'nuevo'
        ? { orden: (profes.length + 1) * 10, activo: true }
        : profes.find(function (x) { return x.id === estado.editando; });
      if (!p) { estado.editando = null; return vistaInstructores(); }
      $('#vista').innerHTML =
        botonVolver() +
        cabecera(estado.editando === 'nuevo' ? 'Nuevo instructor' : p.nombre,
          'Aparece en la sección Instructores y se puede asignar a cada disciplina.') +
        fichaInstructor(p);
      conectarVolver();
      return;
    }

    $('#vista').innerHTML =
      cabecera('Instructores', 'Tocá <strong>Editar</strong> para abrir el detalle de cada uno.') +
      '<div class="barra-acciones">' +
        '<span class="ficha-meta">' + profes.length + ' instructor(es)</span>' +
        '<button class="btn" id="btn-nuevo">+ Agregar instructor</button>' +
      '</div>' +
      (profes.length
        ? '<div class="lista">' + profes.map(itemInstructor).join('') + '</div>'
        : '<p class="vacio">Todavía no hay instructores cargados.</p>');

    $('#btn-nuevo').addEventListener('click', function () {
      estado.editando = 'nuevo';
      abrir('instructores');
    });
  }

  function itemInstructor(p) {
    return '<div class="item' + (p.activo === false ? ' inactivo' : '') + '" data-id="' + esc(p.id) + '" data-tabla="instructores">' +
      '<img class="item-img" src="' + esc(urlImagen(p.img)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="item-txt">' +
        '<div class="item-nombre">' + esc(p.nombre) +
          (p.activo === false ? '<span class="etiqueta-oculto">oculto</span>' : '') + '</div>' +
        '<div class="item-meta">' + esc(p.ensena || 'sin especificar') + ' · orden ' + (p.orden || 0) + '</div>' +
      '</div>' +
      '<div class="item-botones">' +
        '<button class="btn fantasma chico" data-editar>Editar</button>' +
        '<button class="btn peligro chico" data-borrar-item>Eliminar</button>' +
      '</div>' +
    '</div>';
  }

  function fichaInstructor(p) {
    return '<section class="ficha" data-id="' + esc(p.id || '') + '" data-tabla="instructores">' +
      '<div class="fila">' +
        '<div><label>Nombre</label><input type="text" data-campo="nombre" value="' + esc(p.nombre || '') + '"></div>' +
        '<div><label>Orden</label><input type="number" data-campo="orden" value="' + (p.orden || 0) + '"></div>' +
      '</div>' +
      '<label>Qué enseña</label><input type="text" data-campo="ensena" value="' + esc(p.ensena || '') + '">' +
      '<p class="ayuda">Ej: «Brazilian Jiu-Jitsu · Gi y No-Gi».</p>' +
      '<label>Descripción</label><textarea data-campo="bio" style="min-height:80px">' + esc(p.bio || '') + '</textarea>' +
      campoImagen('Foto', p.img, 'img') +
      '<label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:14px;font-family:Poppins,sans-serif;color:var(--texto)">' +
        '<input type="checkbox" data-campo="activo"' + (p.activo !== false ? ' checked' : '') + '> Visible en el sitio</label>' +
      '<div class="acciones"><button class="btn" data-guardar>' +
        (p.id ? 'Guardar cambios' : 'Crear instructor') + '</button>' +
      '<button class="btn fantasma" data-cancelar>Cancelar</button></div>' +
    '</section>';
  }

  /* ---------------------------------- CONFIGURACIÓN ------------------------ */

  async function traerAjustes() {
    var filas = await supa.from('ajustes').select('*');
    if (filas.error) throw filas.error;
    var o = {};
    (filas.data || []).forEach(function (f) { o[f.clave] = f.valor; });
    return o;
  }

  async function guardarAjustes(obj) {
    var filas = Object.keys(obj).map(function (k) { return { clave: k, valor: String(obj[k] == null ? '' : obj[k]) }; });
    if (!filas.length) return;
    var r = await supa.from('ajustes').upsert(filas, { onConflict: 'clave' });
    if (r.error) throw r.error;
  }

  async function vistaAjustes() {
    var a = await traerAjustes();
    $('#vista').innerHTML =
      cabecera('Configuración', 'Imagen de portada y datos de contacto. El número de WhatsApp también lo usa el botón flotante.') +
      '<section class="ficha" id="form-ajustes">' +
        '<div style="font-weight:700;margin-bottom:4px">Portada</div>' +
        campoImagen('Imagen de fondo del inicio', a.hero_img, 'hero_img') +
        '<hr style="border:none;border-top:1px solid var(--borde);margin:26px 0">' +
        '<div style="font-weight:700;margin-bottom:4px">Contacto</div>' +
        '<div class="fila">' +
          '<div><label>WhatsApp (solo dígitos, con código de país)</label>' +
            '<input type="text" data-campo="whatsapp" value="' + esc(a.whatsapp || '') + '" placeholder="595981105384">' +
            '<p class="ayuda">Sin + ni espacios. Cambia el enlace de todos los botones, incluido el flotante.</p></div>' +
          '<div><label>WhatsApp como se muestra</label>' +
            '<input type="text" data-campo="whatsapp_visible" value="' + esc(a.whatsapp_visible || '') + '" placeholder="(0981) 105-384"></div>' +
        '</div>' +
        '<label>Correo</label><input type="text" data-campo="email" value="' + esc(a.email || '') + '">' +
        '<label>Ubicación</label><input type="text" data-campo="direccion" value="' + esc(a.direccion || '') + '">' +
        '<div class="fila">' +
          '<div><label>Instagram (usuario)</label><input type="text" data-campo="instagram_usuario" value="' + esc(a.instagram_usuario || '') + '" placeholder="@rammartial"></div>' +
          '<div><label>Instagram (enlace)</label><input type="text" data-campo="instagram_url" value="' + esc(a.instagram_url || '') + '"></div>' +
        '</div>' +
        '<hr style="border:none;border-top:1px solid var(--borde);margin:26px 0">' +
        '<div style="font-weight:700;margin-bottom:4px">Sobre RAM</div>' +
        campoImagen('Imagen de la sección', a.nosotros_img, 'nosotros_img') +
        '<label>Primer párrafo</label><textarea data-campo="nosotros_p1">' + esc(a.nosotros_p1 || '') + '</textarea>' +
        '<label>Segundo párrafo</label><textarea data-campo="nosotros_p2">' + esc(a.nosotros_p2 || '') + '</textarea>' +
        '<div class="acciones"><button class="btn" id="btn-ajustes">Guardar configuración</button></div>' +
      '</section>';

    $('#btn-ajustes').addEventListener('click', async function () {
      ocupado(this, true);
      try {
        var o = leerCampos($('#form-ajustes'));
        if (o.whatsapp) o.whatsapp = o.whatsapp.replace(/\D/g, '');
        await guardarAjustes(o);
        aviso('Configuración guardada.', 'ok');
      } catch (e) { fallo(e, 'Guardando configuración'); }
      finally { ocupado(this, false); }
    });
  }

  /* ---------------------------- acciones delegadas ------------------------- */

  $('#vista').addEventListener('click', async function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    var ficha = btn.closest('[data-id]');

    // guardar genérico (beneficios, instructores)
    if (btn.hasAttribute('data-guardar')) {
      if (estado.seccion === 'disciplinas') return guardarDisciplina(ficha, btn);
      var tabla = ficha.dataset.tabla;
      var o = leerCampos(ficha);
      if (ficha.dataset.id) o.id = ficha.dataset.id;
      ocupado(btn, true);
      try {
        var f = await guardarFila(tabla, o);
        ficha.dataset.id = f.id;
        aviso('Guardado.', 'ok');
        // los que tienen listado vuelven a él; «Por qué RAM» se edita en bloque
        if (CON_LISTADO.indexOf(estado.seccion) >= 0) {
          estado.editando = null;
          abrir(estado.seccion);
        }
      } catch (e) { fallo(e, 'Guardando'); } finally { ocupado(btn, false); }
      return;
    }

    // abrir el detalle desde el listado
    if (btn.hasAttribute('data-editar')) {
      estado.editando = ficha.dataset.id;
      abrir(estado.seccion);
      return;
    }

    // eliminar desde el listado
    if (btn.hasAttribute('data-borrar-item')) {
      var nombreItem = ($('.item-nombre', ficha).textContent || '').replace(/oculta|oculto/i, '').trim();
      var ok = await confirmar('Eliminar ' + nombreItem,
        'Se va a borrar de la base y deja de verse en el sitio. No se puede deshacer.');
      if (!ok) return;
      try {
        await borrarFila(ficha.dataset.tabla, ficha.dataset.id);
        aviso(nombreItem + ' eliminado.', 'ok');
        abrir(estado.seccion);
      } catch (e) { fallo(e, 'Eliminando'); }
      return;
    }

    if (btn.hasAttribute('data-cancelar')) {
      if (CON_LISTADO.indexOf(estado.seccion) >= 0) {
        estado.editando = null;
        abrir(estado.seccion);
      } else { ficha.remove(); }
      return;
    }

    if (btn.hasAttribute('data-borrar')) {
      var tablaB = ficha.dataset.tabla || 'disciplinas';
      var nombre = ($('.ficha-titulo', ficha) || {}).textContent || 'este elemento';
      var confirmado = await confirmar('Eliminar ' + nombre,
        'Se va a borrar de la base y deja de verse en el sitio. No se puede deshacer.');
      if (!confirmado) return;
      try {
        if (ficha.dataset.id) await borrarFila(tablaB, ficha.dataset.id);
        ficha.remove();
        aviso('Eliminado.', 'ok');
      } catch (e) { fallo(e, 'Eliminando'); }
    }
  });

  iniciar();
})();
