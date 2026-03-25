// CLAMP — Claude.ai scraper
// Extracts conversation turns from claude.ai DOM

(function () {
  // Listen for scrape requests from popup
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

    // Claude.ai conversation turns
    // Human turns: [data-testid="human-turn"] or .human-turn
    // AI turns: [data-testid="ai-turn"] or .ai-turn

    // Try primary selectors
    const humanTurns = document.querySelectorAll('[data-testid="human-turn"]');
    const aiTurns = document.querySelectorAll('[data-testid="ai-turn"]');

    if (humanTurns.length === 0 && aiTurns.length === 0) {
      // Fallback: try interleaved message containers
      return scrapeFallback();
    }

    // Build interleaved turns by DOM order
    const allTurnEls = document.querySelectorAll(
      '[data-testid="human-turn"], [data-testid="ai-turn"]'
    );

    allTurnEls.forEach((el) => {
      const isHuman = el.dataset.testid === "human-turn";
      const role = isHuman ? "USER" : "ASSISTANT";
      const text = el.innerText.trim();
      if (text) turns.push(`[${role}]: ${text}`);
    });

    if (turns.length === 0) return scrapeFallback();

    return {
      conversation: turns.join("\n\n"),
      platform: "claude.ai",
      turnCount: turns.length,
    };
  }

  function scrapeFallback() {
    // Generic fallback — grab all visible text blocks in conversation container
    const container =
      document.querySelector('[data-testid="conversation-content"]') ||
      document.querySelector("main") ||
      document.body;

    const blocks = container.querySelectorAll("p, li, pre, code, h1, h2, h3");
    const text = Array.from(blocks)
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .join("\n");

    return {
      conversation: text || "[Could not extract conversation — try copying manually]",
      platform: "claude.ai",
      turnCount: 0,
      fallback: true,
    };
  }
})();
