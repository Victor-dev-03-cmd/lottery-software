interface Props { size?: number; className?: string; }
export function EmptyInvoice({ size = 120, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      {/* Document — stronger fill */}
      <rect x="20" y="10" width="70" height="88" rx="8" fill="#C5D8FB"/>
      <rect x="20" y="10" width="70" height="88" rx="8" stroke="#4285F4" strokeWidth="2"/>
      {/* Fold corner */}
      <path d="M72 10 L90 28 L72 28 Z" fill="#4285F4" fillOpacity="0.35"/>
      <path d="M72 10 L90 28 H72 V10" stroke="#4285F4" strokeWidth="2" strokeLinejoin="round"/>
      {/* Content lines — more visible */}
      <line x1="32" y1="44" x2="78" y2="44" stroke="#5F6368" strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="54" x2="72" y2="54" stroke="#5F6368" strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="64" x2="68" y2="64" stroke="#9AA0A6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="32" y1="74" x2="58" y2="74" stroke="#9AA0A6" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Checkmark circle */}
      <circle cx="82" cy="90" r="14" fill="#E6F4EA"/>
      <circle cx="82" cy="90" r="14" stroke="#34A853" strokeWidth="2"/>
      <path d="M76 90 L80 94 L88 86" stroke="#34A853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
