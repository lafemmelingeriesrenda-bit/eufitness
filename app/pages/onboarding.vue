<script setup lang="ts">
import type { Database } from '~/types/database.types'

// Primeiro acesso do personal: cria a assessoria e vira administrador.
const supabase = useSupabaseClient<Database>()
const { me, load, signOut } = useMe()

const route = useRoute()
await load()
// O dono da plataforma vai para /admin, a não ser que tenha pedido para criar uma assessoria.
if (me.value?.current || (me.value?.isPlatformAdmin && route.query.criar !== '1')) {
  await navigateTo(homeFor(me.value), { replace: true })
}

const orgName = ref('')
const cref = ref('')
const loading = ref(false)
const error = ref('')

async function create() {
  error.value = ''
  loading.value = true
  const { error: rpcError } = await supabase.rpc('create_organization', {
    org_name: orgName.value.trim(),
    cref: cref.value.trim() || null,
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
    <AppRings />
    <div class="relative flex flex-1 flex-col gap-7 px-6 pt-[180px] pb-7">
      <div class="flex flex-col gap-3.5">
        <span class="chip">Primeiro acesso</span>
        <h1 class="font-display text-[30px] leading-[1.1] font-bold tracking-tight">
          Olá, {{ me?.profile.full_name.split(' ')[0] || 'personal' }}.<br><span class="text-lime">Vamos montar sua assessoria.</span>
        </h1>
        <p class="text-base leading-normal text-muted">É o espaço onde ficam seus alunos, seu nutricionista parceiro e os planos.</p>
      </div>

      <form class="flex flex-col gap-3" @submit.prevent="create">
        <label for="org" class="text-sm font-semibold text-muted">Nome da assessoria</label>
        <input id="org" v-model="orgName" class="field" placeholder="Ex.: Studio Rafael Andrade" required minlength="2" maxlength="80">
        <label for="cref" class="mt-2 text-sm font-semibold text-muted">CREF <span class="font-normal text-faint">(opcional)</span></label>
        <input id="cref" v-model="cref" class="field" placeholder="000000-G/SP">
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <button class="btn-primary mt-2" type="submit" :disabled="loading">
          {{ loading ? 'Criando…' : 'Criar assessoria' }}
          <AppIcon name="arrow" />
        </button>
      </form>

      <div class="mt-auto flex flex-col items-center gap-2 text-center">
        <p class="text-sm text-faint">É aluno ou nutricionista? Abra o link de convite que você recebeu.</p>
        <button type="button" class="text-sm text-muted underline-offset-4 hover:underline" @click="signOut">Sair</button>
      </div>
    </div>
  </div>
</template>
