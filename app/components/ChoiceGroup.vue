<!-- Grupo de botões de escolha única (ex.: dias por semana, objetivo). -->
<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  legend: string
  options: { value: T; label: string; hint?: string }[]
  /** big = números grandes; card = com dica embaixo; pill = compacto */
  variant?: 'big' | 'card' | 'pill'
  cols?: number
}>()
const model = defineModel<T | null>()

const gridCols = computed(() => ({ gridTemplateColumns: `repeat(${props.cols ?? props.options.length}, minmax(0, 1fr))` }))
</script>

<template>
  <fieldset class="flex flex-col gap-3">
    <legend class="mb-3 text-sm font-semibold text-muted">{{ legend }}</legend>
    <div class="grid gap-2.5" :style="gridCols">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        :aria-pressed="model === o.value"
        class="transition active:scale-[.98]"
        :class="[
          model === o.value ? 'border-2 border-lime bg-[#1F2611] text-text' : 'border border-line bg-card text-[#C4CAD1]',
          variant === 'big' && 'h-16 rounded-[18px] font-display text-[22px] font-bold',
          variant === 'big' && model === o.value && 'border-0 bg-lime text-ink',
          (variant ?? 'pill') === 'pill' && 'min-h-12 rounded-[16px] px-2 text-[15px] font-semibold',
          variant === 'card' && 'flex min-h-[72px] flex-col items-start justify-center gap-1 rounded-[18px] px-4 py-3 text-left',
        ]"
        @click="model = o.value"
      >
        <template v-if="variant === 'card'">
          <span class="text-[15px] font-semibold">{{ o.label }}</span>
          <span v-if="o.hint" class="text-[13px] leading-snug text-muted">{{ o.hint }}</span>
        </template>
        <template v-else>{{ o.label }}</template>
      </button>
    </div>
  </fieldset>
</template>
