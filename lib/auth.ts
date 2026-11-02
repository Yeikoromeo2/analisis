export const COOKIE = 'gc_sesion';

/** Token derivado de la contraseña: si cambia APP_PASSWORD, todas las sesiones caducan. */
export async function tokenSesion(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}:gestion-contactos:v1`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
