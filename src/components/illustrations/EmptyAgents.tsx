interface Props { size?: number; className?: string; }
export function EmptyAgents({ size = 110, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="38" cy="35" r="14" fill="#EAF1FB" stroke="#4285F4" strokeWidth="1.5"/>
      <path d="M12 80 Q12 60 38 60 Q64 60 64 80" fill="#EAF1FB" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="72" cy="38" r="12" fill="#F1F3F4" stroke="#9AA0A6" strokeWidth="1.5"/>
      <path d="M50 80 Q50 63 72 63 Q94 63 94 80" fill="#F1F3F4" stroke="#9AA0A6" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="88" cy="26" r="12" fill="#34A853"/>
      <line x1="88" y1="20" x2="88" y2="32" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="82" y1="26" x2="94" y2="26" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
