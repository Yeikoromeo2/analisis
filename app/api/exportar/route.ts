import ExcelJS from 'exceljs';
import { q } from '@/lib/db';
import { whereRegistros, type FiltrosRegistros } from '@/lib/consultas';
import { verificar } from '@/lib/verificacion';
import { hoyISO } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AZUL = 'FF1F4E78', NARANJA = 'FFED7D31';

/** Convierte 'YYYY-MM-DD[ HH:MM:SS]' a Date "de pared" (Excel no maneja zonas horarias). */
const xd = (v: unknown) => {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0))) : null;
};

type Col = { h: string; k: string; w: number; fmt?: string; manual?: boolean; v?: (r: any) => unknown };

function hoja(wb: ExcelJS.Workbook, nombre: string, cols: Col[], rows: any[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w, style: c.fmt ? { numFmt: c.fmt } : {} }));
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.k, c.v ? c.v(r) : r[c.k] ?? null])));
  const head = ws.getRow(1);
  head.height = 22;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.manual ? NARANJA : AZUL } };
    cell.alignment = { vertical: 'middle' };
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams) as FiltrosRegistros;
  const { where, params } = whereRegistros(sp);
  const [regs, hist, base, controles] = await Promise.all([
    q<any>(`SELECT * FROM v_registros ${where} ORDER BY numero NULLS LAST, fecha_creacion`, params),
    q<any>(`SELECT s.*, r.nombre FROM seguimientos s JOIN registros r USING (id_trax)
       WHERE s.id_trax IN (SELECT id_trax FROM v_registros ${where}) ORDER BY s.fecha_contacto, s.id`, params),
    q<any>(`SELECT * FROM base_clientes ORDER BY customer_id`),
    verificar(),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestión de Contactos';
  const MONEY = '"$"#,##0.00', DATE = 'dd/mm/yyyy', DT = 'dd/mm/yyyy hh:mm';

  hoja(wb, 'NUEVOS REGISTROS 2026', [
    { h: 'N°', k: 'numero', w: 7 },
    { h: 'FECHA DE CREACION', k: 'fecha_creacion', w: 18, fmt: DT, v: (r) => xd(r.fecha_creacion) },
    { h: 'MES', k: 'mes', w: 12 }, { h: 'ID DE TRAX', k: 'id_trax', w: 14 },
    { h: 'NOMBRE DE LA CUENTA', k: 'nombre', w: 45 }, { h: 'RUC', k: 'ruc', w: 14 }, { h: 'PROVID', k: 'provid', w: 14 },
    { h: 'CONTACTO', k: 'contacto', w: 32 }, { h: 'CELULAR', k: 'celular', w: 13 }, { h: 'CORREO', k: 'correo', w: 34 },
    { h: 'CIUDAD', k: 'ciudad', w: 16 },
    { h: 'COMPRAS EN EL AÑO ($$)', k: 'compra', w: 16, fmt: MONEY, v: (r) => (r.compra > 0 ? r.compra : null) },
    { h: 'EJECUTIVO', k: 'ejecutivo', w: 16 }, { h: 'OV ABIERTA', k: 'ov_abierta', w: 12 }, { h: 'FACTURACIÓN', k: 'facturacion', w: 14 },
    { h: 'CRUCE BASE', k: 'cruce', w: 20 },
  ], regs);

  hoja(wb, 'SEGUIMIENTO SEMANAL', [
    { h: 'ID TRAX', k: 'id_trax', w: 13 },
    { h: 'FECHA REGISTRO', k: 'fecha_creacion', w: 14, fmt: DATE, v: (r) => xd(r.fecha_creacion) },
    { h: 'SEMANA REGISTRO', k: 'semana_registro', w: 15, fmt: DATE, v: (r) => xd(r.semana_registro) },
    { h: 'CLIENTE', k: 'nombre', w: 40 }, { h: 'RUC', k: 'ruc', w: 14 }, { h: 'CONTACTO', k: 'contacto', w: 30 },
    { h: 'CELULAR', k: 'celular', w: 13 }, { h: 'CORREO', k: 'correo', w: 32 }, { h: 'CIUDAD', k: 'ciudad', w: 15 },
    { h: 'EJECUTIVO', k: 'ejecutivo', w: 15 }, { h: 'CRUCE BASE', k: 'cruce', w: 18 },
    { h: 'COMPRA $', k: 'compra', w: 13, fmt: MONEY, v: (r) => (r.compra > 0 ? r.compra : null) },
    { h: 'COMPRÓ', k: 'compro', w: 9, v: (r) => (r.compra > 0 ? 'SÍ' : 'NO') },
    { h: 'SEMANA CONTACTO', k: 'semana_contacto', w: 16, fmt: DATE, v: (r) => xd(r.semana_contacto) },
    { h: 'FECHA CONTACTO', k: 'fecha_contacto', w: 15, fmt: DATE, manual: true, v: (r) => xd(r.fecha_contacto) },
    { h: 'RESPONSABLE', k: 'responsable', w: 17, manual: true }, { h: 'ESTADO CONTACTO', k: 'estado', w: 18, manual: true },
    { h: 'PRÓXIMA ACCIÓN', k: 'proxima_accion', w: 20, manual: true },
    { h: 'FECHA PRÓXIMA ACCIÓN', k: 'fecha_proxima', w: 15, fmt: DATE, manual: true, v: (r) => xd(r.fecha_proxima) },
    { h: 'OBSERVACIÓN', k: 'observacion', w: 40, manual: true },
    { h: 'N° CONTACTOS', k: 'total_seguimientos', w: 12 },
  ], regs);

  hoja(wb, 'HISTORIAL SEGUIMIENTO', [
    { h: 'ID TRAX', k: 'id_trax', w: 13 }, { h: 'CLIENTE', k: 'nombre', w: 40 },
    { h: 'SEMANA CONTACTO', k: 'semana', w: 15, fmt: DATE, v: (r) => { const d = xd(r.fecha_contacto); if (!d) return null; d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; } },
    { h: 'FECHA CONTACTO', k: 'fecha_contacto', w: 15, fmt: DATE, manual: true, v: (r) => xd(r.fecha_contacto) },
    { h: 'RESPONSABLE', k: 'responsable', w: 17, manual: true }, { h: 'ESTADO CONTACTO', k: 'estado', w: 18, manual: true },
    { h: 'PRÓXIMA ACCIÓN', k: 'proxima_accion', w: 20, manual: true },
    { h: 'FECHA PRÓXIMA ACCIÓN', k: 'fecha_proxima', w: 15, fmt: DATE, manual: true, v: (r) => xd(r.fecha_proxima) },
    { h: 'OBSERVACIÓN', k: 'observacion', w: 50, manual: true },
  ], hist);

  const meses = [...new Set(base.flatMap((b) => Object.keys(b.meses ?? {})))].sort();
  hoja(wb, 'BASE', [
    { h: 'Customer ID', k: 'customer_id', w: 16 }, { h: 'Customer Name', k: 'nombre', w: 40 },
    ...meses.map((m) => ({ h: m, k: m, w: 12, fmt: '#,##0.00', v: (r: any) => r.meses?.[m] ?? null })),
    { h: 'Total general', k: 'total', w: 14, fmt: '#,##0.00' },
  ], base);

  hoja(wb, 'VERIFICACIÓN', [
    { h: 'PESTAÑA', k: 'grupo', w: 22 }, { h: 'CONTROL', k: 'control', w: 42 },
    { h: 'RESULTADO', k: 'valor', w: 14, v: (r) => (r.formato === 'pct' ? `${(r.valor * 100).toFixed(1)}%` : r.valor) },
    { h: 'ESTADO', k: 'nivel', w: 10, v: (r) => ({ ok: 'OK', aviso: 'REVISAR', error: 'CORREGIR', info: '' } as any)[r.nivel] },
    { h: 'NOTA', k: 'nota', w: 55 },
  ], controles);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="gestion-contactos-${hoyISO()}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
