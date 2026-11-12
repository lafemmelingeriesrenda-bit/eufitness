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
const { data: plans } = await useAsyncData('aluno-planos', async () => {
  const { data } = await supabase.rpc('my_plans')
  return data ?? []
})
const hasPlan = (k: PlanKind) => (plans.value ?? []).some((p) => p.kind === k)

// Próximo treino: o dia seguinte ao último concluído (A → B → C → A…), ou um
// treino começado e não terminado nas últimas 12 h.
const { data: ultimoLog } = await useAsyncData('aluno-ultimo-treino', async () => {
  const { data } = await supabase
    .from('workout_logs').select('day_index, finished_at, started_at')
    .eq('student_id', user.value!.sub).order('started_at', { ascending: false }).limit(1).maybeSingle()
  return data
})
const proximoTreino = computed(() => {
  const treino = (plans.value ?? []).find((p) => p.kind === 'treino')?.content as unknown as Treino | undefined
  if (!treino?.dias.length) return null
  const log = ultimoLog.value
  const emAndamento = !!log && !log.finished_at && Date.now() - new Date(log.started_at).getTime() < 12 * 3600_000
  const indice = !log ? 0 : emAndamento ? log.day_index : (log.day_index + 1) % treino.dias.length
  const dia = treino.dias[indice] ?? treino.dias[0]!
  return { indice, dia, emAndamento, minutos: estimarMinutos(dia) }
})
const route = useRoute()
const justSent = computed(() => route.query.anamnese === 'enviada')

const firstName = computed(() => me.value?.profile.full_name.split(' ')[0] || '')
const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0">
    <AppHeader />

    <section class="flex flex-col gap-1 lg:col-span-2">
      <span class="text-sm text-muted first-letter:uppercase">{{ today }}</span>
      <h1 class="font-display text-[28px] leading-tight font-bold">
        Bora, <span class="text-lime">{{ firstName }}</span>.
      </h1>
    </section>

    <section class="relative flex items-center gap-5 overflow-hidden rounded-[26px] bg-card p-5 lg:col-start-1">
      <svg aria-hidden="true" width="96" height="96" viewBox="0 0 120 120" class="shrink-0">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#1A1E24" stroke-width="14" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="#C6F432" stroke-width="14" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="250" transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r="30" fill="none" stroke="#1A1E24" stroke-width="14" />
        <circle cx="60" cy="60" r="30" fill="none" stroke="#FF8A3D" stroke-width="14" stroke-linecap="round" stroke-dasharray="188" stroke-dashoffset="150" transform="rotate(-90 60 60)" />
      </svg>
      <div v-if="hasPlan('treino') && hasPlan('dieta')" class="flex flex-col gap-1.5">
        <p class="font-display text-lg leading-snug font-semibold">Seu plano está pronto</p>
        <p class="text-sm text-muted">Treino e dieta aprovados pela sua equipe. É só seguir.</p>
      </div>
      <div v-else-if="anamnese?.submitted_at" class="flex flex-col gap-1.5">
        <p class="font-display text-lg leading-snug font-semibold">{{ justSent ? 'Anamnese enviada!' : hasPlan('treino') || hasPlan('dieta') ? 'Parte do seu plano chegou' : 'Seu plano está sendo preparado' }}</p>
        <p class="text-sm text-muted">Seus profissionais já podem ver suas respostas e montar treino e dieta para você.</p>
      </div>
      <div v-else class="flex flex-col gap-1.5">
        <p class="font-display text-lg leading-snug font-semibold">Comece pela anamnese</p>
        <p class="text-sm text-muted">São 6 passos rápidos. Com eles seus profissionais montam treino e dieta para você.</p>
      </div>
    </section>

    <NuxtLink v-if="!anamnese?.submitted_at" to="/aluno/anamnese" class="btn-primary lg:col-start-1">
      {{ anamnese && anamnese.step > 1 ? `Continuar do passo ${anamnese.step}` : 'Responder anamnese' }}
      <AppIcon name="arrow" />
    </NuxtLink>

    <NuxtLink
      v-if="anamnese?.submitted_at && proximoTreino"
      :to="`/aluno/treino/${proximoTreino.indice}`"
      class="flex items-center gap-4 rounded-[26px] bg-lime p-5 text-ink lg:col-start-1"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-xs font-bold tracking-[.08em] uppercase">{{ proximoTreino.emAndamento ? 'Continuar treino' : 'Próximo treino' }}</span>
        <span class="truncate font-display text-[22px] leading-tight font-bold">{{ proximoTreino.dia.nome }}</span>
        <span class="truncate text-sm font-semibold opacity-80">
          {{ proximoTreino.dia.foco || `${proximoTreino.dia.exercicios.length} exercícios` }} · ~{{ proximoTreino.minutos }} min
        </span>
      </div>
      <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-lime"><AppIcon name="play" :size="26" /></span>
    </NuxtLink>

    <section v-if="anamnese?.submitted_at" class="grid grid-cols-2 gap-2.5 lg:col-start-1 lg:gap-4">
      <NuxtLink
        v-for="k in (['treino', 'dieta'] as const)"
        :key="k"
        :to="`/aluno/plano/${k}`"
        class="flex flex-col gap-3 rounded-[22px] p-4"
        :class="hasPlan(k) ? 'bg-card' : 'border border-dashed border-line'"
      >
        <span class="flex size-[42px] items-center justify-center rounded-[14px] bg-raised" :class="k === 'treino' ? 'text-lime' : 'text-violet-soft'">
          <AppIcon :name="k === 'treino' ? 'dumbbell' : 'leaf'" />
        </span>
        <span class="flex flex-col gap-0.5">
          <span class="text-[15px] font-semibold">{{ k === 'treino' ? 'Seu treino' : 'Sua dieta' }}</span>
          <span class="text-[13px] text-muted">{{ hasPlan(k) ? 'Abrir' : 'Em preparo' }}</span>
        </span>
      </NuxtLink>
    </section>

    <NuxtLink v-if="anamnese?.submitted_at" to="/aluno/anamnese" class="btn-ghost self-start lg:col-start-1 lg:justify-self-start">
      <AppIcon name="edit" :size="16" /> Revisar minhas respostas
    </NuxtLink>

    <section class="flex flex-col gap-3 lg:col-start-2 lg:row-span-4 lg:row-start-2">
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
