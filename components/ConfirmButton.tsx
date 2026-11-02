'use client';
export default function ConfirmButton({ mensaje, children, className = 'btn danger' }: { mensaje: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!confirm(mensaje)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
