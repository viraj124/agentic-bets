export const BankrBetsLogo = ({ className }: { className?: string }) => {
  return (
    <svg className={className} viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="6" width="72" height="72" rx="24" fill="#1F2A44" />
      <rect x="10" y="10" width="64" height="64" rx="20" fill="url(#bankr-bets-fill)" />
      <path
        d="M28 24H43C52.389 24 58 28.21 58 35.086C58 39.741 55.274 42.86 50.195 44.138C56.18 45.143 60 48.714 60 55.457C60 63.471 53.326 68 42.158 68H28V24Z"
        fill="#F7F3E8"
      />
      <path
        d="M38.421 31.289V40.695H42.568C46.851 40.695 49.126 39.145 49.126 35.95C49.126 32.816 46.851 31.289 42.568 31.289H38.421Z"
        fill="#7F5AF0"
      />
      <path
        d="M38.421 47.242V60.711H43.263C48.568 60.711 51.316 58.98 51.316 54.553C51.316 49.034 46.949 47.242 42.316 47.242H38.421Z"
        fill="#7F5AF0"
      />
      <circle cx="58" cy="26" r="5" fill="#F779B8" />
      <circle cx="25" cy="58" r="3.5" fill="#34D399" fillOpacity="0.95" />
      <path d="M19 19L27 27" stroke="#F7F3E8" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <defs>
        <linearGradient id="bankr-bets-fill" x1="16" y1="14" x2="70" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EF71B5" />
          <stop offset="0.52" stopColor="#9D6BF3" />
          <stop offset="1" stopColor="#7757EE" />
        </linearGradient>
      </defs>
    </svg>
  );
};
