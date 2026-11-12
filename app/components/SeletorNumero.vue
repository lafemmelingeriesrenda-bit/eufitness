<!--
  Seletor grande para mudar carga ou repetições durante o treino: número
  enorme, botões grandes de − e +, atalhos rápidos e campo para digitar.
  Feito para mão suada e celular na academia.
-->
<script setup lang="ts">
const props = defineProps<{
  titulo: string
  unidade: string
  passo: number
  atalhos: number[]
  /** Valor sugerido (ex.: o da última vez), mostrado como referência. */
  referencia?: string | null
}>()
const valor = defineModel<number | null>({ required: true })
const emit = defineEmits<{ close: [] }>()

const local = ref<number>(Number(valor.value) || 0)
const arred = (v: number) => Math.max(0, Math.round(v * 10) / 10)
const fmt = (v: number) => String(v).replace('.', ',')

function somar(d: number) {
  local.value = arred(local.value + d)
}
function confirmar() {
  valor.value = local.value
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 md:items-center md:p-6" @click.self="emit('close')">
    <div class="flex w-full max-w-[480px] flex-col gap-5 rounded-t-[28px] border-t border-line bg-raised px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] md:rounded-[28px] md:border" role="dialog" :aria-label="titulo">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-muted uppercase">{{ titulo }}</span>
        <button type="button" class="text-sm text-muted" @click="emit('close')">Cancelar</button>
      </div>

      <div class="flex items-center justify-between gap-3">
        <button type="button" :aria-label="`Menos ${fmt(passo)}`" class="flex size-16 shrink-0 items-center justify-center rounded-full bg-card active:scale-95" @click="somar(-passo)">
          <AppIcon name="minus" :size="28" />
        </button>
        <label class="flex min-w-0 flex-1 flex-col items-center">
          <input
            v-model.number="local"
            type="number"
            inputmode="decimal"
            min="0"
            :step="passo"
            class="w-full bg-transparent text-center font-display text-[64px] leading-none font-bold outline-none"
            :aria-label="titulo"
          >
          <span class="text-sm text-muted">{{ unidade }}</span>
        </label>
        <button type="button" :aria-label="`Mais ${fmt(passo)}`" class="flex size-16 shrink-0 items-center justify-center rounded-full bg-card active:scale-95" @click="somar(passo)">
          <AppIcon name="plus" :size="28" />
        </button>
      </div>

      <div class="grid grid-cols-4 gap-2">
        <button v-for="a in atalhos" :key="a" type="button" class="h-12 rounded-[14px] bg-card text-sm font-semibold active:scale-95" @click="somar(a)">
          {{ a > 0 ? '+' : '−' }}{{ fmt(Math.abs(a)) }}
        </button>
      </div>

      <p v-if="referencia" class="text-center text-sm text-faint">Última vez: {{ referencia }}</p>

      <button type="button" class="btn-primary h-14" @click="confirmar"><AppIcon name="check" /> Pronto</button>
    </div>
  </div>
</template>
