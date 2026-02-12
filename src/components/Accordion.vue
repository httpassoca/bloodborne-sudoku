<script setup>
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const bodyEl = ref(null)
const maxH = ref('0px')

async function measure() {
  await nextTick()
  const el = bodyEl.value
  if (!el) return
  maxH.value = open.value ? `${el.scrollHeight}px` : '0px'
}

watch(open, () => measure(), { immediate: true })

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}
</script>

<template>
  <section class="acc" :data-open="open ? '1' : '0'">
    <button
      class="acc-head"
      type="button"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="acc-title">{{ title }}</span>
      <span class="acc-chev" aria-hidden="true">▾</span>
    </button>

    <div
      class="acc-body"
      :style="{ maxHeight: maxH }"
      :aria-hidden="!open"
    >
      <div ref="bodyEl" class="acc-inner">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.acc {
  border-radius: 16px;
  background: color-mix(in oklab, var(--panel) 84%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  overflow: clip;
}

.acc-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px;
  background: transparent;
  border: 0;
  color: var(--bone);
  cursor: pointer;
}

.acc-head:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--blood) 60%, white);
  outline-offset: 2px;
}

.acc-title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.9;
}

.acc-chev {
  opacity: 0.7;
  transition: transform 180ms ease;
}

.acc[data-open='1'] .acc-chev {
  transform: rotate(180deg);
}

.acc-body {
  max-height: 0px;
  transition: max-height 220ms ease;
}

.acc-inner {
  padding: 12px 12px 14px;
  display: grid;
  gap: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .acc-body,
  .acc-chev {
    transition: none;
  }
}
</style>
