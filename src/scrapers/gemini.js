// CLAMP — Gemini scraper

(function () {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCRAPE_CONVERSATION") {
      try {
        const result = scrape();
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }
  });

  function scrape() {
    const turns = [];

    // Gemini uses .query-content for user, .response-content for model
    const allEls = document.querySelectorAll(
      ".query-content, .response-content, " +
      "user-query, model-response, " +
      "[class*='user-query'], [class*='model-response']"
    );

    allEls.forEach((el) => {
      const cls = el.className + el.tagName.toLowerCase();
      const isUser = /query|user/i.test(cls);
      const label = isUser ? "USER" : "ASSISTANT";
      const text = el.innerText.trim();
      if (text) turns.push(`[${label}]: ${text}`);
    });

    if (turns.length === 0) return scrapeFallback();

    return {
      conversation: turns.join("\n\n"),
      platform: "gemini.google.com",
      turnCount: turns.length,
    };
  }

  function scrapeFallback() {
    const container = document.querySelector("chat-window, main, .conversation-container") || document.body;
    const text = container.innerText.trim();
    return {
      conversation: text || "[Could not extract conversation]",
      platform: "gemini.google.com",
      turnCount: 0,
      fallback: true,
    };
  }
})();
