import { GAME_BUILD } from './game-build';
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "./pilot.css";
const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const pilot = {
  enabled: env.VITE_PILOT_ENABLED === "true",
  canPlay: false,
  admin: false,
  userId: "",
  consent: false,
  epoch: "",
  progress: {} as Record<string, unknown>,
};
let client: SupabaseClient | null = null;
let sequence = 0;
const sessionId = crypto.randomUUID();
let samples: Record<string, unknown>[] = [];
let actions: Record<string, number> = {};
let sending = false;
let pending:
  | {
      samples: Record<string, unknown>[];
      epoch: string;
      sequence: number;
      device: ReturnType<typeof device>;
    }
  | undefined;
let retryAfter = 0;
let failures = 0;
let longTasks = 0;
let observer: PerformanceObserver | undefined;
const capture = window as Window & { __islandOutbreakPerfEnabled?: boolean };
const status = (node: HTMLElement, message: string) => {
  node.textContent = message;
};
const disclosure =
  "Share performance timings, frame rates, graphics settings, broad device information and counts of game actions to improve Island Outbreak. No passwords, typed text, audio or screen recordings are included. Reports are kept for up to 91 days and reviewed by the developer, potentially with AI analysis tools. Sharing is optional; you can play without it and turn it off in Game Data to delete your reports.";
function setReporting(allowed: boolean) {
  pilot.consent = allowed;
  capture.__islandOutbreakPerfEnabled = allowed;
  samples = [];
  actions = {};
  pending = undefined;
  retryAfter = 0;
  failures = 0;
  observer?.disconnect();
  longTasks = 0;
  if (allowed && "PerformanceObserver" in window) {
    try {
      observer = new PerformanceObserver((list) => {
        longTasks += list.getEntries().length;
      });
      observer.observe({ type: "longtask" });
    } catch {
      /* Unsupported browser. */
    }
  }
}
export function recordPilotAction(id: string) {
  if (!pilot.consent) return;
  const known =
    /^(shoot|reload|jump|slide|aim|pause|resume|restart|leaveSurvival|map|wildcard|hud|settings|graphics)/i;
  if (!known.test(id)) return;
  const key = id.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48);
  actions[key] = Math.min(1000000, (actions[key] || 0) + 1);
}
function device() {
  const ua = navigator.userAgent;
  return {
    browser: /Firefox/.test(ua)
      ? "Firefox"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua)
          ? "Safari"
          : "Other",
    os: /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : "Other",
    cores: navigator.hardwareConcurrency || null,
    memoryGB:
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory || null,
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  };
}
async function flush() {
  if (
    !client ||
    !pilot.consent ||
    sending ||
    (!pending && !samples.length) ||
    !navigator.onLine ||
    Date.now() < retryAfter
  )
    return;
  sending = true;
  const batch = (pending ||= {
    samples: samples.splice(0, 12),
    epoch: pilot.epoch,
    sequence: sequence++,
    device: device(),
  });
  try {
    const { error } = await client.rpc("pilot_report", {
      epoch: batch.epoch,
      session_id: sessionId,
      sequence: batch.sequence,
      build: GAME_BUILD,
      device: batch.device,
      samples: batch.samples,
    });
    if (error) throw error;
    if (pending === batch) pending = undefined;
    failures = 0;
    retryAfter = 0;
  } catch {
    if (pilot.consent && pilot.epoch === batch.epoch) {
      failures++;
      retryAfter =
        Date.now() + Math.min(300000, 15000 * 2 ** Math.min(failures, 5));
    }
  } finally {
    sending = false;
  }
}
function setupReports() {
  addEventListener("island-outbreak-performance", (event) => {
    if (!pilot.consent) return;
    const d = (event as CustomEvent<Record<string, number>>).detail;
    const sample: Record<string, unknown> = { actions, longTasks };
    actions = {};
    longTasks = 0;
    const mapping: Record<string, string> = {
      windowMs: "windowMs",
      frames: "frames",
      slowFrames: "slowFramesOver50ms",
      worstFrameMs: "worstFrameMs",
      callbackMs: "frameCallbackAvgMs",
      gapMs: "frameGapAvgMs",
      simulationMs: "simulationAvgMs",
      renderMs: "renderAvgMs",
      drawCalls: "drawCallsAvg",
      wave: "wave",
      livingZombies: "livingZombies",
      chunkQueueDepth: "chunkQueueDepth",
      pixelRatio: "pixelRatio",
      canvasWidth: "canvasWidth",
      canvasHeight: "canvasHeight",
      callbackMaxMs: "frameCallbackMaxMs",
      gapMaxMs: "frameGapMaxMs",
      simulationMaxMs: "simulationMaxMs",
      renderMaxMs: "renderMaxMs",
      drawCallsMax: "drawCallsMax",
    };
    for (const [key, source] of Object.entries(mapping))
      sample[key] = Number.isFinite(d[source]) ? Math.max(0, d[source]) : 0;
    const costs: Record<string, number> = {};
    for (const phase of [
      "survivalUpdate",
      "aimQuery",
      "mapUpdate",
      "chunkPump",
      "chunkStream",
      "fire",
      "enemyAI",
      "combatEffects",
    ]) {
      for (const suffix of ["AvgMs", "MaxMs", "Samples", "Count"]) {
        const n = d[phase + suffix];
        if (Number.isFinite(n)) costs[phase + suffix] = Math.max(0, n);
      }
    }
    sample.costs = costs;
    const histogram = (
      d as unknown as { frameHistogram?: Record<string, number> }
    ).frameHistogram;
    if (histogram) sample.histogram = histogram;
    samples.push(sample);
    samples = samples.slice(-24);
    if (samples.length >= 6) void flush();
  });
  // The game finishes each capture after two minutes; rearm on the next task only with consent.
  setInterval(() => {
    if (pilot.consent) capture.__islandOutbreakPerfEnabled = true;
    void flush();
  }, 30000);
  const recordButton = (e: Event) => {
    const node =
      e.target instanceof Element ? e.target.closest("button") : null;
    if (node?.id) recordPilotAction(node.id);
  };
  document.addEventListener("pointerdown", recordButton, true);
  document.addEventListener(
    "click",
    (e) => {
      if (e.detail === 0) recordButton(e);
    },
    true,
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flush();
  });
  addEventListener("error", () => {
    if (pilot.consent) actions.runtimeError = (actions.runtimeError || 0) + 1;
  });
  addEventListener("unhandledrejection", () => {
    if (pilot.consent)
      actions.unhandledRejection = (actions.unhandledRejection || 0) + 1;
  });
}
function settings(admin: boolean) {
  const page = document.querySelector<HTMLElement>(
    '[data-settings-page="diagnostics"]',
  );
  const tab = document.querySelector<HTMLElement>(
    '[data-settings-tab="diagnostics"]',
  );
  if (tab) tab.textContent = "GAME DATA";
  if (!page) return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "pilot-data";
  const heading = document.createElement("h3");
  heading.textContent = "GAME DATA";
  const text = document.createElement("p");
  text.textContent = disclosure;
  const button = document.createElement("button");
  button.textContent = pilot.consent
    ? "STOP SHARING & DELETE REPORTS"
    : "ALLOW PERFORMANCE REPORTS";
  const message = document.createElement("p");
  message.setAttribute("aria-live", "polite");
  let pendingWithdrawal =
    localStorage.getItem("pilot-withdrawal:" + pilot.userId) === "pending";
  if (pendingWithdrawal) button.textContent = "RETRY DELETION";
  button.onclick = async () => {
    button.disabled = true;
    const allowed = pendingWithdrawal ? false : !pilot.consent;
    if (!allowed) {
      pendingWithdrawal = true;
      localStorage.setItem("pilot-withdrawal:" + pilot.userId, "pending");
      setReporting(false);
    }
    const { data, error } = await client!.rpc("pilot_consent", { allowed });
    if (error) {
      status(
        message,
        allowed
          ? "Could not enable sharing. Please retry."
          : "Reporting stopped on this device. Server deletion is pending; retry when connected.",
      );
      button.textContent = pendingWithdrawal
        ? "RETRY DELETION"
        : "ALLOW PERFORMANCE REPORTS";
    } else {
      pendingWithdrawal = false;
      localStorage.removeItem("pilot-withdrawal:" + pilot.userId);
      pilot.epoch = data;
      setReporting(allowed);
      button.textContent = allowed
        ? "STOP SHARING & DELETE REPORTS"
        : "ALLOW PERFORMANCE REPORTS";
      status(
        message,
        allowed
          ? "Sharing enabled."
          : "Sharing stopped and stored reports deleted.",
      );
    }
    button.disabled = false;
  };
  const logout = document.createElement("button");
  logout.textContent = "SIGN OUT";
  logout.onclick = async () => {
    setReporting(false);
    await client!.auth.signOut();
    location.reload();
  };
  section.append(heading, text, button, message, logout);
  if (admin) {
    const analytics = document.createElement("a");
    analytics.textContent = "OPEN OWNER CONTROL CENTER ↗";
    analytics.href = "/control-center.html";
    analytics.target = "_blank"; analytics.rel = "noopener";
    analytics.className = "pilot-owner-link";
    section.append(analytics);
  }
  page.append(section);
}
export async function initializePilot() {
  if (!pilot.enabled) {
    pilot.canPlay = true;
    return;
  }
  capture.__islandOutbreakPerfEnabled = false;
  const overlay = document.createElement("div");
  overlay.className = "pilot-overlay";
  overlay.innerHTML =
    '<section class="pilot-card"><h1>ISLAND OUTBREAK</h1><p>First deployment · 20-player pilot</p><form><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button type="submit">SIGN IN</button><button type="button" data-signup>CREATE ACCOUNT</button><button type="button" data-reset>RESET PASSWORD</button></form><p role="status" aria-live="polite"></p></section>';
  document.body.classList.add("pilot-auth");
  document.body.append(overlay);
  const card = overlay.querySelector<HTMLElement>("section")!;
  const message = card.querySelector<HTMLElement>('[role="status"]')!;
  if (
    !env.VITE_SUPABASE_URL ||
    !env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
  ) {
    status(
      message,
      "Pilot setup is in progress. Please return when the launch link is ready.",
    );
    card.querySelector("form")!.remove();
    await new Promise(() => {});
    return;
  }
  client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  await new Promise<void>((resolve) => {
    let working = false;
    const enter = async () => {
      if (working || pilot.canPlay) return;
      working = true;
      try {
        const {
          data: { session },
        } = await client!.auth.getSession();
        if (!session) return;
        const { data, error } = await client!.rpc("pilot_admit");
        if (error) {
          status(message, error.message);
          return;
        }
        if (!data.admitted) {
          status(
            message,
            "All 20 pilot places are taken. Existing players can still sign in.",
          );
          return;
        }
        pilot.userId = session.user.id;
        pilot.epoch = data.epoch;
        pilot.progress = data.progress || {};
        if (
          localStorage.getItem("pilot-withdrawal:" + pilot.userId) === "pending"
        ) {
          setReporting(false);
          const withdrawal = await client!.rpc("pilot_consent", {
            allowed: false,
          });
          data.consent = false;
          if (!withdrawal.error) {
            pilot.epoch = withdrawal.data;
            localStorage.removeItem("pilot-withdrawal:" + pilot.userId);
          }
        }
        if (data.consent === null) {
          card.querySelector("form")?.remove();
          const explanation = document.createElement("p");
          explanation.textContent = disclosure;
          const yes = document.createElement("button");
          yes.textContent = "ALLOW GAME DATA";
          const no = document.createElement("button");
          no.textContent = "PLAY WITHOUT SHARING";
          card.insertBefore(explanation, message);
          card.insertBefore(yes, message);
          card.insertBefore(no, message);
          await new Promise<void>((choice) => {
            for (const [button, allowed] of [
              [yes, true],
              [no, false],
            ] as const)
              button.onclick = async () => {
                yes.disabled = no.disabled = true;
                const { data: epoch, error: err } = await client!.rpc(
                  "pilot_consent",
                  { allowed },
                );
                if (err) {
                  status(message, "Could not save your choice. Please retry.");
                  yes.disabled = no.disabled = false;
                  return;
                }
                pilot.epoch = epoch;
                setReporting(allowed);
                choice();
              };
          });
        } else setReporting(data.consent === true);
        pilot.canPlay = true;
        pilot.admin = data.admin === true;
        settings(data.admin === true);
        setupReports();
        overlay.remove();
        document.body.classList.remove("pilot-auth");
        resolve();
      } finally {
        working = false;
      }
    };
    const form = card.querySelector<HTMLFormElement>("form")!;
    const credentials = () => {
      const data = new FormData(form);
      return {
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || ""),
      };
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      status(message, "Signing in…");
      const { error } = await client!.auth.signInWithPassword(credentials());
      if (error) status(message, error.message);
      else await enter();
    };
    card.querySelector<HTMLButtonElement>("[data-signup]")!.onclick =
      async () => {
        if (!form.reportValidity()) return;
        const { error } = await client!.auth.signUp({
          ...credentials(),
          options: { emailRedirectTo: location.origin },
        });
        status(
          message,
          error
            ? error.message
            : "Check your email to confirm your account, then sign in. A place is assigned after confirmation.",
        );
      };
    card.querySelector<HTMLButtonElement>("[data-reset]")!.onclick =
      async () => {
        const { error } = await client!.auth.resetPasswordForEmail(
          credentials().email,
          { redirectTo: location.origin + "/?recovery=1" },
        );
        status(
          message,
          error
            ? error.message
            : "If that account exists, a password reset email has been requested.",
        );
      };
    client!.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        const email = form.elements.namedItem("email") as HTMLInputElement;
        email.required = false;
        email.closest("label")!.hidden = true;
        form.querySelectorAll<HTMLButtonElement>("[data-signup], [data-reset]").forEach((button) => { button.hidden = true; });
        const input = form.elements.namedItem("password") as HTMLInputElement;
        input.autocomplete = "new-password";
        form.querySelector("button")!.textContent = "SAVE NEW PASSWORD";
        form.onsubmit = async (e) => {
          e.preventDefault();
          const { error } = await client!.auth.updateUser({
            password: input.value,
          });
          if (error) status(message, error.message);
          else {
            history.replaceState(null, "", location.pathname);
            await enter();
          }
        };
      } else if (event === "SIGNED_OUT" && pilot.canPlay) {
        setReporting(false);
        location.reload();
      }
    });
    if (!location.search.includes("recovery=1")) void enter();
  });
}
let progressTimer: ReturnType<typeof setTimeout> | undefined;
let progressDirty = false;
let progressSending = false;
let progressFailures = 0;
async function flushPilotProgress() {
  if (!client || progressSending || !progressDirty) return;
  progressSending = true;
  progressDirty = false;
  try {
    const { error } = await client.rpc("pilot_save_progress", { value: pilot.progress });
    if (error) throw error;
    progressFailures = 0;
  } catch {
    progressDirty = true;
    progressFailures++;
  } finally {
    progressSending = false;
    if (progressDirty) {
      clearTimeout(progressTimer);
      progressTimer = setTimeout(() => void flushPilotProgress(), progressFailures
        ? Math.min(300000, 15000 * 2 ** Math.min(progressFailures - 1, 5)) : 1500);
    }
  }
}
export function savePilotProgress(value: Record<string, unknown>) {
  if (!pilot.enabled || !client || !pilot.canPlay) return;
  pilot.progress = { ...pilot.progress, ...structuredClone(value) };
  progressDirty = true;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => void flushPilotProgress(), 1500);
}

export async function fetchControlCenter(days: number, build: string | null): Promise<import('./control-center').ControlCenterData> {
  if (!client || !pilot.admin) throw new Error('Owner access required');
  const { data, error } = await client.rpc('pilot_control_center', { days, selected_build: build });
  if (error || !data) throw error || new Error('Analytics unavailable');
  return data;
}

export async function signOutPilot(): Promise<void> {
  setReporting(false);
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  location.reload();
}
