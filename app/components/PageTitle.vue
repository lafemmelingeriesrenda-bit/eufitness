<!-- Título da página no PC (no celular quem faz esse papel é o AppHeader). -->
<script setup lang="ts">
defineProps<{ title: string; kicker?: string | null }>()
</script>

<template>
  <div class="hidden items-end justify-between gap-4 lg:flex">
    <div class="flex min-w-0 flex-col gap-1">
      <span v-if="kicker" class="truncate text-sm text-muted">{{ kicker }}</span>
      <h1 class="font-display text-[32px] leading-tight font-bold tracking-tight">{{ title }}</h1>
    </div>
    <slot />
  </div>
</template>
