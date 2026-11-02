import Link from 'next/link';

export default function Paginacion({ page, total, porPagina, params }: { page: number; total: number; porPagina: number; params: Record<string, string | undefined> }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') sp.set(k, v);
    sp.set('page', String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="paginacion">
      {page > 1 ? <Link className="btn" href={href(page - 1)}>← Anterior</Link> : <span />}
      <span className="muted">Página {page} de {paginas}</span>
      {page < paginas ? <Link className="btn" href={href(page + 1)}>Siguiente →</Link> : <span />}
    </div>
  );
}
