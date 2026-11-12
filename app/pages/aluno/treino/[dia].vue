<script setup lang="ts">
import type { Database, Json, Sentimento } from '~/types/database.types'

// Treino do aluno em quatro etapas, uma coisa por vez:
//   intro (treino de hoje) → série → descanso → série … → fim.
// Salva enquanto o aluno treina: fechar e abrir de novo continua de onde parou.
definePageMeta({ roles: ['aluno'], middleware: 'role', layout: 'focus' })

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

  // A última vez que fez este dia: preenche cargas e mostra "última vez".
  const { data: last } = await supabase
    .from('workout_logs').select('exercises')
    .eq('student_id', uid).eq('day_index', dayIndex).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  const anterior = (last?.exercises as unknown as ExercicioFeito[] | null) ?? null

  // Sessão aberta deste dia nas últimas 12 h: continua de onde parou.
  const since = new Date(Date.now() - 12 * 3600_000).toISOString()
  const { data: open } = await supabase
    .from('workout_logs').select('*')
    .eq('student_id', uid).eq('day_index', dayIndex).is('finished_at', null).gte('started_at', since)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (open) return { dia, log: open, anterior, personal: plan?.published_by_name ?? null }

  const { data: created, error } = await supabase
    .from('workout_logs')
    .insert({
      student_id: uid,
      organization_id: me.value!.current!.organization_id,
      day_index: dayIndex,
      day_name: dia.nome,
      exercises: registroInicial(dia, anterior) as unknown as Json,
    })
    .select('*').single()
  if (error) throw error
  return { dia, log: created, anterior, personal: plan?.published_by_name ?? null }
})

const dia = computed(() => data.value?.dia)
const registro = ref<ExercicioFeito[]>((data.value?.log.exercises as unknown as ExercicioFeito[]) ?? [])
const total = computed(() => dia.value?.exercicios.length ?? 0)
const totalSeries = computed(() => registro.value.reduce((n, e) => n + e.series.length, 0))
const feitas = computed(() => seriesFeitas(registro.value))

type Etapa = 'intro' | 'contagem' | 'serie' | 'descanso' | 'fim'
// Quem já começou volta direto para a série; quem não começou vê o "treino de hoje".
const etapa = ref<Etapa>(feitas.value > 0 ? 'serie' : 'intro')

// ---- posição: exercício e série atuais ----
function primeiraPendente(e: ExercicioFeito | undefined) {
  const i = e?.series.findIndex((s) => !s.feita) ?? -1
  return i < 0 ? Math.max(0, (e?.series.length ?? 1) - 1) : i
}
const pos = ref(Math.max(0, registro.value.findIndex((e) => e.series.some((s) => !s.feita))))
const serie = ref(primeiraPendente(registro.value[pos.value]))
const ex = computed(() => dia.value?.exercicios[pos.value])
const feito = computed(() => registro.value[pos.value])
const atual = computed(() => feito.value?.series[serie.value])
const ultimaVez = computed(() => data.value?.anterior?.find((a) => a.exercicio === feito.value?.exercicio)?.series[serie.value])

function irPara(p: number, s?: number) {
  pos.value = Math.min(total.value - 1, Math.max(0, p))
  serie.value = s ?? primeiraPendente(registro.value[pos.value])
  mostrarLista.value = false
  mostrarDica.value = false
  foto.value = 0
}

// ---- fotos (alternam sozinhas, efeito de movimento) e vídeo ----
const { porId } = useExerciciosDoPlano(me.value?.current?.organization_id ?? '', () => dia.value?.exercicios.map((e) => e.exercicio_id ?? '') ?? [])
const catalogo = (exId?: string) => (exId ? porId.value.get(exId) : undefined)
const catalogoEx = computed(() => catalogo(ex.value?.exercicio_id))
const foto = ref(0)
let fotoTimer: ReturnType<typeof setInterval> | null = null
const verDetalhe = ref(false)
const mostrarDica = ref(false)
const mostrarLista = ref(false)

// ---- números da série: + e − ----
const repsNum = computed(() => numeroReps(atual.value?.reps ?? ''))
function mudarReps(delta: number) {
  if (!atual.value || repsNum.value === null) return
  atual.value.reps = String(Math.max(1, repsNum.value + delta))
}
function mudarCarga(delta: number) {
  if (!atual.value) return
  const v = Math.max(0, (Number(atual.value.carga_kg) || 0) + delta)
  atual.value.carga_kg = Math.round(v * 10) / 10
}
const fmtKg = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : String(v).replace('.', ','))

// ---- salvar enquanto treina (no máximo a cada 0,8 s) ----
const saveError = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null
async function persist(extra: Database['public']['Tables']['workout_logs']['Update'] = {}) {
  if (!data.value) return
  const { error } = await supabase
    .from('workout_logs')
    .update({ exercises: registro.value as unknown as Json, ...extra })
    .eq('id', data.value.log.id)
  saveError.value = error ? 'Sem conexão: suas séries ficam aqui e são salvas quando a internet voltar.' : ''
}
watch(registro, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => persist(), 800)
}, { deep: true })

// ---- contagem 3, 2, 1 ----
const contagem = ref(3)
function comecar() {
  etapa.value = 'contagem'
  contagem.value = 3
  const t = setInterval(() => {
    contagem.value--
    if (contagem.value <= 0) {
      clearInterval(t)
      etapa.value = 'serie'
    }
  }, 800)
}

// ---- descanso ----
const restTotal = ref(0)
const remaining = ref(0)
const proximo = ref<{ pos: number; serie: number } | null>(null)
let restTimer: ReturnType<typeof setInterval> | null = null

function bip() {
  try { navigator.vibrate?.([250, 120, 250]) } catch {}
  try {
    const ctx = new AudioContext()
    for (const [i, f] of [880, 1320].entries()) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.value = 0.15
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18)
      o.stop(ctx.currentTime + i * 0.18 + 0.14)
    }
  } catch {}
}
function iniciarDescanso(seg: number) {
  pararDescanso()
  restTotal.value = Math.max(1, seg)
  remaining.value = Math.max(1, seg)
  etapa.value = 'descanso'
  restTimer = setInterval(() => {
    remaining.value--
    if (remaining.value <= 0) {
      bip()
      terminarDescanso()
    }
  }, 1000)
}
function pararDescanso() {
  if (restTimer) clearInterval(restTimer)
  restTimer = null
}
function terminarDescanso() {
  pararDescanso()
  if (proximo.value) irPara(proximo.value.pos, proximo.value.serie)
  etapa.value = 'serie'
}
function maisTempo() {
  remaining.value += 15
  restTotal.value += 15
}
const restOffset = computed(() => (restTotal.value ? 427 * (1 - remaining.value / restTotal.value) : 0))

// ---- fiz a série ----
function proximaPendente(): { pos: number; serie: number } | null {
  const mesma = feito.value?.series.findIndex((s) => !s.feita) ?? -1
  if (mesma >= 0) return { pos: pos.value, serie: mesma }
  for (let k = 1; k <= total.value; k++) {
    const p = (pos.value + k) % total.value
    const s = registro.value[p]?.series.findIndex((x) => !x.feita) ?? -1
    if (s >= 0) return { pos: p, serie: s }
  }
  return null
}
function fizSerie() {
  if (!atual.value) return
  atual.value.feita = true
  proximo.value = proximaPendente()
  if (!proximo.value) {
    finalizar()
    return
  }
  // Descanso de quem acabou de ser feito; troca de exercício também descansa.
  iniciarDescanso(ex.value?.descanso_seg ?? 60)
}
function serieExtra() {
  const last = feito.value?.series.at(-1)
  feito.value?.series.push({ reps: last?.reps ?? ex.value?.repeticoes ?? '10', carga_kg: last?.carga_kg ?? null, feita: false })
  serie.value = (feito.value?.series.length ?? 1) - 1
}
const proximoInfo = computed(() => {
  if (!proximo.value) return null
  const e = registro.value[proximo.value.pos]
  const s = e?.series[proximo.value.serie]
  const mesmoExercicio = proximo.value.pos === pos.value
  return {
    titulo: mesmoExercicio ? `Série ${proximo.value.serie + 1}` : e?.exercicio ?? '',
    detalhe: `${s?.reps ?? ''} reps${s?.carga_kg ? ` × ${fmtKg(s.carga_kg)} kg` : ''}`,
    foto: catalogo(dia.value?.exercicios[proximo.value.pos]?.exercicio_id)?.images[0],
    mesmoExercicio,
  }
})

// ---- fim ----
const resumo = ref({ minutos: 0, series: 0, volume: 0, seguidos: 0 })
const recordesHoje = ref<{ exercicio: string; ganho: number }[]>([])
const sentimento = ref<Sentimento | null>(null)
async function finalizar() {
  pararDescanso()
  if (saveTimer) clearTimeout(saveTimer)
  const agora = new Date()
  await persist({ finished_at: agora.toISOString() })
  const { data: done } = await supabase
    .from('workout_logs').select('started_at')
    .eq('student_id', user.value!.sub).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(120)
  resumo.value = {
    minutos: Math.max(1, Math.round((agora.getTime() - new Date(data.value!.log.started_at).getTime()) / 60000)),
    series: seriesFeitas(registro.value),
    volume: volumeKg(registro.value),
    seguidos: diasSeguidos((done ?? []).map((d) => d.started_at)),
  }
  recordesHoje.value = recordes(registro.value, data.value?.anterior).slice(0, 3)
  etapa.value = 'fim'
}
async function responder(s: Sentimento) {
  sentimento.value = s
  await persist({ feeling: s })
}
const volumeTexto = computed(() => (resumo.value.volume >= 1000
  ? { n: (resumo.value.volume / 1000).toFixed(1).replace('.', ','), u: 't levantadas' }
  : { n: String(resumo.value.volume), u: 'kg levantados' }))
const personalFirst = computed(() => data.value?.personal?.split(' ')[0] ?? 'Seu personal')

// ---- tela acesa durante o treino ----
let wakeLock: { release: () => Promise<void> } | null = null
async function manterTelaAcesa() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {}
}
function aoVoltar() {
  if (document.visibilityState === 'visible' && etapa.value !== 'fim') manterTelaAcesa()
}
onMounted(() => {
  manterTelaAcesa()
  document.addEventListener('visibilitychange', aoVoltar)
  fotoTimer = setInterval(() => {
    if (etapa.value === 'serie' && (catalogoEx.value?.images.length ?? 0) > 1) foto.value++
  }, 1300)
})
onBeforeUnmount(() => {
  pararDescanso()
  if (fotoTimer) clearInterval(fotoTimer)
  document.removeEventListener('visibilitychange', aoVoltar)
  wakeLock?.release().catch(() => {})
  if (saveTimer) {
    clearTimeout(saveTimer)
    persist()
  }
})

const minutosEstimados = computed(() => (dia.value ? estimarMinutos(dia.value) : 0))
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Erros e plano ausente -->
    <main v-if="loadError || !data || !dia" class="flex flex-col gap-4 px-5 pt-6">
      <NuxtLink to="/aluno/plano/treino" class="btn-ghost self-start"><AppIcon name="back" :size="16" /> Voltar</NuxtLink>
      <p class="text-sm" :class="loadError ? 'text-danger' : 'text-muted'">
        {{ loadError ? `Não deu para abrir o treino: ${friendlyError(loadError)}` : 'Este dia não existe no seu treino atual.' }}
      </p>
    </main>

    <!-- 1. Treino de hoje -->
    <main v-else-if="etapa === 'intro'" class="flex flex-1 flex-col gap-6 px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div class="flex items-center justify-between">
        <NuxtLink to="/aluno" aria-label="Sair" class="flex size-11 items-center justify-center rounded-full border border-line bg-card"><AppIcon name="x" /></NuxtLink>
        <NuxtLink to="/aluno/plano/treino" class="text-sm font-semibold text-muted">Trocar treino</NuxtLink>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-sm text-muted first-letter:uppercase">{{ new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }) }}</span>
        <h1 class="font-display text-[34px] leading-[1.05] font-bold">{{ dia.nome }}<template v-if="dia.foco"><br><span class="text-lime">{{ dia.foco }}</span></template></h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <span class="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-sm font-semibold"><AppIcon name="clock" :size="16" class="text-lime" /> ~{{ minutosEstimados }} min</span>
        <span class="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-sm font-semibold"><AppIcon name="dumbbell" :size="16" class="text-lime" /> {{ total }} exercícios</span>
        <span class="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-sm font-semibold"><AppIcon name="flame" :size="16" class="text-orange" /> {{ totalSeries }} séries</span>
      </div>
      <div class="grid grid-cols-3 gap-2.5">
        <div v-for="(e, i) in dia.exercicios" :key="i" class="flex flex-col gap-1">
          <div class="relative aspect-square overflow-hidden rounded-[16px] bg-white">
            <img v-if="catalogo(e.exercicio_id)?.images[0]" :src="catalogo(e.exercicio_id)!.images[0]" :alt="e.nome" class="size-full object-contain" loading="lazy">
            <span v-else class="flex size-full items-center justify-center bg-raised text-muted"><AppIcon name="dumbbell" /></span>
            <span class="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-ink font-display text-[10px] font-bold text-lime">{{ i + 1 }}</span>
          </div>
          <span class="line-clamp-2 text-[11px] leading-tight text-muted">{{ e.nome }}</span>
        </div>
      </div>
      <div class="flex-1" />
      <button type="button" class="btn-primary h-16 text-lg" @click="comecar"><AppIcon name="play" /> Começar</button>
    </main>

    <!-- Contagem 3, 2, 1 -->
    <main v-else-if="etapa === 'contagem'" class="flex flex-1 flex-col items-center justify-center gap-4">
      <span class="text-lg text-muted">Prepare-se</span>
      <span :key="contagem" class="animate-ping-once font-display text-[120px] leading-none font-bold text-lime">{{ contagem }}</span>
      <span class="text-sm text-muted">{{ dia.exercicios[pos]?.nome }}</span>
    </main>

    <!-- 4. Treino concluído -->
    <main v-else-if="etapa === 'fim'" class="flex flex-1 flex-col items-center gap-6 px-6 pt-12 pb-[max(24px,env(safe-area-inset-bottom))] text-center">
      <span class="flex size-24 items-center justify-center rounded-full bg-lime text-ink"><AppIcon name="check" :size="48" /></span>
      <h1 class="font-display text-[32px] leading-[1.05] font-bold">Treino concluído</h1>
      <div class="grid w-full grid-cols-3 gap-2.5">
        <div class="flex flex-col gap-0.5 rounded-[18px] bg-card p-3"><span class="font-display text-2xl font-bold">{{ resumo.minutos }}</span><span class="text-xs text-muted">minutos</span></div>
        <div class="flex flex-col gap-0.5 rounded-[18px] bg-card p-3"><span class="font-display text-2xl font-bold">{{ resumo.series }}</span><span class="text-xs text-muted">séries</span></div>
        <div class="flex flex-col gap-0.5 rounded-[18px] bg-card p-3"><span class="font-display text-2xl font-bold">{{ volumeTexto.n }}</span><span class="text-xs text-muted">{{ volumeTexto.u }}</span></div>
      </div>
      <div v-for="r in recordesHoje" :key="r.exercicio" class="flex w-full items-center gap-3 rounded-[18px] bg-[#1F2611] px-4 py-3 text-left">
        <AppIcon name="trophy" class="shrink-0 text-lime" />
        <span class="text-sm"><strong class="text-lime">Recorde:</strong> +{{ fmtKg(r.ganho) }} kg em {{ r.exercicio }}</span>
      </div>
      <div class="flex w-full flex-col gap-3">
        <span class="text-sm font-semibold">Como foi o treino?</span>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="op in ([['leve', 'Leve'], ['na_medida', 'Na medida'], ['pesado', 'Pesado']] as const)"
            :key="op[0]"
            type="button"
            class="flex h-14 items-center justify-center rounded-[16px] border text-sm font-semibold transition"
            :class="sentimento === op[0] ? 'border-lime bg-lime text-ink' : 'border-line bg-card'"
            @click="responder(op[0])"
          >
            {{ op[1] }}
          </button>
        </div>
        <span class="text-xs text-faint">{{ sentimento ? `${personalFirst} vai ver sua resposta.` : 'Sua resposta ajuda o personal a ajustar o treino.' }}</span>
      </div>
      <span v-if="resumo.seguidos > 1" class="flex items-center gap-1.5 text-sm text-muted"><AppIcon name="flame" :size="16" class="text-orange" /> {{ resumo.seguidos }} dias seguidos</span>
      <div class="flex-1" />
      <NuxtLink to="/aluno" class="btn-primary h-14">Voltar para o início</NuxtLink>
    </main>

    <!-- 3. Descanso -->
    <main v-else-if="etapa === 'descanso'" class="flex flex-1 flex-col items-center gap-6 px-6 pt-10 pb-[max(24px,env(safe-area-inset-bottom))]" role="timer">
      <span class="text-lg font-semibold text-muted">Descanso</span>
      <svg :aria-label="`Faltam ${remaining} segundos`" role="img" width="240" height="240" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="68" fill="none" stroke="#1A1E24" stroke-width="12" />
        <circle cx="80" cy="80" r="68" fill="none" stroke="#C6F432" stroke-width="12" stroke-linecap="round" stroke-dasharray="427" :stroke-dashoffset="restOffset" transform="rotate(-90 80 80)" class="transition-[stroke-dashoffset] duration-1000 ease-linear" />
        <text x="80" y="94" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="42" font-weight="700" fill="#F3F5F7">{{ remaining }}</text>
      </svg>
      <div class="grid w-full grid-cols-2 gap-3">
        <button type="button" class="btn-ghost h-14 justify-center rounded-[16px] text-base" @click="maisTempo">+15 s</button>
        <button type="button" class="btn-ghost h-14 justify-center rounded-[16px] text-base" @click="terminarDescanso">Pular</button>
      </div>
      <div class="flex-1" />
      <div v-if="proximoInfo" class="flex w-full items-center gap-3 rounded-[20px] bg-card p-3">
        <div class="size-14 shrink-0 overflow-hidden rounded-[12px] bg-white">
          <img v-if="proximoInfo.foto" :src="proximoInfo.foto" alt="" class="size-full object-contain">
        </div>
        <div class="flex min-w-0 flex-col">
          <span class="text-xs text-muted">{{ proximoInfo.mesmoExercicio ? 'A seguir' : 'Próximo exercício' }}</span>
          <span class="truncate font-semibold">{{ proximoInfo.titulo }}</span>
          <span class="text-sm text-muted">{{ proximoInfo.detalhe }}</span>
        </div>
      </div>
    </main>

    <!-- 2. Série atual -->
    <template v-else-if="ex && feito && atual">
      <header class="flex items-center gap-3 px-5 pt-5 pb-3">
        <NuxtLink to="/aluno" aria-label="Sair do treino (o progresso fica salvo)" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card"><AppIcon name="x" /></NuxtLink>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-raised" :aria-label="`${feitas} de ${totalSeries} séries`">
          <div class="h-full rounded-full bg-lime transition-all" :style="{ width: `${Math.round((feitas / Math.max(1, totalSeries)) * 100)}%` }" />
        </div>
        <button type="button" aria-label="Ver todos os exercícios" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card" @click="mostrarLista = true"><AppIcon name="list" /></button>
      </header>

      <main class="flex flex-1 flex-col gap-4 px-5 pb-4">
        <div class="relative overflow-hidden rounded-[24px] bg-white">
          <img v-if="catalogoEx?.images.length" :src="catalogoEx.images[foto % catalogoEx.images.length]" :alt="ex.nome" class="aspect-[4/3] w-full object-contain">
          <div v-else class="flex aspect-[4/3] w-full items-center justify-center bg-raised text-muted"><AppIcon name="dumbbell" :size="40" /></div>
          <button v-if="ex.observacao" type="button" aria-label="Dica do personal" class="absolute top-3 left-3 flex size-10 items-center justify-center rounded-full bg-ink/80 text-text" @click="mostrarDica = !mostrarDica"><AppIcon name="info" /></button>
          <button v-if="catalogoEx" type="button" :aria-label="catalogoEx.video_url ? 'Ver vídeo' : 'Como fazer'" class="absolute right-3 bottom-3 flex h-10 items-center gap-1.5 rounded-full bg-ink/80 px-3.5 text-sm font-semibold text-text" @click="verDetalhe = true">
            <AppIcon :name="catalogoEx.video_url ? 'play' : 'info'" :size="16" /> {{ catalogoEx.video_url ? 'Vídeo' : 'Como fazer' }}
          </button>
          <div v-if="mostrarDica" class="absolute inset-x-3 top-16 rounded-[16px] bg-ink/90 p-3.5 text-sm leading-relaxed text-text" @click="mostrarDica = false">
            <strong class="text-lime">Dica:</strong> {{ ex.observacao }}
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h1 class="font-display text-[24px] leading-tight font-bold">{{ ex.nome }}</h1>
          <div class="flex items-center gap-3">
            <span class="font-semibold text-muted">Série {{ serie + 1 }} de {{ feito.series.length }}</span>
            <span class="flex gap-1.5">
              <button
                v-for="(s, i) in feito.series"
                :key="i"
                type="button"
                :aria-label="`Ir para a série ${i + 1}`"
                class="size-3 rounded-full transition"
                :class="[s.feita ? 'bg-lime' : 'bg-line', i === serie && 'ring-2 ring-lime ring-offset-2 ring-offset-ink']"
                @click="serie = i"
              />
            </span>
            <button type="button" class="ml-auto text-xs font-semibold text-muted" @click="serieExtra">+ série</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col items-center gap-2 rounded-[20px] bg-card p-3">
            <span class="text-xs font-semibold text-muted uppercase">Repetições</span>
            <div class="flex w-full items-center justify-between">
              <button v-if="repsNum !== null" type="button" aria-label="Menos uma repetição" class="flex size-11 items-center justify-center rounded-full bg-raised" @click="mudarReps(-1)"><AppIcon name="minus" /></button>
              <input v-model="atual.reps" class="w-16 bg-transparent text-center font-display text-[30px] font-bold outline-none" :class="repsNum === null && 'w-full'" inputmode="numeric" aria-label="Repetições">
              <button v-if="repsNum !== null" type="button" aria-label="Mais uma repetição" class="flex size-11 items-center justify-center rounded-full bg-raised" @click="mudarReps(1)"><AppIcon name="plus" /></button>
            </div>
          </div>
          <div class="flex flex-col items-center gap-2 rounded-[20px] bg-card p-3">
            <span class="text-xs font-semibold text-muted uppercase">Carga (kg)</span>
            <div class="flex w-full items-center justify-between">
              <button type="button" aria-label="Menos 2,5 kg" class="flex size-11 items-center justify-center rounded-full bg-raised" @click="mudarCarga(-2.5)"><AppIcon name="minus" /></button>
              <input v-model.number="atual.carga_kg" type="number" step="0.5" min="0" class="w-16 bg-transparent text-center font-display text-[30px] font-bold outline-none" inputmode="decimal" placeholder="0" aria-label="Carga em kg">
              <button type="button" aria-label="Mais 2,5 kg" class="flex size-11 items-center justify-center rounded-full bg-raised" @click="mudarCarga(2.5)"><AppIcon name="plus" /></button>
            </div>
          </div>
        </div>
        <span v-if="ultimaVez" class="-mt-1 text-center text-sm text-faint">Última vez: {{ ultimaVez.reps }} × {{ fmtKg(ultimaVez.carga_kg) }} kg</span>
        <span v-else class="-mt-1 text-center text-sm text-faint">Meta: {{ ex.series }} × {{ ex.repeticoes }}</span>
        <p v-if="saveError" class="text-center text-sm text-[#FFB98A]" role="status">{{ saveError }}</p>
      </main>

      <footer class="sticky bottom-0 flex flex-col gap-2 bg-ink px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button v-if="!atual.feita" type="button" class="btn-primary h-16 text-lg" @click="fizSerie"><AppIcon name="check" :size="24" /> Fiz a série</button>
        <button v-else type="button" class="btn-ghost h-16 justify-center rounded-[18px] text-base" @click="atual.feita = false">Série feita · desfazer</button>
      </footer>

      <!-- Lista de exercícios -->
      <div v-if="mostrarLista" class="fixed inset-0 z-30 flex items-end justify-center bg-black/60 md:items-center md:p-6" @click.self="mostrarLista = false">
        <div class="flex max-h-[85dvh] w-full max-w-[560px] flex-col gap-2 overflow-y-auto rounded-t-[28px] border-t border-line bg-raised p-5 md:rounded-[28px] md:border" role="dialog" aria-label="Exercícios do treino">
          <div class="mb-1 flex items-center justify-between">
            <h2 class="font-display text-lg font-semibold">{{ dia.nome }}</h2>
            <button type="button" class="text-sm text-muted" @click="mostrarLista = false">Fechar</button>
          </div>
          <button
            v-for="(e, i) in dia.exercicios"
            :key="i"
            type="button"
            class="flex items-center gap-3 rounded-[16px] p-2 text-left transition"
            :class="i === pos ? 'bg-card ring-1 ring-lime' : 'bg-card'"
            @click="irPara(i)"
          >
            <div class="size-12 shrink-0 overflow-hidden rounded-[12px] bg-white">
              <img v-if="catalogo(e.exercicio_id)?.images[0]" :src="catalogo(e.exercicio_id)!.images[0]" alt="" class="size-full object-contain">
            </div>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ e.nome }}</span>
            <span class="shrink-0 text-xs font-semibold" :class="registro[i]?.series.every((s) => s.feita) ? 'text-lime' : 'text-muted'">
              {{ registro[i]?.series.filter((s) => s.feita).length }}/{{ registro[i]?.series.length }}
            </span>
          </button>
          <button type="button" class="btn-ghost mt-2 justify-center py-3" @click="finalizar">Terminar treino agora</button>
        </div>
      </div>

      <ExercicioSheet v-if="verDetalhe && catalogoEx" :key="catalogoEx.id" :item="catalogoEx" :org-id="me?.current?.organization_id ?? ''" :can-edit="false" @close="verDetalhe = false" />
    </template>
  </div>
</template>

<style scoped>
@keyframes pop {
  0% { transform: scale(0.6); opacity: 0; }
  40% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-ping-once { animation: pop 0.6s ease-out; }
</style>
