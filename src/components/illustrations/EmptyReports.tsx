interface Props { size?: number; className?: string; }
export function EmptyReports({ size = 120, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      {/* Chart frame — more visible */}
      <rect x="12" y="16" width="96" height="76" rx="8" fill="#E8F0FE"/>
      <rect x="12" y="16" width="96" height="76" rx="8" stroke="#C5D8FB" strokeWidth="1"/>
      {/* Axes — stronger */}
      <line x1="28" y1="75" x2="96" y2="75" stroke="#9AA0A6" strokeWidth="1.5"/>
      <line x1="28" y1="28" x2="28" y2="75" stroke="#9AA0A6" strokeWidth="1.5"/>
      {/* Empty bar outlines — more visible dashes */}
      <rect x="38" y="48" width="12" height="27" rx="3" fill="#C5D8FB" fillOpacity="0.6" stroke="#4285F4" strokeWidth="1.2" strokeDasharray="3 2"/>
      <rect x="56" y="38" width="12" height="37" rx="3" fill="#C5D8FB" fillOpacity="0.6" stroke="#4285F4" strokeWidth="1.2" strokeDasharray="3 2"/>
      <rect x="74" y="54" width="12" height="21" rx="3" fill="#C5D8FB" fillOpacity="0.6" stroke="#4285F4" strokeWidth="1.2" strokeDasharray="3 2"/>
      {/* Trend line — solid, more visible */}
      <path d="M38 62 Q56 44 74 56 Q82 60 90 52" stroke="#4285F4" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" fill="none"/>
      {/* Dots at data points */}
      <circle cx="38" cy="62" r="3" fill="#4285F4"/>
      <circle cx="74" cy="56" r="3" fill="#4285F4"/>
      <circle cx="90" cy="52" r="3" fill="#4285F4"/>
      {/* Label bar */}
      <rect x="32" y="98" width="56" height="9" rx="4.5" fill="#C5D8FB"/>
    </svg>
  );
}
