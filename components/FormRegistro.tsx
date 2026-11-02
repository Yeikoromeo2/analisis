import { guardarRegistro } from '@/lib/acciones';

export default function FormRegistro({ r, ejecutivos }: { r?: any; ejecutivos: string[] }) {
  const v = (k: string) => r?.[k] ?? '';
  const fc = r?.fecha_creacion ? String(r.fecha_creacion).slice(0, 16).replace(' ', 'T') : '';
  return (
    <form action={guardarRegistro} className="card">
      <h2>{r ? 'Editar datos del registro' : 'Datos del nuevo registro'}</h2>
      {r && <input type="hidden" name="original" value={r.id_trax} />}
      <div className="form-grid">
        <label>ID TRAX *<input name="id_trax" defaultValue={v('id_trax')} required placeholder="XPE0XXXXX" /></label>
        <label>Fecha de creación<input type="datetime-local" name="fecha_creacion" defaultValue={fc} /></label>
        <label className="full">Razón social *<input name="nombre" defaultValue={v('nombre')} required /></label>
        <label>RUC<input name="ruc" defaultValue={v('ruc')} inputMode="numeric" /></label>
        <label>Provincia / PROVID<input name="provid" defaultValue={v('provid')} /></label>
        <label>Ciudad<input name="ciudad" defaultValue={v('ciudad')} /></label>
        <label>Contacto<input name="contacto" defaultValue={v('contacto')} /></label>
        <label>Celular<input name="celular" defaultValue={v('celular')} inputMode="tel" /></label>
        <label>Correo<input type="email" name="correo" defaultValue={v('correo')} /></label>
        <label>Ejecutivo<input name="ejecutivo" defaultValue={v('ejecutivo')} list="ejecutivos" /></label>
        <label>OV abierta<input name="ov_abierta" defaultValue={v('ov_abierta')} /></label>
        <label>Facturación<input name="facturacion" defaultValue={v('facturacion')} /></label>
      </div>
      <datalist id="ejecutivos">{ejecutivos.map((e) => <option key={e} value={e} />)}</datalist>
      <div className="actions"><button className="btn primary" type="submit">Guardar</button></div>
    </form>
  );
}
