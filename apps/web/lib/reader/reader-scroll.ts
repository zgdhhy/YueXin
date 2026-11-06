/** Reading helpers also support an internal scroller; current desktop docking keeps window scrolling. */
export function readingScroller(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(".reader-copy");
  return el && getComputedStyle(el).overflowY === "auto" ? el : null;
}
export function readingScroll() {
  const el = readingScroller();
  return { top: el?.scrollTop ?? window.scrollY, height: el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - innerHeight };
}
export function scrollReadingBy(delta: number) {
  const el = readingScroller();
  if (el) el.scrollTop += delta;
  else window.scrollBy({ top: delta, behavior: "instant" });
}
