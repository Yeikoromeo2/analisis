/* Lógica del complemento (sin dependencias de Office): lectura de pestañas por encabezados,
   cruce con BASE, búsqueda, pendientes y verificación. Funciona en el navegador (window.GC) y en Node. */
(function (root) {
  'use strict';

  const normHeader = (s) =>
    String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const normNombre = (s) =>
    String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normId = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
  const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const esError = (v) => typeof v === 'string' && /^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NULL!|NUM!|SPILL!|CALC!|BUSY!)/.test(v);
  const txt = (v) => (vacio(v) || esError(v) ? '' : String(v).trim());
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null));

  // ---------- fechas Excel ----------
  const serialAFecha = (s) => new Date(Math.round((s - 25569) * 86400000));
  const pad = (n) => String(n).padStart(2, '0');
  function fechaTexto(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = serialAFecha(v);
      return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    }
    return txt(v);
  }
  function fechaISO(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = serialAFecha(v);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : '';
  }
  function isoASerial(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : null;
  }

  // ---------- columnas ----------
  function letra(i) { // 0 → A
    let s = ''; i += 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function mapaEncabezados(fila) {
    const m = new Map();
    (fila || []).forEach((h, i) => { const k = normHeader(h); if (k && !m.has(k)) m.set(k, i); });
    return m;
  }
  function col(hdr, ...nombres) {
    for (const n of nombres) {
      const k = normHeader(n);
      if (hdr.has(k)) return hdr.get(k);
    }
    for (const n of nombres) { // coincidencia por prefijo ("COMPRAS EN EL AÑO ($$)")
      const k = normHeader(n);
      for (const [h, i] of hdr) if (h.startsWith(k)) return i;
    }
    return -1;
  }
  function tipoHoja(hdr) {
    if (col(hdr, 'CUSTOMER ID') >= 0 && col(hdr, 'TOTAL GENERAL') >= 0) return 'base';
    if (col(hdr, 'ID DE TRAX') >= 0 && col(hdr, 'NOMBRE DE LA CUENTA') >= 0) return 'registros';
    if (col(hdr, 'ID TRAX') >= 0 && col(hdr, 'FECHA CONTACTO') >= 0) return 'seguimiento';
    return null;
  }

  /**
   * hojas: [{ nombre, values: any[][], fila0: índice (0) de la primera fila del rango, col0 }]
   * Devuelve el modelo con índices para buscar y escribir.
   */
  function construirModelo(hojas) {
    const M = { hojas: {}, avisos: [], registros: [], porId: new Map(), base: new Map(), basePorNombre: new Map(), seg: new Map(), segFilas: [] };
    for (const h of hojas) {
      if (!h.values || !h.values.length) continue;
      const hdr = mapaEncabezados(h.values[0]);
      const t = tipoHoja(hdr);
      if (!t) continue;
      if (M.hojas[t]) { M.avisos.push(`Hay más de una pestaña de tipo ${t}; se usa "${M.hojas[t].nombre}".`); continue; }
      M.hojas[t] = { nombre: h.nombre, hdr, encabezados: h.values[0], fila0: h.fila0 || 0, col0: h.col0 || 0, n: h.values.length - 1 };
      const fila = (i) => (h.fila0 || 0) + i + 1; // número de fila Excel (1 = primera)
      const c = (...n) => { const i = col(hdr, ...n); return i; };
      const g = (row, i) => (i >= 0 ? row[i] : '');

      if (t === 'base') {
        const cId = c('CUSTOMER ID'), cNom = c('CUSTOMER NAME'), cTot = c('TOTAL GENERAL');
        const meses = [...hdr.entries()].filter(([k]) => /^M\d{2}$/.test(k)).map(([k, i]) => [k, i]);
        M.hojas.base.meses = meses.map((m) => m[0]);
        let errores = 0;
        for (let i = 1; i < h.values.length; i++) {
          const r = h.values[i];
          const id = normId(g(r, cId));
          if (!id || id === 'TOTALGENERAL') continue;
          const mv = {};
          for (const [k, ci] of meses) { if (esError(r[ci])) errores++; const n = num(r[ci]); if (n !== null) mv[k] = n; }
          const b = { id, nombre: txt(g(r, cNom)), total: num(g(r, cTot)) || 0, meses: mv, fila: fila(i) };
          M.base.set(id, b);
          const nn = normNombre(b.nombre);
          if (nn) { if (!M.basePorNombre.has(nn)) M.basePorNombre.set(nn, []); M.basePorNombre.get(nn).push(id); }
        }
        M.hojas.base.errores = errores;
      }

      if (t === 'registros') {
        const C = {
          id: c('ID DE TRAX'), nombre: c('NOMBRE DE LA CUENTA'), ruc: c('RUC'), provid: c('PROVID'), contacto: c('CONTACTO'),
          celular: c('CELULAR'), correo: c('CORREO'), ciudad: c('CIUDAD'), ejecutivo: c('EJECUTIVO'), mes: c('MES'),
          fecha: c('FECHA DE CREACION'), compra: c('COMPRAS EN EL AÑO', 'COMPRAS'), cruce: c('CRUCE BASE'),
        };
        M.hojas.registros.C = C;
        for (let i = 1; i < h.values.length; i++) {
          const r = h.values[i];
          const id = normId(g(r, C.id));
          if (!id) continue;
          const reg = {
            id, fila: fila(i), nombre: txt(g(r, C.nombre)), ruc: txt(g(r, C.ruc)), provid: txt(g(r, C.provid)),
            contacto: txt(g(r, C.contacto)), celular: txt(g(r, C.celular)), correo: txt(g(r, C.correo)),
            ciudad: txt(g(r, C.ciudad)), ejecutivo: txt(g(r, C.ejecutivo)), mes: txt(g(r, C.mes)).toUpperCase(),
            fecha: fechaTexto(g(r, C.fecha)), compraHoja: num(g(r, C.compra)),
          };
          if (M.porId.has(id)) reg.duplicado = true;
          M.registros.push(reg);
          if (!M.porId.has(id)) M.porId.set(id, reg);
        }
      }

      if (t === 'seguimiento') {
        const C = {
          id: c('ID TRAX', 'ID DE TRAX'), fecha: c('FECHA CONTACTO'), responsable: c('RESPONSABLE'),
          estado: c('ESTADO CONTACTO', 'ESTADO'), proxima: c('PROXIMA ACCION'), fechaProxima: c('FECHA PROXIMA ACCION'),
          observacion: c('OBSERVACION', 'OBSERVACIONES'),
        };
        M.hojas.seguimiento.C = C;
        for (let i = 1; i < h.values.length; i++) {
          const r = h.values[i];
          const id = normId(g(r, C.id));
          if (!id || id === '0') continue;
          const s = {
            id, fila: fila(i), fecha: g(r, C.fecha), responsable: txt(g(r, C.responsable)), estado: txt(g(r, C.estado)),
            proxima: txt(g(r, C.proxima)), fechaProxima: g(r, C.fechaProxima), observacion: txt(g(r, C.observacion)),
          };
          M.segFilas.push(s);
          if (!M.seg.has(id)) M.seg.set(id, s);
        }
        M.hojas.seguimiento.ultimaFila = (h.fila0 || 0) + h.values.length;
      }
    }
    for (const r of M.registros) Object.assign(r, cruce(M, r.id, r.nombre));
    return M;
  }

  /** Cruce con BASE: ID → ID+CSP → razón social única. */
  function cruce(M, id, nombre) {
    const b1 = M.base.get(id), b2 = M.base.get(id + 'CSP');
    if (b1 || b2) {
      return { cruce: b1 && b2 ? 'ID + ID CSP' : b1 ? 'ID' : 'ID CSP', compra: (b1 ? b1.total : 0) + (b2 ? b2.total : 0), lineas: [b1, b2].filter(Boolean) };
    }
    const ids = M.basePorNombre.get(normNombre(nombre)) || [];
    if (ids.length === 1) { const b = M.base.get(ids[0]); return { cruce: 'RAZÓN SOCIAL', compra: b.total, lineas: [b] }; }
    if (ids.length > 1) return { cruce: 'RAZÓN SOCIAL AMBIGUA', compra: null, lineas: ids.map((x) => M.base.get(x)) };
    return { cruce: 'NO ENCONTRADO', compra: null, lineas: [] };
  }

  function buscar(M, texto, max = 25) {
    const t = String(texto || '').trim();
    if (!t) return [];
    const tu = t.toUpperCase(), tn = normNombre(t), digitos = t.replace(/\D/g, '');
    const out = [];
    for (const r of M.registros) {
      if (r.duplicado) continue;
      const hit = r.id.includes(tu.replace(/\s+/g, '')) ||
        (digitos.length >= 4 && (r.ruc.includes(digitos) || r.celular.replace(/\D/g, '').includes(digitos))) ||
        (tn.length >= 3 && (normNombre(r.nombre).includes(tn) || normNombre(r.contacto).includes(tn))) ||
        (t.includes('@') && r.correo.toLowerCase().includes(t.toLowerCase()));
      if (hit) { out.push(r); if (out.length >= max) break; }
    }
    return out;
  }

  function pendientes(M, f = {}) {
    return M.registros.filter((r) => {
      if (r.duplicado) return false;
      const s = M.seg.get(r.id);
      if (s && !vacio(s.fecha)) return false;
      if (f.mes && r.mes !== f.mes) return false;
      if (f.compro === 'si' && !(r.compra > 0)) return false;
      if (f.compro === 'no' && r.compra > 0) return false;
      return true;
    });
  }

  const reCel = /^(51)?9\d{8}$/;
  const reCorreo = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

  /** Controles por pestaña. Cada control trae la lista de filas afectadas para poder ir a ellas. */
  function verificar(M) {
    const R = M.registros.filter((r) => !r.duplicado);
    const C = [];
    const add = (grupo, control, items, nivel, nota, hoja) =>
      C.push({ grupo, control, valor: Array.isArray(items) ? items.length : items, items: Array.isArray(items) ? items : null, nivel, nota, hoja });
    const lvl = (n, malo = 'aviso') => (n ? malo : 'ok');
    const it = (r, extra) => ({ id: r.id, fila: r.fila, texto: `${r.id} · ${r.nombre}${extra ? ' · ' + extra : ''}` });
    const hr = M.hojas.registros ? M.hojas.registros.nombre : '';

    if (!M.hojas.registros) C.push({ grupo: 'GENERAL', control: 'No se encontró la pestaña de NUEVOS REGISTROS', valor: 1, nivel: 'error' });
    if (!M.hojas.base) C.push({ grupo: 'GENERAL', control: 'No se encontró la pestaña BASE', valor: 1, nivel: 'error' });
    if (!M.hojas.seguimiento) C.push({ grupo: 'GENERAL', control: 'No se encontró la pestaña SEGUIMIENTO SEMANAL', valor: 1, nivel: 'error' });

    if (M.hojas.registros) {
      add('NUEVOS REGISTROS', 'Registros', R.length, 'info');
      const dup = M.registros.filter((r) => r.duplicado);
      add('NUEVOS REGISTROS', 'ID TRAX duplicados', dup.map((r) => it(r)), lvl(dup.length, 'error'), '', hr);
      const porRuc = new Map();
      R.forEach((r) => { if (r.ruc) porRuc.set(r.ruc, (porRuc.get(r.ruc) || 0) + 1); });
      const rucDup = R.filter((r) => r.ruc && porRuc.get(r.ruc) > 1);
      add('NUEVOS REGISTROS', 'RUC repetido en otro registro', rucDup.map((r) => it(r, 'RUC ' + r.ruc)), lvl(rucDup.length, 'error'), '', hr);
      const rucMal = R.filter((r) => r.ruc && r.ruc.replace(/\D/g, '').length !== 11);
      add('NUEVOS REGISTROS', 'RUC con longitud distinta de 11', rucMal.map((r) => it(r, 'RUC ' + r.ruc)), lvl(rucMal.length), 'Los del extranjero pueden ser distintos', hr);
      for (const [k, t] of [['contacto', 'Sin contacto'], ['celular', 'Sin celular'], ['correo', 'Sin correo'], ['ciudad', 'Sin ciudad']]) {
        const x = R.filter((r) => !r[k]);
        add('NUEVOS REGISTROS', t, x.map((r) => it(r)), lvl(x.length), '', hr);
      }
      const celMal = R.filter((r) => r.celular && !reCel.test(r.celular.replace(/\D/g, '')));
      add('NUEVOS REGISTROS', 'Celular con formato dudoso', celMal.map((r) => it(r, r.celular)), lvl(celMal.length), '9 dígitos que empiezan en 9 (con o sin 51)', hr);
      const corMal = R.filter((r) => r.correo && !reCorreo.test(r.correo));
      add('NUEVOS REGISTROS', 'Correo con formato inválido', corMal.map((r) => it(r, r.correo)), lvl(corMal.length), '', hr);
    }
    if (M.hojas.registros && M.hojas.base) {
      for (const k of ['ID', 'ID + ID CSP', 'ID CSP', 'RAZÓN SOCIAL', 'RAZÓN SOCIAL AMBIGUA', 'NO ENCONTRADO']) {
        const x = R.filter((r) => r.cruce === k);
        const nivel = k === 'RAZÓN SOCIAL AMBIGUA' ? lvl(x.length, 'error') : k === 'RAZÓN SOCIAL' ? lvl(x.length) : 'info';
        const nota = { 'ID CSP': 'Un BUSCARV exacto no los encuentra', 'ID + ID CSP': 'Se suman ambas líneas', 'RAZÓN SOCIAL': 'El ID no está en BASE: confirmar', 'RAZÓN SOCIAL AMBIGUA': 'Nombre repetido en BASE' }[k];
        add('CRUCE CON BASE', `Cruce: ${k}`, x.map((r) => it(r, r.compra > 0 ? '$' + r.compra.toFixed(2) : '')), nivel, nota, hr);
      }
      const dist = R.filter((r) => r.cruce === 'ID' && normNombre(r.nombre) !== normNombre(M.base.get(r.id).nombre));
      add('CRUCE CON BASE', 'Razón social distinta a BASE (mismo ID)', dist.map((r) => it(r, 'BASE: ' + M.base.get(r.id).nombre)), lvl(dist.length), '', hr);
      const compraron = R.filter((r) => r.compra > 0);
      add('CRUCE CON BASE', 'Compraron', compraron.length, 'info');
      C.push({ grupo: 'CRUCE CON BASE', control: 'Efectividad', valor: R.length ? compraron.length / R.length : 0, formato: 'pct', nivel: 'info' });
      C.push({ grupo: 'CRUCE CON BASE', control: 'Monto comprado', valor: compraron.reduce((a, r) => a + r.compra, 0), formato: 'money', nivel: 'info' });
      const C2 = M.hojas.registros.C;
      if (C2.compra >= 0) {
        const difer = R.filter((r) => Math.abs((r.compraHoja || 0) - (r.compra || 0)) > 0.01);
        add('CRUCE CON BASE', 'Columna de compras desactualizada', difer.map((r) => it(r, `hoja ${r.compraHoja || 0} vs BASE ${(r.compra || 0).toFixed(2)}`)), lvl(difer.length), 'Usa Herramientas → Actualizar compras y cruce', hr);
      }
    }
    if (M.hojas.base) {
      add('BASE', 'Clientes en BASE', M.base.size, 'info');
      add('BASE', 'Celdas con error (#N/A) en meses', M.hojas.base.errores, lvl(M.hojas.base.errores), 'El Total general sí las incluye');
    }
    if (M.hojas.seguimiento) {
      const hs = M.hojas.seguimiento.nombre;
      const its = (s) => { const r = M.porId.get(s.id); return { id: s.id, fila: s.fila, texto: `${s.id} · ${r ? r.nombre : '(no está en NUEVOS)'}`, hoja: hs }; };
      const contactados = M.segFilas.filter((s) => !vacio(s.fecha));
      add('SEGUIMIENTO', 'Contactados', contactados.length, 'info');
      if (M.hojas.registros) {
        const sinFila = R.filter((r) => !M.seg.has(r.id));
        add('SEGUIMIENTO', 'Registros sin fila en SEGUIMIENTO', sinFila.map((r) => it(r)), lvl(sinFila.length), 'Se puede agregar la fila desde el panel', hr);
        const huerf = M.segFilas.filter((s) => !M.porId.has(s.id));
        add('SEGUIMIENTO', 'Filas cuyo ID no está en NUEVOS', huerf.map(its), lvl(huerf.length), '', hs);
        add('SEGUIMIENTO', 'Pendientes de contactar', pendientes(M).length, 'info');
      }
      const sinResp = contactados.filter((s) => !s.responsable);
      add('SEGUIMIENTO', 'Contactado sin RESPONSABLE', sinResp.map(its), lvl(sinResp.length, 'error'), '', hs);
      const sinEstado = contactados.filter((s) => !s.estado);
      add('SEGUIMIENTO', 'Contactado sin ESTADO', sinEstado.map(its), lvl(sinEstado.length), '', hs);
      const datosSinFecha = M.segFilas.filter((s) => vacio(s.fecha) && (s.responsable || s.estado || s.observacion));
      add('SEGUIMIENTO', 'Con datos pero sin FECHA CONTACTO', datosSinFecha.map(its), lvl(datosSinFecha.length), '', hs);
    }
    return C;
  }

  /** Quita referencias a otro libro: ='C:\...\[analisis.xlsx]HOJA'!D2 → ='HOJA'!D2 ; [1]HOJA!D2 → HOJA!D2 */
  function repararFormula(f) {
    if (typeof f !== 'string' || f[0] !== '=') return f;
    return f
      .replace(/'(?:[^'\[]*)\[[^\]]+\]([^']+)'!/g, "'$1'!")
      .replace(/(^|[^A-Za-z0-9_'])\[[^\]]+\]([A-Za-z0-9_.]+)!/g, '$1$2!');
  }
  const tieneVinculoExterno = (f) => typeof f === 'string' && f[0] === '=' && /\[[^\]]+\][^!]*!/.test(f);

  /** Columna donde va "CRUCE BASE": la existente, o la primera sin encabezado a la derecha de la de compras. */
  function columnaCruce(M) {
    const H = M.hojas.registros;
    const c = col(H.hdr, 'CRUCE BASE');
    if (c >= 0) return { col: c, nueva: false };
    const enc = H.encabezados || [];
    for (let i = Math.max(0, H.C.compra) + 1; i < enc.length; i++) if (vacio(enc[i])) return { col: i, nueva: true };
    return { col: enc.length, nueva: true };
  }

  /** Fórmulas de compra y cruce para la pestaña de registros (se recalculan solas en Excel). */
  function formulasCruce(M, cCruce) {
    const H = M.hojas.registros, B = M.hojas.base;
    const q = (n) => `'${n.replace(/'/g, "''")}'`;
    const bId = `${q(B.nombre)}!$${letra(B.col0 + col(B.hdr, 'CUSTOMER ID'))}:$${letra(B.col0 + col(B.hdr, 'CUSTOMER ID'))}`;
    const bNom = `${q(B.nombre)}!$${letra(B.col0 + col(B.hdr, 'CUSTOMER NAME'))}:$${letra(B.col0 + col(B.hdr, 'CUSTOMER NAME'))}`;
    const bTot = `${q(B.nombre)}!$${letra(B.col0 + col(B.hdr, 'TOTAL GENERAL'))}:$${letra(B.col0 + col(B.hdr, 'TOTAL GENERAL'))}`;
    const D = letra(H.col0 + H.C.id), E = letra(H.col0 + H.C.nombre), Q = letra(H.col0 + cCruce);
    const filas = [];
    for (let i = 1; i <= H.n; i++) {
      const r = H.fila0 + i + 1;
      filas.push({
        fila: r,
        cruce: `=IF(${D}${r}="","",IF(COUNTIF(${bId},${D}${r})>0,IF(COUNTIF(${bId},${D}${r}&"CSP")>0,"ID + ID CSP","ID"),IF(COUNTIF(${bId},${D}${r}&"CSP")>0,"ID CSP",IF(COUNTIF(${bNom},${E}${r})=1,"RAZÓN SOCIAL",IF(COUNTIF(${bNom},${E}${r})>1,"RAZÓN SOCIAL AMBIGUA","NO ENCONTRADO")))))`,
        compra: `=IF(OR(${Q}${r}="",${Q}${r}="NO ENCONTRADO",${Q}${r}="RAZÓN SOCIAL AMBIGUA"),"",IF(${Q}${r}="RAZÓN SOCIAL",SUMIF(${bNom},${E}${r},${bTot}),SUMIF(${bId},${D}${r},${bTot})+SUMIF(${bId},${D}${r}&"CSP",${bTot})))`,
      });
    }
    return filas;
  }

  const api = {
    normHeader, normNombre, normId, vacio, txt, num, letra, col, mapaEncabezados, tipoHoja,
    construirModelo, cruce, columnaCruce, buscar, pendientes, verificar, repararFormula, tieneVinculoExterno, formulasCruce,
    fechaTexto, fechaISO, isoASerial,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GC = api;
})(typeof window !== 'undefined' ? window : globalThis);
