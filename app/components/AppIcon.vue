<!-- Ícones de traço simples usados nas telas. -->
<script setup lang="ts">
defineProps<{ name: 'arrow' | 'plus' | 'users' | 'user' | 'logout' | 'copy' | 'check' | 'whatsapp' | 'sparkle' | 'leaf' | 'dumbbell' | 'back' | 'alert' | 'edit'; size?: number }>()
</script>

<template>
  <svg aria-hidden="true" :width="size ?? 20" :height="size ?? 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path v-if="name === 'arrow'" d="M5 12h14M13 6l6 6-6 6" />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </template>
    <path v-else-if="name === 'logout'" d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    <template v-else-if="name === 'copy'">
      <rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </template>
    <path v-else-if="name === 'check'" d="M5 12.5l4.5 4.5L19 7.5" />
    <path v-else-if="name === 'whatsapp'" d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z" />
    <path v-else-if="name === 'sparkle'" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path v-else-if="name === 'leaf'" d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7" />
    <path v-else-if="name === 'dumbbell'" d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />
    <path v-else-if="name === 'back'" d="M15 18l-6-6 6-6" />
    <template v-else-if="name === 'alert'">
      <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </template>
    <path v-else-if="name === 'edit'" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
</template>
