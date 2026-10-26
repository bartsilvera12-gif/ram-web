/* ---------------------------------------------------------------------------
   Panel de administración · RAM Martial Arts
   Vanilla + supabase-js. Todo el contenido vive en el schema "ram".
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var CFG = window.RAM_CONFIG || {};
  var supa = null;
  var estado = { seccion: 'disciplinas', instructores: [], disciplinas: [] };

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

  $('#form-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var btn = $('#btn-entrar');
    ocupado(btn, true);
    try {
      var r = await supa.auth.signInWithPassword({
        email: $('#correo').value.trim(),
        password: $('#clave').value
      });
      if (r.error) throw r.error;
      $('#clave').value = '';
      await entrarAlPanel(r.data.session);
    } catch (e) {
      fallo(e, 'No se pudo entrar');
    } finally { ocupado(btn, false); }
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
    if (b) abrir(b.dataset.ir);
  });

  async function abrir(id) {
    estado.seccion = id;
    dibujarTabs();
    $('#vista').innerHTML = '<p class="vacio">Cargando…</p>';
    window.scrollTo(0, 0);
    try {
      await ({
        disciplinas: vistaDisciplinas, horarios: vistaHorarios, porque: vistaPorque,
        galeria: vistaGaleria, instructores: vistaInstructores, ajustes: vistaAjustes
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
        : (el.type === 'number' ? (parseInt(el.value, 10) || 0) : el.value.trim());
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

    $('#vista').innerHTML =
      cabecera('Disciplinas',
        'La descripción corta es la que se ve en la tarjeta del inicio. La larga aparece al entrar a la disciplina.') +
      '<div id="lista">' + discs.map(function (d) { return fichaDisciplina(d, profes, porDisc[d.id] || []); }).join('') + '</div>' +
      '<div class="acciones"><button class="btn" id="btn-nueva">Agregar disciplina</button></div>';

    $('#btn-nueva').addEventListener('click', function () {
      var tmp = document.createElement('div');
      tmp.innerHTML = fichaDisciplina({ orden: (discs.length + 1) * 10, activo: true }, profes, []);
      $('#lista').appendChild(tmp.firstChild);
      window.scrollTo(0, document.body.scrollHeight);
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
        '<button class="btn" data-guardar>Guardar</button>' +
        (nuevo ? '<button class="btn fantasma" data-cancelar>Cancelar</button>'
               : '<button class="btn peligro" data-borrar>Eliminar</button>') +
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
      $('.ficha-titulo', ficha).textContent = fila.titulo;
      $('.ficha-meta', ficha).textContent = fila.slug;
    } catch (e) { fallo(e, 'Guardando disciplina'); }
    finally { ocupado(btn, false); }
  }

  /* ---------------------------------- HORARIOS ----------------------------- */

  async function vistaHorarios() {
    var filas = await traer('horarios');
    $('#vista').innerHTML =
      cabecera('Horarios', 'Esta es la tabla que se ve en el sitio. Agregá, edití o borrá filas libremente.') +
      '<div class="ficha"><div class="envoltorio-tabla"><table class="tabla"><thead><tr>' +
        '<th style="width:70px">Orden</th><th>Clase</th><th>Días</th><th>Hora</th><th>Nivel</th><th style="width:40px"></th>' +
      '</tr></thead><tbody id="cuerpo">' + filas.map(filaHorario).join('') + '</tbody></table></div>' +
      '<div class="acciones"><button class="btn fantasma" id="btn-fila">Agregar fila</button>' +
      '<button class="btn" id="btn-guardar-todo">Guardar todo</button></div></div>';

    $('#btn-fila').addEventListener('click', function () {
      var n = $('#cuerpo').children.length;
      $('#cuerpo').insertAdjacentHTML('beforeend', filaHorario({ orden: (n + 1) * 10, activo: true }));
    });
    $('#btn-guardar-todo').addEventListener('click', guardarHorarios);
  }

  function filaHorario(h) {
    return '<tr data-id="' + esc(h.id || '') + '">' +
      '<td><input type="number" data-campo="orden" value="' + (h.orden || 0) + '"></td>' +
      '<td><input type="text" data-campo="clase" value="' + esc(h.clase || '') + '"></td>' +
      '<td><input type="text" data-campo="dias" value="' + esc(h.dias || '') + '"></td>' +
      '<td><input type="text" data-campo="hora" value="' + esc(h.hora || '') + '"></td>' +
      '<td><input type="text" data-campo="nivel" value="' + esc(h.nivel || '') + '"></td>' +
      '<td><button class="btn peligro chico" data-quitar title="Quitar">✕</button></td>' +
    '</tr>';
  }

  async function guardarHorarios() {
    var btn = $('#btn-guardar-todo');
    ocupado(btn, true);
    try {
      var filas = [].slice.call($('#cuerpo').children);
      for (var i = 0; i < filas.length; i++) {
        var o = leerCampos(filas[i]);
        if (!o.clase) continue;
        o.activo = true;
        if (filas[i].dataset.id) o.id = filas[i].dataset.id;
        var g = await guardarFila('horarios', o);
        filas[i].dataset.id = g.id;
      }
      aviso('Horarios guardados.', 'ok');
    } catch (e) { fallo(e, 'Guardando horarios'); }
    finally { ocupado(btn, false); }
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
    var destacadas = fotos.filter(function (f) { return f.destacada; }).length;
    $('#vista').innerHTML =
      cabecera('Galería',
        'Las <strong>destacadas</strong> son las que aparecen en el inicio: conviene dejar exactamente 4. ' +
        'El resto se ve en la página de galería. <span id="cuenta"></span>') +
      '<div class="ficha">' +
        '<label class="btn" style="margin:0;cursor:pointer;display:inline-flex">Subir fotos' +
        '<input type="file" accept="image/*" multiple id="subir-varias" style="display:none"></label>' +
        '<p class="ayuda">Podés elegir varias de una vez.</p>' +
      '</div>' +
      '<div class="galeria-grid" id="grilla">' + fotos.map(fichaFoto).join('') + '</div>' +
      (fotos.length ? '' : '<p class="vacio">Todavía no hay fotos.</p>');
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
    el.textContent = 'Ahora hay ' + n + ' destacada(s).';
    el.style.color = n === 4 ? 'var(--apagado)' : 'var(--rojo)';
  }

  function fichaFoto(f) {
    return '<div class="foto' + (f.destacada ? ' destacada' : '') + '" data-id="' + esc(f.id) + '" data-tabla="galeria">' +
      '<img src="' + esc(urlImagen(f.img)) + '" alt="" loading="lazy">' +
      '<label class="marca-destacada"><input type="checkbox" data-destacada' + (f.destacada ? ' checked' : '') + '> Destacada</label>' +
      '<input type="text" data-alt value="' + esc(f.alt || '') + '" placeholder="Descripción" style="margin-bottom:8px">' +
      '<input type="number" data-orden value="' + (f.orden || 0) + '" style="margin-bottom:8px">' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn chico" data-guardar-foto style="flex:1">Guardar</button>' +
        '<button class="btn peligro chico" data-borrar>✕</button>' +
      '</div></div>';
  }

  /* ---------------------------------- INSTRUCTORES ------------------------- */

  async function vistaInstructores() {
    var profes = await traer('instructores');
    $('#vista').innerHTML =
      cabecera('Instructores', 'Aparecen en la sección Instructores y se pueden asignar a cada disciplina.') +
      '<div id="lista">' + profes.map(fichaInstructor).join('') + '</div>' +
      '<div class="acciones"><button class="btn" id="btn-nuevo">Agregar instructor</button></div>';
    $('#btn-nuevo').addEventListener('click', function () {
      var n = $('#lista').children.length;
      $('#lista').insertAdjacentHTML('beforeend', fichaInstructor({ orden: (n + 1) * 10, activo: true }));
      window.scrollTo(0, document.body.scrollHeight);
    });
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
      '<div class="acciones"><button class="btn" data-guardar>Guardar</button>' +
      '<button class="btn peligro" data-borrar>Eliminar</button></div>' +
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
      } catch (e) { fallo(e, 'Guardando'); } finally { ocupado(btn, false); }
      return;
    }

    // guardar una foto de la galería
    if (btn.hasAttribute('data-guardar-foto')) {
      ocupado(btn, true);
      try {
        await guardarFila('galeria', {
          id: ficha.dataset.id,
          alt: $('[data-alt]', ficha).value.trim(),
          orden: parseInt($('[data-orden]', ficha).value, 10) || 0,
          destacada: $('[data-destacada]', ficha).checked
        });
        ficha.classList.toggle('destacada', $('[data-destacada]', ficha).checked);
        pintarCuenta(document.querySelectorAll('.foto [data-destacada]:checked').length);
        aviso('Foto guardada.', 'ok');
      } catch (e) { fallo(e, 'Guardando foto'); } finally { ocupado(btn, false); }
      return;
    }

    if (btn.hasAttribute('data-cancelar')) { ficha.remove(); return; }
    if (btn.hasAttribute('data-quitar')) {
      var id = ficha.dataset.id;
      ficha.remove();
      if (id) { try { await borrarFila('horarios', id); } catch (e) { fallo(e, 'Borrando'); } }
      return;
    }

    if (btn.hasAttribute('data-borrar')) {
      var tablaB = ficha.dataset.tabla || 'disciplinas';
      var nombre = ($('.ficha-titulo', ficha) || {}).textContent || 'este elemento';
      if (!confirm('¿Eliminar ' + nombre + '? No se puede deshacer.')) return;
      try {
        if (ficha.dataset.id) await borrarFila(tablaB, ficha.dataset.id);
        ficha.remove();
        aviso('Eliminado.', 'ok');
        if (tablaB === 'galeria') pintarCuenta(document.querySelectorAll('.foto [data-destacada]:checked').length);
      } catch (e) { fallo(e, 'Eliminando'); }
    }
  });

  iniciar();
})();
