"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface InfoTooltipProps {
  text: string;
  iconClassName?: string;
}

export function InfoTooltip({ text, iconClassName = "h-3 w-3" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen(o => !o), []);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, true);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close, true);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // Position the tooltip so it doesn't overflow the viewport
  useEffect(() => {
    if (!open || !tipRef.current || !ref.current) return;
    const tip = tipRef.current;
    const icon = ref.current;
    const iconRect = icon.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Center horizontally relative to icon, clamp to viewport
    let left = iconRect.left + iconRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;

    // Place below icon by default, above if no room
    const below = iconRect.bottom + 6;
    const above = iconRect.top - tipRect.height - 6;
    if (below + tipRect.height > window.innerHeight - 8 && above > 8) {
      tip.style.top = `${above}px`;
    } else {
      tip.style.top = `${below}px`;
    }
  }, [open]);

  return (
    <span ref={ref} className="inline-flex items-center cursor-help relative" onClick={toggle}>
      <svg
        className={`${iconClassName} opacity-60`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="9" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18.75h.008v.008H12v-.008Z"
        />
      </svg>
      {open && (
        <div
          ref={tipRef}
          className="fixed z-[9999] max-w-[220px] px-3 py-2 rounded-lg bg-pg-slate text-white text-[11px] leading-relaxed text-center shadow-lg pointer-events-none"
          style={{ position: "fixed" }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
