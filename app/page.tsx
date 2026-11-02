import Link from 'next/link';
import { q, one } from '@/lib/db';
import { money, int, pct, fecha } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Panel() {
  const k = await one<any>(`
    SELECT count(*)::int registros,
      count(*) FILTER (WHERE compra > 0)::int compraron,
      coalesce(sum(compra),0) monto,
      count(*) FILTER (WHERE total_seguimientos > 0)::int contactados,
      count(*) FILTER (WHERE fecha_proxima <= (now() AT TIME ZONE 'America/Lima')::date)::int vencidas,
      (SELECT count(*)::int FROM base_clientes) base,
      (SELECT max(actualizado) FROM base_clientes) base_fecha,
      (SELECT count(*)::int FROM seguimientos WHERE date_trunc('week', fecha_contacto) = date_trunc('week', (now() AT TIME ZONE 'America/Lima')::date)) semana
    FROM v_registros`);
  const meses = await q<any>(`
    SELECT mes, count(*)::int registros, count(*) FILTER (WHERE compra > 0)::int compraron,
           coalesce(sum(compra),0) monto, count(*) FILTER (WHERE total_seguimientos > 0)::int contactados
    FROM v_registros WHERE mes IS NOT NULL GROUP BY mes ORDER BY min(fecha_creacion)`);
  const estados = await q<any>(`
    SELECT coalesce(estado, 'Sin contactar') estado, count(*)::int n FROM v_registros GROUP BY 1 ORDER BY 2 DESC`);
  const ejecutivos = await q<any>(`
    SELECT coalesce(initcap(lower(trim(ejecutivo))),'(sin ejecutivo)') ejecutivo, count(*)::int n, count(*) FILTER (WHERE compra>0)::int compraron, coalesce(sum(compra),0) monto
    FROM v_registros GROUP BY 1 ORDER BY 4 DESC, 2 DESC LIMIT 10`);

  const n = k?.registros ?? 0;
  if (n === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Panel</h1><p className="muted">Aún no hay datos cargados.</p></div></div>
        <div className="card">
          <h2>Primer paso: importa tu Excel</h2>
          <p>Sube el libro con las pestañas <b>NUEVOS REGISTROS 2026</b>, <b>BASE</b> y (opcional) <b>SEGUIMIENTO SEMANAL</b>. La app detecta cada pestaña por sus encabezados y hace el cruce automáticamente.</p>
          <Link href="/datos" className="btn primary">Ir a Importar</Link>
        </div>
      </>
    );
  }
  const maxMes = Math.max(...meses.map((m) => m.registros), 1);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel</h1>
          <p className="muted">BASE de compras: {int(k.base)} clientes · actualizada {fecha(k.base_fecha)}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn" href="/registros/nuevo">+ Nuevo registro</Link>
          <a className="btn primary" href="/api/exportar">Descargar Excel</a>
        </div>
      </div>

      <div className="grid k4" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lbl">Registros</div><div className="val">{int(n)}</div></div>
        <div className="kpi"><div className="lbl">Compraron</div><div className="val">{int(k.compraron)}</div><div className="sub">Efectividad {pct(k.compraron / n)}</div></div>
        <div className="kpi"><div className="lbl">Monto comprado</div><div className="val">{money(k.monto)}</div></div>
        <div className="kpi naranja"><div className="lbl">Contactados</div><div className="val">{int(k.contactados)}</div><div className="sub">{pct(k.contactados / n)} · {int(n - k.contactados)} pendientes</div></div>
        <div className="kpi naranja"><div className="lbl">Contactos esta semana</div><div className="val">{int(k.semana)}</div></div>
        <Link href="/registros?filtro=accion_vencida" className="kpi naranja" style={{ color: 'inherit' }}>
          <div className="lbl">Próximas acciones vencidas</div><div className="val">{int(k.vencidas)}</div><div className="sub">Ver lista →</div>
        </Link>
      </div>

      <div className="grid panel">
        <div className="card">
          <h2>Por mes de registro</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mes</th><th className="num">Registros</th><th className="num">Compraron</th><th className="num">Efectividad</th><th className="num">Monto</th><th className="num manual">Contactados</th></tr></thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes}>
                    <td><Link href={`/registros?mes=${encodeURIComponent(m.mes)}`}>{m.mes}</Link>
                      <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${(m.registros / maxMes) * 100}%` }} /></div></td>
                    <td className="num">{int(m.registros)}</td>
                    <td className="num">{int(m.compraron)}</td>
                    <td className="num">{pct(m.compraron / m.registros)}</td>
                    <td className="num">{money(m.monto)}</td>
                    <td className="num">{int(m.contactados)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="num">{int(n)}</td><td className="num">{int(k.compraron)}</td><td className="num">{pct(k.compraron / n)}</td><td className="num">{money(k.monto)}</td><td className="num">{int(k.contactados)}</td></tr></tfoot>
            </table>
          </div>
        </div>
        <div>
          <div className="card">
            <h2>Estado del último contacto</h2>
            <div className="table-wrap">
              <table>
                <tbody>
                  {estados.map((e) => (
                    <tr key={e.estado}>
                      <td><Link href={`/registros?estado=${encodeURIComponent(e.estado === 'Sin contactar' ? '__sin' : e.estado)}`}>{e.estado}</Link></td>
                      <td style={{ width: '45%' }}><div className="bar"><span style={{ width: `${(e.n / n) * 100}%` }} /></div></td>
                      <td className="num">{int(e.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Por ejecutivo (top 10 por monto)</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ejecutivo</th><th className="num">Registros</th><th className="num">Compraron</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {ejecutivos.map((e) => (
                    <tr key={e.ejecutivo}><td>{e.ejecutivo}</td><td className="num">{int(e.n)}</td><td className="num">{int(e.compraron)}</td><td className="num">{money(e.monto)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
