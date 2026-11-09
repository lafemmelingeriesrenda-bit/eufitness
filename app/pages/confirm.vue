<script setup lang="ts">
definePageMeta({ layout: 'auth' })
// Volta do link de e-mail (confirmação de cadastro ou nova senha).
const user = useSupabaseUser()
const { continueAfterLogin } = useNextStep()
const slow = ref(false)

watch(user, (value) => {
  if (value) continueAfterLogin()
}, { immediate: true })

onMounted(() => setTimeout(() => (slow.value = true), 6000))
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
    <div class="size-10 animate-spin rounded-full border-4 border-raised border-t-lime" />
    <p class="text-muted">Confirmando seu acesso…</p>
    <p v-if="slow" class="text-sm text-faint">
      Está demorando? O link pode ter expirado. <NuxtLink to="/login" class="text-lime">Voltar para o login</NuxtLink>
    </p>
  </div>
</template>
