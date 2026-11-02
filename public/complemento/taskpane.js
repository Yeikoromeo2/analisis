/* Panel del complemento: conecta la lógica (logica.js) con el libro abierto mediante Office.js. */
(function () {
  'use strict';
  const GC = window.GC;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => '$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const LISTAS_DEF = {
    responsables: [],
    estados: ['Contactado', 'No contesta', 'Interesado', 'Cotización enviada', 'Compró', 'No interesado', 'Datos errados', 'Volver a llamar'],
    acciones: ['Llamar nuevamente', 'Enviar correo', 'Enviar cotización', 'Agendar reunión', 'Derivar a ejecutivo', 'Cerrar seguimiento'],
  };

  let M = null;          // modelo del libro
  let actual = null;     // registro mostrado
  let selTimer = null;
  let pendienteConfirmar = null;

  // ---------------- utilidades de UI ----------------
  function estado(msg, tipo) {
    const e = $('estado');
    e.textContent = msg;
    e.className = 'estado' + (tipo ? ' ' + tipo : '');
    e.hidden = !msg;
  }
  async function conBoton(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (err) { console.error(err); estado('Error: ' + (err && err.message ? err.message : err), 'err'); }
    finally { btn.disabled = false; }
  }
  function confirmar(btn, texto, fn) { // Office no permite confirm(): se pide un segundo clic.
    const orig = btn.dataset.orig || btn.textContent;
    btn.dataset.orig = orig;
    if (pendienteConfirmar === btn) { pendienteConfirmar = null; btn.textContent = orig; return fn(); }
    pendienteConfirmar = btn;
    btn.textContent = texto;
    setTimeout(() => { if (pendienteConfirmar === btn) { pendienteConfirmar = null; btn.textContent = orig; } }, 4000);
    return Promise.resolve();
  }
  function tab(nombre) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === nombre));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + nombre));
    if (nombre === 'verificacion') renderVerificacion();
    if (nombre === 'pendientes') renderPendientes();
  }
  const claseCruce = (c) => (c === 'NO ENCONTRADO' ? 'tag' : c === 'RAZÓN SOCIAL AMBIGUA' ? 'tag rojo' : c === 'ID' || c === 'ID + ID CSP' ? 'tag verde' : 'tag ambar');

  // ---------------- lectura del libro ----------------
  async function cargar() {
    estado('Leyendo el libro…');
    await Excel.run(async (ctx) => {
      const wss = ctx.workbook.worksheets;
      wss.load('items/name');
      await ctx.sync();
      const pares = wss.items.map((ws) => {
        const r = ws.getUsedRangeOrNullObject(true);
        r.load(['values', 'rowIndex', 'columnIndex']);
        return [ws.name, r];
      });
      await ctx.sync();
      const hojas = pares.filter(([, r]) => !r.isNullObject).map(([nombre, r]) => ({ nombre, values: r.values, fila0: r.rowIndex, col0: r.columnIndex }));
      M = GC.construirModelo(hojas);
    });
    const faltan = ['registros', 'base', 'seguimiento'].filter((t) => !M.hojas[t]);
    const nombres = { registros: 'NUEVOS REGISTROS', base: 'BASE', seguimiento: 'SEGUIMIENTO SEMANAL' };
    if (faltan.length) estado('No se encontró: ' + faltan.map((f) => nombres[f]).join(', ') + '. Revisa los encabezados de la fila 1.', 'err');
    else estado(`${M.registros.length} registros · ${M.base.size} clientes en BASE · ${M.segFilas.filter((s) => !GC.vacio(s.fecha)).length} contactados`, 'ok');
    llenarListas();
    llenarMeses();
    if (actual) mostrar(M.porId.get(actual.id));
    const activa = document.querySelector('.tabs button.on').dataset.tab;
    if (activa === 'verificacion') renderVerificacion();
    if (activa === 'pendientes') renderPendientes();
  }

  // ---------------- listas (guardadas en el libro) ----------------
  function listas() {
    let l = null;
    try { l = Office.context.document.settings.get('gcListas'); } catch (e) { /* sin settings */ }
    return Object.assign({}, LISTAS_DEF, l || {});
  }
  function unicos(arr) { return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')); }
  function llenarListas() {
    const l = listas();
    const usados = (k) => (M ? M.segFilas.map((s) => s[k]) : []);
    const fill = (id, vals) => { $(id).innerHTML = vals.map((v) => `<option value="${esc(v)}"></option>`).join(''); };
    fill('dlResp', unicos([...l.responsables, ...usados('responsable')]));
    fill('dlEstado', unicos([...l.estados, ...usados('estado')]));
    fill('dlProx', unicos([...l.acciones, ...usados('proxima')]));
    $('lResp').value = l.responsables.join('\n');
    $('lEstado').value = l.estados.join('\n');
    $('lProx').value = l.acciones.join('\n');
  }
  function leerListasForm() {
    const lines = (id) => $(id).value.split('\n').map((s) => s.trim().replace(/,/g, ' ')).filter(Boolean);
    return { responsables: lines('lResp'), estados: lines('lEstado'), acciones: lines('lProx') };
  }
  function guardarListas() {
    return new Promise((res, rej) => {
      Office.context.document.settings.set('gcListas', leerListasForm());
      Office.context.document.settings.saveAsync((r) => (r.status === Office.AsyncResultStatus.Succeeded ? res() : rej(r.error)));
    });
  }

  // ---------------- contacto ----------------
  function renderResultados(lista) {
    $('resultados').innerHTML = lista.map((r) => `<li data-id="${esc(r.id)}"><b>${esc(r.id)}</b> · ${esc(r.nombre)}<div class="small muted">${esc(r.ruc || 'sin RUC')} · ${esc(r.contacto || 'sin contacto')}</div></li>`).join('');
  }
  function mostrar(r) {
    actual = r || null;
    $('ficha').hidden = !r;
    $('ayudaContacto').hidden = !!r;
    if (!r) return;
    $('fNombre').textContent = r.nombre;
    $('fSub').textContent = `${r.id} · RUC ${r.ruc || '—'}`;
    $('fCruce').textContent = r.cruce; $('fCruce').className = claseCruce(r.cruce);
    $('fCompra').textContent = r.compra > 0 ? 'Compró ' + money(r.compra) : 'Sin compras'; $('fCompra').className = r.compra > 0 ? 'tag verde' : 'tag';
    $('fContacto').textContent = r.contacto || 'Falta';
    const cel = r.celular.replace(/\D/g, '');
    $('fCelular').innerHTML = r.celular ? `${esc(r.celular)} · <a target="_blank" href="https://wa.me/${/^9\d{8}$/.test(cel) ? '51' + cel : cel}">WhatsApp</a>` : 'Falta';
    $('fCorreo').innerHTML = r.correo ? `<a href="mailto:${esc(r.correo)}">${esc(r.correo)}</a>` : 'Falta';
    $('fCiudad').textContent = r.ciudad || r.provid || '—';
    $('fEjecutivo').textContent = r.ejecutivo || '—';
    $('fRegistro').textContent = `${r.fecha || '—'} ${r.mes ? '(' + r.mes + ')' : ''} · fila ${r.fila}`;
    const meses = M.hojas.base ? M.hojas.base.meses : [];
    $('fLineas').hidden = !r.lineas.length;
    $('fLineasBody').innerHTML = r.lineas.length ? `<table><tr><th>Mes</th>${r.lineas.map((b) => `<th class="num">${esc(b.id)}</th>`).join('')}</tr>${meses.filter((m) => r.lineas.some((b) => b.meses[m] !== undefined)).map((m) => `<tr><td>${m}</td>${r.lineas.map((b) => `<td class="num">${b.meses[m] !== undefined ? money(b.meses[m]) : ''}</td>`).join('')}</tr>`).join('')}<tr><th>Total</th>${r.lineas.map((b) => `<th class="num">${money(b.total)}</th>`).join('')}</tr></table>` : '';

    const s = M.seg.get(r.id);
    const C = M.hojas.seguimiento ? M.hojas.seguimiento.C : null;
    $('sinFila').hidden = !!s || !C;
    $('formSeg').querySelectorAll('input,textarea,#btnGuardar,#btnLimpiar').forEach((el) => { el.disabled = !s; });
    $('fFila').textContent = s ? `(fila ${s.fila} de ${M.hojas.seguimiento.nombre})` : '';
    $('lblFechaProx').hidden = !C || C.fechaProxima < 0;
    $('sFecha').value = s ? GC.fechaISO(s.fecha) : '';
    $('sResp').value = s ? s.responsable : '';
    $('sEstado').value = s ? s.estado : '';
    $('sProx').value = s ? s.proxima : '';
    $('sFechaProx').value = s ? GC.fechaISO(s.fechaProxima) : '';
    $('sObs').value = s ? s.observacion : '';
    if (s && !$('sFecha').value) $('sFecha').value = hoyISO();
  }

  async function irA(hojaNombre, fila, colIdx) {
    await Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItem(hojaNombre);
      ws.activate();
      ws.getRangeByIndexes(fila - 1, colIdx || 0, 1, 1).select();
      await ctx.sync();
    });
  }

  async function escribirSeguimiento(valores) {
    const s = M.seg.get(actual.id);
    const H = M.hojas.seguimiento, C = H.C;
    const campos = [
      ['fecha', 'fecha', true], ['responsable', 'responsable'], ['estado', 'estado'], ['proxima', 'proxima'],
      ['fechaProxima', 'fechaProxima', true], ['observacion', 'observacion'],
    ];
    await Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItem(H.nombre);
      for (const [k, ck, esFecha] of campos) {
        if (C[ck] < 0 || !(k in valores)) continue;
        const cell = ws.getRangeByIndexes(s.fila - 1, H.col0 + C[ck], 1, 1);
        let v = valores[k];
        if (esFecha) {
          const serial = GC.isoASerial(v);
          v = serial === null ? '' : serial;
          if (serial !== null) cell.numberFormat = [['dd/mm/yyyy']];
        }
        cell.values = [[v]];
      }
      await ctx.sync();
    });
    // actualizar modelo local
    for (const k of Object.keys(valores)) {
      const v = valores[k];
      s[k] = k === 'fecha' || k === 'fechaProxima' ? (GC.isoASerial(v) ?? '') : v;
    }
  }

  async function guardar(e) {
    e.preventDefault();
    if (!actual) return;
    await conBoton($('btnGuardar'), async () => {
      if (!$('sFecha').value) { estado('Indica la fecha de contacto.', 'err'); return; }
      await escribirSeguimiento({
        fecha: $('sFecha').value, responsable: $('sResp').value.trim(), estado: $('sEstado').value.trim(),
        proxima: $('sProx').value.trim(), fechaProxima: $('sFechaProx').value, observacion: $('sObs').value.trim(),
      });
      estado(`Guardado en la fila ${M.seg.get(actual.id).fila} de ${M.hojas.seguimiento.nombre}.`, 'ok');
      llenarListas();
    });
  }

  async function limpiar() {
    const b = $('btnLimpiar');
    await confirmar(b, '¿Borrar? Toca otra vez', () => conBoton(b, async () => {
      await escribirSeguimiento({ fecha: '', responsable: '', estado: '', proxima: '', fechaProxima: '', observacion: '' });
      mostrar(actual);
      estado('Fila de seguimiento vaciada.', 'ok');
    }));
  }

  /** Extiende SEGUIMIENTO hasta la última fila de NUEVOS copiando las fórmulas (R1C1) de la última fila. */
  async function agregarFilas() {
    await conBoton($('btnAgregarFila'), async () => {
      const H = M.hojas.seguimiento, R = M.hojas.registros;
      const ultimaSeg = Math.max(...M.segFilas.map((s) => s.fila), H.fila0 + 1);
      const faltantes = M.registros.filter((r) => !r.duplicado && !M.seg.has(r.id));
      await Excel.run(async (ctx) => {
        const ws = ctx.workbook.worksheets.getItem(H.nombre);
        const ancho = H.encabezados.length;
        const plantilla = ws.getRangeByIndexes(ultimaSeg - 1, H.col0, 1, ancho);
        plantilla.load(['formulasR1C1', 'formulas']);
        await ctx.sync();
        // Si las fórmulas apuntan a la misma fila de NUEVOS, se copian hacia abajo hasta su última fila.
        const alineada = R && /NUEVOS/i.test(String(plantilla.formulas[0][H.C.id]));
        const n = Math.max(...M.registros.map((r) => r.fila)) - ultimaSeg;
        if (alineada && n > 0) {
          const fila = plantilla.formulasR1C1[0].map((f) => (typeof f === 'string' && f.startsWith('=') ? f : ''));
          ws.getRangeByIndexes(ultimaSeg, H.col0, n, ancho).formulasR1C1 = Array.from({ length: n }, () => fila.slice());
        } else {
          faltantes.forEach((r, i) => { ws.getRangeByIndexes(ultimaSeg + i, H.col0 + H.C.id, 1, 1).values = [[r.id]]; });
        }
        await ctx.sync();
      });
      const id = actual && actual.id;
      await cargar();
      if (id) mostrar(M.porId.get(id));
      estado(`Se agregaron filas en ${H.nombre}.`, 'ok');
    });
  }

  // ---------------- selección en la hoja ----------------
  function onSeleccion() {
    if (!$('seguirSel').checked || !M) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      Excel.run(async (ctx) => {
        const r = ctx.workbook.getSelectedRange();
        r.load('rowIndex');
        const ws = ctx.workbook.worksheets.getActiveWorksheet();
        ws.load('name');
        await ctx.sync();
        const fila = r.rowIndex + 1;
        let id = null;
        if (M.hojas.seguimiento && ws.name === M.hojas.seguimiento.nombre) { const s = M.segFilas.find((x) => x.fila === fila); id = s && s.id; }
        if (M.hojas.registros && ws.name === M.hojas.registros.nombre) { const x = M.registros.find((y) => y.fila === fila); id = x && x.id; }
        if (id && (!actual || actual.id !== id) && M.porId.get(id)) { mostrar(M.porId.get(id)); tab('contacto'); }
      }).catch((e) => console.warn(e));
    }, 250);
  }

  // ---------------- pendientes ----------------
  function llenarMeses() {
    const meses = [...new Set(M.registros.map((r) => r.mes).filter(Boolean))];
    const sel = $('pMes'), v = sel.value;
    sel.innerHTML = '<option value="">Todos los meses</option>' + meses.map((m) => `<option>${esc(m)}</option>`).join('');
    sel.value = v;
  }
  function renderPendientes() {
    if (!M) return;
    const lista = GC.pendientes(M, { mes: $('pMes').value, compro: $('pCompro').value });
    $('pResumen').textContent = `${lista.length} sin FECHA CONTACTO${lista.length > 150 ? ' (se muestran 150)' : ''}`;
    $('pLista').innerHTML = lista.slice(0, 150).map((r) => `<li data-id="${esc(r.id)}"><b>${esc(r.id)}</b> · ${esc(r.nombre)}<div class="small muted">${esc(r.fecha)} · ${esc(r.contacto || 'sin contacto')} · ${esc(r.celular || 'sin celular')}${r.compra > 0 ? ' · compró ' + money(r.compra) : ''}</div></li>`).join('');
  }

  // ---------------- verificación ----------------
  function renderVerificacion() {
    if (!M) return;
    const controles = GC.verificar(M);
    let html = '', grupo = '';
    controles.forEach((c, i) => {
      if (c.grupo !== grupo) { grupo = c.grupo; html += `<div class="grupo">${esc(grupo)}</div>`; }
      const v = c.formato === 'pct' ? (c.valor * 100).toFixed(1) + '%' : c.formato === 'money' ? money(c.valor) : Number(c.valor).toLocaleString('es-PE');
      const items = c.items && c.items.length
        ? `<ul hidden>${c.items.slice(0, 200).map((it) => `<li data-hoja="${esc(it.hoja || c.hoja || '')}" data-fila="${it.fila}" data-id="${esc(it.id)}">${esc(it.texto)}</li>`).join('')}${c.items.length > 200 ? '<li class="muted">…</li>' : ''}</ul>` : '';
      html += `<div class="control" data-i="${i}"><div class="cab"><span class="dot ${c.nivel}"></span><span>${esc(c.control)}</span><span class="n">${v}</span></div>${c.nota ? `<div class="nota small muted">${esc(c.nota)}</div>` : ''}${items}</div>`;
    });
    $('vLista').innerHTML = html;
  }

  // ---------------- herramientas ----------------
  async function actualizarCruce() {
    const b = $('btnCruce');
    await conBoton(b, async () => {
      if (!M.hojas.registros || !M.hojas.base) throw new Error('Se necesitan las pestañas NUEVOS REGISTROS y BASE.');
      const H = M.hojas.registros;
      if (H.C.compra < 0) throw new Error('No se encontró la columna "COMPRAS EN EL AÑO" en NUEVOS REGISTROS.');
      const cc = GC.columnaCruce(M);
      const filas = GC.formulasCruce(M, cc.col);
      await Excel.run(async (ctx) => {
        const ws = ctx.workbook.worksheets.getItem(H.nombre);
        if (cc.nueva) {
          const h = ws.getRangeByIndexes(H.fila0, H.col0 + cc.col, 1, 1);
          h.values = [['CRUCE BASE']];
          try { h.copyFrom(ws.getRangeByIndexes(H.fila0, H.col0 + H.C.compra, 1, 1), Excel.RangeCopyType.formats); } catch (e) { h.format.font.bold = true; }
        }
        ws.getRangeByIndexes(H.fila0 + 1, H.col0 + cc.col, filas.length, 1).formulas = filas.map((f) => [f.cruce]);
        ws.getRangeByIndexes(H.fila0 + 1, H.col0 + H.C.compra, filas.length, 1).formulas = filas.map((f) => [f.compra]);
        await ctx.sync();
      });
      await cargar();
      estado(`Fórmulas actualizadas en ${filas.length} filas (columnas ${GC.letra(H.col0 + H.C.compra)} y ${GC.letra(H.col0 + cc.col)}).`, 'ok');
    });
  }

  async function vinculos() {
    const b = $('btnVinculos');
    await conBoton(b, async () => {
      const hallados = [];
      await Excel.run(async (ctx) => {
        const wss = ctx.workbook.worksheets;
        wss.load('items/name');
        await ctx.sync();
        const pares = wss.items.map((ws) => { const r = ws.getUsedRangeOrNullObject(); r.load(['formulas', 'rowIndex', 'columnIndex']); return [ws, r]; });
        await ctx.sync();
        for (const [ws, r] of pares) {
          if (r.isNullObject) continue;
          const cols = new Set(); let n = 0;
          r.formulas.forEach((fila) => fila.forEach((f, j) => { if (GC.tieneVinculoExterno(f)) { cols.add(j); n++; } }));
          if (n) hallados.push({ ws, r, cols: [...cols], n });
        }
        if (!hallados.length) { $('hVinculos').textContent = 'No hay fórmulas que apunten a otro archivo.'; return; }
        const total = hallados.reduce((a, h) => a + h.n, 0);
        if (b.dataset.listo !== '1') {
          $('hVinculos').innerHTML = hallados.map((h) => `${esc(h.ws.name)}: <b>${h.n}</b> fórmulas`).join('<br>') + '<br>Toca otra vez para reparar.';
          b.dataset.listo = '1'; b.textContent = `Reparar ${total} fórmulas`;
          setTimeout(() => { b.dataset.listo = ''; b.textContent = 'Buscar y reparar'; }, 15000);
          return;
        }
        for (const h of hallados) {
          for (const j of h.cols) {
            const nuevo = h.r.formulas.map((fila) => [GC.repararFormula(fila[j])]);
            h.ws.getRangeByIndexes(h.r.rowIndex, h.r.columnIndex + j, nuevo.length, 1).formulas = nuevo;
          }
        }
        await ctx.sync();
        b.dataset.listo = ''; b.textContent = 'Buscar y reparar';
        $('hVinculos').textContent = `Listo: ${total} fórmulas ahora apuntan a este libro.`;
      });
      if (b.dataset.listo !== '1' && /Listo/.test($('hVinculos').textContent)) await cargar();
    });
  }

  async function aplicarListas() {
    await conBoton($('btnAplicarListas'), async () => {
      if (!Office.context.requirements.isSetSupported('ExcelApi', '1.8')) throw new Error('Tu versión de Excel no permite crear listas desde el complemento.');
      await guardarListas();
      const H = M.hojas.seguimiento, l = leerListasForm();
      const ultima = Math.max(H.fila0 + H.n + 1, 3000);
      const reglas = [[H.C.estado, l.estados], [H.C.proxima, l.acciones], [H.C.responsable, l.responsables]];
      await Excel.run(async (ctx) => {
        const ws = ctx.workbook.worksheets.getItem(H.nombre);
        for (const [c, vals] of reglas) {
          if (c < 0 || !vals.length) continue;
          const rg = ws.getRangeByIndexes(H.fila0 + 1, H.col0 + c, ultima - H.fila0 - 1, 1);
          rg.dataValidation.clear();
          rg.dataValidation.rule = { list: { inCellDropDown: true, source: vals.join(',').slice(0, 255) } };
          rg.dataValidation.errorAlert = { showAlert: true, style: Excel.DataValidationAlertStyle.warning, title: 'Valor fuera de la lista', message: 'Puedes continuar o elegir un valor de la lista.' };
        }
        await ctx.sync();
      });
      llenarListas();
      estado('Listas aplicadas en ' + H.nombre + '.', 'ok');
    });
  }

  // ---------------- eventos ----------------
  function eventos() {
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    $('btnRecargar').addEventListener('click', () => cargar().catch((e) => estado('Error: ' + e.message, 'err')));
    let t = null;
    $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => renderResultados(M ? GC.buscar(M, $('q').value) : []), 150); });
    $('q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const r = M && GC.buscar(M, $('q').value, 1)[0]; if (r) { mostrar(r); $('resultados').innerHTML = ''; } }
    });
    $('resultados').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      mostrar(M.porId.get(li.dataset.id)); $('resultados').innerHTML = ''; $('q').value = '';
    });
    $('pLista').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      const r = M.porId.get(li.dataset.id); mostrar(r); tab('contacto');
      const s = M.seg.get(r.id); if (s) irA(M.hojas.seguimiento.nombre, s.fila, M.hojas.seguimiento.col0 + M.hojas.seguimiento.C.fecha).catch(() => {});
    });
    $('pMes').addEventListener('change', renderPendientes);
    $('pCompro').addEventListener('change', renderPendientes);
    $('vLista').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-fila]');
      if (li) {
        if (M.porId.get(li.dataset.id)) mostrar(M.porId.get(li.dataset.id));
        if (li.dataset.hoja) irA(li.dataset.hoja, +li.dataset.fila).catch(() => {});
        return;
      }
      const cab = e.target.closest('.cab'); if (!cab) return;
      const ul = cab.parentElement.querySelector('ul'); if (ul) ul.hidden = !ul.hidden;
    });
    $('btnIrReg').addEventListener('click', () => actual && irA(M.hojas.registros.nombre, actual.fila, M.hojas.registros.col0 + M.hojas.registros.C.id));
    $('btnIrSeg').addEventListener('click', () => { const s = actual && M.seg.get(actual.id); if (s) irA(M.hojas.seguimiento.nombre, s.fila, M.hojas.seguimiento.col0 + M.hojas.seguimiento.C.fecha); });
    $('btnHoy').addEventListener('click', () => { $('sFecha').value = hoyISO(); });
    $('formSeg').addEventListener('submit', guardar);
    $('btnLimpiar').addEventListener('click', limpiar);
    $('btnAgregarFila').addEventListener('click', agregarFilas);
    $('btnCruce').addEventListener('click', actualizarCruce);
    $('btnVinculos').addEventListener('click', vinculos);
    $('btnGuardarListas').addEventListener('click', () => conBoton($('btnGuardarListas'), async () => { await guardarListas(); llenarListas(); estado('Listas guardadas en el libro.', 'ok'); }));
    $('btnAplicarListas').addEventListener('click', aplicarListas);
    $('lnkApp').href = location.origin + '/';
  }

  Office.onReady((info) => {
    eventos();
    if (info.host !== Office.HostType.Excel) { estado('Este complemento funciona en Excel.', 'err'); return; }
    if (!Office.context.requirements.isSetSupported('ExcelApi', '1.7')) { estado('Necesitas Excel de Microsoft 365, Excel 2021 o Excel en la web.', 'err'); return; }
    try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSeleccion); } catch (e) { console.warn(e); }
    cargar().catch((e) => { console.error(e); estado('No se pudo leer el libro: ' + e.message, 'err'); });
  });
})();
