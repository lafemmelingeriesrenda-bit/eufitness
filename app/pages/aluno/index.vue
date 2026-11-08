<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ roles: ['aluno'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()

const { data: team } = await useAsyncData('aluno-equipe', async () => {
  const orgId = me.value!.current!.organization_id
  const [links, members] = await Promise.all([
    supabase
      .from('coach_students')
      .select('professional_id, professional:profiles!coach_students_professional_id_fkey(full_name)')
      .eq('student_id', user.value!.sub)
      .eq('status', 'ativo'),
    supabase.from('memberships').select('user_id, role, registry').eq('organization_id', orgId).neq('role', 'aluno'),
  ])
  return (links.data ?? []).map((l) => {
    const member = members.data?.find((m) => m.user_id === l.professional_id)
    return {
      id: l.professional_id,
      name: l.professional?.full_name ?? '',
      role: member?.role ?? 'personal',
      registry: member?.registry,
    }
  })
})

const { data: anamnese } = await useAsyncData('aluno-anamnese-status', async () => {
  const { data } = await supabase
    .from('anamneses')
    .select('step, submitted_at')
    .eq('student_id', user.value!.sub)
    .maybeSingle()
  return data
})
const route = useRoute()
const justSent = computed(() => route.query.anamnese === 'enviada')

const firstName = computed(() => me.value?.profile.full_name.split(' ')[0] || '')
const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10">
    <AppHeader />

    <section class="flex flex-col gap-1">
      <span class="text-sm text-muted first-letter:uppercase">{{ today }}</span>
      <h1 class="font-display text-[28px] leading-tight font-bold">
        Bora, <span class="text-lime">{{ firstName }}</span>.
      </h1>
    </section>

    <section class="relative flex items-center gap-5 overflow-hidden rounded-[26px] bg-card p-5">
      <svg aria-hidden="true" width="96" height="96" viewBox="0 0 120 120" class="shrink-0">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#1A1E24" stroke-width="14" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="#C6F432" stroke-width="14" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="250" transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r="30" fill="none" stroke="#1A1E24" stroke-width="14" />
        <circle cx="60" cy="60" r="30" fill="none" stroke="#FF8A3D" stroke-width="14" stroke-linecap="round" stroke-dasharray="188" stroke-dashoffset="150" transform="rotate(-90 60 60)" />
      </svg>
      <div v-if="anamnese?.submitted_at" class="flex flex-col gap-1.5">
        <p class="font-display text-lg leading-snug font-semibold">{{ justSent ? 'Anamnese enviada!' : 'Seu plano está sendo preparado' }}</p>
        <p class="text-sm text-muted">Seus profissionais já podem ver suas respostas e montar treino e dieta para você.</p>
      </div>
      <div v-else class="flex flex-col gap-1.5">
        <p class="font-display text-lg leading-snug font-semibold">Comece pela anamnese</p>
        <p class="text-sm text-muted">São 6 passos rápidos. Com eles seus profissionais montam treino e dieta para você.</p>
      </div>
    </section>

    <NuxtLink v-if="!anamnese?.submitted_at" to="/aluno/anamnese" class="btn-primary">
      {{ anamnese && anamnese.step > 1 ? `Continuar do passo ${anamnese.step}` : 'Responder anamnese' }}
      <AppIcon name="arrow" />
    </NuxtLink>
    <NuxtLink v-else to="/aluno/anamnese" class="btn-ghost self-start">
      <AppIcon name="edit" :size="16" /> Revisar minhas respostas
    </NuxtLink>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-lg font-semibold">Sua equipe</h2>
      <div v-for="p in team ?? []" :key="p.id" class="flex items-center gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <AppAvatar :name="p.name" :size="42" :color="p.role === 'nutri' ? '#8B7CFF' : '#C6F432'" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-[15px] font-semibold">{{ p.name }}</span>
          <span class="truncate text-[13px] text-muted">{{ roleLabel[p.role] }}{{ p.registry ? ` · ${p.registry}` : '' }}</span>
        </div>
        <AppIcon :name="p.role === 'nutri' ? 'leaf' : 'dumbbell'" class="text-muted" />
      </div>
      <p v-if="!team?.length" class="text-sm text-muted">Nenhum profissional vinculado ainda.</p>
    </section>
  </main>
</template>
