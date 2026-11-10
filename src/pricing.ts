// The pricing page: three plans that open Waffo's hosted checkout (created
// server-side by /api/waffo/checkout — prices never come from this page),
// plus license activation and the lost-key lookup.

import "./style.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { onVipChange, planLabel, vipActivate, vipDeactivate, vipInit, vipState } from "./lib/vip";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---- activation box (shared shape with the editor's VIP panel)

const statusEl = $("#vip-status");
function syncVip(): void {
  const s = vipState();
  $("#vip-active-row").hidden = !s;
  ($("#vip-key").closest(".row") as HTMLElement | null)?.classList.toggle("off", !!s);
  statusEl.textContent = s
    ? t("vip.status", { plan: planLabel(s.plan) })
    : t("vip.inactive");
}
syncVip();
onVipChange(syncVip);

async function tryActivate(key: string): Promise<void> {
  const btn = $<HTMLButtonElement>("#vip-activate");
  btn.disabled = true;
  btn.textContent = t("vip.checking");
  const r = await vipActivate(key);
  btn.disabled = false;
  btn.textContent = t("vip.activate");
  statusEl.textContent =
    r === "ok" ? t("vip.ok") : r === "invalid" ? t("vip.bad") : t("vip.err");
}

$<HTMLButtonElement>("#vip-activate").addEventListener("click", () => {
  const key = $<HTMLInputElement>("#vip-key").value.trim();
  if (key) void tryActivate(key);
});
$("#vip-key").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const key = $<HTMLInputElement>("#vip-key").value.trim();
    if (key) void tryActivate(key);
  }
});
$<HTMLButtonElement>("#vip-deactivate").addEventListener("click", () => vipDeactivate());

// returning from checkout: /pricing/?key=PJV-… auto-activates
const params = new URLSearchParams(location.search);
const returning = params.get("key");
if (returning) {
  statusEl.textContent = t("pricing.paid");
  void tryActivate(returning);
  params.delete("key");
  history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
}

// ---- lost-key lookup by email

$<HTMLButtonElement>("#lookup-go").addEventListener("click", () => {
  const email = $<HTMLInputElement>("#lookup-email").value.trim();
  const out = $("#lookup-out");
  if (!email) return;
  out.textContent = t("vip.checking");
  void (async () => {
    try {
      const res = await fetch("/api/license/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { keys?: { key: string; plan: string; expires_at: string | null }[] };
      if (!data.keys?.length) {
        out.textContent = t("pricing.lostNone");
        return;
      }
      out.replaceChildren(
        ...data.keys.flatMap((k, i) => {
          const line = document.createElement("span");
          line.textContent = `${k.key} · ${planLabel(k.plan as "lifetime" | "yearly" | "monthly")}${k.expires_at ? ` · ${k.expires_at.slice(0, 10)}` : ""}  `;
          const use = document.createElement("button");
          use.className = "btn";
          use.type = "button";
          use.textContent = t("pricing.useKey");
          use.addEventListener("click", () => {
            $<HTMLInputElement>("#vip-key").value = k.key;
            void tryActivate(k.key);
          });
          return i === 0 ? [line, use, document.createElement("br")] : [line, use, document.createElement("br")];
        }),
      );
    } catch {
      out.textContent = t("vip.err");
    }
  })();
});

// ---- buy buttons: the server creates the checkout session and picks the
// product; this page only redirects to the returned URL

document.querySelectorAll<HTMLButtonElement>(".buy").forEach((btn) => {
  btn.addEventListener("click", () => {
    const plan = btn.dataset.plan!;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("pricing.busy");
    void (async () => {
      try {
        const res = await fetch("/api/waffo/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = (await res.json()) as { checkoutUrl?: string; error?: string };
        if (res.ok && data.checkoutUrl && /^https:\/\//.test(data.checkoutUrl)) {
          location.href = data.checkoutUrl;
          return; // navigating away — leave the button as-is
        }
        btn.textContent = data.error === "This plan is not available yet" ? t("pricing.notAvail") : t("pricing.unavail");
        window.setTimeout(() => {
          btn.disabled = false;
          btn.textContent = label;
        }, 4000);
      } catch {
        btn.textContent = t("pricing.unavail");
        window.setTimeout(() => {
          btn.disabled = false;
          btn.textContent = label;
        }, 4000);
      }
    })();
  });
});

// ---- i18n

applyStaticText();
mountLangSwitcher();
onLocaleChange(() => {
  document.title = t("title.pricing");
  syncVip();
});
if (document.documentElement.lang !== "en") document.title = t("title.pricing");
void vipInit();
