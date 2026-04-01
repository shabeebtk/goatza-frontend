import { useEffect } from "react";


// ── Hook: 3D card tilt ───────────────────────────────────────────
function useTilt(ref: React.RefObject<HTMLElement | null>, intensity = 8) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      el.style.setProperty("--tilt-y", `${dx * intensity}deg`);
      el.style.setProperty("--tilt-x", `${-dy * intensity}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [ref, intensity]);
}

export default useTilt;