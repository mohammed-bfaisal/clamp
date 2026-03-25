// CLAMP — Background Service Worker
// Handles OpenRouter API calls and orchestrates the compress-and-continue flow

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

const DISTILL_SYSTEM_PROMPT = `You are CLAMP, a context distillation engine.

Read the conversation below and extract ONLY the load-bearing information.
Output a CLAMP.md file in EXACTLY this format — no preamble, no commentary, nothing else:

# CLAMP v1

## TASK
One to three sentences describing what is being built or solved. Be specific.

## STACK
Bullet list of languages, frameworks, tools, key dependencies. Omit if not a coding session.

## STRUCTURE
File/folder layout as understood from the conversation. Mark [done], [in-progress], [pending]. Omit if not applicable.

## STATE
What has been completed, what is active, what is queued next. Be concrete.

## DECISIONS
Numbered list of key choices made and WHY. This is the most valuable section — never skip if decisions were made.

## BLOCKERS
Unresolved problems or open questions. Write "None." if there are none.

## RESUME
A single cold-boot paragraph (3–5 sentences) in second person ("You are helping..."). Must be self-contained and immediately actionable for a fresh AI session.

Rules:
- Be ruthlessly concise. No fluff.
- If a section doesn't apply, write "N/A" rather than inventing content.
- DECISIONS is the most important section.
- RESUME must standalone — it's the first thing a fresh session reads.`;

// ── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DISTILL_AND_CONTINUE") {
    // sender.tab is undefined when message comes from popup — use tabId from payload
    chrome.tabs.get(message.payload.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ ok: false, error: "Could not find source tab." });
        return;
      }
      const hostname = new URL(tab.url).hostname;
      const supported = { "claude.ai":1, "chatgpt.com":1, "chat.openai.com":1, "gemini.google.com":1 };
      if (!supported[hostname]) {
        sendResponse({ ok: false, error: "Tab is not a supported platform." });
        return;
      }
      handleDistillAndContinue(message.payload, tab)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
    return true; // keep channel open for async
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(["apiKey", "model"], (data) => {
      sendResponse({ apiKey: data.apiKey || "", model: data.model || DEFAULT_MODEL });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ apiKey: message.apiKey, model: message.model }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ── Main flow ────────────────────────────────────────────────────────────────

async function handleDistillAndContinue(payload, sourceTab) {
  const { platform } = payload;

  // 1. Get settings
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("No OpenRouter API key set. Click the CLAMP icon to add one.");
  }

  // 2. Scrape — inject scraper directly at runtime (fixes "receiving end does not exist")
  const scrapeResults = await chrome.scripting.executeScript({
    target: { tabId: sourceTab.id },
    func: scrapeConversation,
    args: [platform],
  });

  const scrapeResult = scrapeResults?.[0]?.result;
  if (!scrapeResult?.ok) {
    throw new Error(scrapeResult?.error || "Could not read conversation from page.");
  }

  // 3. Distill
  const clampMd = await distill(scrapeResult.conversation, settings.apiKey, settings.model);

  // 4. Build the cold-boot prompt
  const coldBoot = buildColdBoot(clampMd);

  // 5. Open new chat on the same platform and inject
  await openNewChatAndInject(platform, coldBoot, sourceTab);

  return { clampMd };
}

// ── Scraper (injected into page at runtime) ───────────────────────────────────
// Runs in page context — no extension APIs, no closures.

function scrapeConversation(platform) {
  try {
    const turns = [];

    if (platform === "claude.ai") {
      const els = document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]');
      els.forEach((el) => {
        const role = el.dataset.testid === "human-turn" ? "USER" : "ASSISTANT";
        const text = el.innerText.trim();
        if (text) turns.push(`[${role}]: ${text}`);
      });
    }

    if (platform === "chatgpt.com") {
      const els = document.querySelectorAll("article[data-testid^='conversation-turn']");
      els.forEach((el) => {
        const roleEl = el.querySelector("[data-message-author-role]");
        const role = roleEl?.dataset?.messageAuthorRole === "user" ? "USER" : "ASSISTANT";
        const text = el.innerText.trim();
        if (text) turns.push(`[${role}]: ${text}`);
      });
    }

    if (platform === "gemini.google.com") {
      const els = document.querySelectorAll(".query-content, .response-content, user-query, model-response");
      els.forEach((el) => {
        const isUser = /query|user/i.test(el.className + el.tagName);
        const text = el.innerText.trim();
        if (text) turns.push(`[${isUser ? "USER" : "ASSISTANT"}]: ${text}`);
      });
    }

    // Fallback: grab all visible text if selectors found nothing
    if (turns.length === 0) {
      const body = document.querySelector("main")?.innerText || document.body.innerText;
      const trimmed = body.trim().slice(0, 40000);
      if (!trimmed) return { ok: false, error: "Page appears empty. Are you on a conversation page?" };
      return { ok: true, conversation: trimmed, platform, fallback: true };
    }

    return { ok: true, conversation: turns.join("\n\n"), platform, turnCount: turns.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Distillation ─────────────────────────────────────────────────────────────

async function distill(conversation, apiKey, model) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/clamp-protocol/clamp-ext",
      "X-Title": "CLAMP",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: DISTILL_SYSTEM_PROMPT },
        { role: "user", content: conversation },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenRouter error ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ── Cold-boot prompt builder ──────────────────────────────────────────────────

function buildColdBoot(clampMd) {
  return `${clampMd}

---

Your prompt:`;
}

// ── New chat + injection ──────────────────────────────────────────────────────

const NEW_CHAT_URLS = {
  "claude.ai": "https://claude.ai/new",
  "chatgpt.com": "https://chatgpt.com/",
  "chat.openai.com": "https://chatgpt.com/",
  "gemini.google.com": "https://gemini.google.com/app",
};

async function openNewChatAndInject(platform, coldBoot, sourceTab) {
  const newUrl = NEW_CHAT_URLS[platform];
  if (!newUrl) throw new Error(`Unsupported platform: ${platform}`);

  // Open new tab
  const newTab = await chrome.tabs.create({ url: newUrl, index: sourceTab.index + 1 });

  // Wait for page to load, then inject
  await waitForTabLoad(newTab.id);

  // Small extra delay for SPA hydration
  await sleep(1200);

  await chrome.scripting.executeScript({
    target: { tabId: newTab.id },
    func: injectTextIntoChat,
    args: [coldBoot, platform],
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Injected function (runs in page context) ──────────────────────────────────
// NOTE: This function is serialized and injected — no closure access.

function injectTextIntoChat(text, platform) {
  const SELECTORS = {
    "claude.ai": 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"]',
    "chatgpt.com": '#prompt-textarea, div[contenteditable="true"]',
    "chat.openai.com": '#prompt-textarea, div[contenteditable="true"]',
    "gemini.google.com": 'div[contenteditable="true"].ql-editor, div[contenteditable="true"]',
  };

  const selector = SELECTORS[platform] || 'div[contenteditable="true"], textarea';

  // Retry loop — SPA might not have rendered the input yet
  let attempts = 0;
  const maxAttempts = 20;

  function tryInject() {
    attempts++;
    const input = document.querySelector(selector);

    if (!input) {
      if (attempts < maxAttempts) {
        setTimeout(tryInject, 300);
      }
      return;
    }

    input.focus();

    if (input.tagName === "TEXTAREA") {
      // Standard textarea
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // contenteditable (Claude, ChatGPT, Gemini all use these)
      // Use execCommand for broadest compatibility
      input.innerHTML = "";
      input.focus();
      document.execCommand("insertText", false, text);

      // Fallback: direct innerHTML + input event
      if (!input.textContent.trim()) {
        input.textContent = text;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    }

    // Move cursor to end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(input);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  tryInject();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiKey", "model"], (data) => {
      resolve({ apiKey: data.apiKey || "", model: data.model || DEFAULT_MODEL });
    });
  });
}
