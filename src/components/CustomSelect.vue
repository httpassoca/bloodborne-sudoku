<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true }, // [{key,label}]
  label: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const activeIndex = ref(0)
const root = ref(null)

const selected = computed(() => props.options.find((o) => o.key === props.modelValue) || props.options[0])

watch(
  () => props.modelValue,
  () => {
    const i = props.options.findIndex((o) => o.key === props.modelValue)
    if (i >= 0) activeIndex.value = i
  },
  { immediate: true }
)

function setValue(key) {
  emit('update:modelValue', key)
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onKeyDown(e) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open.value = true
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % props.options.length
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + props.options.length) % props.options.length
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const opt = props.options[activeIndex.value]
    if (opt) setValue(opt.key)
  }
}

function onDocPointerDown(e) {
  if (!root.value) return
  if (!root.value.contains(e.target)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<template>
  <div ref="root" class="select" :data-open="open ? '1' : '0'">
    <div v-if="label" class="label">{{ label }}</div>

    <button
      class="trigger"
      type="button"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeyDown"
    >
      <span class="value">{{ selected?.label }}</span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="menu" role="listbox">
      <button
        v-for="(opt, i) in options"
        :key="opt.key"
        class="item"
        type="button"
        role="option"
        :aria-selected="opt.key === modelValue"
        :data-active="i === activeIndex ? '1' : '0'"
        @mouseenter="activeIndex = i"
        @click="setValue(opt.key)"
      >
        <span class="item-label">{{ opt.label }}</span>
        <span v-if="opt.key === modelValue" class="mark" aria-hidden="true">✦</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.select {
  display: grid;
  gap: 8px;
  position: relative;
}

.label {
  opacity: 0.78;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
}

.trigger {
  width: 100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 90%, transparent);
  color: var(--bone);
  outline: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.trigger:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--blood) 60%, white);
  outline-offset: 2px;
}

.value {
  text-align: left;
}

.chev {
  opacity: 0.8;
  color: color-mix(in oklab, var(--bone) 70%, var(--mist));
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  border-radius: 14px;
  padding: 8px;
  z-index: 20;
  background:
    radial-gradient(500px 260px at 20% 10%, color-mix(in oklab, var(--blood) 14%, transparent), transparent 60%),
    linear-gradient(180deg, color-mix(in oklab, var(--panel) 92%, transparent), color-mix(in oklab, var(--panel) 82%, black));
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 24px 70px var(--shadow);
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--bone);
  cursor: pointer;
}

.item[data-active='1'],
.item:hover {
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 10%);
  border-color: color-mix(in oklab, var(--ink) 55%, transparent);
}

.mark {
  color: color-mix(in oklab, var(--gold) 70%, white);
}
</style>
