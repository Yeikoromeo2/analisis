// Esquema de la base de datos. Se aplica automáticamente (es idempotente).
const NORM = (col: string) =>
  `regexp_replace(upper(translate(coalesce(${col},''),'áéíóúÁÉÍÓÚñÑüÜ','aeiouAEIOUnNuU')),'[^A-Z0-9]','','g')`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS base_clientes (
  customer_id  text PRIMARY KEY,
  nombre       text,
  nombre_norm  text GENERATED ALWAYS AS (${NORM('nombre')}) STORED,
  meses        jsonb NOT NULL DEFAULT '{}'::jsonb,
  total        numeric(14,2) NOT NULL DEFAULT 0,
  actualizado  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS base_clientes_nombre_norm_idx ON base_clientes (nombre_norm);

CREATE TABLE IF NOT EXISTS registros (
  id_trax        text PRIMARY KEY,
  numero         integer,
  fecha_creacion timestamp,
  mes            text,
  nombre         text NOT NULL,
  nombre_norm    text GENERATED ALWAYS AS (${NORM('nombre')}) STORED,
  ruc            text,
  provid         text,
  contacto       text,
  celular        text,
  correo         text,
  ciudad         text,
  ejecutivo      text,
  ov_abierta     text,
  facturacion    text,
  creado         timestamptz NOT NULL DEFAULT now(),
  actualizado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registros_ruc_idx ON registros (ruc);
CREATE INDEX IF NOT EXISTS registros_nombre_norm_idx ON registros (nombre_norm);
CREATE INDEX IF NOT EXISTS registros_fecha_idx ON registros (fecha_creacion);

CREATE TABLE IF NOT EXISTS seguimientos (
  id              bigserial PRIMARY KEY,
  id_trax         text NOT NULL REFERENCES registros(id_trax) ON DELETE CASCADE ON UPDATE CASCADE,
  fecha_contacto  date NOT NULL,
  responsable     text,
  estado          text,
  proxima_accion  text,
  fecha_proxima   date,
  observacion     text,
  creado          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seguimientos_trax_idx ON seguimientos (id_trax, fecha_contacto DESC, id DESC);
CREATE INDEX IF NOT EXISTS seguimientos_fecha_idx ON seguimientos (fecha_contacto);

CREATE TABLE IF NOT EXISTS catalogos (
  tipo   text NOT NULL,
  valor  text NOT NULL,
  orden  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tipo, valor)
);

INSERT INTO catalogos (tipo, valor, orden)
SELECT 'estado', v, o FROM (VALUES
  ('Contactado',1),('No contesta',2),('Interesado',3),('Cotización enviada',4),
  ('Compró',5),('No interesado',6),('Datos errados',7),('Volver a llamar',8)) t(v,o)
WHERE NOT EXISTS (SELECT 1 FROM catalogos WHERE tipo='estado');

INSERT INTO catalogos (tipo, valor, orden)
SELECT 'proxima_accion', v, o FROM (VALUES
  ('Llamar nuevamente',1),('Enviar correo',2),('Enviar cotización',3),('Agendar reunión',4),
  ('Derivar a ejecutivo',5),('Cerrar seguimiento',6)) t(v,o)
WHERE NOT EXISTS (SELECT 1 FROM catalogos WHERE tipo='proxima_accion');

CREATE OR REPLACE VIEW v_registros AS
SELECT
  r.id_trax, r.numero, r.fecha_creacion, r.mes, r.nombre, r.nombre_norm, r.ruc, r.provid,
  r.contacto, r.celular, r.correo, r.ciudad, r.ejecutivo, r.ov_abierta, r.facturacion,
  r.creado, r.actualizado,
  date_trunc('week', r.fecha_creacion)::date AS semana_registro,
  b1.customer_id AS base_id, b2.customer_id AS base_id_csp,
  nn.cnt AS coincidencias_nombre, nn.customer_id AS base_id_nombre, b1.nombre AS base_nombre,
  CASE
    WHEN b1.customer_id IS NOT NULL AND b2.customer_id IS NOT NULL THEN 'ID + ID CSP'
    WHEN b1.customer_id IS NOT NULL THEN 'ID'
    WHEN b2.customer_id IS NOT NULL THEN 'ID CSP'
    WHEN nn.cnt = 1 THEN 'RAZÓN SOCIAL'
    WHEN nn.cnt > 1 THEN 'RAZÓN SOCIAL AMBIGUA'
    ELSE 'NO ENCONTRADO'
  END AS cruce,
  CASE
    WHEN b1.customer_id IS NOT NULL OR b2.customer_id IS NOT NULL
      THEN coalesce(b1.total,0) + coalesce(b2.total,0)
    WHEN nn.cnt = 1 THEN nn.total
  END AS compra,
  s.fecha_contacto, date_trunc('week', s.fecha_contacto)::date AS semana_contacto,
  s.responsable, s.estado, s.proxima_accion, s.fecha_proxima, s.observacion,
  coalesce(sc.n, 0) AS total_seguimientos
FROM registros r
LEFT JOIN base_clientes b1 ON b1.customer_id = r.id_trax
LEFT JOIN base_clientes b2 ON b2.customer_id = r.id_trax || 'CSP'
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt, max(b.total) AS total, max(b.customer_id) AS customer_id
  FROM base_clientes b
  WHERE r.nombre_norm <> '' AND b.nombre_norm = r.nombre_norm
) nn ON b1.customer_id IS NULL AND b2.customer_id IS NULL
LEFT JOIN LATERAL (
  SELECT x.* FROM seguimientos x WHERE x.id_trax = r.id_trax
  ORDER BY x.fecha_contacto DESC, x.id DESC LIMIT 1
) s ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS n FROM seguimientos x WHERE x.id_trax = r.id_trax
) sc ON true;
`;
