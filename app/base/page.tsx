import Link from 'next/link';
import { q, one } from '@/lib/db';
import { money, int, fecha } from '@/lib/format';
import Paginacion from '@/components/Paginacion';

export const dynamic = 'force-dynamic';
const POR = 50;

export default async function Base({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; registrado?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const w: string[] = []; const p: unknown[] = [];
  if (sp.q?.trim()) { p.push(`%${sp.q.trim()}%`); w.push(`(b.customer_id ILIKE $1 OR b.nombre ILIKE $1)`); }
  if (sp.registrado === 'si') w.push(`r.id_trax IS NOT NULL`);
  if (sp.registrado === 'no') w.push(`r.id_trax IS NULL`);
  const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const from = `FROM base_clientes b LEFT JOIN registros r ON r.id_trax = regexp_replace(b.customer_id, 'CSP$', '')`;
  const tot = await one<any>(`SELECT count(*)::int n, coalesce(sum(b.total),0) monto, max(b.actualizado) act ${from} ${where}`, p);
  const rows = await q<any>(`SELECT b.*, r.id_trax registro ${from} ${where} ORDER BY b.total DESC LIMIT ${POR} OFFSET ${(page - 1) * POR}`, p);
  const meses = [...new Set(rows.flatMap((b) => Object.keys(b.meses ?? {})))].sort();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>BASE de compras</h1>
          <p className="muted">{int(tot.n)} clientes · {money(tot.monto)} · actualizada {fecha(tot.act)}. Se reemplaza al importar un Excel con la pestaña BASE.</p>
        </div>
        <Link className="btn primary" href="/datos">Actualizar BASE</Link>
      </div>
      <form className="filtros">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="Customer ID o nombre" style={{ width: 260 }} /></label>
        <label>¿Es nuevo registro?<select name="registrado" defaultValue={sp.registrado ?? ''}><option value="">Todos</option><option value="si">Sí</option><option value="no">No</option></select></label>
        <button className="btn primary">Buscar</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer ID</th><th>Customer Name</th>{meses.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total general</th><th>Registro</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={meses.length + 4} className="muted">Sin resultados.</td></tr>}
            {rows.map((b) => (
              <tr key={b.customer_id}>
                <td>{b.customer_id}</td><td className="wrap">{b.nombre}</td>
                {meses.map((m) => <td key={m} className="num">{b.meses?.[m] !== undefined ? int(Math.round(b.meses[m])) : ''}</td>)}
                <td className="num"><b>{money(b.total)}</b></td>
                <td>{b.registro ? <Link href={`/registros/${encodeURIComponent(b.registro)}`}>{b.registro}</Link> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacion page={page} total={tot.n} porPagina={POR} params={sp as Record<string, string>} />
    </>
  );
}
