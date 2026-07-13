"use client";
import { useEffect } from "react";

/**
 * Smooth-scrolls in-page anchor clicks (href="#section") to the target,
 * offset-correct beneath the fixed header via each section's `scroll-margin-top`.
 *
 * Uses a capture-phase listener on the document so it fires before next/link's
 * own click handling — clicks on <Button href="#how"> (which renders a Link)
 * and plain <a href="#…"> nav links are handled identically, and Next never
 * gets a chance to do its own hash navigation. External/route links (no leading
 * "#") and modified clicks (new tab, etc.) are left completely untouched.
 */
export default function useSmoothScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.(
        'a[href^="#"]'
      ) as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.length < 2) return; // ignore "#" / empty

      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id);
      if (!target) return;

      // We own this click end-to-end: stop it reaching next/link's handler.
      e.preventDefault();
      e.stopPropagation();

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
