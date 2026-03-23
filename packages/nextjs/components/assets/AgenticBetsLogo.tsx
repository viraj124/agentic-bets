export const AgenticBetsLogo = ({ className }: { className?: string }) => {
  return (
    <svg className={className} viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="6" width="72" height="72" rx="24" fill="#1F2A44" />
      <rect x="10" y="10" width="64" height="64" rx="20" fill="url(#agentic-bets-fill)" />
      <path d="M42 22L58 66H49.5L46 56H38L34.5 66H26L42 22Z" fill="#F7F3E8" />
      <path d="M39.5 50H44.5L42 42.5L39.5 50Z" fill="#7F5AF0" />
      <circle cx="58" cy="26" r="5" fill="#F779B8" />
      <circle cx="25" cy="58" r="3.5" fill="#34D399" fillOpacity="0.95" />
      <path d="M19 19L27 27" stroke="#F7F3E8" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <defs>
        <linearGradient id="agentic-bets-fill" x1="16" y1="14" x2="70" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EF71B5" />
          <stop offset="0.52" stopColor="#9D6BF3" />
          <stop offset="1" stopColor="#7757EE" />
        </linearGradient>
      </defs>
    </svg>
  );
};
