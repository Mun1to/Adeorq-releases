/* ============================================================================
   Adeorq · command-menu.js
   Dialog + Command pattern inspired by shadcn/ui. Uses the native <dialog>
   element, so the static landing stays dependency-free and keyboard friendly.
   ========================================================================== */

const dialog = document.getElementById('command-menu')
const trigger = document.getElementById('command-trigger')
const input = document.querySelector('[data-command-input]')
const list = document.querySelector('[data-command-list]')
const empty = document.querySelector('[data-command-empty]')

if (dialog && trigger && input && list && empty && typeof dialog.showModal === 'function') {
  const labels = {
    es: { placeholder: 'Busca una sección...', search: 'Buscar una sección', close: 'Cerrar' },
    en: { placeholder: 'Search a section...', search: 'Search for a section', close: 'Close' },
  }

  function language() {
    return document.documentElement.lang === 'en' ? 'en' : 'es'
  }

  function syncLanguage() {
    const copy = labels[language()]
    input.placeholder = copy.placeholder
    input.setAttribute('aria-label', copy.search)
    dialog.querySelector('.comando__cerrar').setAttribute('aria-label', copy.close)
  }

  function filter() {
    const needle = input.value.trim().toLocaleLowerCase()
    let visible = 0
    Array.from(list.querySelectorAll('[data-command-target]')).forEach((item) => {
      const haystack = `${item.textContent} ${item.dataset.commandKeywords || ''}`.toLocaleLowerCase()
      const match = !needle || haystack.includes(needle)
      item.hidden = !match
      if (match) visible += 1
    })
    empty.hidden = visible > 0
  }

  function open() {
    syncLanguage()
    filter()
    dialog.showModal()
    requestAnimationFrame(() => input.focus())
  }

  function go(target) {
    dialog.close()
    const destination = document.querySelector(target)
    if (destination) destination.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  trigger.addEventListener('click', open)
  input.addEventListener('input', filter)
  list.addEventListener('click', (event) => {
    const command = event.target.closest('[data-command-target]')
    if (command) go(command.dataset.commandTarget)
  })
  dialog.addEventListener('close', () => {
    input.value = ''
    filter()
    trigger.focus()
  })
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (!dialog.open) open()
    }
  })
  window.addEventListener('adeorq:language', syncLanguage)
  syncLanguage()
}
