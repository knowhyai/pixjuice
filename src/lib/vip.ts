// The VIP license, client side: activate with a key, cache the server-signed
// token in localStorage (claims + signature + expiry), and mark VIP-only
// controls. Any element with data-vip="1" is VIP-only: while no valid license
// is cached, clicks are intercepted with an upgrade hint and the control gets
// a lock badge (body.vip drives the CSS). The gate is advisory like every
// browser-side gate — what it protects is the one-click convenience.

import { t } from "./i18n";

const STORE = "pixjuice-vip";
const PUB_STORE = "pixjuice-vip-pub";
const REFRESH_MS = 24 * 60 * 60 * 1000; // re-check against the server once a day

export type VipPlan = "lifetime" | "yearly" | "monthly";

export interface VipState {
  plan: VipPlan;
  key: string;
  /** Epoch ms; 0 = lifetime. */
  expiresAt: number;
  token: string;
  /** When the server last confirmed this token (epoch ms). */
  checked: number;
}

interface Claims {
  k: string;
  p: VipPlan;
  e: number;
  i: number;
}

// ---- token plumbing

function b64urlToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function decodeToken(token: string): Claims | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(token.slice(0, dot)))) as Claims;
    if (typeof claims.k !== "string" || typeof claims.i !== "number") return null;
    if (claims.p !== "lifetime" && claims.p !== "yearly" && claims.p !== "monthly") return null;
    return claims;
  } catch {
    return null;
  }
}

let pubKey: CryptoKey | null = null;

/** Fetch (and cache) the token-signing public key; null when unreachable. */
async function getPubKey(): Promise<CryptoKey | null> {
  if (pubKey) return pubKey;
  try {
    let jwk = localStorage.getItem(PUB_STORE);
    try {
      const res = await fetch("/api/license/pubkey");
      if (res.ok) {
        jwk = await res.text();
        localStorage.setItem(PUB_STORE, jwk!);
      }
    } catch {
      /* offline — fall back to the cached key */
    }
    if (!jwk) return null;
    pubKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(jwk) as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return pubKey;
  } catch {
    return null;
  }
}

async function tokenSignatureOk(token: string): Promise<boolean | "offline"> {
  const key = await getPubKey();
  if (!key) return "offline";
  const dot = token.indexOf(".");
  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64urlToBytes(token.slice(dot + 1)) as unknown as ArrayBuffer,
      b64urlToBytes(token.slice(0, dot)) as unknown as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

// ---- state

let state: VipState | null = load();

type Listener = (s: VipState | null) => void;
const listeners = new Set<Listener>();

function load(): VipState | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const s = JSON.parse(raw) as VipState;
    if (!s.token || !s.plan) return null;
    const claims = decodeToken(s.token);
    if (!claims) return null;
    return { ...s, key: claims.k, plan: claims.p, expiresAt: claims.e };
  } catch {
    return null;
  }
}

function persist(next: VipState | null): void {
  state = next;
  try {
    if (next) localStorage.setItem(STORE, JSON.stringify(next));
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode — session only */
  }
  document.body.classList.toggle("vip", !!next);
  for (const fn of listeners) fn(next);
}

export function onVipChange(fn: Listener): void {
  listeners.add(fn);
}

export function vipState(): VipState | null {
  return state;
}

export function vipActive(): boolean {
  return !!state && (state.expiresAt === 0 || state.expiresAt > Date.now());
}

export function planLabel(plan: VipPlan): string {
  return t(`vip.plan.${plan}`);
}

/**
 * Check the cached token on load: locally the signature and expiry, and against
 * the server when the last confirmation is older than a day (revocations and
 * renewals land that way). A stale-but-unexpired license stays usable while the
 * re-check runs; a signature mismatch clears it immediately.
 */
export async function vipInit(): Promise<void> {
  if (!state) {
    document.body.classList.remove("vip");
    mountGuard();
    return;
  }
  const sig = await tokenSignatureOk(state.token);
  if (sig === false) {
    persist(null);
    mountGuard();
    return;
  }
  if (state.expiresAt !== 0 && state.expiresAt <= Date.now()) {
    persist(null);
    mountGuard();
    return;
  }
  document.body.classList.add("vip");
  if (Date.now() - state.checked > REFRESH_MS) void revalidate(state.key);
  mountGuard();
}

/** Silent server re-check of an already-activated key (revocation/renewal). */
async function revalidate(key: string): Promise<void> {
  try {
    const res = await postKey(key);
    const current = vipState();
    if (!current) return; // deactivated while the request was in flight
    if (res.valid && res.token) {
      persist({
        ...current,
        token: res.token,
        checked: Date.now(),
        plan: res.plan!,
        expiresAt: res.expiresAt ? Date.parse(`${res.expiresAt.replace(" ", "T")}Z`) : 0,
      });
    } else {
      persist(null);
    }
  } catch {
    /* offline — keep the cached token */
  }
}

interface VerifyResponse {
  valid: boolean;
  plan?: VipPlan;
  expiresAt?: string;
  token?: string;
}

async function postKey(key: string): Promise<VerifyResponse> {
  const res = await fetch("/api/license/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok && res.status !== 200 && res.status !== 403) throw new Error(`verify ${res.status}`);
  return (await res.json()) as VerifyResponse;
}

/** Activate with a pasted key. Returns a status string for the caller to show. */
export async function vipActivate(key: string): Promise<"ok" | "invalid" | "error"> {
  const trimmed = key.trim();
  if (!trimmed) return "invalid";
  try {
    const res = await postKey(trimmed);
    if (!res.valid || !res.token) {
      persist(null);
      return "invalid";
    }
    persist({
      plan: res.plan!,
      key: trimmed,
      expiresAt: res.expiresAt ? Date.parse(`${res.expiresAt.replace(" ", "T")}Z`) : 0,
      token: res.token,
      checked: Date.now(),
    });
    return "ok";
  } catch {
    return "error";
  }
}

export function vipDeactivate(): void {
  persist(null);
}

// ---- locks

let guardMounted = false;

/** While not VIP, intercept clicks on [data-vip] controls with an upgrade hint. */
function mountGuard(): void {
  if (guardMounted) return;
  guardMounted = true;
  document.addEventListener(
    "click",
    (e) => {
      if (vipActive()) return;
      const el = (e.target as Element | null)?.closest?.("[data-vip]");
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      vipToast();
    },
    true,
  );
}

let toastTimer = 0;

/** The one-line upgrade hint, with a link to the pricing page. */
export function vipToast(): void {
  let toast = document.getElementById("vip-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "vip-toast";
    toast.className = "vip-toast";
    const msg = document.createElement("span");
    msg.dataset.i18n = "vip.lockNote";
    const link = document.createElement("a");
    link.href = "/pricing/";
    link.dataset.i18n = "vip.lockCta";
    toast.append(msg, link);
    document.body.append(toast);
    // translate now (the static pass already ran for page chrome)
    msg.textContent = t("vip.lockNote");
    link.textContent = t("vip.lockCta");
  }
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast!.classList.remove("show"), 4200);
}
