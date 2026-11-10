// Header menus: the tools list and the Knowhy network list are native <details>.
// Close them on an outside click or Escape, and fold both into the mobile drawer.

export function mountToolsMenu(): void {
  const head = document.querySelector<HTMLElement>(".head");
  const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
  const menus = [...document.querySelectorAll<HTMLDetailsElement>("details.tools")];

  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    for (const menu of menus) {
      if (menu.open && !menu.contains(target)) menu.open = false;
    }
    if (head?.classList.contains("head-open") && toggle && head && !head.contains(target)) {
      head.classList.remove("head-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    let focusedMenu = false;
    for (const menu of menus) {
      if (!menu.open) continue;
      menu.open = false;
      focusedMenu = true;
      (menu.querySelector("summary") as HTMLElement | null)?.focus();
    }
    if (head?.classList.contains("head-open")) {
      head.classList.remove("head-open");
      toggle?.setAttribute("aria-expanded", "false");
      if (!focusedMenu) toggle?.focus();
    }
  });

  toggle?.addEventListener("click", () => {
    if (!head) return;
    const open = head.classList.toggle("head-open");
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) for (const menu of menus) menu.open = false;
  });
}
