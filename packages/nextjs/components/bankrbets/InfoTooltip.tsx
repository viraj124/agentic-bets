"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  text: string;
  iconClassName?: string;
  children?: React.ReactNode;
}

export function InfoTooltip({ text, iconClassName = "h-3 w-3", children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(o => !o);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", close);
    };
  }, [open]);

  // Position tooltip above the trigger, clamped to viewport
  useLayoutEffect(() => {
    if (!open || !tipRef.current || !ref.current) return;
    const tip = tipRef.current;
    const anchor = ref.current.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    let left = anchor.left + anchor.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${anchor.top - tipRect.height - 8}px`;
  }, [open]);

  return (
    <span
      ref={ref}
      className="inline-flex items-center gap-1 cursor-help relative"
      onClick={toggle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
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
      {open &&
        createPortal(
          <div
            ref={tipRef}
            className="fixed z-[9999] w-max px-3.5 py-2.5 rounded-xl bg-[#2d1b69] text-white/90 text-[11px] leading-relaxed text-center shadow-[0_4px_20px_rgba(139,92,246,0.25)] border border-pg-violet/20 pointer-events-none whitespace-nowrap"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
