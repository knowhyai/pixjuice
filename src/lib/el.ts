// Tiny DOM builder used by the template/library pages: class/text/html are the
// common shortcuts, on* keys attach listeners, everything else is an attribute
// (false skips, true sets an empty attribute like `hidden`).

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag) as HTMLElementTagNameMap[K];
  for (const [k, v] of Object.entries(props)) {
    if (k === "class" || k === "className") e.className = String(v);
    else if (k === "text") e.textContent = String(v);
    else if (k === "html") e.innerHTML = String(v);
    else if (k.slice(0, 2) === "on" && typeof v === "function")
      e.addEventListener(k.slice(2), v as EventListener);
    else if (v === false) continue;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  e.append(...kids);
  return e;
}
