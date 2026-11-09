<script setup lang="ts">
import type { Database, Json } from '~/types/database.types'

// Treino em andamento: um exercício por vez, marca as séries, ajusta carga e
// repetições, e o descanso começa sozinho. Salva enquanto o aluno treina,
// então dá para fechar o app e voltar de onde parou.
definePageMeta({ roles: ['aluno'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()
const route = useRoute()
const dayIndex = Number(route.params.dia)

const { data, error: loadError } = await useAsyncData(`treino-dia-${dayIndex}`, async () => {
  const uid = user.value!.sub
  const { data: plans } = await supabase.rpc('my_plans')
  const plan = plans?.find((p) => p.kind === 'treino')
  const treino = plan?.content as unknown as Treino | undefined
  const dia = treino?.dias[dayIndex]
  if (!dia) return null

  // Sessão aberta deste dia nas últimas 12 h: continua de onde parou.
  const since = new Date(Date.now() - 12 * 3600_000).toISOString()
  const { data: open } = await supabase
    .from('workout_logs').select('*')
    .eq('student_id', uid).eq('day_index', dayIndex).is('finished_at', null).gte('started_at', since)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (open) return { dia, log: open, personal: plan?.published_by_name ?? null }

  // Nova sessão, com as cargas da última vez que fez este dia.
  const { data: last } = await supabase
    .from('workout_logs').select('exercises')
    .eq('student_id', uid).eq('day_index', dayIndex).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  const { data: created, error } = await supabase
    .from('workout_logs')
    .insert({
      student_id: uid,
      organization_id: me.value!.current!.organization_id,
      day_index: dayIndex,
      day_name: dia.nome,
      exercises: registroInicial(dia, last?.exercises as unknown as ExercicioFeito[] | null) as unknown as Json,
    })
    .select('*').single()
  if (error) throw error
  return { dia, log: created, personal: plan?.published_by_name ?? null }
})

const dia = computed(() => data.value?.dia)
const registro = ref<ExercicioFeito[]>((data.value?.log.exercises as unknown as ExercicioFeito[]) ?? [])
const total = computed(() => dia.value?.exercicios.length ?? 0)
// Começa no primeiro exercício que ainda tem série por fazer.
const pos = ref(Math.max(0, registro.value.findIndex((ex) => ex.series.some((s) => !s.feita))))
const ex = computed(() => dia.value?.exercicios[pos.value])
const feito = computed(() => registro.value[pos.value])
const finished = ref(false)
const summary = ref({ minutos: 0, series: 0, seguidos: 0 })
const saveError = ref('')

// ---- salvar enquanto treina (no máximo a cada 0,8 s) ----
let timer: ReturnType<typeof setTimeout> | null = null
async function persist(extra: Database['public']['Tables']['workout_logs']['Update'] = {}) {
  if (!data.value) return
  const { error } = await supabase
    .from('workout_logs')
    .update({ exercises: registro.value as unknown as Json, ...extra })
    .eq('id', data.value.log.id)
  saveError.value = error ? 'Sem conexão: suas séries ficam aqui e são salvas quando a internet voltar.' : ''
}
watch(registro, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => persist(), 800)
}, { deep: true })

// ---- descanso ----
const restTotal = ref(0)
const remaining = ref(0)
let restTimer: ReturnType<typeof setInterval> | null = null
function startRest(seconds: number) {
  stopRest()
  if (seconds <= 0) return
  restTotal.value = seconds
  remaining.value = seconds
  restTimer = setInterval(() => {
    remaining.value--
    if (remaining.value <= 0) {
      stopRest()
      try { navigator.vibrate?.([200, 100, 200]) } catch {}
    }
  }, 1000)
}
function stopRest() {
  if (restTimer) clearInterval(restTimer)
  restTimer = null
  remaining.value = 0
}
onBeforeUnmount(() => {
  stopRest()
  if (timer) {
    clearTimeout(timer)
    persist()
  }
})
const restOffset = computed(() => (restTotal.value ? 188.5 * (1 - remaining.value / restTotal.value) : 0))

function toggle(i: number) {
  const s = feito.value!.series[i]!
  s.feita = !s.feita
  const isLastSet = pos.value === total.value - 1 && feito.value!.series.every((x) => x.feita)
  if (s.feita && !isLastSet) startRest(ex.value?.descanso_seg ?? 60)
  else if (!s.feita) stopRest()
}
function addSerie() {
  const last = feito.value!.series.at(-1)
  feito.value!.series.push({ reps: last?.reps ?? ex.value!.repeticoes, carga_kg: last?.carga_kg ?? null, feita: false })
}

function go(delta: number) {
  stopRest()
  pos.value = Math.min(total.value - 1, Math.max(0, pos.value + delta))
  window.scrollTo({ top: 0 })
}

async function finish() {
  stopRest()
  if (timer) clearTimeout(timer)
  const now = new Date()
  await persist({ finished_at: now.toISOString() })
  const { data: done } = await supabase
    .from('workout_logs').select('started_at')
    .eq('student_id', user.value!.sub).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(120)
  summary.value = {
    minutos: Math.max(1, Math.round((now.getTime() - new Date(data.value!.log.started_at).getTime()) / 60000)),
    series: seriesFeitas(registro.value),
    seguidos: diasSeguidos((done ?? []).map((d) => d.started_at)),
  }
  finished.value = true
}

const descanso = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`)
const personalFirst = computed(() => data.value?.personal?.split(' ')[0] ?? 'Seu personal')
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Erros e plano ausente -->
    <main v-if="loadError || !data" class="flex flex-col gap-4 px-5 pt-6">
      <NuxtLink to="/aluno/plano/treino" class="btn-ghost self-start"><AppIcon name="back" :size="16" /> Voltar</NuxtLink>
      <p class="text-sm" :class="loadError ? 'text-danger' : 'text-muted'">
        {{ loadError ? `Não deu para abrir o treino: ${friendlyError(loadError)}` : 'Este dia não existe no seu treino atual.' }}
      </p>
    </main>

    <!-- Treino concluído -->
    <main v-else-if="finished" class="flex flex-1 flex-col items-center justify-center gap-6 bg-lime px-6 py-10 text-center text-ink">
      <svg aria-hidden="true" width="110" height="110" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#0B0D10" stroke-width="8" />
        <path d="M38 62l15 15 30-34" fill="none" stroke="#0B0D10" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h1 class="font-display text-[34px] leading-[1.05] font-bold">Treino<br>concluído!</h1>
      <div class="grid w-full grid-cols-3 gap-2">
        <div v-for="s in [[summary.minutos, 'minutos'], [summary.series, 'séries'], [summary.seguidos, summary.seguidos === 1 ? 'dia seguido' : 'dias seguidos']]" :key="String(s[1])" class="flex flex-col gap-0.5 rounded-[18px] bg-ink/10 p-3">
          <span class="font-display text-2xl font-bold">{{ s[0] }}</span>
          <span class="text-xs font-semibold">{{ s[1] }}</span>
        </div>
      </div>
      <p class="text-[15px] leading-relaxed">{{ personalFirst }} vai ver seu treino. Agora é hidratar e descansar.</p>
      <NuxtLink to="/aluno" class="flex h-[58px] w-full items-center justify-center rounded-[18px] bg-ink text-[17px] font-extrabold text-lime">Voltar para o início</NuxtLink>
    </main>

    <!-- Treino em andamento -->
    <template v-else-if="ex && feito">
      <header class="sticky top-0 z-10 flex items-center gap-3 bg-ink px-5 pt-5 pb-3">
        <NuxtLink to="/aluno/plano/treino" aria-label="Sair do treino (o progresso fica salvo)" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card">
          ✕
        </NuxtLink>
        <div class="flex flex-1 gap-1" :aria-label="`Exercício ${pos + 1} de ${total}`">
          <div
            v-for="(r, i) in registro"
            :key="i"
            class="h-1.5 flex-1 rounded-full"
            :class="r.series.every((s) => s.feita) ? 'bg-lime' : i === pos ? 'bg-lime/50' : 'bg-raised'"
          />
        </div>
        <span class="shrink-0 text-sm font-semibold text-muted">{{ pos + 1 }}/{{ total }}</span>
      </header>

      <main class="flex flex-1 flex-col gap-4 px-5 pt-2 pb-6">
        <section class="flex flex-col gap-3 rounded-[26px] bg-card p-5">
          <span class="chip">{{ dia!.nome }}</span>
          <h1 class="font-display text-[26px] leading-tight font-bold">{{ ex.nome }}</h1>
          <div class="flex flex-wrap gap-2 text-xs font-semibold">
            <span class="rounded-full bg-raised px-2.5 py-1">{{ ex.series }} × {{ ex.repeticoes }}</span>
            <span class="rounded-full bg-raised px-2.5 py-1">descanso {{ descanso(ex.descanso_seg) }}</span>
          </div>
          <p v-if="ex.observacao" class="text-sm text-muted"><strong class="text-text">Dica:</strong> {{ ex.observacao }}</p>
        </section>

        <section v-if="remaining > 0" class="flex items-center gap-4 rounded-[22px] border border-violet-line bg-violet-deep p-4" role="timer">
          <svg role="img" :aria-label="`Descanso: ${remaining} segundos`" width="72" height="72" viewBox="0 0 72 72" class="shrink-0">
            <circle cx="36" cy="36" r="30" fill="none" stroke="#2A2550" stroke-width="7" />
            <circle cx="36" cy="36" r="30" fill="none" stroke="#8B7CFF" stroke-width="7" stroke-linecap="round" stroke-dasharray="188.5" :stroke-dashoffset="restOffset" transform="rotate(-90 36 36)" />
            <text x="36" y="41" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="15" font-weight="700" fill="#F3F5F7">{{ remaining }}</text>
          </svg>
          <div class="flex flex-1 flex-col gap-0.5">
            <span class="font-semibold">Descansando</span>
            <span class="text-sm text-muted">Respira. Próxima série já já.</span>
          </div>
          <button type="button" class="btn-ghost" @click="stopRest">Pular</button>
        </section>

        <section class="flex flex-col gap-2">
          <div class="grid grid-cols-[48px_1fr_1fr] gap-2 px-1 text-[11px] font-semibold text-faint uppercase">
            <span />
            <span>Repetições</span>
            <span>Carga (kg)</span>
          </div>
          <div
            v-for="(s, i) in feito.series"
            :key="i"
            class="grid grid-cols-[48px_1fr_1fr] items-center gap-2 rounded-[18px] p-2 transition"
            :class="s.feita ? 'bg-[#1F2611]' : 'bg-card'"
          >
            <button
              type="button"
              :aria-pressed="s.feita"
              :aria-label="`Série ${i + 1} ${s.feita ? 'feita' : 'por fazer'}`"
              class="flex size-12 items-center justify-center rounded-[14px] font-display font-bold transition active:scale-95"
              :class="s.feita ? 'bg-lime text-ink' : 'border border-line bg-raised text-muted'"
              @click="toggle(i)"
            >
              <AppIcon v-if="s.feita" name="check" />
              <template v-else>{{ i + 1 }}</template>
            </button>
            <input v-model="s.reps" class="field h-12 bg-raised px-3" inputmode="numeric" :aria-label="`Repetições da série ${i + 1}`">
            <input v-model.number="s.carga_kg" type="number" min="0" step="0.5" inputmode="decimal" class="field h-12 bg-raised px-3" placeholder="—" :aria-label="`Carga da série ${i + 1} em kg`">
          </div>
          <button type="button" class="btn-ghost self-start" @click="addSerie"><AppIcon name="plus" :size="16" /> Série extra</button>
        </section>

        <p v-if="saveError" class="text-sm text-[#FFB98A]" role="status">{{ saveError }}</p>
      </main>

      <footer class="sticky bottom-0 grid grid-cols-[58px_1fr] gap-2 bg-ink px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Exercício anterior" class="flex h-[58px] items-center justify-center rounded-[18px] border border-line bg-card disabled:opacity-40" :disabled="pos === 0" @click="go(-1)">
          <AppIcon name="back" />
        </button>
        <button v-if="pos < total - 1" type="button" class="btn-primary" @click="go(1)">
          Próximo exercício <AppIcon name="arrow" />
        </button>
        <button v-else type="button" class="btn-primary" @click="finish">
          <AppIcon name="check" /> Concluir treino
        </button>
      </footer>
    </template>
  </div>
</template>
