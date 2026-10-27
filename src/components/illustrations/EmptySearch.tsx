interface Props { size?: number; className?: string; }
export function EmptySearch({ size = 100, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      {/* Lens — stronger fill */}
      <circle cx="42" cy="42" r="26" fill="#C5D8FB"/>
      <circle cx="42" cy="42" r="26" stroke="#4285F4" strokeWidth="2.5"/>
      {/* Handle */}
      <line x1="61" y1="61" x2="82" y2="82" stroke="#4285F4" strokeWidth="4" strokeLinecap="round"/>
      {/* X inside lens */}
      <line x1="33" y1="33" x2="51" y2="51" stroke="#5F6368" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="51" y1="33" x2="33" y2="51" stroke="#5F6368" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
