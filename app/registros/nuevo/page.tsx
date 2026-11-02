import Link from 'next/link';
import FormRegistro from '@/components/FormRegistro';
import { opcionesFiltros } from '@/lib/consultas';

export const dynamic = 'force-dynamic';

export default async function Nuevo() {
  const op = await opcionesFiltros();
  return (
    <>
      <div className="page-head"><div><Link href="/registros" className="small">← Registros</Link><h1>Nuevo registro</h1></div></div>
      <FormRegistro ejecutivos={op.ejecutivos} />
    </>
  );
}
