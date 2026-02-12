import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

function setupCustomCursor(): void {
  // desktop only
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches
  if (!fine) return

  const el = document.createElement('div')
  el.className = 'custom-cursor is-hidden'
  document.body.appendChild(el)

  let x = -100
  let y = -100
  let rot = 0

  function isInteractive(target: EventTarget | null): boolean {
    if (!target) return false
    const node = target as Element
    return !!node.closest(
      'a, button, [role="button"], input, select, textarea, label, summary, [data-cursor="pointer"]'
    )
  }

  function render(): void {
    el.style.setProperty('--cx', `${x}px`)
    el.style.setProperty('--cy', `${y}px`)
    el.style.setProperty('--crot', `${rot}deg`)
  }

  window.addEventListener('mousemove', (e: MouseEvent) => {
    x = e.clientX
    y = e.clientY
    rot = isInteractive(e.target) ? 45 : 0
    el.classList.remove('is-hidden')
    render()
  })

  window.addEventListener('mouseleave', () => {
    el.classList.add('is-hidden')
  })

  // keyboard focus should also show pointer mode
  window.addEventListener(
    'focusin',
    (e: FocusEvent) => {
      rot = isInteractive(e.target) ? 45 : 0
      render()
    },
    true
  )
}

createApp(App).mount('#app')
setupCustomCursor()
