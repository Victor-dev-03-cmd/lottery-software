interface Props { size?: number; className?: string; }
export function EmptySearch({ size = 100, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      aria-hidden="true" className={className}
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="42" cy="42" r="26" fill="#EAF1FB"/>
      <circle cx="42" cy="42" r="26" stroke="#4285F4" strokeWidth="2"/>
      <line x1="61" y1="61" x2="82" y2="82" stroke="#4285F4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="34" y1="34" x2="50" y2="50" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round"/>
      <line x1="50" y1="34" x2="34" y2="50" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
