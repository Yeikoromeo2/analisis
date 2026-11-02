import Link from 'next/link';
import { verificar, linkFiltro } from '@/lib/verificacion';
import { int, money, pct } from '@/lib/format';

export const dynamic = 'force-dynamic';

const NIVEL: Record<string, [string, string]> = { ok: ['tag verde', 'OK'], aviso: ['tag ambar', 'Revisar'], error: ['tag rojo', 'Corregir'], info: ['tag gris', 'Info'] };

export default async function Verificacion() {
  const controles = await verificar();
  const grupos = [...new Set(controles.map((c) => c.grupo))];
  const problemas = controles.filter((c) => c.nivel === 'error' || c.nivel === 'aviso').filter((c) => c.valor > 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Verificación por pestaña</h1>
          <p className="muted">Controles calculados en vivo. La llave del cruce es el ID TRAX (BASE no trae RUC); si no está, se prueba ID + "CSP" y luego la razón social exacta.</p>
        </div>
        <a className="btn" href="/api/exportar">Descargar Excel con verificación</a>
      </div>
      {problemas.length === 0
        ? <div className="alert ok">Todo en orden: no hay controles por corregir.</div>
        : <div className="alert warn">{problemas.length} controles requieren revisión. Haz clic en el número para ver los registros.</div>}
      {grupos.map((g) => (
        <div className="card" key={g}>
          <h2>{g}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Control</th><th className="num">Resultado</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody>
                {controles.filter((c) => c.grupo === g).map((c) => {
                  const v = c.formato === 'pct' ? pct(c.valor) : c.formato === 'money' ? money(c.valor) : int(c.valor);
                  const href = linkFiltro(c.filtro);
                  return (
                    <tr key={c.control}>
                      <td>{c.control}</td>
                      <td className="num"><b>{href && c.valor > 0 ? <Link href={href}>{v}</Link> : v}</b></td>
                      <td><span className={NIVEL[c.nivel][0]}>{NIVEL[c.nivel][1]}</span></td>
                      <td className="muted wrap">{c.nota ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
