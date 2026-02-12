<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  placement: { type: String, default: 'top' }, // top|bottom
})

const open = ref(false)

const placementClass = computed(() => {
  return props.placement === 'bottom' ? 'bottom' : 'top'
})

function onShow() {
  open.value = true
}

function onHide() {
  open.value = false
}
</script>

<template>
  <span class="tt" @mouseenter="onShow" @mouseleave="onHide" @focusin="onShow" @focusout="onHide">
    <slot />
    <span class="bubble" :class="[{ show: open }, placementClass]" role="tooltip">
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.tt {
  position: relative;
  display: inline-grid;
}

.bubble {
  position: absolute;
  left: 50%;
  max-width: 240px;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  z-index: 5000;

  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 90%, black);
  color: color-mix(in oklab, var(--bone) 88%, white);
  font-size: 12px;
  letter-spacing: 0.04em;
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.55);

  transition: opacity 140ms ease, transform 140ms ease;
}

.bubble.top {
  bottom: calc(100% + 10px);
}

.bubble.bottom {
  top: calc(100% + 10px);
}

.bubble.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .bubble {
    transition: none;
  }
}
</style>
