// Use rendered heights for the feel workbench's sticky offsets and scroll margins.

export function syncHeaderOffset(): void {
  const head = document.querySelector<HTMLElement>(".head");
  if (!head) return;
  const workbench = document.querySelector<HTMLElement>(".feel-main");
  const card = workbench?.querySelector<HTMLElement>(".feel-demo-card");
  const stage = workbench?.querySelector<HTMLElement>(".feel-stage");
  const apply = (): void => {
    document.documentElement.style.setProperty("--head-h", `${Math.ceil(head.offsetHeight)}px`);
    if (card) workbench?.style.setProperty("--feel-card-h", `${card.offsetHeight}px`);
    if (stage) workbench?.style.setProperty("--feel-stage-h", `${stage.offsetHeight}px`);
  };
  if (typeof ResizeObserver !== "undefined") {
    const resize = new ResizeObserver(apply);
    resize.observe(head);
    if (card) resize.observe(card);
    if (stage) resize.observe(stage);
  }
  apply();
}
