<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { continueAfterLogin } = useNextStep()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const info = ref('')

onMounted(() => {
  if (user.value) continueAfterLogin()
})

async function signIn() {
  error.value = ''
  info.value = ''
  loading.value = true
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })
  loading.value = false
  if (authError) {
    error.value = friendlyError(authError)
    return
  }
  await continueAfterLogin()
}

async function resetPassword() {
  error.value = ''
  info.value = ''
  if (!email.value.trim()) {
    error.value = 'Digite seu e-mail acima para receber o link.'
    return
  }
  const { error: authError } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
    redirectTo: `${location.origin}/confirm`,
  })
  if (authError) error.value = friendlyError(authError)
  else info.value = 'Enviamos um link para seu e-mail. Abra e defina a nova senha em Conta.'
}
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden">
    <AppRings class="lg:hidden" />
    <div class="relative flex flex-1 flex-col gap-7 px-6 pt-[210px] pb-7 lg:pt-12">
      <div class="flex flex-col gap-3.5">
        <span class="chip">Eu Fitness</span>
        <h1 class="font-display text-[38px] leading-[1.05] font-bold tracking-tight">
          Seu corpo.<br><span class="text-lime">Seu plano.</span>
        </h1>
        <p class="text-base leading-normal text-muted">Treino e dieta montados para você e aprovados por quem entende.</p>
      </div>

      <form class="flex flex-col gap-3" @submit.prevent="signIn">
        <label for="email" class="sr-only">E-mail</label>
        <input id="email" v-model="email" class="field" type="email" autocomplete="email" placeholder="E-mail" required>
        <label for="senha" class="sr-only">Senha</label>
        <input id="senha" v-model="password" class="field" type="password" autocomplete="current-password" placeholder="Senha" required>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <p v-if="info" class="text-sm text-lime" role="status">{{ info }}</p>
        <button class="btn-primary mt-1" type="submit" :disabled="loading">
          {{ loading ? 'Entrando…' : 'Entrar' }}
          <AppIcon name="arrow" />
        </button>
        <button type="button" class="self-center py-2 text-sm text-muted underline-offset-4 hover:underline" @click="resetPassword">
          Esqueci minha senha
        </button>
      </form>

      <div class="mt-auto flex flex-col gap-2.5 rounded-[22px] border border-line bg-card p-4">
        <p class="text-sm text-muted">É personal e quer usar o Eu Fitness com seus alunos?</p>
        <NuxtLink to="/cadastro" class="btn-ghost self-start">Criar conta de personal <AppIcon name="arrow" :size="16" /></NuxtLink>
        <p class="text-xs text-faint">Aluno ou nutricionista entra pelo link de convite que recebeu.</p>
      </div>
    </div>
  </div>
</template>
