<script setup lang="ts">
import type { Database } from '~/types/database.types'

// Painel do dono da plataforma: todas as assessorias e todas as pessoas.
// Os dados vêm de admin_overview(), que recusa quem não é dono.
definePageMeta({ platformAdmin: true, middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const { me } = useMe()

const { data, error } = await useAsyncData('admin-overview', async () => {
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  return data
})

const tab = ref<'assessorias' | 'pessoas'>('assessorias')
const search = ref('')

const orgs = computed(() => data.value?.organizations ?? [])
const users = computed(() => data.value?.users ?? [])
const totals = computed(() => ({
  assessorias: orgs.value.length,
  alunos: orgs.value.reduce((n, o) => n + o.alunos, 0),
  profissionais: orgs.value.reduce((n, o) => n + o.personais + o.nutris, 0),
  anamneses: orgs.value.reduce((n, o) => n + o.anamneses_enviadas, 0),
}))

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filteredOrgs = computed(() => {
  const q = norm(search.value.trim())
  return q ? orgs.value.filter((o) => norm(`${o.name} ${o.owner_name} ${o.owner_email}`).includes(q)) : orgs.value
})
const filteredUsers = computed(() => {
  const q = norm(search.value.trim())
  return q ? users.value.filter((u) => norm(`${u.full_name} ${u.email} ${u.roles.map((r) => r.organization).join(' ')}`).includes(q)) : users.value
})

// ---- Catálogo de exercícios: tradução feita pelo agente ----
const { data: catalogo, refresh: refreshCatalogo } = await useAsyncData('admin-catalogo', async () => {
  const [total, traduzidos] = await Promise.all([
    supabase.from('exercises').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('exercises').select('id', { count: 'exact', head: true }).is('organization_id', null).not('name_pt', 'is', null),
  ])
  return { total: total.count ?? 0, traduzidos: traduzidos.count ?? 0 }
})
const translating = ref(false)
const stopRequested = ref(false)
const translateError = ref('')

async function traduzirCatalogo() {
  translateError.value = ''
  stopRequested.value = false
  translating.value = true
  const { data: pendentes } = await supabase
    .from('exercises').select('id').is('organization_id', null).is('name_pt', null).order('id').limit(2000)
  const lotes: string[][] = []
  const ids = (pendentes ?? []).map((p) => p.id)
  for (let i = 0; i < ids.length; i += 12) lotes.push(ids.slice(i, i + 12))

  // Quatro lotes ao mesmo tempo para não demorar demais.
  async function worker() {
    while (lotes.length && !stopRequested.value && !translateError.value) {
      const lote = lotes.shift()!
      try {
        const res = await $fetch<{ traduzidos: number }>('/api/admin/catalogo/traduzir', { method: 'POST', body: { ids: lote } })
        if (catalogo.value) catalogo.value.traduzidos += res.traduzidos
      } catch (e: unknown) {
        const err = e as { data?: { statusMessage?: string }; statusMessage?: string }
        translateError.value = err.data?.statusMessage || err.statusMessage || 'Falhou. Tente continuar daqui a pouco.'
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  translating.value = false
  await refreshCatalogo()
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const rolesText = (roles: { organization: string; role: keyof typeof roleLabel; is_admin: boolean }[]) =>
  roles.map((r) => `${roleLabel[r.role]}${r.is_admin ? ' (admin)' : ''} · ${r.organization}`).join('\n') || 'Sem assessoria'
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:px-0">
    <PageTitle kicker="Dono da plataforma" title="Plataforma" />
    <header class="flex items-center justify-between gap-3 lg:hidden">
      <div class="flex min-w-0 items-center gap-3">
        <NuxtLink
          v-if="me?.current"
          :to="homeFor({ ...me, isPlatformAdmin: false })"
          aria-label="Voltar ao meu painel"
          class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card"
        >
          <AppIcon name="back" :size="22" />
        </NuxtLink>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="flex items-center gap-1.5 text-[13px] text-violet-soft"><AppIcon name="shield" :size="14" /> Dono da plataforma</span>
          <span class="truncate text-lg font-bold">{{ me?.profile.full_name || 'Admin' }}</span>
        </div>
      </div>
      <NuxtLink to="/conta" aria-label="Conta" class="flex size-[46px] shrink-0 items-center justify-center rounded-full border border-line bg-card">
        <AppIcon name="user" />
      </NuxtLink>
    </header>

    <p v-if="error" class="text-sm text-danger" role="alert">Não deu para carregar: {{ friendlyError(error) }}</p>

    <section v-if="catalogo && catalogo.traduzidos < catalogo.total" class="flex flex-col gap-3 rounded-[22px] border border-violet-line bg-violet-deep p-5">
      <span class="flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-violet-soft uppercase">
        <AppIcon name="dumbbell" :size="16" /> Catálogo de exercícios
      </span>
      <p class="font-display text-lg leading-tight font-semibold">
        {{ catalogo.traduzidos }} de {{ catalogo.total }} exercícios traduzidos para o português
      </p>
      <div class="h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <div class="h-full rounded-full bg-lime transition-all" :style="{ width: `${Math.round((catalogo.traduzidos / Math.max(1, catalogo.total)) * 100)}%` }" />
      </div>
      <p class="text-sm text-muted">
        O agente traduz nome e instruções com os nomes usados nas academias brasileiras. Leva uns 10 minutos; deixe esta tela aberta.
        Dá para parar e continuar depois. Cada assessoria ainda pode renomear do seu jeito.
      </p>
      <p v-if="translateError" class="text-sm text-danger" role="alert">{{ translateError }}</p>
      <div class="flex flex-wrap gap-2">
        <button v-if="!translating" type="button" class="btn-primary h-12 lg:w-[280px]" @click="traduzirCatalogo">
          <AppIcon name="sparkle" :size="18" /> {{ catalogo.traduzidos ? 'Continuar tradução' : 'Traduzir com o agente' }}
        </button>
        <template v-else>
          <span class="flex items-center gap-2 text-sm"><span class="size-5 animate-spin rounded-full border-[3px] border-raised border-t-lime" /> Traduzindo…</span>
          <button type="button" class="btn-ghost" :disabled="stopRequested" @click="stopRequested = true">{{ stopRequested ? 'Parando…' : 'Parar' }}</button>
        </template>
      </div>
    </section>

    <section class="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold">{{ totals.assessorias }}</span>
        <span class="text-xs text-muted">Assessorias</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-lime">{{ totals.alunos }}</span>
        <span class="text-xs text-muted">Alunos</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-violet">{{ totals.profissionais }}</span>
        <span class="text-xs text-muted">Personais e nutris</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-orange">{{ totals.anamneses }}</span>
        <span class="text-xs text-muted">Anamneses enviadas</span>
      </div>
    </section>

    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1 lg:w-[360px] lg:shrink-0" role="tablist">
        <button
          v-for="t in (['assessorias', 'pessoas'] as const)"
          :key="t"
          type="button"
          role="tab"
          :aria-selected="tab === t"
          class="min-h-10 rounded-full text-sm font-semibold capitalize transition"
          :class="tab === t ? 'bg-lime text-ink' : 'text-muted'"
          @click="tab = t"
        >
          {{ t }} ({{ t === 'assessorias' ? orgs.length : users.length }})
        </button>
      </div>
      <label for="busca" class="sr-only">Buscar</label>
      <input id="busca" v-model="search" class="field" type="search" placeholder="Buscar por nome ou e-mail">
    </div>

    <section v-if="tab === 'assessorias'" class="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      <div v-if="!filteredOrgs.length" class="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted lg:col-span-2">
        {{ orgs.length ? 'Nada encontrado.' : 'Nenhuma assessoria criada ainda.' }}
      </div>
      <article v-for="o in filteredOrgs" :key="o.id" class="flex flex-col gap-3 rounded-[20px] bg-card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <h2 class="truncate text-[15px] font-semibold">{{ o.name }}</h2>
            <span class="truncate text-[13px] text-muted">{{ o.owner_name || 'Sem nome' }} · {{ o.owner_email }}</span>
          </div>
          <span class="shrink-0 text-xs text-faint">desde {{ date(o.created_at) }}</span>
        </div>
        <div class="flex flex-wrap gap-2 text-xs font-semibold">
          <span class="rounded-full bg-raised px-2.5 py-1">{{ o.personais }} personal</span>
          <span class="rounded-full bg-raised px-2.5 py-1 text-violet-soft">{{ o.nutris }} nutri</span>
          <span class="rounded-full bg-raised px-2.5 py-1 text-lime">{{ o.alunos }} alunos</span>
          <span class="rounded-full bg-raised px-2.5 py-1 text-[#FFB98A]">{{ o.anamneses_enviadas }} anamneses</span>
        </div>
      </article>
    </section>

    <section v-else class="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      <div v-if="!filteredUsers.length" class="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted lg:col-span-2">
        Nada encontrado.
      </div>
      <article v-for="u in filteredUsers" :key="u.id" class="flex items-start gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <AppAvatar :name="u.full_name" :size="42" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-[15px] font-semibold">{{ u.full_name || 'Sem nome' }}</span>
          <span class="truncate text-[13px] text-muted">{{ u.email }}</span>
          <span class="text-[13px] whitespace-pre-line text-muted">{{ rolesText(u.roles) }}</span>
          <span class="text-xs text-faint">
            Último acesso {{ date(u.last_sign_in_at) }}<template v-if="!u.confirmed"> · e-mail não confirmado</template>
          </span>
        </div>
      </article>
    </section>

    <NuxtLink v-if="!me?.current" to="/onboarding?criar=1" class="btn-ghost self-center">
      <AppIcon name="plus" :size="16" /> Criar minha própria assessoria
    </NuxtLink>
  </main>
</template>
