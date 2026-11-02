import Link from 'next/link';
import { listarRegistros, opcionesFiltros, CRUCES, FILTROS, POR_PAGINA, type FiltrosRegistros } from '@/lib/consultas';
import { money, int, fecha, cruceClase } from '@/lib/format';
import Paginacion from '@/components/Paginacion';

export const dynamic = 'force-dynamic';

export default async function Registros({ searchParams }: { searchParams: Promise<FiltrosRegistros & { aviso?: string }> }) {
  const sp = await searchParams;
  const [{ rows, total, monto, page }, op] = await Promise.all([listarRegistros(sp), opcionesFiltros()]);
  const exportHref = `/api/exportar?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'page' && k !== 'aviso') as [string, string][]).toString()}`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Registros</h1>
          <p className="muted">{int(total)} registros · compras {money(monto)}{sp.filtro && FILTROS[sp.filtro] ? ` · filtro: ${FILTROS[sp.filtro].titulo}` : ''}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn" href={exportHref}>Exportar esta vista</a>
          <Link className="btn primary" href="/registros/nuevo">+ Nuevo registro</Link>
        </div>
      </div>
      {sp.aviso === 'eliminado' && <div className="alert ok">Registro eliminado.</div>}

      <form className="filtros">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="ID, RUC, razón social, contacto, correo…" style={{ width: 280 }} /></label>
        <label>Mes<select name="mes" defaultValue={sp.mes ?? ''}><option value="">Todos</option>{op.meses.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Cruce BASE<select name="cruce" defaultValue={sp.cruce ?? ''}><option value="">Todos</option>{CRUCES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Compró<select name="compro" defaultValue={sp.compro ?? ''}><option value="">Todos</option><option value="si">Sí</option><option value="no">No</option></select></label>
        <label>Estado contacto<select name="estado" defaultValue={sp.estado ?? ''}><option value="">Todos</option><option value="__sin">Sin contactar</option>{op.estados.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Responsable<select name="responsable" defaultValue={sp.responsable ?? ''}><option value="">Todos</option>{op.responsables.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Ejecutivo<select name="ejecutivo" defaultValue={sp.ejecutivo ?? ''}><option value="">Todos</option>{op.ejecutivos.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Control<select name="filtro" defaultValue={sp.filtro ?? ''}><option value="">—</option>{Object.entries(FILTROS).map(([k, f]) => <option key={k} value={k}>{f.titulo}</option>)}</select></label>
        <button className="btn primary" type="submit">Filtrar</button>
        <Link className="btn" href="/registros">Limpiar</Link>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID TRAX</th><th>Registro</th><th>Cliente</th><th>RUC</th><th>Contacto</th><th>Celular</th><th>Correo</th>
              <th>Cruce BASE</th><th className="num">Compra $</th>
              <th className="manual">Últ. contacto</th><th className="manual">Responsable</th><th className="manual">Estado</th><th className="manual">Próxima acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={13} className="muted">Sin resultados.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id_trax}>
                <td><Link href={`/registros/${encodeURIComponent(r.id_trax)}`}><b>{r.id_trax}</b></Link></td>
                <td>{fecha(r.fecha_creacion)}</td>
                <td className="wrap">{r.nombre}</td>
                <td>{r.ruc ?? '—'}</td>
                <td className="wrap">{r.contacto ?? <span className="tag rojo">Falta</span>}</td>
                <td>{r.celular ? <a href={`https://wa.me/${r.celular.replace(/\D/g, '').replace(/^(9\d{8})$/, '51$1')}`} target="_blank">{r.celular}</a> : '—'}</td>
                <td>{r.correo ? <a href={`mailto:${r.correo}`}>{r.correo}</a> : '—'}</td>
                <td><span className={cruceClase(r.cruce)}>{r.cruce}</span></td>
                <td className="num">{r.compra > 0 ? money(r.compra) : '—'}</td>
                <td>{r.fecha_contacto ? fecha(r.fecha_contacto) : <span className="tag gris">Pendiente</span>}</td>
                <td>{r.responsable ?? ''}</td>
                <td>{r.estado ? <span className="tag azul">{r.estado}</span> : ''}</td>
                <td>{r.proxima_accion ?? ''}{r.fecha_proxima ? <div className="small muted">{fecha(r.fecha_proxima)}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacion page={page} total={total} porPagina={POR_PAGINA} params={sp as Record<string, string>} />
    </>
  );
}
