import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

function setupCustomCursor() {
  // desktop only
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches
  if (!fine) return

  const el = document.createElement('div')
  el.className = 'custom-cursor is-hidden'
  document.body.appendChild(el)

  let x = -100
  let y = -100
  let rot = 0
  let raf = 0

  function isInteractive(target) {
    if (!target) return false
    return !!target.closest(
      'a, button, [role="button"], input, select, textarea, label, summary, [data-cursor="pointer"]'
    )
  }

  function render() {
    raf = 0
    el.style.setProperty('--cx', `${x}px`)
    el.style.setProperty('--cy', `${y}px`)
    el.style.setProperty('--crot', `${rot}deg`)
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(render)
  }

  window.addEventListener('mousemove', (e) => {
    x = e.clientX
    y = e.clientY
    rot = isInteractive(document.elementFromPoint(e.clientX, e.clientY)) ? 45 : 0
    el.classList.remove('is-hidden')
    schedule()
  })

  window.addEventListener('mouseleave', () => {
    el.classList.add('is-hidden')
  })

  // keyboard focus should also show pointer mode
  window.addEventListener(
    'focusin',
    (e) => {
      rot = isInteractive(e.target) ? 45 : 0
      schedule()
    },
    true
  )
}

createApp(App).mount('#app')
setupCustomCursor()
