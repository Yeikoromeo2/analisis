'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Panel'],
  ['/registros', 'Registros'],
  ['/seguimiento', 'Seguimiento semanal'],
  ['/base', 'BASE de compras'],
  ['/verificacion', 'Verificación'],
  ['/datos', 'Importar / Exportar'],
  ['/configuracion', 'Configuración'],
  ['/instalar', 'Complemento Excel'],
];

export default function Nav() {
  const path = usePathname();
  if (path === '/login') return null;
  return (
    <nav className="nav">
      <div className="brand">Gestión de Contactos</div>
      {LINKS.map(([href, label]) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? 'active' : ''}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
