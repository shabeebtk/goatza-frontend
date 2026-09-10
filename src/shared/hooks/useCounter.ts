import { useEffect, useState } from "react";


// ── Hook: animated counter ───────────────────────────────────────
function useCounter(target: number, duration = 1200, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;

    // Every write goes through a frame, including the reduced-motion jump.
    // Setting state synchronously in the effect body is a cascading render, and
    // one frame is imperceptible for a value that is meant to appear at once.
    let raf = 0;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setCount(target));
      return () => cancelAnimationFrame(raf);
    }

    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
      else setCount(target);
    };
    raf = requestAnimationFrame(step);

    // The loop used to run uncancelled: unmounting mid-count left it ticking
    // and writing state into a component that was gone.
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return count;
}

export default useCounter;