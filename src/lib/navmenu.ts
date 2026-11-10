// The header "tools ▾" dropdown (native <details>) needs one nudge to feel like a menu:
// close it when the click lands elsewhere (or on Escape). Links inside navigate anyway.

export function mountToolsMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>("details.tools");
  if (!menu) return;
  document.addEventListener("click", (e) => {
    if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.open) {
      menu.open = false;
      (menu.querySelector("summary") as HTMLElement | null)?.focus();
    }
  });
}
