const state = {
  apiBase: 'http://127.0.0.1:8000',
  apiToken: '',
  ticker: null,
  strategy: null,
  optionCandidates: [],
}

function authHeaders() {
  const t = state.apiToken && String(state.apiToken).trim()
  if (!t) return {}
  return { Authorization: `Bearer ${t}` }
}

function isLikelyContractTicker(t) {
  if (!t || typeof t !== 'string') return false
  const s = t.toUpperCase()
  // Contract tickers are typically long and hyphenated, like `KX...-...-...`.
  return s.startsWith('KX') && s.includes('-') && s.length >= 15
}

function isLikelyKalshiId(t) {
  if (!t || typeof t !== 'string') return false
  const s = t.toUpperCase()
  return s.startsWith('KX') && s.length >= 6
}

function el(id) {
  return document.getElementById(id)
}

function showOptionsPicker(markets, defaultTicker) {
  state.optionCandidates = Array.isArray(markets) ? markets : []
  const card = el('optionsCard')
  const select = el('optionsSelect')
  const apply = el('applyOption')
  if (!card || !select || !apply) return

  if (state.optionCandidates.length <= 1) {
    card.style.display = 'none'
    return
  }

  select.innerHTML = ''
  for (const m of state.optionCandidates) {
    const opt = document.createElement('option')
    opt.value = String(m?.ticker ?? '')
    const title = String(m?.title ?? m?.ticker ?? '')
    const yesAsk = m?.yes_ask_dollars ?? m?.yes_ask ?? ''
    opt.textContent = `${title}${yesAsk !== '' ? ` (YES ask ${String(yesAsk)})` : ''}`
    if (defaultTicker && String(m?.ticker ?? '') === String(defaultTicker)) opt.selected = true
    select.appendChild(opt)
  }

  card.style.display = 'block'
  apply.onclick = async () => {
    const t = select.value
    if (!t) return
    // For contract tickers, this will fetch directly and refresh verdicts/orders buttons.
    await loadEverythingForTicker(t, el('market')?.textContent || '')
  }
}

function centsFromDollarsMaybe(x) {
  const n = typeof x === 'number' ? x : Number(x)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return cents >= 1 && cents <= 99 ? cents : null
}

function midCentsFromYesBidAsk(m) {
  const bid = centsFromDollarsMaybe(m?.yes_bid_dollars ?? m?.yes_bid)
  const ask = centsFromDollarsMaybe(m?.yes_ask_dollars ?? m?.yes_ask)
  if (bid == null || ask == null) return null
  const mid = Math.round((bid + ask) / 2)
  return mid >= 1 && mid <= 99 ? mid : null
}

async function apiGet(path) {
  const res = await fetch(`${state.apiBase}${path}`, {
    cache: 'no-store',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`)
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${state.apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`)
  return res.json()
}

function setStatusLine(text, kind) {
  const line = el('statusLine')
  line.textContent = text || ''
  line.style.color = kind === 'error' ? '#ff4d6a' : 'var(--text2)'
}

function renderBotStatus(strategy) {
  state.strategy = strategy
  if (!strategy) {
    el('botStatus').textContent = '—'
    return
  }
  if (!strategy.bot_enabled) {
    el('botStatus').textContent = 'Bot is OFF (paper-only disabled)'
    return
  }
  el('botStatus').textContent = strategy.paper_mode ? 'Paper mode ON' : 'LIVE mode ON (extension is paper-only)'
}

function setAnalysisIdle(message) {
  const loading = el('analysisLoading')
  const body = el('analysisBody')
  const err = el('analysisError')
  if (loading) {
    loading.style.display = 'block'
    loading.textContent = message || '—'
  }
  if (body) body.style.display = 'none'
  if (err) {
    err.style.display = 'none'
    err.textContent = ''
  }
}

function renderAnalysis(resp) {
  const a = resp && resp.analysis
  const loading = el('analysisLoading')
  const body = el('analysisBody')
  const err = el('analysisError')
  if (!loading || !body) return
  if (!a) {
    setAnalysisIdle('No analysis in response.')
    return
  }
  loading.style.display = 'none'
  if (err) {
    err.style.display = 'none'
    err.textContent = ''
  }
  body.style.display = 'block'

  const pct = (x) =>
    typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—'
  el('aiModelYes').textContent = pct(a.model_yes_probability)
  el('aiMarketYes').textContent = pct(a.implied_yes_probability)

  const edge = a.edge_vs_market_yes
  const edgeEl = el('aiEdge')
  if (typeof edge === 'number' && Number.isFinite(edge)) {
    const pp = edge * 100
    edgeEl.textContent = `${pp >= 0 ? '+' : ''}${pp.toFixed(1)} pp`
    edgeEl.style.color = pp > 0 ? 'var(--accent)' : pp < 0 ? 'var(--red)' : 'var(--text)'
  } else {
    edgeEl.textContent = '—'
    edgeEl.style.color = 'var(--accent)'
  }

  const conf = a.confidence
  const lab = a.confidence_label || ''
  el('aiConfidence').textContent =
    typeof conf === 'number' && Number.isFinite(conf)
      ? `${(conf * 100).toFixed(0)}%${lab ? ` · ${lab}` : ''}`
      : '—'

  el('aiRationale').textContent = String(a.rationale || '').slice(0, 280)

  const newsEl = el('aiNewsHeadlines')
  const n = a.news
  if (newsEl) {
    if (n && n.ok === true && Array.isArray(n.headlines) && n.headlines.length) {
      newsEl.style.display = 'block'
      const rows = n.headlines
        .slice(0, 5)
        .map((h) => {
          const t = String(h?.title || '').slice(0, 140)
          const s = String(h?.source || '').trim()
          const src = s ? `<span class="newsSrc">${s}</span> ` : ''
          return `<div class="newsLine">${src}${t}</div>`
        })
        .join('')
      newsEl.innerHTML = `<div class="newsLabel">Recent headlines</div>${rows}`
    } else {
      newsEl.style.display = 'none'
      newsEl.innerHTML = ''
    }
  }

  const claude = resp.claude_enriched === true
  const newsOk = resp.news_fetched === true
  let src = 'Source: market mid baseline (liquidity-based confidence)'
  if (claude && newsOk) src = 'Source: Claude + market + NewsAPI (server keys)'
  else if (claude) src = 'Source: Claude + market (ANTHROPIC_API_KEY on server)'
  else if (newsOk) src = 'Source: market baseline; NewsAPI headlines attached'
  el('aiSource').textContent = src

  el('aiSource').style.marginTop = '8px'
}

async function fetchAnalysis(ticker, title) {
  const loading = el('analysisLoading')
  const body = el('analysisBody')
  const err = el('analysisError')
  if (!loading) return
  loading.style.display = 'block'
  loading.textContent = 'Fetching market snapshot and model…'
  if (body) body.style.display = 'none'
  if (err) {
    err.style.display = 'none'
    err.textContent = ''
  }
  try {
    const resp = await apiPost('/api/v1/analysis/market', {
      ticker,
      title: title || null,
    })
    renderAnalysis(resp)
  } catch (e) {
    loading.style.display = 'none'
    if (body) body.style.display = 'none'
    if (err) {
      err.style.display = 'block'
      err.textContent = `Analysis failed: ${String(e.message || e).slice(0, 200)}`
    }
  }
}

function renderVerdict(side, verdict, reasons) {
  const vEl = side === 'yes' ? el('yesVerdict') : el('noVerdict')
  const rEl = side === 'yes' ? el('yesReasons') : el('noReasons')

  if (!verdict) {
    vEl.textContent = '—'
    rEl.textContent = ''
    return
  }

  const ok = verdict.allowed === true
  vEl.textContent = ok ? 'ALLOWED (paper)' : 'BLOCKED (paper)'
  vEl.style.color = ok ? 'var(--accent)' : 'var(--red)'

  const reasonsText = (verdict.reasons || []).join('\n')
  rEl.textContent = reasonsText || '—'
}

async function placePaper(side, priceCents) {
  if (!state.ticker) return
  const strategy = state.strategy
  if (!strategy) return
  if (!strategy.paper_mode) {
    setStatusLine('Disabled because bot is in LIVE intent mode.', 'error')
    return
  }

  // Paper order: we still use the same endpoint; backend decides paper/live from strategy.
  await apiPost('/api/v1/orders/place', {
    ticker: state.ticker,
    side,
    price_cents: priceCents,
    count: 1,
    daily_loss_cents: 0,
    confirm_live: false,
  })
  setStatusLine(`Paper ${side.toUpperCase()} order created (if allowed).`, 'ok')
}

async function checkRiskForSide(market, side) {
  if (!state.ticker) throw new Error('No ticker')
  // We only need a price in 1..99 cents for the selected side.
  // For binary complementary contracts: no_price_cents = 100 - yes_price_cents.
  const yesMid = midCentsFromYesBidAsk(market)
  let yesPrice = yesMid
  if (yesPrice == null) yesPrice = centsFromDollarsMaybe(market?.yes_ask_dollars ?? market?.yes_ask) // fallback

  if (yesPrice == null) throw new Error('Could not derive a valid price (need yes bid/ask).')

  const priceCents = side === 'yes' ? yesPrice : 100 - yesPrice

  return apiPost('/api/v1/risk/check-order', {
    ticker: state.ticker,
    price_cents: priceCents,
    count: 1,
    daily_loss_cents: 0,
  })
}

function tokenize(title) {
  const s = String(title || '').toUpperCase()
  return s.split(/[^A-Z0-9]+/).filter((w) => w.length >= 3).slice(0, 12)
}

function scoreMarketMatch(m, marketTitleText) {
  const tokens = tokenize(marketTitleText)
  if (tokens.length === 0) return 0

  const hay = `${m?.title ?? ''} ${m?.subtitle ?? ''} ${m?.yes_sub_title ?? ''} ${m?.no_sub_title ?? ''}`.toUpperCase()
  let score = 0
  for (const t of tokens) {
    if (hay.includes(t)) score += 1
  }
  // Slightly prefer markets with a longer title (often more specific).
  score += Math.min(5, String(m?.title ?? '').length / 50)
  return score
}

async function resolveMarketFromSelector(selectorTicker, marketTitleText) {
  // If selector is already a contract ticker, fetch directly.
  if (isLikelyContractTicker(selectorTicker)) {
    const m = await apiGet(`/api/v1/markets/${encodeURIComponent(selectorTicker)}`)
    return { market: m, candidates: [] }
  }

  // Otherwise the selector might be event_ticker OR series_ticker depending on page type.
  // Try event_ticker first (usually the tightest set), then series_ticker fallback.
  let eventMarkets = []
  try {
    const eventResp = await apiGet(
      `/api/v1/markets?limit=200&event_ticker=${encodeURIComponent(selectorTicker)}&mve_filter=exclude`,
    )
    eventMarkets = eventResp?.markets ?? []
  } catch (_) {}

  let seriesMarkets = []
  try {
    const seriesResp = await apiGet(
      `/api/v1/markets?limit=200&series_ticker=${encodeURIComponent(selectorTicker)}&mve_filter=exclude`,
    )
    seriesMarkets = seriesResp?.markets ?? []
  } catch (_) {}

  const dedup = new Map()
  for (const m of [...eventMarkets, ...seriesMarkets]) {
    const t = String(m?.ticker ?? '')
    if (t) dedup.set(t, m)
  }
  const markets = Array.from(dedup.values())
  if (markets.length === 0) throw new Error(`No markets found for series ${selectorTicker}`)

  const ranked = markets
    .map((m) => ({ m, s: scoreMarketMatch(m, marketTitleText) }))
    .sort((a, b) => b.s - a.s)

  const best = ranked[0]?.m ?? markets[0]
  // Keep dropdown focused and usable: show top relevant candidates only.
  const candidates = ranked
    .filter((x) => x.s > 0)
    .slice(0, 40)
    .map((x) => x.m)

  return {
    market: best,
    candidates: candidates.length > 0 ? candidates : ranked.slice(0, 40).map((x) => x.m),
  }
}

async function loadEverythingForTicker(selectorTicker, marketTitleText) {
  if (!isLikelyKalshiId(selectorTicker)) {
    throw new Error(`Invalid ticker: ${selectorTicker}`)
  }

  el('market').textContent = marketTitleText || '—'
  setStatusLine('Loading…', 'ok')

  try {
    const [sResp, resolved] = await Promise.all([
      apiGet('/api/v1/dashboard/strategy'),
      resolveMarketFromSelector(selectorTicker, marketTitleText),
    ])

    renderBotStatus(sResp?.strategy ?? null)

    const market = resolved?.market
    const candidates = resolved?.candidates ?? []
    const resolvedTicker = market?.ticker ? String(market.ticker) : String(selectorTicker)
    state.ticker = resolvedTicker.toUpperCase()

    // Show human-friendly title first; keep ticker in the hint line.
    const question = String(marketTitleText || '').trim()
    const optionTitle = String(market?.title || '').trim()
    const subtitle = String(market?.subtitle || '').trim()

    // If the contract title is just one option (e.g., a name), prefer showing the full question.
    const mainLine = question || optionTitle || state.ticker
    el('market').textContent = mainLine

    const parts = []
    if (question && optionTitle && optionTitle !== question) parts.push(`Option: ${optionTitle}`)
    if (subtitle) parts.push(subtitle)
    parts.push(`Contract: ${state.ticker}`)
    el('marketHint').textContent = parts.join(' • ')

    // If this is a multi-option series, let the user choose the option.
    showOptionsPicker(candidates, state.ticker)

    void fetchAnalysis(state.ticker, mainLine)

    let yesVerdict = null
    let noVerdict = null
    try {
      yesVerdict = await checkRiskForSide(market, 'yes')
    } catch (e) {
      yesVerdict = { allowed: false, reasons: [String(e.message || e)] }
    }

    try {
      noVerdict = await checkRiskForSide(market, 'no')
    } catch (e) {
      noVerdict = { allowed: false, reasons: [String(e.message || e)] }
    }

    renderVerdict('yes', yesVerdict, yesVerdict?.reasons)
    renderVerdict('no', noVerdict, noVerdict?.reasons)

    // Enable place buttons only when allowed and paper_mode is on.
    const mid = midCentsFromYesBidAsk(market)
    const yesPrice = mid ?? centsFromDollarsMaybe(market?.yes_ask_dollars ?? market?.yes_ask) ?? null
    const noPrice = yesPrice != null ? 100 - yesPrice : null

    const canPlace = state.strategy?.paper_mode === true && state.strategy?.bot_enabled === true

    el('placeYes').disabled = !(canPlace && yesVerdict?.allowed === true && yesPrice != null)
    el('placeNo').disabled = !(canPlace && noVerdict?.allowed === true && noPrice != null)

    el('placeYes').onclick = () => placePaper('yes', yesPrice)
    el('placeNo').onclick = () => placePaper('no', noPrice)

    setStatusLine('Paper-only risk check complete.', 'ok')
  } catch (e) {
    setStatusLine(`Error: failed to resolve market for ${selectorTicker}. Try selecting the market again.`, 'error')
    el('botStatus').textContent = 'Open a Kalshi market page…'
    el('placeYes').disabled = true
    el('placeNo').disabled = true
    renderVerdict('yes', null)
    renderVerdict('no', null)
    el('market').textContent = marketTitleText || '—'
    el('marketHint').textContent = ''
    setAnalysisIdle('Open a Kalshi market page…')
  }
}

function tryParseTickerFromUrl(tabUrl) {
  if (!tabUrl) return null
  const str = String(tabUrl)
  // Kalshi market pages typically embed the ticker in the path, e.g. `/markets/<ticker>`.
  const pathMatch = str.match(/\/markets\/([^/?#]+)/)
  const candidate = pathMatch?.[1] ?? str

  // Prefer full contract tickers (hyphenated) when present, but allow shorter KX selectors too.
  const candidates = candidate.match(/KX[A-Z0-9-]{4,}/gi) ?? []
  if (candidates.length === 0) return null

  const scored = candidates
    .map((t) => {
      const up = String(t).toUpperCase()
      const hyphenCount = (up.match(/-/g) || []).length
      return { t: up, score: hyphenCount * 10000 + up.length }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]?.t ?? null
  return best && isLikelyKalshiId(best) ? best : null
}

async function detectTickerFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url || ''
  const fromUrl = tryParseTickerFromUrl(url)
  return fromUrl
}

async function init() {
  const { apiBase, apiToken } = await chrome.storage.sync.get(['apiBase', 'apiToken'])
  if (apiBase) state.apiBase = apiBase
  if (apiToken != null && String(apiToken).trim()) state.apiToken = String(apiToken).trim()

  const openOpts = el('openOptions')
  if (openOpts && chrome?.runtime?.openOptionsPage) {
    openOpts.onclick = (e) => {
      e.preventDefault()
      chrome.runtime.openOptionsPage()
    }
  }

  // Default UI state (pre-detection).
  state.ticker = null
  el('market').textContent = '—'
  el('marketHint').textContent = 'Open kalshi.com and select the market you want to paper-trade. We’ll detect it automatically.'
  el('botStatus').textContent = 'Open a Kalshi market page…'
  el('placeYes').disabled = true
  el('placeNo').disabled = true
  el('yesVerdict').textContent = '—'
  el('noVerdict').textContent = '—'
  el('yesReasons').textContent = ''
  el('noReasons').textContent = ''
  setAnalysisIdle('Open a Kalshi market page…')

  // Read stored ticker first (the content script may have already run).
  try {
    const { detectedTicker, detectedAt, detectedMarketTitle } = await chrome.storage.local.get([
      'detectedTicker',
      'detectedAt',
      'detectedMarketTitle',
    ])
    const ageMs = typeof detectedAt === 'number' ? Date.now() - detectedAt : Infinity
    // Avoid reusing a stale ticker from a previous visit.
    if (detectedTicker && ageMs < 2 * 60 * 1000) {
      if (isLikelyKalshiId(detectedTicker)) {
        el('marketHint').textContent = 'Detected from previous scan.'
        await loadEverythingForTicker(detectedTicker, detectedMarketTitle)
        // Do NOT return here. We still want to attach the content-script message
        // listener so navigating to another market updates the popup.
      }
    }
  } catch (_) {}

  // Receive ticker from content script (preferred).
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'KALSHIBOT_TICKER' || !msg?.ticker) return
    el('marketHint').textContent = 'Detected from page.'
    await loadEverythingForTicker(msg.ticker, msg.marketTitle)
  })

  // Fallback: try to parse from URL.
  try {
    const ticker = await detectTickerFromActiveTab()
    if (ticker) {
      el('marketHint').textContent = 'Detected from URL.'
      await loadEverythingForTicker(ticker, null)
    } else {
      // Important: do not ask for “ticket keys” or tickers; just instruct the user.
      el('marketHint').textContent = 'Open kalshi.com and select the market you want to paper-trade. We’ll detect it automatically.'
      setStatusLine('', 'ok')
      el('botStatus').textContent = 'Open a Kalshi market page…'
    }
  } catch (e) {
    setStatusLine(`Extension init error: ${String(e.message || e)}`, 'error')
  }
}

document.addEventListener('DOMContentLoaded', init)

