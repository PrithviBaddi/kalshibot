// Extract a Kalshi-like ticker from the page and send it to the extension popup.
// This is heuristic because Kalshi page DOM can change.
(function () {
  let currentTicker = null
  let currentMarketTitle = null
  let lastHref = location.href

  function isLikelyContractTicker(t) {
    if (!t || typeof t !== 'string') return false
    const s = t.toUpperCase()
    // Contract tickers are typically long and hyphenated, like: KX...-...-...
    return s.startsWith('KX') && s.includes('-') && s.length >= 15
  }

  function isLikelyKalshiId(t) {
    if (!t || typeof t !== 'string') return false
    const s = t.toUpperCase()
    return s.startsWith('KX') && s.length >= 6
  }

  function normalizeTicker(t) {
    return String(t).toUpperCase()
  }

  function extractMarketTitleText() {
    try {
      const h1 = document.querySelector('h1')?.textContent?.trim()
      const h2 = document.querySelector('h2')?.textContent?.trim()
      const title = (document.title || '').trim()
      const raw = h1 || h2 || title
      return raw ? raw.slice(0, 140) : ''
    } catch (_) {
      return ''
    }
  }

  function pickBestTicker(candidates) {
    if (!candidates || candidates.length === 0) return null
    const normalized = candidates.map(normalizeTicker).filter(isLikelyKalshiId)
    if (normalized.length === 0) return null

    // Prefer the full contract ticker (hyphenated + long). If not found, return
    // the best-guess selector ID so the popup can resolve it via `/markets` later.
    const scored = normalized
      .map((t) => {
        const hyphenCount = (t.match(/-/g) || []).length
        const lengthScore = t.length
        return { t, score: hyphenCount * 10000 + lengthScore }
      })
      .sort((a, b) => b.score - a.score)
    return scored[0]?.t ?? null
  }

  function extractTickerFromText(text) {
    if (!text) return null
    // Grab all KX-like strings; then pick the best match (prefer hyphenated/longest).
    const candidates = String(text).match(/KX[A-Z0-9-]{4,}/gi) ?? []
    return pickBestTicker(candidates)
  }

  function extractTicker() {
    // 1) Prefer URL/path-based extraction.
    const path = location.pathname || ''
    const pathMatch = path.match(/\/markets\/([^/?#]+)/)
    if (pathMatch?.[1]) {
      const candidate = extractTickerFromText(pathMatch[1])
      if (candidate) return candidate
    }

    // 2) Try a DOM scan (contract tickers are often embedded in non-visible markup).
    try {
      const domText = document.documentElement?.innerHTML || ''
      if (domText) {
        const fromDom = extractTickerFromText(domText)
        if (fromDom) return fromDom
      }
    } catch (_) {}

    // 3) Try full URL.
    const fromUrl = extractTickerFromText(location.href || '')
    if (fromUrl) return fromUrl

    // 4) Scan visible text nodes (fallback).
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    let count = 0
    while ((node = walker.nextNode()) && count < 8000) {
      count++
      const t = (node.nodeValue || '').trim()
      if (t.length < 6) continue
      const candidate = extractTickerFromText(t)
      if (candidate) return candidate
    }

    return null
  }

  function extensionAlive() {
    try {
      return Boolean(chrome?.runtime?.id)
    } catch (_) {
      return false
    }
  }

  function safeSendMessage(payload) {
    try {
      if (!extensionAlive()) return
      chrome.runtime.sendMessage(payload, () => {
        // Swallow "Extension context invalidated" and similar transient errors.
        void chrome.runtime.lastError
      })
    } catch (_) {}
  }

  function persistTicker(ticker) {
    try {
      if (!isLikelyKalshiId(ticker)) return
      if (!extensionAlive()) return
      const normalized = normalizeTicker(ticker)
      currentTicker = normalized
      currentMarketTitle = extractMarketTitleText()
      chrome.storage.local.set(
        {
          detectedTicker: normalized,
          detectedMarketTitle: currentMarketTitle,
          detectedAt: Date.now(),
        },
        () => {
          // Swallow runtime invalidation during extension reload/update.
          void chrome.runtime.lastError
        },
      )
    } catch (_) {}
  }

  function detectAndStoreOnce() {
    if (!extensionAlive()) return false
    const t = extractTicker()
    if (t) {
      persistTicker(t)
      safeSendMessage({
        type: 'KALSHIBOT_TICKER',
        ticker: t,
        marketTitle: currentMarketTitle,
      })
      return true
    }
    return false
  }

  // Try detection immediately, then a few times in case content renders after load.
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      if (!currentTicker) detectAndStoreOnce()
    }, i * 700)
  }

  // Kalshi is often an SPA; when you switch markets in the same tab the content script stays mounted.
  // Poll URL changes; if it changes, clear cached ticker and re-detect.
  setInterval(() => {
    try {
      if (!extensionAlive()) return
      const href = location.href
      if (href !== lastHref) {
        lastHref = href
        currentTicker = null
        currentMarketTitle = null
        detectAndStoreOnce()
      }
    } catch (_) {}
  }, 900)

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!extensionAlive()) return
    if (!msg || msg.type !== 'KALSHIBOT_GET_TICKER') return
    const t = currentTicker
    if (t) {
      sendResponse({ ticker: t, marketTitle: currentMarketTitle })
      return true
    }

    const detected = extractTicker()
    if (detected) {
      persistTicker(detected)
      try {
        sendResponse({ ticker: detected, marketTitle: extractMarketTitleText() })
      } catch (_) {}
      return true
    }

    sendResponse({ ticker: null, marketTitle: null })
    return true
  })
})()

