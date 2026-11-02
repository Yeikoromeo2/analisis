// Manifiesto del complemento de Excel. Usa el dominio desde el que se descarga,
// así sirve tal cual para el sitio publicado en Vercel (o para pruebas locales con https).
export const dynamic = 'force-dynamic';

const ID = 'c5b83f94-b701-44f8-b39b-1de563a902e2';
const VERSION = '1.0.0.0';

export function GET(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const base = process.env.ADDIN_BASE_URL?.replace(/\/$/, '') || `${proto}://${host}`;
  const c = `${base}/complemento`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
           xsi:type="TaskPaneApp">
  <Id>${ID}</Id>
  <Version>${VERSION}</Version>
  <ProviderName>Gestión de Contactos</ProviderName>
  <DefaultLocale>es-ES</DefaultLocale>
  <DisplayName DefaultValue="Gestión de Contactos" />
  <Description DefaultValue="Cruce con BASE, contactos por ID TRAX, seguimiento semanal y verificación del libro de nuevos registros." />
  <IconUrl DefaultValue="${c}/icon-32.png" />
  <HighResolutionIconUrl DefaultValue="${c}/icon-64.png" />
  <SupportUrl DefaultValue="${base}/" />
  <AppDomains>
    <AppDomain>${base}</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Workbook" />
  </Hosts>
  <Requirements>
    <Sets DefaultMinVersion="1.1">
      <Set Name="ExcelApi" MinVersion="1.7" />
    </Sets>
  </Requirements>
  <DefaultSettings>
    <SourceLocation DefaultValue="${c}/taskpane.html" />
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Workbook">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GC.Titulo" />
            <Description resid="GC.Inicio" />
            <LearnMoreUrl resid="GC.Url.Sitio" />
          </GetStarted>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="GC.Grupo">
                <Label resid="GC.Titulo" />
                <Icon>
                  <bt:Image size="16" resid="GC.Icon16" />
                  <bt:Image size="32" resid="GC.Icon32" />
                  <bt:Image size="80" resid="GC.Icon80" />
                </Icon>
                <Control xsi:type="Button" id="GC.Abrir">
                  <Label resid="GC.Boton" />
                  <Supertip>
                    <Title resid="GC.Boton" />
                    <Description resid="GC.Tip" />
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="GC.Icon16" />
                    <bt:Image size="32" resid="GC.Icon32" />
                    <bt:Image size="80" resid="GC.Icon80" />
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>GC.Panel</TaskpaneId>
                    <SourceLocation resid="GC.Url.Panel" />
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="GC.Icon16" DefaultValue="${c}/icon-16.png" />
        <bt:Image id="GC.Icon32" DefaultValue="${c}/icon-32.png" />
        <bt:Image id="GC.Icon80" DefaultValue="${c}/icon-80.png" />
      </bt:Images>
      <bt:Urls>
        <bt:Url id="GC.Url.Panel" DefaultValue="${c}/taskpane.html" />
        <bt:Url id="GC.Url.Sitio" DefaultValue="${base}/" />
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GC.Titulo" DefaultValue="Gestión de Contactos" />
        <bt:String id="GC.Boton" DefaultValue="Contactos" />
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GC.Tip" DefaultValue="Abre el panel para buscar clientes, ver su compra en BASE y registrar el seguimiento en su fila." />
        <bt:String id="GC.Inicio" DefaultValue="Pulsa Contactos en la pestaña Inicio para abrir el panel." />
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
`;
  const descargar = url.searchParams.has('descargar');
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(descargar ? { 'Content-Disposition': 'attachment; filename="manifest.xml"' } : {}),
    },
  });
}
