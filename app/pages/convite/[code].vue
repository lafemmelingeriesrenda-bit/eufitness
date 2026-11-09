<script setup lang="ts">
definePageMeta({ layout: 'auth' })
import type { Database } from '~/types/database.types'

// Página aberta pelo link de convite. Funciona sem login para mostrar o
// convite; para aceitar, a pessoa cria conta ou entra.
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const route = useRoute()
const { remember } = useNextStep()
const { me, load } = useMe()

const code = String(route.params.code)

const { data: invite, status } = await useAsyncData(`convite-${code}`, async () => {
  const { data } = await supabase.rpc('get_invite', { invite_code: code })
  return data?.[0] ?? null
})

const registry = ref('')
const loading = ref(false)
const error = ref('')

const roleText = computed(() => {
  if (!invite.value) return ''
  return { aluno: 'como aluno', nutri: 'como nutricionista', personal: 'como personal' }[invite.value.role]
})

if (user.value) await load()

function goLogin() {
  remember(`/convite/${code}`)
  return navigateTo('/login')
}

async function accept() {
  error.value = ''
  loading.value = true
  const { error: rpcError } = await supabase.rpc('accept_invite', {
    invite_code: code,
    registry: registry.value.trim() || null,
  })
  loading.value = false
  if (rpcError) {
    error.value = friendlyError(rpcError)
    return
  }
  const fresh = await load(true)
  await navigateTo(homeFor(fresh), { replace: true })
}
</script>

<template>
  <div class="relative flex min-h-dvh flex-col overflow-hidden">
    <AppRings class="lg:hidden" />
    <div class="relative flex flex-1 flex-col gap-7 px-6 pt-[180px] pb-7 lg:pt-12">
      <div v-if="status === 'pending'" class="text-muted">Carregando convite…</div>

      <template v-else-if="!invite || !invite.valid">
        <span class="chip">Convite</span>
        <h1 class="font-display text-[30px] leading-[1.1] font-bold">Este convite não vale mais</h1>
        <p class="text-muted">
          {{ invite ? 'Ele já foi usado ou passou de 7 dias.' : 'Não encontramos este link.' }}
          Peça um novo para quem te convidou.
        </p>
        <NuxtLink to="/login" class="btn-primary mt-auto">Ir para o login</NuxtLink>
      </template>

      <template v-else>
        <div class="flex flex-col gap-3.5">
          <span class="chip">Convite</span>
          <h1 class="font-display text-[30px] leading-[1.1] font-bold tracking-tight">
            {{ invite.name ? `${invite.name.split(' ')[0]}, você` : 'Você' }} foi convidado para a
            <span class="text-lime">{{ invite.organization_name }}</span>
          </h1>
          <p class="text-base leading-normal text-muted">
            {{ invite.invited_by_name }} te chamou para entrar {{ roleText }}.
          </p>
        </div>

        <div v-if="user" class="flex flex-col gap-3">
          <template v-if="invite.role === 'nutri'">
            <label for="crn" class="text-sm font-semibold text-muted">CRN <span class="font-normal text-faint">(opcional)</span></label>
            <input id="crn" v-model="registry" class="field" placeholder="CRN-3 00000">
          </template>
          <p class="text-sm text-faint">Entrando como {{ me?.profile.full_name || 'você' }}.</p>
          <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
          <button class="btn-primary" type="button" :disabled="loading" @click="accept">
            {{ loading ? 'Entrando…' : 'Aceitar convite' }}
            <AppIcon name="arrow" />
          </button>
        </div>

        <div v-else class="mt-auto flex flex-col gap-3">
          <NuxtLink :to="`/cadastro?convite=${code}`" class="btn-primary">
            Criar minha conta
            <AppIcon name="arrow" />
          </NuxtLink>
          <button type="button" class="btn-ghost justify-center py-3" @click="goLogin">Já tenho conta</button>
        </div>
      </template>
    </div>
  </div>
</template>
