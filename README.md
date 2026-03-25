# CLAMP — Context Lifecycle & Memory Protocol

> **Stop burning your AI session limits.**  
> One click. Conversation compressed. Fresh session opened. Ready to continue.

![CLAMP demo](assets/demo.gif)
<!-- record a quick gif of it working and drop it here — this alone doubles stars -->

---

## The problem nobody talks about

You're deep in a coding session with Claude or ChatGPT. The AI knows your entire codebase, your decisions, your half-finished architecture. The context is *rich*.

Then the session fills up. You open a new chat.

And spend the next 20 minutes re-explaining everything from scratch — burning half your new session limit before writing a single line.

**This happens to every serious AI user. Every day.**

The root problem isn't context length. It's that a 60,000-token conversation has maybe 4,000 tokens of load-bearing signal. The rest is noise — repeated file pastes, error traces, scaffolding that was useful once.

## What CLAMP does

CLAMP is a browser extension. One click while you're in any AI chat:

1. **Reads** your entire conversation
2. **Distills** it into a structured `CLAMP.md` — task, stack, decisions, blockers, resume
3. **Opens a new chat** on the same platform
4. **Pastes the summary** into the input box, ending with `Your prompt:` so you continue immediately

Zero re-explaining. Zero context lost. The session is fresh but the AI already knows everything.

## Install

**Option A — Load unpacked (30 seconds)**

1. Download [`clamp-v0.1.0.zip`](https://github.com/mohammed-bfaisal/clamp/releases/download/v0.1.0/clamp-v0.1.0.zip) and unzip
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the `clamp-ext` folder
5. Click the CLAMP icon → **Settings** → paste your [OpenRouter API key](https://openrouter.ai/keys) → Save

**Option B — Chrome Web Store**  
*(coming soon — star this repo to get notified)*

## Supported platforms

| Platform | Status |
|----------|--------|
| claude.ai | ✅ Supported |
| chatgpt.com | ✅ Supported |
| gemini.google.com | ✅ Supported |
| grok.x.com | 🔜 Coming soon |
| perplexity.ai | 🔜 Coming soon |

## What a CLAMP.md looks like
```markdown
# CLAMP v1

## TASK
Building a Chrome extension that compresses AI chat sessions and continues
them in a fresh tab. Currently working on the DOM injection into new tabs.

## STACK
- Manifest V3, vanilla JS (no build step)
- OpenRouter API for distillation
- Supports Claude, ChatGPT, Gemini

## STATE
Done: scraping, distillation API, popup UI, new tab opening
Active: fixing injection timing on ChatGPT's SPA
Pending: Firefox port, Chrome Web Store submission

## DECISIONS
1. executeScript over content scripts — works on pre-existing tabs, no install reload needed
2. OpenRouter over direct APIs — model-agnostic, user brings their own key
3. No build step — zero friction for contributors, load unpacked just works

## BLOCKERS
ChatGPT occasionally hydrates the input box late — retry loop handles it but
timing needs tuning on slow connections.

## RESUME
You are helping build CLAMP, a Chrome extension (Manifest V3) that scrapes
AI chat conversations, distills them via OpenRouter, and injects the summary
into a new chat tab. The scraping and distillation work. You're debugging the
contenteditable injection timing on chatgpt.com's React SPA.
```

## Why OpenRouter

CLAMP uses [OpenRouter](https://openrouter.ai) for distillation — not the chat platform's own API. This means:
- **Model-agnostic** — use Claude, GPT-4o, Gemini, or even free Llama models
- **Your key, your cost** — no CLAMP subscription, no data sent to us
- **~$0.001 per compression** with Haiku (the default)

## Roadmap

- [ ] Firefox support
- [ ] Chrome Web Store release
- [ ] `clamp watch` — token counter overlay that warns before you hit the wall
- [ ] Auto-detect session % and prompt compression proactively
- [ ] Offline mode — local distillation via Ollama

## Contributing

The scraper selectors break when AI platforms redeploy. This is the #1 thing that needs community maintenance.

If CLAMP stops working on a platform:
1. Open DevTools → Inspector on the conversation
2. Find the selector for human/AI turns
3. PR to update `src/scrapers/<platform>.js`

That's it. No build step, no toolchain. Just edit and PR.

## License

MIT — do whatever you want with it.

---

*Built because this problem was too annoying to ignore.*
