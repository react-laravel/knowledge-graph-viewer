const THEME_KEY = 'kg-viewer-theme'

export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme) {
  const isDark = theme === 'dark'
  document.documentElement.classList.toggle('theme-dark', isDark)
  document.body?.classList.toggle('theme-dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light'
  applyTheme(next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('kg-theme-change', { detail: { theme: next } }))
  return next
}

export function initTheme() {
  const theme = getTheme()
  applyTheme(theme)
  return theme
}
