import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { importarExcel } from '@/lib/importar';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const file = fd.get('archivo');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Selecciona un archivo .xlsx' }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx (Excel). Si está protegido con etiqueta de confidencialidad, guarda una copia sin protección.' }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0xd0 && head[1] === 0xcf) {
      return NextResponse.json({ error: 'El archivo está cifrado o protegido (etiqueta de confidencialidad / IRM). Quita la protección en Excel y vuelve a intentarlo.' }, { status: 400 });
    }
    const resumen = await importarExcel(buf, { reemplazarBase: fd.get('reemplazarBase') !== 'no' });
    revalidatePath('/', 'layout');
    return NextResponse.json(resumen);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'Error al importar' }, { status: 500 });
  }
}
