// CLAMP — ChatGPT scraper
// Extracts conversation turns from chatgpt.com DOM

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

    // ChatGPT uses article[data-testid="conversation-turn-N"]
    // Each turn has a role in data-message-author-role on a child div
    const turnEls = document.querySelectorAll("article[data-testid^='conversation-turn']");

    turnEls.forEach((el) => {
      const roleEl = el.querySelector("[data-message-author-role]");
      const role = roleEl?.dataset?.messageAuthorRole;
      if (!role) return;

      const label = role === "user" ? "USER" : "ASSISTANT";
      const text = el.innerText.trim();
      if (text) turns.push(`[${label}]: ${text}`);
    });

    if (turns.length === 0) return scrapeFallback();

    return {
      conversation: turns.join("\n\n"),
      platform: "chatgpt.com",
      turnCount: turns.length,
    };
  }

  function scrapeFallback() {
    // Older ChatGPT layout
    const msgs = document.querySelectorAll(
      ".text-message, [class*='ConversationItem'], [class*='message-content']"
    );

    const text = Array.from(msgs)
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .join("\n\n");

    return {
      conversation: text || "[Could not extract conversation — try copying manually]",
      platform: "chatgpt.com",
      turnCount: 0,
      fallback: true,
    };
  }
})();
