const KEYS = ['apiBase', 'apiToken']

function el(id) {
  return document.getElementById(id)
}

/**
 * Non-localhost API URLs need a one-time Chrome permission so fetch() works from the extension.
 * optional_host_permissions includes <all_urls> in manifest so we can request https://your-api/* at runtime.
 */
async function ensureHostPermissionForApiBase(apiBase) {
  try {
    const u = new URL(apiBase)
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1') return { ok: true }
    const pattern = `${u.origin}/*`
    if (chrome.permissions && chrome.permissions.contains) {
      const has = await chrome.permissions.contains({ origins: [pattern] })
      if (has) return { ok: true }
    }
    if (chrome.permissions && chrome.permissions.request) {
      const granted = await chrome.permissions.request({ origins: [pattern] })
      return {
        ok: granted,
        message: granted ? '' : 'Chrome did not grant access to this API URL — the extension cannot call it until you allow.',
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
}

async function load() {
  const s = await chrome.storage.sync.get(KEYS)
  el('apiBase').value = (s.apiBase && String(s.apiBase).trim()) || 'http://127.0.0.1:8000'
  el('apiToken').value = ''
  el('apiToken').placeholder = s.apiToken ? '(saved — type new to replace)' : '(empty = no token)'
}

async function save() {
  const apiBase = el('apiBase').value.trim() || 'http://127.0.0.1:8000'
  const raw = el('apiToken').value.trim()
  const prev = await chrome.storage.sync.get(['apiToken'])
  let apiToken = prev.apiToken != null ? String(prev.apiToken) : ''
  if (raw) apiToken = raw

  let perm
  try {
    perm = await ensureHostPermissionForApiBase(apiBase)
  } catch (e) {
    el('status').textContent = String(e?.message || e)
    return
  }
  if (!perm.ok) {
    el('status').textContent = perm.message || 'Could not enable API access.'
    return
  }

  await chrome.storage.sync.set({ apiBase, apiToken })
  el('apiToken').value = ''
  el('apiToken').placeholder = apiToken ? '(saved — type new to replace)' : '(empty = no token)'
  el('status').textContent = 'Saved.'
  setTimeout(() => {
    el('status').textContent = ''
  }, 2500)
}

async function clearToken() {
  await chrome.storage.sync.set({ apiToken: '' })
  el('apiToken').value = ''
  el('apiToken').placeholder = '(empty = no token)'
  el('status').textContent = 'Token cleared.'
  setTimeout(() => {
    el('status').textContent = ''
  }, 2000)
}

document.addEventListener('DOMContentLoaded', () => {
  load()
  el('save').addEventListener('click', save)
  el('clearToken').addEventListener('click', clearToken)
})
