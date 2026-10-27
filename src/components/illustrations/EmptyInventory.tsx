interface Props { size?: number; className?: string; }
export function EmptyInventory({ size = 120, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      <path d="M20 50 L60 32 L100 50 L100 90 L60 108 L20 90 Z" fill="#EAF1FB"/>
      <path d="M20 50 L60 32 L100 50 L100 90 L60 108 L20 90 Z" stroke="#4285F4" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M20 50 L60 68 L100 50" stroke="#4285F4" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="60" y1="68" x2="60" y2="108" stroke="#4285F4" strokeWidth="1.5"/>
      <circle cx="80" cy="36" r="13" fill="#FFFFFF" stroke="#9AA0A6" strokeWidth="1.5"/>
      <line x1="89" y1="45" x2="98" y2="54" stroke="#9AA0A6" strokeWidth="2.5" strokeLinecap="round"/>
      <text x="80" y="41" textAnchor="middle" fontSize="12" fill="#9AA0A6" fontWeight="600">?</text>
    </svg>
  );
}
