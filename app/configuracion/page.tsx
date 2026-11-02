import { q } from '@/lib/db';
import { agregarCatalogo, eliminarCatalogo, vaciarDatos } from '@/lib/acciones';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const TIPOS: [string, string, string][] = [
  ['responsable', 'Responsables', 'Personas que hacen el seguimiento (aparecen como sugerencia al registrar un contacto).'],
  ['estado', 'Estados de contacto', 'Lista desplegable "ESTADO CONTACTO".'],
  ['proxima_accion', 'Próximas acciones', 'Lista desplegable "PRÓXIMA ACCIÓN".'],
];

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sp = await searchParams;
  const cat = await q<{ tipo: string; valor: string }>(`SELECT tipo, valor FROM catalogos ORDER BY tipo, orden, valor`);
  return (
    <>
      <div className="page-head"><div><h1>Configuración</h1><p className="muted">Listas desplegables del seguimiento y mantenimiento de datos.</p></div></div>
      {sp.aviso === 'vaciado' && <div className="alert ok">Datos eliminados.</div>}
      {sp.aviso === 'noconfirmado' && <div className="alert err">Escribe BORRAR para confirmar.</div>}
      <div className="grid c2">
        {TIPOS.map(([tipo, titulo, desc]) => (
          <div className="card" key={tipo}>
            <h2>{titulo}</h2>
            <p className="small muted">{desc}</p>
            <div className="table-wrap" style={{ marginBottom: 10 }}>
              <table><tbody>
                {cat.filter((c) => c.tipo === tipo).length === 0 && <tr><td className="muted">Vacío</td></tr>}
                {cat.filter((c) => c.tipo === tipo).map((c) => (
                  <tr key={c.valor}><td>{c.valor}</td><td style={{ width: 1 }}>
                    <form action={eliminarCatalogo}><input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="valor" value={c.valor} /><button className="btn sm danger">Quitar</button></form>
                  </td></tr>
                ))}
              </tbody></table>
            </div>
            <form action={agregarCatalogo} style={{ display: 'flex', gap: 8 }}>
              <input type="hidden" name="tipo" value={tipo} />
              <input name="valor" placeholder="Agregar…" required style={{ flex: 1 }} />
              <button className="btn primary">Agregar</button>
            </form>
          </div>
        ))}
        <div className="card" style={{ borderTop: '4px solid var(--rojo)' }}>
          <h2>Vaciar datos</h2>
          <p className="small muted">Útil para volver a cargar desde cero. Descarga antes un respaldo en Excel.</p>
          <form action={vaciarDatos} className="form-grid">
            <label>Qué borrar<select name="que" defaultValue="seguimientos">
              <option value="seguimientos">Solo el historial de seguimiento</option>
              <option value="base">Solo la BASE de compras</option>
              <option value="todo">Todo (registros, seguimiento y BASE)</option>
            </select></label>
            <label>Escribe BORRAR<input name="confirmar" autoComplete="off" /></label>
            <div className="full"><ConfirmButton mensaje="¿Seguro? Esta acción no se puede deshacer.">Vaciar</ConfirmButton></div>
          </form>
        </div>
      </div>
    </>
  );
}
