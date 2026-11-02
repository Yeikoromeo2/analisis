import { q, one } from './db';

/** Filtros especiales usados desde la página de Verificación. */
export const FILTROS: Record<string, { titulo: string; sql: string }> = {
  ruc_invalido: { titulo: 'RUC con longitud distinta de 11', sql: `ruc IS NOT NULL AND length(regexp_replace(ruc,'\\D','','g')) <> 11` },
  ruc_vacio: { titulo: 'Sin RUC', sql: `ruc IS NULL` },
  ruc_duplicado: { titulo: 'RUC repetido en otro registro', sql: `ruc IN (SELECT ruc FROM registros WHERE ruc IS NOT NULL GROUP BY ruc HAVING count(*) > 1)` },
  sin_contacto: { titulo: 'Sin nombre de contacto', sql: `contacto IS NULL` },
  sin_celular: { titulo: 'Sin celular', sql: `celular IS NULL` },
  celular_invalido: { titulo: 'Celular con formato dudoso', sql: `celular IS NOT NULL AND regexp_replace(celular,'\\D','','g') !~ '^(51)?9\\d{8}$'` },
  sin_correo: { titulo: 'Sin correo', sql: `correo IS NULL` },
  correo_invalido: { titulo: 'Correo con formato inválido', sql: `correo IS NOT NULL AND correo !~* '^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$'` },
  sin_ciudad: { titulo: 'Sin ciudad', sql: `ciudad IS NULL` },
  nombre_distinto: { titulo: 'Razón social distinta a la de BASE', sql: `base_id IS NOT NULL AND base_nombre IS NOT NULL AND nombre_norm <> regexp_replace(upper(translate(base_nombre,'áéíóúÁÉÍÓÚñÑüÜ','aeiouAEIOUnNuU')),'[^A-Z0-9]','','g')` },
  pendiente: { titulo: 'Pendientes de contactar', sql: `total_seguimientos = 0` },
  contactado: { titulo: 'Contactados', sql: `total_seguimientos > 0` },
  sin_responsable: { titulo: 'Último contacto sin responsable', sql: `total_seguimientos > 0 AND responsable IS NULL` },
  accion_vencida: { titulo: 'Próxima acción vencida', sql: `fecha_proxima IS NOT NULL AND fecha_proxima <= (now() AT TIME ZONE 'America/Lima')::date` },
  compro_sin_contacto: { titulo: 'Compraron y no tienen seguimiento', sql: `compra > 0 AND total_seguimientos = 0` },
};

export type FiltrosRegistros = {
  q?: string; mes?: string; cruce?: string; compro?: string; estado?: string;
  responsable?: string; ejecutivo?: string; filtro?: string; page?: string;
};

export const POR_PAGINA = 50;

export function whereRegistros(f: FiltrosRegistros) {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('$?', `$${p.length}`)); };
  if (f.q?.trim()) {
    const t = `%${f.q.trim()}%`;
    p.push(t);
    const i = p.length;
    w.push(`(id_trax ILIKE $${i} OR nombre ILIKE $${i} OR ruc ILIKE $${i} OR contacto ILIKE $${i} OR correo ILIKE $${i} OR celular ILIKE $${i})`);
  }
  if (f.mes) add(`mes = $?`, f.mes);
  if (f.cruce) add(`cruce = $?`, f.cruce);
  if (f.compro === 'si') w.push(`compra > 0`);
  if (f.compro === 'no') w.push(`coalesce(compra,0) <= 0`);
  if (f.estado === '__sin') w.push(`estado IS NULL`);
  else if (f.estado) add(`estado = $?`, f.estado);
  if (f.responsable) add(`responsable = $?`, f.responsable);
  if (f.ejecutivo) add(`ejecutivo = $?`, f.ejecutivo);
  if (f.filtro && FILTROS[f.filtro]) w.push(`(${FILTROS[f.filtro].sql})`);
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', params: p };
}

export async function listarRegistros(f: FiltrosRegistros) {
  const { where, params } = whereRegistros(f);
  const page = Math.max(1, Number(f.page) || 1);
  const tot = await one<{ n: number; monto: number }>(`SELECT count(*)::int n, coalesce(sum(compra),0) monto FROM v_registros ${where}`, params);
  const rows = await q(
    `SELECT * FROM v_registros ${where} ORDER BY fecha_creacion DESC NULLS LAST, id_trax DESC LIMIT ${POR_PAGINA} OFFSET ${(page - 1) * POR_PAGINA}`,
    params,
  );
  return { rows, total: tot?.n ?? 0, monto: tot?.monto ?? 0, page };
}

export async function catalogo(tipo: string): Promise<string[]> {
  return (await q<{ valor: string }>(`SELECT valor FROM catalogos WHERE tipo = $1 ORDER BY orden, valor`, [tipo])).map((r) => r.valor);
}

export async function opcionesFiltros() {
  const [meses, ejecutivos, responsables, estados] = await Promise.all([
    q<{ mes: string }>(`SELECT mes FROM registros WHERE mes IS NOT NULL GROUP BY mes ORDER BY min(fecha_creacion)`),
    q<{ v: string }>(`SELECT DISTINCT ejecutivo v FROM registros WHERE ejecutivo IS NOT NULL ORDER BY 1`),
    q<{ v: string }>(`SELECT valor v FROM catalogos WHERE tipo='responsable' UNION SELECT DISTINCT responsable FROM seguimientos WHERE responsable IS NOT NULL ORDER BY 1`),
    q<{ v: string }>(`SELECT valor v FROM catalogos WHERE tipo='estado' UNION SELECT DISTINCT estado FROM seguimientos WHERE estado IS NOT NULL ORDER BY 1`),
  ]);
  return {
    meses: meses.map((r) => r.mes),
    ejecutivos: ejecutivos.map((r) => r.v),
    responsables: responsables.map((r) => r.v),
    estados: estados.map((r) => r.v),
  };
}

export const CRUCES = ['ID', 'ID + ID CSP', 'ID CSP', 'RAZÓN SOCIAL', 'RAZÓN SOCIAL AMBIGUA', 'NO ENCONTRADO'];
