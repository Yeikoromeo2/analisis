import ExcelJS from 'exceljs';
import { tx } from './db';

export type ResumenImportacion = {
  hojas: { nombre: string; tipo: string; filas: number }[];
  base?: { clientes: number; modo: string };
  registros?: { nuevos: number; actualizados: number; duplicadosEnArchivo: string[] };
  seguimientos?: { agregados: number; omitidos: number };
  avisos: string[];
};

const normHeader = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

/** Devuelve el valor "real" de una celda de ExcelJS (resultado de fórmula, texto enriquecido, etc.). */
function valor(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as any;
    if ('error' in o) return null;
    if ('richText' in o) return o.richText.map((t: any) => t.text).join('');
    if ('formula' in o || 'sharedFormula' in o) {
      const f = String(o.formula ?? '');
      // Celular escrito como fórmula: =51+991843457 → 991843457
      const m = f.match(/^\+?51\+(\d{9})$/);
      if (m) return m[1];
      return o.result === undefined ? null : valor(o.result);
    }
    if ('text' in o) return o.text;
    if ('result' in o) return valor(o.result);
    return null;
  }
  return v;
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = (typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v)).trim();
  return s === '' ? null : s;
};
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** Excel guarda la hora "de pared"; ExcelJS la entrega como UTC. Se conserva tal cual. */
const fechaHora = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}:00`;
    const iso = v.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (iso) return `${iso[1]} ${iso[2] ?? '00:00'}:00`;
  }
  return null;
};
const soloFecha = (v: unknown) => fechaHora(v)?.slice(0, 10) ?? null;

type Hoja = { nombre: string; headers: Map<string, number>; filas: unknown[][] };

function leerHoja(ws: ExcelJS.Worksheet): Hoja {
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = normHeader(valor(cell.value));
    if (h && !headers.has(h)) headers.set(h, col);
  });
  const filas: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col] = valor(cell.value); });
    filas.push(vals);
  });
  return { nombre: ws.name, headers, filas };
}

function col(h: Hoja, ...nombres: string[]): number | undefined {
  for (const n of nombres) {
    const c = h.headers.get(normHeader(n));
    if (c) return c;
  }
  return undefined;
}

function tipoHoja(h: Hoja): 'base' | 'registros' | 'seguimiento' | null {
  if (col(h, 'CUSTOMER ID') && col(h, 'TOTAL GENERAL', 'TOTAL')) return 'base';
  if (col(h, 'ID DE TRAX') && col(h, 'NOMBRE DE LA CUENTA')) return 'registros';
  if (col(h, 'ID TRAX', 'ID DE TRAX') && col(h, 'FECHA CONTACTO')) return 'seguimiento';
  return null;
}

export async function importarExcel(buf: ArrayBuffer, opciones: { reemplazarBase: boolean }): Promise<ResumenImportacion> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const resumen: ResumenImportacion = { hojas: [], avisos: [] };
  const hojas: Record<string, Hoja[]> = { base: [], registros: [], seguimiento: [] };

  wb.eachSheet((ws) => {
    const h = leerHoja(ws);
    const t = tipoHoja(h);
    resumen.hojas.push({ nombre: ws.name, tipo: t ?? 'no reconocida', filas: h.filas.length });
    if (t) hojas[t].push(h);
  });
  if (!hojas.base.length && !hojas.registros.length && !hojas.seguimiento.length) {
    throw new Error('No se reconoció ninguna pestaña. Se esperan encabezados como "ID DE TRAX", "Customer ID" o "FECHA CONTACTO" en la fila 1.');
  }

  await tx(async (c) => {
    // ---------- BASE ----------
    for (const h of hojas.base) {
      const cId = col(h, 'CUSTOMER ID')!, cNom = col(h, 'CUSTOMER NAME', 'NOMBRE');
      const cTot = col(h, 'TOTAL GENERAL', 'TOTAL')!;
      const meses = [...h.headers.entries()].filter(([k]) => /^M\d{2}$/.test(k));
      const ids: string[] = [], noms: (string | null)[] = [], mesesJson: string[] = [], tots: number[] = [];
      const vistos = new Set<string>();
      for (const f of h.filas) {
        const id = texto(f[cId])?.replace(/\s+/g, '').toUpperCase();
        if (!id || id === 'TOTALGENERAL' || vistos.has(id)) continue;
        vistos.add(id);
        const m: Record<string, number> = {};
        let suma = 0;
        for (const [k, ci] of meses) {
          const n = numero(f[ci]);
          if (n !== null) { m[k] = n; suma += n; }
        }
        const tot = numero(f[cTot]) ?? suma;
        // Mes perdido (#N/A) pero incluido en el total: se reconstruye la diferencia en el último mes.
        const ultimo = meses.length ? meses[meses.length - 1][0] : null;
        if (ultimo && m[ultimo] === undefined && Math.abs(tot - suma) > 0.005) m[ultimo] = Math.round((tot - suma) * 100) / 100;
        ids.push(id); noms.push(cNom ? texto(f[cNom]) : null); mesesJson.push(JSON.stringify(m)); tots.push(tot);
      }
      if (opciones.reemplazarBase) await c.query('DELETE FROM base_clientes');
      await c.query(
        `INSERT INTO base_clientes (customer_id, nombre, meses, total, actualizado)
         SELECT * , now() FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::numeric[])
         ON CONFLICT (customer_id) DO UPDATE SET nombre = EXCLUDED.nombre, meses = EXCLUDED.meses,
           total = EXCLUDED.total, actualizado = now()`,
        [ids, noms, mesesJson, tots],
      );
      resumen.base = { clientes: ids.length, modo: opciones.reemplazarBase ? 'reemplazada' : 'actualizada' };
    }

    // ---------- NUEVOS REGISTROS ----------
    for (const h of hojas.registros) {
      const C = {
        num: col(h, 'N°', 'N', 'NRO'), fecha: col(h, 'FECHA DE CREACION'), mes: col(h, 'MES'),
        id: col(h, 'ID DE TRAX')!, nombre: col(h, 'NOMBRE DE LA CUENTA')!, ruc: col(h, 'RUC'),
        provid: col(h, 'PROVID'), contacto: col(h, 'CONTACTO'), celular: col(h, 'CELULAR'),
        correo: col(h, 'CORREO'), ciudad: col(h, 'CIUDAD'), ejecutivo: col(h, 'EJECUTIVO'),
        ov: col(h, 'OV ABIERTA'), fact: col(h, 'FACTURACION'),
      };
      const get = (f: unknown[], ci?: number) => (ci ? f[ci] : null);
      const filas = new Map<string, any[]>();
      const dup: string[] = [];
      for (const f of h.filas) {
        const id = texto(f[C.id])?.replace(/\s+/g, '').toUpperCase();
        const nombre = texto(f[C.nombre]);
        if (!id || !nombre) continue;
        if (filas.has(id)) dup.push(id);
        filas.set(id, [
          id, numero(get(f, C.num)), fechaHora(get(f, C.fecha)), texto(get(f, C.mes))?.toUpperCase() ?? null, nombre,
          texto(get(f, C.ruc)), texto(get(f, C.provid)), texto(get(f, C.contacto)), texto(get(f, C.celular)),
          texto(get(f, C.correo))?.toLowerCase() ?? null, texto(get(f, C.ciudad)), texto(get(f, C.ejecutivo)),
          texto(get(f, C.ov)), texto(get(f, C.fact)),
        ]);
      }
      const rows = [...filas.values()];
      const colsArr = rows[0] ? rows[0].map((_, i) => rows.map((r) => r[i])) : Array.from({ length: 14 }, () => []);
      const res = await c.query(
        `INSERT INTO registros (id_trax, numero, fecha_creacion, mes, nombre, ruc, provid, contacto, celular, correo,
                                ciudad, ejecutivo, ov_abierta, facturacion)
         SELECT * FROM unnest($1::text[], $2::int[], $3::timestamp[], $4::text[], $5::text[], $6::text[], $7::text[],
                              $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])
         ON CONFLICT (id_trax) DO UPDATE SET
           numero = coalesce(EXCLUDED.numero, registros.numero),
           fecha_creacion = coalesce(EXCLUDED.fecha_creacion, registros.fecha_creacion),
           mes = coalesce(EXCLUDED.mes, registros.mes),
           nombre = EXCLUDED.nombre,
           ruc = coalesce(EXCLUDED.ruc, registros.ruc),
           provid = coalesce(EXCLUDED.provid, registros.provid),
           contacto = coalesce(EXCLUDED.contacto, registros.contacto),
           celular = coalesce(EXCLUDED.celular, registros.celular),
           correo = coalesce(EXCLUDED.correo, registros.correo),
           ciudad = coalesce(EXCLUDED.ciudad, registros.ciudad),
           ejecutivo = coalesce(EXCLUDED.ejecutivo, registros.ejecutivo),
           ov_abierta = coalesce(EXCLUDED.ov_abierta, registros.ov_abierta),
           facturacion = coalesce(EXCLUDED.facturacion, registros.facturacion),
           actualizado = now()
         RETURNING (xmax = 0) AS nuevo`,
        colsArr,
      );
      const nuevos = res.rows.filter((r) => r.nuevo).length;
      resumen.registros = { nuevos, actualizados: res.rows.length - nuevos, duplicadosEnArchivo: dup };
      if (dup.length) resumen.avisos.push(`${dup.length} ID TRAX repetidos dentro del archivo; se tomó la última fila: ${dup.slice(0, 10).join(', ')}`);
    }

    // ---------- SEGUIMIENTO (solo filas con FECHA CONTACTO) ----------
    for (const h of hojas.seguimiento) {
      const C = {
        id: col(h, 'ID TRAX', 'ID DE TRAX')!, fecha: col(h, 'FECHA CONTACTO')!, resp: col(h, 'RESPONSABLE'),
        estado: col(h, 'ESTADO CONTACTO', 'ESTADO'), prox: col(h, 'PROXIMA ACCION'), obs: col(h, 'OBSERVACION', 'OBSERVACIONES'),
      };
      const get = (f: unknown[], ci?: number) => (ci ? texto(f[ci]) : null);
      const a: (string | null)[][] = [[], [], [], [], [], []];
      for (const f of h.filas) {
        const id = texto(f[C.id])?.replace(/\s+/g, '').toUpperCase();
        const fe = soloFecha(f[C.fecha]);
        if (!id || !fe) continue;
        [id, fe, get(f, C.resp), get(f, C.estado), get(f, C.prox), get(f, C.obs)].forEach((v, i) => a[i].push(v));
      }
      const res = await c.query(
        `WITH t AS (SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::text[], $6::text[])
                    AS t(id_trax, fecha_contacto, responsable, estado, proxima_accion, observacion))
         INSERT INTO seguimientos (id_trax, fecha_contacto, responsable, estado, proxima_accion, observacion)
         SELECT t.* FROM t JOIN registros r ON r.id_trax = t.id_trax
         WHERE NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.id_trax = t.id_trax AND s.fecha_contacto = t.fecha_contacto
                           AND s.responsable IS NOT DISTINCT FROM t.responsable AND s.estado IS NOT DISTINCT FROM t.estado
                           AND s.observacion IS NOT DISTINCT FROM t.observacion)
         RETURNING id`,
        a,
      );
      const prev = resumen.seguimientos ?? { agregados: 0, omitidos: 0 };
      resumen.seguimientos = { agregados: prev.agregados + (res.rowCount ?? 0), omitidos: prev.omitidos + a[0].length - (res.rowCount ?? 0) };
    }
  });

  if (!hojas.base.length) resumen.avisos.push('El archivo no trae pestaña BASE: las compras se calculan con la BASE ya cargada.');
  return resumen;
}
