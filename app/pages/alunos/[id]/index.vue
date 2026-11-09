<script setup lang="ts">
import type { Database } from '~/types/database.types'

// Ficha do aluno para o personal e o nutri: dados básicos e a anamnese.
// O RLS só devolve a anamnese de quem tem vínculo ativo (ou é admin).
definePageMeta({ roles: ['personal', 'nutri'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const { me } = useMe()
const route = useRoute()
const studentId = route.params.id as string
const home = computed(() => homeFor(me.value))

const { data } = await useAsyncData(`ficha-${studentId}`, async () => {
  const [profile, anamnese, plans, logs] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', studentId).maybeSingle(),
    supabase.from('anamneses').select('*').eq('student_id', studentId).maybeSingle(),
    supabase.from('plans').select('kind, draft_by_agent, draft_updated_at, published_at').eq('student_id', studentId),
    supabase.from('workout_logs').select('id, day_name, exercises, started_at, finished_at')
      .eq('student_id', studentId).not('finished_at', 'is', null)
      .order('started_at', { ascending: false }).limit(8),
  ])
  return { profile: profile.data, anamnese: anamnese.data, plans: plans.data ?? [], logs: logs.data ?? [] }
})

/** Resumo de cada treino feito: dia, data, duração, séries e volume. */
const treinosFeitos = computed(() => (data.value?.logs ?? []).map((l) => {
  const reg = l.exercises as unknown as ExercicioFeito[]
  return {
    id: l.id,
    dia: l.day_name,
    data: new Date(l.started_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }),
    minutos: Math.max(1, Math.round((new Date(l.finished_at!).getTime() - new Date(l.started_at).getTime()) / 60000)),
    series: seriesFeitas(reg),
    volume: volumeKg(reg),
  }
}))

const a = computed(() => data.value?.anamnese ?? null)

/** Situação de cada plano para o card: sem plano, rascunho para revisar ou publicado. */
function planStatus(kind: PlanKind) {
  const p = data.value?.plans.find((x) => x.kind === kind)
  if (!p?.draft_updated_at) return { text: 'Sem plano', cls: 'bg-raised text-muted' }
  const pending = !p.published_at || p.draft_updated_at > p.published_at
  if (!p.published_at) return { text: p.draft_by_agent ? 'Rascunho do agente' : 'Rascunho', cls: 'bg-[rgba(255,138,61,0.16)] text-[#FFB98A]' }
  if (pending) return { text: 'Alterações não enviadas', cls: 'bg-[rgba(255,138,61,0.16)] text-[#FFB98A]' }
  return { text: `Enviado em ${new Date(p.published_at).toLocaleDateString('pt-BR')}`, cls: 'bg-[rgba(198,244,50,0.14)] text-lime' }
}
const age = computed(() => ageFrom(a.value?.birth_date ?? null))
const bmi = computed(() => {
  if (!a.value?.height_cm || !a.value?.weight_kg) return null
  const m = a.value.height_cm / 100
  return (Number(a.value.weight_kg) / (m * m)).toFixed(1).replace('.', ',')
})
const fmt = (n: number | null | undefined, unit: string) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')} ${unit}`)
const whatsapp = computed(() => {
  const digits = data.value?.profile?.phone?.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`
})

const sections = computed(() => {
  const x = a.value
  if (!x) return []
  return [
    {
      title: 'Treino',
      rows: [
        ['Dias por semana', x.training_days ? `${x.training_days}x` : '—'],
        ['Onde', labelOf(placeOptions, x.training_place) || '—'],
        ['Tempo por treino', fmt(x.session_minutes, 'min')],
        ['Horário', labelOf(timeOptions, x.training_time) || '—'],
        ['Experiência', labelOf(experienceOptions, x.experience) || '—'],
      ],
    },
    {
      title: 'Saúde',
      rows: [
        ['Dores ou lesões', x.pain || 'Nenhuma'],
        ['Condições', x.conditions || 'Nenhuma'],
        ['Remédios e suplementos', x.medications || 'Nenhum'],
      ],
    },
    {
      title: 'Alimentação',
      rows: [
        ['Refeições por dia', x.meals_per_day ? String(x.meals_per_day) : '—'],
        ['Restrições', x.diet_restrictions || 'Nenhuma'],
        ['Não come', x.food_dislikes || 'Nada informado'],
        ['Água', fmt(x.water_liters, 'L por dia')],
      ],
    },
    {
      title: 'Dia a dia',
      rows: [
        ['Atividade fora do treino', labelOf(activityOptions, x.activity_level) || '—'],
        ['Sono', fmt(x.sleep_hours, 'h por noite')],
        ['Observações', x.notes || '—'],
      ],
    },
  ]
})
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:px-0">
    <div class="flex items-center gap-3">
      <NuxtLink :to="home" aria-label="Voltar" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card">
        <AppIcon name="back" :size="22" />
      </NuxtLink>
      <span class="text-sm text-muted">Ficha do aluno</span>
    </div>

    <section class="flex items-center gap-4">
      <AppAvatar :name="data?.profile?.full_name ?? ''" :size="60" color="#FF8A3D" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h1 class="truncate font-display text-2xl font-bold">{{ data?.profile?.full_name || 'Aluno' }}</h1>
        <span class="text-sm text-muted">
          {{ [age !== null ? `${age} anos` : '', labelOf(sexOptions, a?.sex ?? null)].filter(Boolean).join(' · ') || 'Sem dados ainda' }}
        </span>
      </div>
      <a v-if="whatsapp" :href="whatsapp" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card">
        <AppIcon name="whatsapp" />
      </a>
    </section>

    <div v-if="!data?.profile" class="rounded-[20px] border border-dashed border-line p-5 text-center text-sm text-muted">
      Aluno não encontrado ou sem vínculo com você.
    </div>

    <div v-else-if="!a?.submitted_at" class="flex flex-col gap-2 rounded-[20px] border border-dashed border-line p-5 text-center">
      <p class="font-semibold">Falta responder a anamnese</p>
      <p class="text-sm text-muted">
        {{ a ? `Parou no passo ${a.step} de 6.` : 'Ainda não começou.' }} Lembre o aluno pelo WhatsApp.
      </p>
    </div>

    <div v-else class="flex flex-col gap-[22px] lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div class="flex flex-col gap-[22px]">
      <section class="grid grid-cols-3 gap-2.5">
        <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
          <span class="font-display text-xl font-bold">{{ fmt(a.weight_kg, 'kg') }}</span>
          <span class="text-xs text-muted">Peso</span>
        </div>
        <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
          <span class="font-display text-xl font-bold">{{ fmt(a.height_cm, 'cm') }}</span>
          <span class="text-xs text-muted">Altura</span>
        </div>
        <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
          <span class="font-display text-xl font-bold text-lime">{{ bmi ?? '—' }}</span>
          <span class="text-xs text-muted">IMC</span>
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h2 class="font-display text-lg font-semibold">Planos</h2>
        <NuxtLink
          v-for="k in (['treino', 'dieta'] as const)"
          :key="k"
          :to="`/alunos/${studentId}/${k}`"
          class="flex items-center gap-3.5 rounded-[20px] border border-violet-line bg-violet-deep px-3.5 py-3"
        >
          <span class="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-raised" :class="k === 'treino' ? 'text-lime' : 'text-violet-soft'">
            <AppIcon :name="k === 'treino' ? 'dumbbell' : 'leaf'" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-semibold">{{ planLabel[k] }}</span>
            <span class="text-[13px] text-muted">{{ k === 'treino' ? 'Montado pelo agente, aprovado pelo personal' : 'Montada pelo agente, aprovada pela nutri' }}</span>
          </span>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" :class="planStatus(k).cls">{{ planStatus(k).text }}</span>
        </NuxtLink>
      </section>

      <section v-if="treinosFeitos.length" class="flex flex-col gap-2">
        <h2 class="font-display text-lg font-semibold">Treinos feitos</h2>
        <div class="flex flex-col divide-y divide-line rounded-[20px] bg-card px-4">
          <div v-for="t in treinosFeitos" :key="t.id" class="flex items-center justify-between gap-3 py-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="truncate text-sm font-semibold">{{ t.dia }}</span>
              <span class="text-xs text-muted first-letter:uppercase">{{ t.data }} · {{ t.minutos }} min</span>
            </div>
            <span class="shrink-0 text-right text-xs text-muted">
              {{ t.series }} séries<template v-if="t.volume"><br>{{ t.volume.toLocaleString('pt-BR') }} kg</template>
            </span>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3 rounded-[22px] bg-card p-4">
        <span class="text-xs font-bold tracking-[.08em] text-muted uppercase">Objetivo</span>
        <p class="font-display text-xl font-semibold text-lime">{{ labelOf(goalOptions, a.goal) }}</p>
        <p v-if="a.goal_notes" class="text-sm text-muted">{{ a.goal_notes }}</p>
      </section>

      <section v-if="anamneseCares(a).length" class="flex gap-3 rounded-[20px] border border-[rgba(255,138,61,0.35)] bg-[rgba(255,138,61,0.08)] p-4">
        <AppIcon name="alert" class="shrink-0 text-[#FFB98A]" />
        <div class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-[#FFB98A]">Cuidados</span>
          <span class="text-sm">{{ anamneseCares(a).join(' · ') }}</span>
        </div>
      </section>

      </div>
      <div class="flex flex-col gap-[22px]">
      <section v-for="s in sections" :key="s.title" class="flex flex-col gap-2">
        <h2 class="font-display text-lg font-semibold">{{ s.title }}</h2>
        <dl class="flex flex-col divide-y divide-line rounded-[20px] bg-card px-4">
          <div v-for="[k, v] in s.rows" :key="k" class="flex items-start justify-between gap-4 py-3">
            <dt class="shrink-0 text-sm text-muted">{{ k }}</dt>
            <dd class="text-right text-sm font-medium whitespace-pre-line">{{ v }}</dd>
          </div>
        </dl>
      </section>

      <p class="text-center text-xs text-faint">
        Respondida em {{ new Date(a.submitted_at).toLocaleDateString('pt-BR') }}
        <template v-if="a.updated_at.slice(0, 10) !== a.submitted_at.slice(0, 10)">
          · atualizada em {{ new Date(a.updated_at).toLocaleDateString('pt-BR') }}
        </template>
      </p>
      </div>
    </div>
  </main>
</template>
