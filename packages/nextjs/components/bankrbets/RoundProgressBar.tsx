"use client";

interface RoundProgressBarProps {
  hasBet: boolean;
  isLocked: boolean;
  isSettled: boolean;
  isCancelled: boolean;
}

const steps = ["Bets Placed", "Bets Locked", "Round Settled"] as const;

export function RoundProgressBar({ hasBet, isLocked, isSettled, isCancelled }: RoundProgressBarProps) {
  // Determine the active step index (0-based)
  let activeStep = 0;
  if (isSettled || isCancelled) activeStep = 2;
  else if (isLocked) activeStep = 1;
  else if (hasBet) activeStep = 0;

  // Colors per step state
  const getStepColor = (idx: number) => {
    if (idx < activeStep) return "bg-pg-mint"; // completed
    if (idx === activeStep) {
      if (isCancelled) return "bg-pg-amber";
      if (isSettled) return "bg-pg-mint";
      return "bg-pg-violet"; // active
    }
    return "bg-base-300"; // upcoming
  };

  const getTextColor = (idx: number) => {
    if (idx < activeStep) return "text-pg-mint";
    if (idx === activeStep) {
      if (isCancelled) return "text-[#9a7200]";
      if (isSettled) return "text-pg-mint";
      return "text-pg-violet";
    }
    return "text-pg-muted/40";
  };

  const getLineColor = (idx: number) => {
    if (idx < activeStep) return "bg-pg-mint";
    return "bg-base-300";
  };

  const getLabel = (idx: number) => {
    if (idx === 2 && isCancelled) return "Cancelled";
    return steps[idx];
  };

  return (
    <div className="flex items-center justify-between w-full max-w-[280px] mx-auto">
      {steps.map((_, idx) => (
        <div key={idx} className="flex items-center flex-1 last:flex-none">
          {/* Step dot + label */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                idx <= activeStep ? `${getStepColor(idx)} border-transparent` : "bg-transparent border-base-300"
              } ${idx === activeStep && !isSettled && !isCancelled ? "ring-2 ring-offset-1 ring-pg-violet/30" : ""}`}
            />
            <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${getTextColor(idx)}`}>
              {getLabel(idx)}
            </span>
          </div>
          {/* Connecting line */}
          {idx < steps.length - 1 && (
            <div className={`h-[2px] flex-1 mx-1.5 rounded-full transition-all duration-300 ${getLineColor(idx)}`} />
          )}
        </div>
      ))}
    </div>
  );
}
