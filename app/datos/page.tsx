import Importador from '@/components/Importador';

export const dynamic = 'force-dynamic';

export default function Datos() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar / Exportar</h1>
          <p className="muted">Carga los datos desde Excel y descarga el libro actualizado con el cruce, los contactos y la verificación.</p>
        </div>
      </div>
      <Importador />
      <div className="card">
        <h2>Exportar a Excel</h2>
        <p className="muted">Genera un libro con las pestañas: NUEVOS REGISTROS 2026 (con compra y tipo de cruce), SEGUIMIENTO SEMANAL (datos de contacto + último seguimiento), HISTORIAL SEGUIMIENTO, BASE y VERIFICACIÓN.</p>
        <div className="actions">
          <a className="btn primary" href="/api/exportar">Descargar libro completo</a>
          <a className="btn" href="/api/exportar?filtro=pendiente">Solo pendientes de contactar</a>
          <a className="btn" href="/api/exportar?compro=si">Solo los que compraron</a>
        </div>
      </div>
    </>
  );
}
