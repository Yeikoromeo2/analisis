import Link from 'next/link';
import { q } from '@/lib/db';
import { fecha, int, money, hoyISO, isoDate } from '@/lib/format';
import { opcionesFiltros } from '@/lib/consultas';

export const dynamic = 'force-dynamic';

function lunes(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt;
}
const mas = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() + dias); return x; };

export default async function Seguimiento({ searchParams }: { searchParams: Promise<{ semana?: string; responsable?: string; estado?: string }> }) {
  const sp = await searchParams;
  const ini = lunes(/^\d{4}-\d{2}-\d{2}$/.test(sp.semana ?? '') ? sp.semana! : hoyISO());
  const semana = isoDate(ini);
  const fin = isoDate(mas(ini, 6));
  const filtros: string[] = [];
  const params: unknown[] = [semana, fin];
  if (sp.responsable) { params.push(sp.responsable); filtros.push(`s.responsable = $${params.length}`); }
  if (sp.estado) { params.push(sp.estado); filtros.push(`s.estado = $${params.length}`); }
  const extra = filtros.length ? `AND ${filtros.join(' AND ')}` : '';

  const [contactos, porResp, porEstado, registrados, semanas, op] = await Promise.all([
    q<any>(`SELECT s.*, v.nombre, v.contacto, v.celular, v.correo, v.compra, v.cruce
            FROM seguimientos s JOIN v_registros v USING (id_trax)
            WHERE s.fecha_contacto BETWEEN $1 AND $2 ${extra}
            ORDER BY s.fecha_contacto DESC, s.id DESC`, params),
    q<any>(`SELECT coalesce(responsable,'(sin responsable)') k, count(*)::int n, count(DISTINCT id_trax)::int clientes
            FROM seguimientos s WHERE fecha_contacto BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, [semana, fin]),
    q<any>(`SELECT coalesce(estado,'(sin estado)') k, count(*)::int n FROM seguimientos s
            WHERE fecha_contacto BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, [semana, fin]),
    q<any>(`SELECT count(*)::int n, count(*) FILTER (WHERE total_seguimientos > 0)::int contactados,
                   count(*) FILTER (WHERE compra > 0)::int compraron
            FROM v_registros WHERE semana_registro = $1`, [semana]),
    q<any>(`SELECT DISTINCT date_trunc('week', fecha_contacto)::date w FROM seguimientos ORDER BY 1 DESC LIMIT 52`),
    opcionesFiltros(),
  ]);
  const reg = registrados[0] ?? { n: 0, contactados: 0, compraron: 0 };
  const link = (d: Date) => `?${new URLSearchParams({ ...(sp.responsable ? { responsable: sp.responsable } : {}), ...(sp.estado ? { estado: sp.estado } : {}), semana: isoDate(d) })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Seguimiento semanal</h1>
          <p className="muted">Semana del {fecha(semana)} al {fecha(fin)}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn" href={link(mas(ini, -7))}>← Semana anterior</Link>
          <Link className="btn" href={link(lunes(hoyISO()))}>Esta semana</Link>
          <Link className="btn" href={link(mas(ini, 7))}>Semana siguiente →</Link>
        </div>
      </div>

      <form className="filtros">
        <label>Semana<select name="semana" defaultValue={semana}>
          {!semanas.some((s) => s.w === semana) && <option value={semana}>{fecha(semana)}</option>}
          {semanas.map((s) => <option key={s.w} value={s.w}>{fecha(s.w)}</option>)}
        </select></label>
        <label>Responsable<select name="responsable" defaultValue={sp.responsable ?? ''}><option value="">Todos</option>{op.responsables.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Estado<select name="estado" defaultValue={sp.estado ?? ''}><option value="">Todos</option>{op.estados.map((e) => <option key={e}>{e}</option>)}</select></label>
        <button className="btn primary">Ver</button>
      </form>

      <div className="grid k4" style={{ marginBottom: 16 }}>
        <div className="kpi naranja"><div className="lbl">Contactos realizados</div><div className="val">{int(contactos.length)}</div><div className="sub">{int(new Set(contactos.map((c) => c.id_trax)).size)} clientes distintos</div></div>
        <div className="kpi"><div className="lbl">Registrados esta semana</div><div className="val">{int(reg.n)}</div><div className="sub">{int(reg.contactados)} ya contactados · {int(reg.compraron)} compraron</div></div>
        <Link className="kpi" href="/registros?filtro=pendiente" style={{ color: 'inherit' }}><div className="lbl">Total pendientes</div><div className="val">→</div><div className="sub">Ver registros sin contactar</div></Link>
        <Link className="kpi naranja" href="/registros?filtro=accion_vencida" style={{ color: 'inherit' }}><div className="lbl">Acciones vencidas</div><div className="val">→</div><div className="sub">Próxima acción con fecha pasada</div></Link>
      </div>

      <div className="grid c2">
        <div className="card"><h2>Por responsable</h2>
          {porResp.length === 0 ? <p className="muted">Sin contactos esta semana.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Responsable</th><th className="num">Contactos</th><th className="num">Clientes</th></tr></thead>
              <tbody>{porResp.map((r) => <tr key={r.k}><td>{r.k}</td><td className="num">{int(r.n)}</td><td className="num">{int(r.clientes)}</td></tr>)}</tbody></table></div>)}
        </div>
        <div className="card"><h2>Por estado</h2>
          {porEstado.length === 0 ? <p className="muted">Sin contactos esta semana.</p> : (
            <div className="table-wrap"><table><tbody>{porEstado.map((r) => <tr key={r.k}><td>{r.k}</td><td className="num">{int(r.n)}</td></tr>)}</tbody></table></div>)}
        </div>
      </div>

      <h2>Contactos de la semana</h2>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>ID TRAX</th><th>Cliente</th><th>Contacto</th><th>Celular</th><th>Correo</th><th className="num">Compra $</th>
            <th className="manual">Fecha contacto</th><th className="manual">Responsable</th><th className="manual">Estado</th><th className="manual">Próxima acción</th><th className="manual">Observación</th>
          </tr></thead>
          <tbody>
            {contactos.length === 0 && <tr><td colSpan={11} className="muted">No hay contactos registrados en esta semana. Regístralos desde la ficha de cada cliente (Registros → ID TRAX).</td></tr>}
            {contactos.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/registros/${encodeURIComponent(c.id_trax)}`}><b>{c.id_trax}</b></Link></td>
                <td className="wrap">{c.nombre}</td><td>{c.contacto ?? '—'}</td><td>{c.celular ?? '—'}</td><td>{c.correo ?? '—'}</td>
                <td className="num">{c.compra > 0 ? money(c.compra) : '—'}</td>
                <td>{fecha(c.fecha_contacto)}</td><td>{c.responsable ?? ''}</td><td>{c.estado ? <span className="tag azul">{c.estado}</span> : ''}</td>
                <td>{c.proxima_accion ?? ''}{c.fecha_proxima ? <div className="small muted">{fecha(c.fecha_proxima)}</div> : null}</td>
                <td className="wrap">{c.observacion ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
