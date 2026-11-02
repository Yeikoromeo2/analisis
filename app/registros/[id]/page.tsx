import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { catalogo, opcionesFiltros } from '@/lib/consultas';
import { money, fecha, fechaHora, hoyISO, cruceClase } from '@/lib/format';
import { agregarSeguimiento, eliminarRegistro, eliminarSeguimiento } from '@/lib/acciones';
import FormRegistro from '@/components/FormRegistro';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const AVISOS: Record<string, [string, string]> = {
  guardado: ['ok', 'Datos guardados.'],
  seguimiento: ['ok', 'Contacto registrado.'],
  existe: ['warn', 'Ese ID TRAX ya existía: se muestra el registro existente.'],
};

export default async function Detalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; editar?: string }> }) {
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(raw);
  const r = await one<any>(`SELECT * FROM v_registros WHERE id_trax = $1`, [id]);
  if (!r) notFound();
  const [base, segs, mismoRuc, estados, acciones, responsables, op] = await Promise.all([
    q<any>(`SELECT * FROM base_clientes WHERE customer_id = ANY($1) ORDER BY customer_id`,
      [[r.id_trax, `${r.id_trax}CSP`]]),
    q<any>(`SELECT * FROM seguimientos WHERE id_trax = $1 ORDER BY fecha_contacto DESC, id DESC`, [id]),
    r.ruc ? q<any>(`SELECT id_trax, nombre FROM registros WHERE ruc = $1 AND id_trax <> $2`, [r.ruc, id]) : Promise.resolve([]),
    catalogo('estado'), catalogo('proxima_accion'), catalogo('responsable'), opcionesFiltros(),
  ]);
  const porNombre = r.cruce.startsWith('RAZÓN SOCIAL')
    ? await q<any>(`SELECT * FROM base_clientes WHERE nombre_norm = $1 ORDER BY customer_id`, [r.nombre_norm])
    : [];
  const lineas = [...base, ...porNombre];
  const meses = [...new Set(lineas.flatMap((b) => Object.keys(b.meses ?? {})))].sort();
  const aviso = sp.aviso ? AVISOS[sp.aviso] : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/registros" className="small">← Registros</Link>
          <h1>{r.nombre}</h1>
          <p className="muted">{r.id_trax} · RUC {r.ruc ?? '—'} · registrado {fechaHora(r.fecha_creacion)} ({r.mes ?? '—'})</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <span className={cruceClase(r.cruce)}>{r.cruce}</span>
          <span className={r.compra > 0 ? 'tag verde' : 'tag gris'}>{r.compra > 0 ? `Compró ${money(r.compra)}` : 'Sin compras'}</span>
        </div>
      </div>
      {aviso && <div className={`alert ${aviso[0]}`}>{aviso[1]}</div>}
      {mismoRuc.length > 0 && (
        <div className="alert warn">El mismo RUC está en otro registro: {mismoRuc.map((m: any) => <Link key={m.id_trax} href={`/registros/${encodeURIComponent(m.id_trax)}`}>{m.id_trax} ({m.nombre}) </Link>)}</div>
      )}
      {r.cruce === 'RAZÓN SOCIAL AMBIGUA' && <div className="alert err">La razón social coincide con varios clientes de BASE y el ID no está. Revisa cuál corresponde y corrige el ID TRAX.</div>}

      <div className="grid c2">
        <div>
          <div className="card">
            <h2>Contacto</h2>
            <dl className="dl">
              <dt>Contacto</dt><dd>{r.contacto ?? <span className="tag rojo">Falta</span>}</dd>
              <dt>Celular</dt><dd>{r.celular ? <><a href={`tel:${r.celular}`}>{r.celular}</a> · <a target="_blank" href={`https://wa.me/${r.celular.replace(/\D/g, '').replace(/^(9\d{8})$/, '51$1')}`}>WhatsApp</a></> : <span className="tag rojo">Falta</span>}</dd>
              <dt>Correo</dt><dd>{r.correo ? <a href={`mailto:${r.correo}`}>{r.correo}</a> : <span className="tag rojo">Falta</span>}</dd>
              <dt>Ciudad</dt><dd>{r.ciudad ?? '—'}</dd>
              <dt>Provincia</dt><dd>{r.provid ?? '—'}</dd>
              <dt>Ejecutivo</dt><dd>{r.ejecutivo ?? '—'}</dd>
              <dt>OV abierta</dt><dd>{r.ov_abierta ?? '—'}</dd>
              <dt>Facturación</dt><dd>{r.facturacion ?? '—'}</dd>
            </dl>
          </div>

          <div className="card">
            <h2>Compras en BASE</h2>
            {lineas.length === 0 ? <p className="muted">No se encontró en BASE ni por ID ({r.id_trax}, {r.id_trax}CSP) ni por razón social.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Customer ID</th>{meses.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total</th></tr></thead>
                  <tbody>
                    {lineas.map((b) => (
                      <tr key={b.customer_id}><td>{b.customer_id}<div className="small muted">{b.nombre}</div></td>
                        {meses.map((m) => <td key={m} className="num">{b.meses?.[m] !== undefined ? money(b.meses[m]) : ''}</td>)}
                        <td className="num"><b>{money(b.total)}</b></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div>
          <form action={agregarSeguimiento} className="card" style={{ borderTop: '4px solid var(--naranja)' }}>
            <h2>Registrar contacto</h2>
            <input type="hidden" name="id_trax" value={r.id_trax} />
            <div className="form-grid">
              <label>Fecha contacto *<input type="date" name="fecha_contacto" defaultValue={hoyISO()} required /></label>
              <label>Responsable<input name="responsable" list="responsables" defaultValue={segs[0]?.responsable ?? ''} /></label>
              <label>Estado contacto<select name="estado" defaultValue=""><option value="">—</option>{estados.map((e) => <option key={e}>{e}</option>)}</select></label>
              <label>Próxima acción<select name="proxima_accion" defaultValue=""><option value="">—</option>{acciones.map((e) => <option key={e}>{e}</option>)}</select></label>
              <label>Fecha próxima acción<input type="date" name="fecha_proxima" /></label>
              <label className="full">Observación<textarea name="observacion" /></label>
            </div>
            <datalist id="responsables">{[...new Set([...responsables, ...op.responsables])].map((e) => <option key={e} value={e} />)}</datalist>
            <div className="actions"><button className="btn naranja" type="submit">Guardar contacto</button></div>
          </form>

          <div className="card">
            <h2>Historial de seguimiento ({segs.length})</h2>
            {segs.length === 0 ? <p className="muted">Todavía no se ha contactado.</p> : (
              <ul className="timeline">
                {segs.map((s: any) => (
                  <li key={s.id}>
                    <div><b>{fecha(s.fecha_contacto)}</b> · {s.responsable ?? 'sin responsable'} {s.estado && <span className="tag azul">{s.estado}</span>}</div>
                    {s.proxima_accion && <div className="small">Próxima acción: {s.proxima_accion}{s.fecha_proxima ? ` (${fecha(s.fecha_proxima)})` : ''}</div>}
                    {s.observacion && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{s.observacion}</div>}
                    <form action={eliminarSeguimiento} style={{ marginTop: 4 }}>
                      <input type="hidden" name="id" value={s.id} /><input type="hidden" name="id_trax" value={r.id_trax} />
                      <ConfirmButton mensaje="¿Eliminar este contacto del historial?" className="btn sm danger">Eliminar</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <details className="card" open={sp.editar === '1'}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Editar datos del registro</summary>
        <div style={{ marginTop: 12 }}><FormRegistro r={r} ejecutivos={op.ejecutivos} /></div>
        <form action={eliminarRegistro}>
          <input type="hidden" name="id_trax" value={r.id_trax} />
          <ConfirmButton mensaje={`¿Eliminar ${r.id_trax} y todo su historial? No se puede deshacer.`}>Eliminar registro</ConfirmButton>
        </form>
      </details>
    </>
  );
}
