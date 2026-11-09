<script setup lang="ts">
definePageMeta({ layout: 'auth' })
// Cria a conta. Sem convite, é um personal novo (vai criar a assessoria);
// com ?convite=codigo, é um aluno ou nutri que veio pelo link.
const supabase = useSupabaseClient()
const route = useRoute()
const { remember, continueAfterLogin } = useNextStep()

const invite = typeof route.query.convite === 'string' ? route.query.convite : null

const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const sentTo = ref('')

async function signUp() {
  error.value = ''
  loading.value = true
  remember(invite ? `/convite/${invite}` : '/onboarding')
  const { data, error: authError } = await supabase.auth.signUp({
    email: email.value.trim(),
    password: password.value,
    options: {
      data: { full_name: name.value.trim() },
      emailRedirectTo: `${location.origin}/confirm`,
    },
  })
  loading.value = false
  if (authError) {
    error.value = friendlyError(authError)
    return
  }
  // Se a confirmação de e-mail estiver desligada no Supabase, já entra direto.
  if (data.session) return continueAfterLogin()
  sentTo.value = email.value.trim()
}
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden">
    <AppRings class="lg:hidden" />
    <div class="relative flex flex-1 flex-col gap-7 px-6 pt-[180px] pb-7 lg:pt-12">
      <div class="flex flex-col gap-3.5">
        <span class="chip">{{ invite ? 'Convite' : 'Para personais' }}</span>
        <h1 class="font-display text-[32px] leading-[1.08] font-bold tracking-tight">
          Crie sua <span class="text-lime">conta</span>
        </h1>
        <p class="text-base leading-normal text-muted">
          {{ invite ? 'Depois de confirmar o e-mail, você volta para o convite e entra na assessoria.' : 'Depois você dá um nome para sua assessoria e convida alunos e seu nutricionista parceiro.' }}
        </p>
      </div>

      <div v-if="sentTo" class="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-5" role="status">
        <p class="font-display text-lg font-semibold">Confira seu e-mail</p>
        <p class="text-sm leading-relaxed text-muted">
          Enviamos um link de confirmação para <strong class="text-text">{{ sentTo }}</strong>. Abra neste mesmo aparelho para continuar.
        </p>
      </div>

      <form v-else class="flex flex-col gap-3" @submit.prevent="signUp">
        <label for="nome" class="sr-only">Nome completo</label>
        <input id="nome" v-model="name" class="field" autocomplete="name" placeholder="Nome completo" required minlength="2">
        <label for="email" class="sr-only">E-mail</label>
        <input id="email" v-model="email" class="field" type="email" autocomplete="email" placeholder="E-mail" required>
        <label for="senha" class="sr-only">Senha</label>
        <input id="senha" v-model="password" class="field" type="password" autocomplete="new-password" placeholder="Senha (mínimo 6 caracteres)" required minlength="6">
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <button class="btn-primary mt-1" type="submit" :disabled="loading">
          {{ loading ? 'Criando…' : 'Criar conta' }}
          <AppIcon name="arrow" />
        </button>
      </form>

      <NuxtLink to="/login" class="mt-auto self-center text-sm text-muted">
        Já tem conta? <span class="font-semibold text-lime">Entrar</span>
      </NuxtLink>
    </div>
  </div>
</template>
