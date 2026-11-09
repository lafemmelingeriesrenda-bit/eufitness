<!-- Lista editável de frases curtas (orientações). -->
<script setup lang="ts">
defineProps<{ label: string; placeholder?: string }>()
const items = defineModel<string[]>({ required: true })
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="mb-2 text-sm font-semibold text-muted">{{ label }}</legend>
    <div v-for="(_, i) in items" :key="i" class="flex items-center gap-2">
      <input v-model="items[i]" class="field h-12 flex-1" :aria-label="`${label} ${i + 1}`" :placeholder="placeholder">
      <button type="button" class="shrink-0 px-2 text-muted hover:text-danger" aria-label="Remover" @click="items.splice(i, 1)">✕</button>
    </div>
    <button type="button" class="btn-ghost self-start" @click="items.push('')">
      <AppIcon name="plus" :size="16" /> Adicionar
    </button>
  </fieldset>
</template>
