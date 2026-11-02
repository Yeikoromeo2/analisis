import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function Instalar() {
  const h = await headers();
  const base = process.env.ADDIN_BASE_URL?.replace(/\/$/, '') || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const manifest = `${base}/manifest.xml`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Complemento de Excel</h1>
          <p className="muted">El panel “Gestión de Contactos” se abre dentro de Excel y trabaja sobre tu libro abierto (NUEVOS REGISTROS, BASE y SEGUIMIENTO SEMANAL).</p>
        </div>
        <a className="btn primary" href="/manifest.xml?descargar=1">Descargar manifest.xml</a>
      </div>

      <div className="grid c2">
        <div className="card" style={{ borderTop: '4px solid var(--naranja)' }}>
          <h2>Qué hace el panel</h2>
          <ul>
            <li><b>Contacto:</b> busca por ID TRAX, RUC, razón social, contacto o celular, o selecciona una celda de la fila del cliente. Muestra sus datos, la compra en BASE y escribe FECHA CONTACTO, RESPONSABLE, ESTADO, PRÓXIMA ACCIÓN y OBSERVACIÓN en <b>su fila</b> de SEGUIMIENTO SEMANAL.</li>
            <li><b>Pendientes:</b> clientes sin fecha de contacto, por mes y según si compraron.</li>
            <li><b>Verificación:</b> controles por pestaña. Al tocar uno ves las filas y saltas a ellas.</li>
            <li><b>Herramientas:</b> pone en NUEVOS REGISTROS las fórmulas de compra y CRUCE BASE (ID, ID+CSP o razón social), repara los vínculos a otro archivo y crea las listas desplegables.</li>
          </ul>
          <p className="small muted">Las pestañas se reconocen por los encabezados de la fila 1, aunque las columnas cambien de lugar.</p>
        </div>

        <div className="card">
          <h2>Instalar en Excel en la web (lo más rápido)</h2>
          <ol>
            <li>Descarga <a href="/manifest.xml?descargar=1">manifest.xml</a>.</li>
            <li>Abre tu libro en Excel en la web (OneDrive o SharePoint).</li>
            <li>Ve a <b>Inicio → Complementos → Más complementos</b> (o <b>Insertar → Complementos</b>).</li>
            <li>Entra a <b>Mis complementos → Cargar mi complemento</b> y sube el <code>manifest.xml</code>.</li>
            <li>Aparece el botón <b>Contactos</b> en la pestaña Inicio. Al pulsarlo se abre el panel.</li>
          </ol>
        </div>

        <div className="card">
          <h2>Para todo el equipo (Excel de escritorio y web)</h2>
          <p>Un administrador de Microsoft 365 entra a <b>admin.microsoft.com → Configuración → Aplicaciones integradas → Cargar aplicaciones personalizadas</b>, sube el mismo <code>manifest.xml</code> y lo asigna a los usuarios. En unas horas el complemento aparece en <b>Inicio → Complementos</b> de cada persona.</p>
          <p className="small muted">Si tu organización bloquea los complementos o el libro tiene etiqueta de confidencialidad con restricciones, esta es la vía que suele estar permitida.</p>
        </div>

        <div className="card">
          <h2>Excel de escritorio (prueba individual)</h2>
          <p><b>Windows:</b> pon el <code>manifest.xml</code> en una carpeta compartida de red. Luego, en Excel, ve a <b>Archivo → Opciones → Centro de confianza → Configuración → Catálogos de complementos de confianza</b>, agrega esa ruta y marca <i>Mostrar en el menú</i>. Reinicia Excel y entra a <b>Insertar → Mis complementos → Carpeta compartida</b>.</p>
          <p><b>Mac:</b> copia el archivo a <code>~/Library/Containers/com.microsoft.Excel/Data/Documents/wef</code> y reinicia Excel.</p>
          <p className="small muted">Dirección del manifiesto: <code>{manifest}</code></p>
        </div>
      </div>
    </>
  );
}
