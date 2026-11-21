// Publishes the sticky site header's real height as --head-h on <html>, so
// sticky demo stages and scroll-margins can sit exactly below it at every
// width — the ≤900px header wraps its nav to a variable height no static
// media query can predict. Runs on the two feel recipe pages.

export function syncHeaderOffset(): void {
  const head = document.querySelector<HTMLElement>(".head");
  if (!head) return;
  const apply = (): void => {
    document.documentElement.style.setProperty("--head-h", `${Math.ceil(head.offsetHeight)}px`);
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(apply).observe(head);
  apply();
}
