import { one } from './db';
import { FILTROS } from './consultas';

export type Control = { grupo: string; control: string; valor: number; nota?: string; filtro?: string; nivel: 'ok' | 'aviso' | 'error' | 'info'; formato?: 'int' | 'pct' | 'money' };

export async function verificar(): Promise<Control[]> {
  const cnt = async (where: string) =>
    (await one<{ n: number }>(`SELECT count(*)::int n FROM v_registros WHERE ${where}`))?.n ?? 0;
  const r = await one<any>(`
    SELECT count(*)::int registros,
      count(*) FILTER (WHERE cruce='ID')::int c_id,
      count(*) FILTER (WHERE cruce='ID + ID CSP')::int c_idcsp,
      count(*) FILTER (WHERE cruce='ID CSP')::int c_csp,
      count(*) FILTER (WHERE cruce='RAZÓN SOCIAL')::int c_nom,
      count(*) FILTER (WHERE cruce='RAZÓN SOCIAL AMBIGUA')::int c_amb,
      count(*) FILTER (WHERE cruce='NO ENCONTRADO')::int c_no,
      count(*) FILTER (WHERE compra > 0)::int compraron,
      coalesce(sum(compra),0) monto,
      count(*) FILTER (WHERE total_seguimientos > 0)::int contactados
    FROM v_registros`);
  const b = await one<any>(`
    SELECT count(*)::int clientes,
      (SELECT count(*)::int FROM base_clientes x WHERE x.nombre_norm <> '' AND x.nombre_norm IN
        (SELECT nombre_norm FROM base_clientes GROUP BY nombre_norm HAVING count(*) > 1)) nombre_rep,
      max(actualizado) actualizado
    FROM base_clientes`);
  const n = r.registros || 0;
  const nivel = (v: number, malo: 'error' | 'aviso' = 'aviso') => (v === 0 ? 'ok' : malo);
  const f = async (key: keyof typeof FILTROS, malo: 'error' | 'aviso' = 'aviso', nota?: string): Promise<Control> => {
    const v = await cnt(FILTROS[key].sql);
    return { grupo: 'NUEVOS REGISTROS', control: FILTROS[key].titulo, valor: v, filtro: key, nivel: nivel(v, malo), nota };
  };

  const regs = await Promise.all([
    f('ruc_duplicado', 'error', 'El mismo RUC aparece con dos ID TRAX'),
    f('ruc_vacio'),
    f('ruc_invalido', 'aviso', 'RUC peruano = 11 dígitos (los del extranjero pueden ser distintos)'),
    f('sin_contacto'), f('sin_celular'), f('celular_invalido', 'aviso', 'Se espera 9 dígitos empezando en 9 (con o sin 51)'),
    f('sin_correo'), f('correo_invalido'), f('sin_ciudad'),
  ]);
  const distinto = await cnt(FILTROS.nombre_distinto.sql);
  const seg = await Promise.all([
    cnt(FILTROS.pendiente.sql), cnt(FILTROS.sin_responsable.sql), cnt(FILTROS.accion_vencida.sql), cnt(FILTROS.compro_sin_contacto.sql),
  ]);

  return [
    { grupo: 'NUEVOS REGISTROS', control: 'Registros cargados', valor: n, nivel: 'info' },
    ...regs,
    { grupo: 'CRUCE CON BASE', control: 'Encontrado por ID exacto', valor: r.c_id, nivel: 'info', filtro: 'cruce:ID' },
    { grupo: 'CRUCE CON BASE', control: 'Encontrado por ID + ID CSP (se suman)', valor: r.c_idcsp, nivel: 'info', filtro: 'cruce:ID + ID CSP' },
    { grupo: 'CRUCE CON BASE', control: 'Encontrado solo como ID CSP', valor: r.c_csp, nivel: 'info', filtro: 'cruce:ID CSP', nota: 'Un BUSCARV exacto no los encuentra' },
    { grupo: 'CRUCE CON BASE', control: 'Encontrado por razón social', valor: r.c_nom, nivel: r.c_nom ? 'aviso' : 'ok', filtro: 'cruce:RAZÓN SOCIAL', nota: 'Confirmar: el ID no está en BASE' },
    { grupo: 'CRUCE CON BASE', control: 'Razón social ambigua', valor: r.c_amb, nivel: nivel(r.c_amb, 'error'), filtro: 'cruce:RAZÓN SOCIAL AMBIGUA', nota: 'Nombre repetido en BASE con varios IDs' },
    { grupo: 'CRUCE CON BASE', control: 'Razón social distinta a BASE (mismo ID)', valor: distinto, nivel: nivel(distinto), filtro: 'nombre_distinto' },
    { grupo: 'CRUCE CON BASE', control: 'No encontrado en BASE (sin compras)', valor: r.c_no, nivel: 'info', filtro: 'cruce:NO ENCONTRADO' },
    { grupo: 'CRUCE CON BASE', control: 'Compraron (compra > 0)', valor: r.compraron, nivel: 'info', filtro: 'compro:si' },
    { grupo: 'CRUCE CON BASE', control: 'Efectividad (compraron / registros)', valor: n ? r.compraron / n : 0, nivel: 'info', formato: 'pct' },
    { grupo: 'CRUCE CON BASE', control: 'Monto total comprado', valor: r.monto, nivel: 'info', formato: 'money' },
    { grupo: 'BASE', control: 'Clientes en BASE', valor: b.clientes, nivel: b.clientes ? 'info' : 'error', nota: b.clientes ? undefined : 'Importa la pestaña BASE' },
    { grupo: 'BASE', control: 'Clientes con razón social repetida', valor: b.nombre_rep, nivel: 'info', nota: 'Por esto la llave principal es el ID TRAX' },
    { grupo: 'SEGUIMIENTO', control: 'Contactados (al menos un seguimiento)', valor: r.contactados, nivel: 'info', filtro: 'contactado' },
    { grupo: 'SEGUIMIENTO', control: 'Pendientes de contactar', valor: seg[0], nivel: 'info', filtro: 'pendiente' },
    { grupo: 'SEGUIMIENTO', control: 'Último contacto sin responsable', valor: seg[1], nivel: nivel(seg[1], 'error'), filtro: 'sin_responsable' },
    { grupo: 'SEGUIMIENTO', control: 'Próxima acción vencida', valor: seg[2], nivel: nivel(seg[2]), filtro: 'accion_vencida' },
    { grupo: 'SEGUIMIENTO', control: 'Compraron y no tienen seguimiento', valor: seg[3], nivel: 'info', filtro: 'compro_sin_contacto' },
  ];
}

export function linkFiltro(filtro?: string) {
  if (!filtro) return undefined;
  const [k, v] = filtro.includes(':') ? filtro.split(/:(.*)/) : ['filtro', filtro];
  return `/registros?${new URLSearchParams({ [k]: v }).toString()}`;
}
