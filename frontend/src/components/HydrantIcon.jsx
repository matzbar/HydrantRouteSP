/**
 * Ícone de hidrante de coluna (tampa, corpo, saídas laterais e base), na cor atual do texto (`currentColor`).
 * Decorativo: quem usa deve dar o nome da situação em texto ao lado.
 */
export default function HydrantIcon({ className = "w-5 h-5", ...props }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <rect x="10" y="2" width="4" height="2" rx="0.5" />
      <path d="M7 8a5 5 0 0 1 10 0v1H7z" />
      <rect x="7.5" y="9.5" width="9" height="9.5" rx="1" />
      <rect x="3.5" y="11" width="4" height="3.5" rx="0.75" />
      <rect x="16.5" y="11" width="4" height="3.5" rx="0.75" />
      <rect x="5.5" y="19.5" width="13" height="2.5" rx="0.75" />
    </svg>
  );
}
