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

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const rolesText = (roles: { organization: string; role: keyof typeof roleLabel; is_admin: boolean }[]) =>
  roles.map((r) => `${roleLabel[r.role]}${r.is_admin ? ' (admin)' : ''} · ${r.organization}`).join('\n') || 'Sem assessoria'
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10">
    <header class="flex items-center justify-between gap-3">
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

    <section class="grid grid-cols-2 gap-2.5">
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

    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1" role="tablist">
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

    <section v-if="tab === 'assessorias'" class="flex flex-col gap-3">
      <div v-if="!filteredOrgs.length" class="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted">
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

    <section v-else class="flex flex-col gap-3">
      <div v-if="!filteredUsers.length" class="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted">
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
