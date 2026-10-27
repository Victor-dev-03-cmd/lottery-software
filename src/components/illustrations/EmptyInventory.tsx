interface Props { size?: number; className?: string; }
export function EmptyInventory({ size = 120, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      {/* Box body — stronger blue fill */}
      <path d="M20 50 L60 32 L100 50 L100 90 L60 108 L20 90 Z" fill="#C5D8FB"/>
      <path d="M20 50 L60 32 L100 50 L100 90 L60 108 L20 90 Z" stroke="#4285F4" strokeWidth="2" strokeLinejoin="round"/>
      {/* Box lid crease */}
      <path d="M20 50 L60 68 L100 50" stroke="#1A73E8" strokeWidth="2" strokeLinejoin="round"/>
      <line x1="60" y1="68" x2="60" y2="108" stroke="#1A73E8" strokeWidth="2"/>
      {/* Left + right panels — slightly darker shading */}
      <path d="M60 68 L60 108 L20 90 L20 50 Z" fill="#A8C7FA" fillOpacity="0.4"/>
      {/* Magnifier */}
      <circle cx="80" cy="36" r="13" fill="#FFFFFF" stroke="#4285F4" strokeWidth="2"/>
      <line x1="89" y1="45" x2="98" y2="54" stroke="#4285F4" strokeWidth="3" strokeLinecap="round"/>
      <text x="80" y="41" textAnchor="middle" fontSize="13" fill="#5F6368" fontWeight="700">?</text>
    </svg>
  );
}
