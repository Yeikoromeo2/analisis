'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one } from './db';

const t = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : v;
};

const CAMPOS = ['nombre', 'ruc', 'provid', 'contacto', 'celular', 'correo', 'ciudad', 'ejecutivo', 'ov_abierta', 'facturacion'] as const;

export async function guardarRegistro(fd: FormData) {
  const original = t(fd, 'original');
  const id = t(fd, 'id_trax')?.replace(/\s+/g, '').toUpperCase();
  if (!id) throw new Error('El ID TRAX es obligatorio.');
  if (!t(fd, 'nombre')) throw new Error('La razón social es obligatoria.');
  const vals = CAMPOS.map((c) => (c === 'correo' ? t(fd, c)?.toLowerCase() ?? null : t(fd, c)));
  const fecha = t(fd, 'fecha_creacion');
  if (original) {
    await q(
      `UPDATE registros SET id_trax=$1, ${CAMPOS.map((c, i) => `${c}=$${i + 2}`).join(', ')},
         fecha_creacion = coalesce($${CAMPOS.length + 2}::timestamp, fecha_creacion), actualizado=now()
       WHERE id_trax=$${CAMPOS.length + 3}`,
      [id, ...vals, fecha, original],
    );
  } else {
    const existe = await one(`SELECT 1 FROM registros WHERE id_trax=$1`, [id]);
    if (existe) redirect(`/registros/${encodeURIComponent(id)}?aviso=existe`);
    const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const f = fecha ? new Date(fecha) : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const num = await one<{ n: number }>(`SELECT coalesce(max(numero),0)+1 n FROM registros`);
    await q(
      `INSERT INTO registros (id_trax, ${CAMPOS.join(', ')}, fecha_creacion, mes, numero)
       VALUES ($1, ${CAMPOS.map((_, i) => `$${i + 2}`).join(', ')}, $${CAMPOS.length + 2}::timestamp, $${CAMPOS.length + 3}, $${CAMPOS.length + 4})`,
      [id, ...vals, fecha ?? f.toISOString().slice(0, 16), MESES[f.getMonth()], num?.n ?? 1],
    );
  }
  revalidatePath('/', 'layout');
  redirect(`/registros/${encodeURIComponent(id)}?aviso=guardado`);
}

export async function eliminarRegistro(fd: FormData) {
  await q(`DELETE FROM registros WHERE id_trax=$1`, [t(fd, 'id_trax')]);
  revalidatePath('/', 'layout');
  redirect('/registros?aviso=eliminado');
}

export async function agregarSeguimiento(fd: FormData) {
  const id = t(fd, 'id_trax');
  const fecha = t(fd, 'fecha_contacto');
  if (!id || !fecha) throw new Error('Falta la fecha de contacto.');
  await q(
    `INSERT INTO seguimientos (id_trax, fecha_contacto, responsable, estado, proxima_accion, fecha_proxima, observacion)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, fecha, t(fd, 'responsable'), t(fd, 'estado'), t(fd, 'proxima_accion'), t(fd, 'fecha_proxima'), t(fd, 'observacion')],
  );
  revalidatePath('/', 'layout');
  const volver = t(fd, 'volver');
  redirect(volver && volver.startsWith('/') ? volver : `/registros/${encodeURIComponent(id)}?aviso=seguimiento`);
}

export async function eliminarSeguimiento(fd: FormData) {
  const id = t(fd, 'id_trax');
  await q(`DELETE FROM seguimientos WHERE id=$1`, [t(fd, 'id')]);
  revalidatePath('/', 'layout');
  redirect(`/registros/${encodeURIComponent(id ?? '')}`);
}

export async function agregarCatalogo(fd: FormData) {
  const tipo = t(fd, 'tipo'), valor = t(fd, 'valor');
  if (tipo && valor) {
    await q(
      `INSERT INTO catalogos (tipo, valor, orden) VALUES ($1,$2,(SELECT coalesce(max(orden),0)+1 FROM catalogos WHERE tipo=$1))
       ON CONFLICT DO NOTHING`,
      [tipo, valor],
    );
  }
  revalidatePath('/configuracion');
}

export async function eliminarCatalogo(fd: FormData) {
  await q(`DELETE FROM catalogos WHERE tipo=$1 AND valor=$2`, [t(fd, 'tipo'), t(fd, 'valor')]);
  revalidatePath('/configuracion');
}

export async function vaciarDatos(fd: FormData) {
  if (t(fd, 'confirmar') !== 'BORRAR') redirect('/configuracion?aviso=noconfirmado');
  const que = t(fd, 'que');
  if (que === 'todo') await q(`TRUNCATE seguimientos, registros, base_clientes`);
  if (que === 'base') await q(`TRUNCATE base_clientes`);
  if (que === 'seguimientos') await q(`TRUNCATE seguimientos`);
  revalidatePath('/', 'layout');
  redirect('/configuracion?aviso=vaciado');
}
