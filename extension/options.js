const key = 'apiBase'

function el(id) {
  return document.getElementById(id)
}

async function load() {
  const { [key]: saved } = await chrome.storage.sync.get([key])
  el('apiBase').value = saved || 'http://127.0.0.1:8000'
}

async function save() {
  const value = el('apiBase').value.trim()
  if (!value) return

  await chrome.storage.sync.set({ [key]: value })
  el('status').textContent = 'Saved.'
  setTimeout(() => (el('status').textContent = ''), 1200)
}

el('save').addEventListener('click', save)

document.addEventListener('DOMContentLoaded', load)

