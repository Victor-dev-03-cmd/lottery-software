interface Props { size?: number; className?: string; }
export function EmptyReports({ size = 120, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="16" width="96" height="76" rx="8" fill="#F1F3F4"/>
      <line x1="28" y1="75" x2="96" y2="75" stroke="#E0E3E7" strokeWidth="1.5"/>
      <line x1="28" y1="28" x2="28" y2="75" stroke="#E0E3E7" strokeWidth="1.5"/>
      <rect x="38" y="48" width="12" height="27" rx="3" fill="#EAF1FB" stroke="#C5D8FB" strokeWidth="1" strokeDasharray="3 2"/>
      <rect x="56" y="38" width="12" height="37" rx="3" fill="#EAF1FB" stroke="#C5D8FB" strokeWidth="1" strokeDasharray="3 2"/>
      <rect x="74" y="54" width="12" height="21" rx="3" fill="#EAF1FB" stroke="#C5D8FB" strokeWidth="1" strokeDasharray="3 2"/>
      <path d="M38 62 Q56 44 74 56 Q82 60 90 52" stroke="#4285F4" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" fill="none"/>
      <rect x="32" y="98" width="56" height="10" rx="5" fill="#E0E3E7"/>
    </svg>
  );
}
