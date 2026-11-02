# Gestión de Contactos

App web para administrar los **nuevos registros**, cruzarlos con la **BASE de compras** y llevar el **seguimiento semanal** de contactos. Reemplaza el libro de Excel (`NUEVOS REGISTROS 2026`, `BASE`, `SEGUIMIENTO SEMANAL`) por una base de datos PostgreSQL. Se puede seguir importando y exportando en Excel.

Stack: Next.js 15 (App Router) · PostgreSQL (`pg`) · ExcelJS. Está lista para desplegarse en **Vercel**.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Panel** | KPIs: registros, compraron, efectividad, monto, contactados, contactos de la semana y acciones vencidas. Muestra cortes por mes y por ejecutivo. |
| **Registros** | Búsqueda por ID, RUC, razón social, contacto, correo o celular. Filtros por mes, cruce, compró, estado, responsable, ejecutivo y por cada control de calidad. Se puede exportar la vista filtrada. |
| **Ficha del registro** | Datos de contacto (con enlaces a llamada, WhatsApp y correo) y compras por mes desde la BASE. Aquí se **registra un contacto**: fecha, responsable, estado, próxima acción con su fecha y observación. Guarda el historial completo. |
| **Seguimiento semanal** | Contactos de la semana elegida (de lunes a domingo), con totales por responsable y por estado, y los registrados en esa semana. |
| **BASE de compras** | Consulta de la BASE. Indica qué clientes son nuevos registros. |
| **Verificación** | Controles por pestaña: RUC repetido o inválido, contactos incompletos, celular o correo con formato dudoso, tipo de cruce, razón social distinta a la de BASE, pendientes, sin responsable y acciones vencidas. Cada número lleva a la lista de registros afectados. |
| **Importar / Exportar** | Sube el `.xlsx` (cada pestaña se reconoce por sus encabezados). Descarga el libro con NUEVOS REGISTROS, SEGUIMIENTO SEMANAL, HISTORIAL, BASE y VERIFICACIÓN. |
| **Configuración** | Listas desplegables (responsables, estados, próximas acciones) y vaciado de datos. |

### Reglas del cruce con BASE

La BASE no trae RUC, así que la llave es el **ID TRAX**:

1. `ID` exacto en Customer ID.
2. `ID` + `CSP` (por ejemplo `XPE017942CSP`). Si existen las dos líneas, se **suman**.
3. Si el ID no aparece, se busca por **razón social** normalizada (sin tildes, signos ni espacios), y solo si es **única** en BASE. Si el nombre se repite, el registro se marca como **RAZÓN SOCIAL AMBIGUA** para revisarlo a mano.
4. Si nada coincide: **NO ENCONTRADO** (sin compras).

Al importar la BASE, si un mes viene con `#N/A` pero el *Total general* lo incluye, el valor se reconstruye así: Total general − meses anteriores.

### Reglas de importación

- **NUEVOS REGISTROS**: inserta o actualiza por ID TRAX. Una celda vacía en el Excel **no borra** el dato que ya está cargado.
- **BASE**: por defecto **reemplaza** toda la BASE, porque es una foto del sistema.
- **SEGUIMIENTO**: solo importa las filas con FECHA CONTACTO y no duplica contactos idénticos. Puedes reimportar un Excel exportado sin problema.
- Un celular escrito como fórmula (`=51+991843457`) se corrige a `991843457`.
- Límite de archivo en Vercel: unos 4 MB.

## Desplegar en Vercel

1. **Sube este proyecto a GitHub** (un repositorio nuevo):
   ```bash
   git init && git add . && git commit -m "Gestión de contactos"
   ```
   ```bash
   git remote add origin https://github.com/TU_USUARIO/gestion-contactos.git && git push -u origin main
   ```
2. En **vercel.com → Add New → Project**, importa el repositorio. Vercel detecta Next.js solo.
3. **Base de datos**: en el proyecto de Vercel, entra a **Storage → Create → Neon (Postgres)** y conéctala al proyecto. Eso crea `DATABASE_URL` automáticamente. También sirve cualquier PostgreSQL (Supabase, etc.); en ese caso pega su cadena de conexión.
4. En **Settings → Environment Variables** agrega `APP_PASSWORD` con la contraseña del equipo.
5. **Deploy**. Las tablas se crean solas en el primer uso.
6. Entra a la app, ve a **Importar / Exportar** y sube tu Excel.

## Correr en local

```bash
cp .env.example .env.local
```
Edita `DATABASE_URL` y `APP_PASSWORD` en `.env.local`. Luego:
```bash
npm install
```
```bash
npm run dev
```
Abre http://localhost:3000

## Estructura

```
app/
  page.tsx                 Panel
  registros/               Lista, ficha [id] y alta (nuevo)
  seguimiento/             Seguimiento semanal
  base/                    BASE de compras
  verificacion/            Controles por pestaña
  datos/                   Importar / Exportar
  configuracion/           Catálogos y mantenimiento
  api/importar/route.ts    Subida del Excel
  api/exportar/route.ts    Descarga del Excel
lib/
  schema.ts                Tablas + vista v_registros (lógica del cruce)
  db.ts                    Conexión y aplicación automática del esquema
  importar.ts              Lectura del Excel por encabezados
  consultas.ts             Filtros y búsquedas
  verificacion.ts          Controles de calidad
  acciones.ts              Server Actions (guardar, eliminar, seguimiento)
middleware.ts              Acceso con contraseña (APP_PASSWORD)
```

### Modelo de datos

- `registros`: un cliente nuevo por ID TRAX, con sus datos de contacto.
- `base_clientes`: BASE de compras (meses en JSON + total).
- `seguimientos`: historial de contactos (varios por registro). El último se muestra como estado actual.
- `catalogos`: listas desplegables.
- `v_registros` (vista): registro + cruce + compra + último seguimiento. Todo se calcula en vivo.
