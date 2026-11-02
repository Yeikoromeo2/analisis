const usd = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 });
const num = new Intl.NumberFormat('es-PE');

export const money = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : usd.format(Number(v)));
export const int = (v: unknown) => num.format(Number(v ?? 0));
export const pct = (v: unknown) => `${(Number(v ?? 0) * 100).toFixed(1)}%`;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}
const pad = (n: number) => String(n).padStart(2, '0');
export const fecha = (v: unknown) => {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
};
export const fechaHora = (v: unknown) => {
  const d = toDate(v);
  return d ? `${fecha(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
};
export const isoDate = (v: unknown) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
};
export const hoyISO = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return isoDate(d);
};

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export const cruceClase = (c: string) =>
  c === 'NO ENCONTRADO' ? 'tag gris' : c === 'RAZÓN SOCIAL AMBIGUA' ? 'tag rojo' : c === 'ID' || c === 'ID + ID CSP' ? 'tag verde' : 'tag ambar';
