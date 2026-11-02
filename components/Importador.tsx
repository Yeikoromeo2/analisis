'use client';
import { useState } from 'react';
import Link from 'next/link';

type Resumen = {
  error?: string;
  hojas?: { nombre: string; tipo: string; filas: number }[];
  base?: { clientes: number; modo: string };
  registros?: { nuevos: number; actualizados: number };
  seguimientos?: { agregados: number; omitidos: number };
  avisos?: string[];
};

const TIPO: Record<string, string> = { base: 'BASE de compras', registros: 'Nuevos registros', seguimiento: 'Seguimiento', 'no reconocida': 'No reconocida (se ignora)' };

export default function Importador() {
  const [estado, setEstado] = useState<'idle' | 'subiendo'>('idle');
  const [res, setRes] = useState<Resumen | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado('subiendo'); setRes(null);
    try {
      const r = await fetch('/api/importar', { method: 'POST', body: new FormData(e.currentTarget) });
      const txt = await r.text();
      let data: Resumen;
      try { data = JSON.parse(txt); } catch { data = { error: r.status === 413 ? 'El archivo es demasiado grande (máx. 4 MB). Sube solo las pestañas necesarias.' : `Error ${r.status}` }; }
      setRes(data);
    } catch {
      setRes({ error: 'No se pudo conectar con el servidor.' });
    } finally {
      setEstado('idle');
    }
  }

  return (
    <form onSubmit={enviar} className="card" style={{ borderTop: '4px solid var(--naranja)' }}>
      <h2>Importar Excel</h2>
      <p className="muted">Se reconoce cada pestaña por los encabezados de la fila 1: <b>NUEVOS REGISTROS</b> (ID DE TRAX, NOMBRE DE LA CUENTA…), <b>BASE</b> (Customer ID, Total general) y <b>SEGUIMIENTO SEMANAL</b> (ID TRAX, FECHA CONTACTO…). Puedes subir el libro completo o solo una pestaña.</p>
      <div className="form-grid">
        <label>Archivo .xlsx<input type="file" name="archivo" accept=".xlsx" required /></label>
        <label>Pestaña BASE
          <select name="reemplazarBase" defaultValue="si">
            <option value="si">Reemplazar toda la BASE (recomendado)</option>
            <option value="no">Solo agregar / actualizar clientes</option>
          </select>
        </label>
      </div>
      <p className="small muted">Los registros existentes se actualizan por ID TRAX; las celdas vacías del Excel no borran datos ya cargados. Los contactos de seguimiento repetidos no se duplican.</p>
      <div className="actions"><button className="btn naranja" disabled={estado === 'subiendo'}>{estado === 'subiendo' ? 'Importando…' : 'Importar'}</button></div>

      {res?.error && <div className="alert err" style={{ marginTop: 14 }}>{res.error}</div>}
      {res && !res.error && (
        <div style={{ marginTop: 14 }}>
          <div className="alert ok">
            Importación completa.
            {res.registros && <> Registros: <b>{res.registros.nuevos}</b> nuevos, <b>{res.registros.actualizados}</b> actualizados.</>}
            {res.base && <> BASE {res.base.modo}: <b>{res.base.clientes}</b> clientes.</>}
            {res.seguimientos && <> Seguimientos: <b>{res.seguimientos.agregados}</b> agregados{res.seguimientos.omitidos ? `, ${res.seguimientos.omitidos} ya existían o sin registro` : ''}.</>}
          </div>
          {res.avisos?.map((a, i) => <div key={i} className="alert warn">{a}</div>)}
          <div className="table-wrap"><table>
            <thead><tr><th>Pestaña</th><th>Detectada como</th><th className="num">Filas</th></tr></thead>
            <tbody>{res.hojas?.map((h) => <tr key={h.nombre}><td>{h.nombre}</td><td>{TIPO[h.tipo] ?? h.tipo}</td><td className="num">{h.filas}</td></tr>)}</tbody>
          </table></div>
          <div className="actions"><Link className="btn primary" href="/verificacion">Ver verificación</Link><Link className="btn" href="/">Ir al panel</Link></div>
        </div>
      )}
    </form>
  );
}
