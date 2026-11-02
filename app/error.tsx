'use client';
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const sinDb = /DATABASE_URL|ECONNREFUSED|ENOTFOUND|password authentication/i.test(error.message);
  return (
    <div className="card">
      <h1>Ocurrió un error</h1>
      {sinDb ? (
        <p>No se pudo conectar a la base de datos. Revisa la variable <code>DATABASE_URL</code> en Vercel (Settings → Environment Variables) y vuelve a desplegar.</p>
      ) : (
        <p className="muted">{error.message || 'Error inesperado.'}{error.digest ? ` (ref. ${error.digest})` : ''}</p>
      )}
      <button className="btn" onClick={reset}>Reintentar</button>
    </div>
  );
}
