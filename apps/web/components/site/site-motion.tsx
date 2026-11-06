"use client";

import { useEffect, useRef } from "react";

/** Progressive enhancement: content is visible and usable without motion or JS. */
export function SiteMotion({ children, cinematic = false }: { children: React.ReactNode; cinematic?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!root.current || reducedMotion.matches || !("IntersectionObserver" in window)) return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        if (!reducedMotion.matches && !document.activeElement?.matches(":focus-visible")) {
          animations.push(entry.target.animate([
            { opacity: 0, transform: `translateY(${cinematic ? 32 : 12}px)` },
            { opacity: 1, transform: "translateY(0)" },
          ], { duration: cinematic ? 850 : 450, delay: index * 75, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" }));
        }
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    const stopMotion = () => { if (reducedMotion.matches) animations.forEach(animation => animation.cancel()); };
    reducedMotion.addEventListener("change", stopMotion);
    root.current.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => { observer.disconnect(); reducedMotion.removeEventListener("change", stopMotion); animations.forEach(animation => animation.cancel()); };
  }, [cinematic]);
  return <div ref={root}>{children}</div>;
}
