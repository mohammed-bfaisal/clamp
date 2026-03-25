// CLAMP — Popup controller

const SUPPORTED_PLATFORMS = {
  "claude.ai": "claude.ai",
  "chatgpt.com": "chatgpt.com",
  "chat.openai.com": "chatgpt.com",
  "gemini.google.com": "gemini.google.com",
};

// ── DOM refs ─────────────────────────────────────────────────────────────────

const el = (id) => document.getElementById(id);

const mainView = el("mainView");
const settingsView = el("settingsView");
const platformDot = el("platformDot");
const platformLabel = el("platformLabel");
const unsupportedMsg = el("unsupportedMsg");
const clampBtn = el("clampBtn");
const progress = el("progress");
const errorBox = el("errorBox");

const settingsToggle = el("settingsToggle");
const backBtn = el("backBtn");
const apiKeyInput = el("apiKeyInput");
const modelSelect = el("modelSelect");
const saveBtn = el("saveBtn");
const saveConfirm = el("saveConfirm");

// ── State ─────────────────────────────────────────────────────────────────────

let currentTab = null;
let currentPlatform = null;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const settings = await sendToBackground({ type: "GET_SETTINGS" });
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.model) modelSelect.value = settings.model;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const hostname = new URL(tab.url).hostname;
  const platform = SUPPORTED_PLATFORMS[hostname];

  if (platform) {
    currentPlatform = platform;
    platformDot.classList.remove("unsupported");
    platformLabel.textContent = platform;
    clampBtn.disabled = false;
  } else {
    platformDot.classList.add("unsupported");
    platformLabel.textContent = hostname || "unsupported platform";
    unsupportedMsg.style.display = "block";
    clampBtn.style.display = "none";
  }
}

// ── Main flow ─────────────────────────────────────────────────────────────────

clampBtn.addEventListener("click", async () => {
  clampBtn.disabled = true;
  errorBox.classList.remove("visible");
  progress.classList.add("visible");

  try {
    // Steps 1+2+3 all happen in background (scrape → distill → inject)
    // We animate progress steps with timing to reflect the actual flow
    setStep("scrape", "active");
    await sleep(400);

    const resultPromise = sendToBackground({
      type: "DISTILL_AND_CONTINUE",
      payload: { platform: currentPlatform, tabId: currentTab.id },
    });

    // After a beat, move to distill step (API call takes a few seconds)
    await sleep(800);
    setStep("scrape", "done");
    setStep("distill", "active");

    const result = await resultPromise;
    if (!result?.ok) throw new Error(result?.error || "Something went wrong.");

    setStep("distill", "done");
    setStep("inject", "active");
    await sleep(600);
    setStep("inject", "done");

    await sleep(400);
    window.close();

  } catch (err) {
    const activeStep = document.querySelector(".progress-step.active");
    if (activeStep) activeStep.classList.replace("active", "error");
    showError(err.message);
    clampBtn.disabled = false;
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

settingsToggle.addEventListener("click", () => {
  mainView.classList.remove("active");
  settingsView.classList.add("active");
});

backBtn.addEventListener("click", () => {
  settingsView.classList.remove("active");
  mainView.classList.add("active");
  saveConfirm.classList.remove("visible");
});

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  if (!apiKey) { apiKeyInput.focus(); return; }
  await sendToBackground({ type: "SAVE_SETTINGS", apiKey, model });
  saveConfirm.classList.add("visible");
  setTimeout(() => saveConfirm.classList.remove("visible"), 2000);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStep(stepId, state) {
  const step = el(`step-${stepId}`);
  if (!step) return;
  step.className = `progress-step ${state}`;
  const icon = step.querySelector(".step-icon");
  icon.textContent = state === "done" ? "✓" : state === "error" ? "✗" : state === "active" ? "›" : "○";
}

function showError(msg) {
  errorBox.textContent = `Error: ${msg}`;
  errorBox.classList.add("visible");
}

function sendToBackground(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

init();
