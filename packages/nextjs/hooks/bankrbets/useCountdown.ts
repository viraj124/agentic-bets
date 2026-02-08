import { useEffect, useState } from "react";

export function useCountdown(targetTimestamp: number) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, targetTimestamp - Math.floor(Date.now() / 1000));
      setTimeLeft(diff);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return {
    timeLeft,
    minutes,
    seconds,
    formatted: `${minutes}:${seconds.toString().padStart(2, "0")}`,
    isExpired: timeLeft === 0,
  };
}
