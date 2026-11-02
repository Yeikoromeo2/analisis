import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, tokenSesion } from '@/lib/auth';

async function entrar(fd: FormData) {
  'use server';
  const pass = process.env.APP_PASSWORD ?? '';
  const next = String(fd.get('next') || '/');
  if (String(fd.get('password')) !== pass) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(COOKIE, await tokenSesion(pass), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login">
      <form action={entrar} className="card login-card">
        <div className="brand-big">Gestión de Contactos</div>
        <p className="muted">Ingresa la contraseña del equipo.</p>
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <label>Contraseña<input type="password" name="password" autoFocus required /></label>
        {sp.error && <p className="error-text">Contraseña incorrecta.</p>}
        <button className="btn primary" type="submit">Entrar</button>
      </form>
    </div>
  );
}
