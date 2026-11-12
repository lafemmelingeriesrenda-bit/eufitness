<script setup lang="ts">
import type { Database, Json, Sentimento } from '~/types/database.types'

// Treino do aluno no modo foco: abre direto na série atual, uma série por vez.
// O descanso é um card acima do botão, já com a próxima série selecionada para
// ajustar. Salva enquanto o aluno treina: fechar e abrir continua de onde parou.
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
const finalizado = ref(false)

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
const verDetalhe = ref(false)
const mostrarDica = ref(false)
const mostrarLista = ref(false)

// ---- carga e repetições: tocar no número abre o seletor grande ----
const fmtKg = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : String(v).replace('.', ','))
const editando = ref<'kg' | 'reps' | null>(null)
/**
 * Ao mudar um valor, as próximas séries ainda não feitas deste exercício que
 * tinham o mesmo valor acompanham a mudança (ex.: subiu a carga na 1ª série,
 * as seguintes já vêm com a carga nova).
 */
function propagar<K extends 'carga_kg' | 'reps'>(campo: K, antigo: SerieFeita[K], novo: SerieFeita[K]) {
  feito.value?.series.forEach((s, i) => {
    if (i > serie.value && !s.feita && s[campo] === antigo) s[campo] = novo
  })
}
const cargaModel = computed<number | null>({
  get: () => (atual.value?.carga_kg ?? null),
  set: (v) => {
    if (!atual.value) return
    const antigo = atual.value.carga_kg
    atual.value.carga_kg = v
    propagar('carga_kg', antigo, v)
  },
})
const repsModel = computed<number | null>({
  get: () => numeroReps(atual.value?.reps ?? ''),
  set: (v) => {
    if (!atual.value || v === null) return
    const n = String(Math.max(1, Math.round(v)))
    const antigo = atual.value.reps
    atual.value.reps = /\d+/.test(antigo) ? antigo.replace(/\d+/, n) : n
    propagar('reps', antigo, atual.value.reps)
  },
})

// ---- cronômetro do treino ----
const agora = ref(Date.now())
const decorrido = computed(() => {
  const s = Math.max(0, Math.floor((agora.value - new Date(data.value?.log.started_at ?? agora.value).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
})

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

// ---- descanso: card acima do botão ----
const descanso = ref<{ total: number; restante: number; trocouExercicio: boolean } | null>(null)
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
function iniciarDescanso(seg: number, trocouExercicio: boolean) {
  pararDescanso()
  descanso.value = { total: Math.max(1, seg), restante: Math.max(1, seg), trocouExercicio }
  restTimer = setInterval(() => {
    if (!descanso.value) return
    descanso.value.restante--
    if (descanso.value.restante <= 0) {
      bip()
      pararDescanso()
    }
  }, 1000)
}
function pararDescanso() {
  if (restTimer) clearInterval(restTimer)
  restTimer = null
  descanso.value = null
}
const fmtSeg = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const restOffset = computed(() => (descanso.value ? 88 * (1 - descanso.value.restante / descanso.value.total) : 0))

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
  const descansoSeg = ex.value?.descanso_seg ?? 60
  const prox = proximaPendente()
  if (!prox) {
    finalizar()
    return
  }
  // Já seleciona a próxima série, para o aluno ajustar enquanto descansa.
  const trocou = prox.pos !== pos.value
  irPara(prox.pos, prox.serie)
  iniciarDescanso(descansoSeg, trocou)
}
function serieExtra() {
  const last = feito.value?.series.at(-1)
  feito.value?.series.push({ reps: last?.reps ?? ex.value?.repeticoes ?? '10', carga_kg: last?.carga_kg ?? null, feita: false })
  serie.value = (feito.value?.series.length ?? 1) - 1
}

// ---- fim ----
const resumo = ref({ minutos: 0, series: 0, volume: 0, seguidos: 0 })
const recordesHoje = ref<{ exercicio: string; ganho: number }[]>([])
const sentimento = ref<Sentimento | null>(null)
async function finalizar() {
  pararDescanso()
  if (saveTimer) clearTimeout(saveTimer)
  const fim = new Date()
  await persist({ finished_at: fim.toISOString() })
  const { data: done } = await supabase
    .from('workout_logs').select('started_at')
    .eq('student_id', user.value!.sub).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(120)
  resumo.value = {
    minutos: Math.max(1, Math.round((fim.getTime() - new Date(data.value!.log.started_at).getTime()) / 60000)),
    series: seriesFeitas(registro.value),
    volume: volumeKg(registro.value),
    seguidos: diasSeguidos((done ?? []).map((d) => d.started_at)),
  }
  recordesHoje.value = recordes(registro.value, data.value?.anterior).slice(0, 3)
  finalizado.value = true
}
async function responder(s: Sentimento) {
  sentimento.value = s
  await persist({ feeling: s })
}
const volumeTexto = computed(() => (resumo.value.volume >= 1000
  ? { n: (resumo.value.volume / 1000).toFixed(1).replace('.', ','), u: 't levantadas' }
  : { n: String(resumo.value.volume), u: 'kg levantados' }))
const personalFirst = computed(() => data.value?.personal?.split(' ')[0] ?? 'Seu personal')

// ---- tela acesa, relógio e fotos ----
let wakeLock: { release: () => Promise<void> } | null = null
async function manterTelaAcesa() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {}
}
function aoVoltar() {
  if (document.visibilityState === 'visible' && !finalizado.value) manterTelaAcesa()
}
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  manterTelaAcesa()
  document.addEventListener('visibilitychange', aoVoltar)
  let n = 0
  tick = setInterval(() => {
    agora.value = Date.now()
    // A cada ~1,3 s troca a foto (início e fim do movimento).
    n++
    if (n % 4 === 0 && (catalogoEx.value?.images.length ?? 0) > 1 && !mostrarDica.value) foto.value++
  }, 330)
})
onBeforeUnmount(() => {
  pararDescanso()
  if (tick) clearInterval(tick)
  document.removeEventListener('visibilitychange', aoVoltar)
  wakeLock?.release().catch(() => {})
  if (saveTimer) {
    clearTimeout(saveTimer)
    persist()
  }
})
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

    <!-- Treino concluído -->
    <main v-else-if="finalizado" class="flex flex-1 flex-col items-center gap-6 px-6 pt-12 pb-[max(24px,env(safe-area-inset-bottom))] text-center">
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

    <!-- Série atual (modo foco) -->
    <template v-else-if="ex && feito && atual">
      <header class="flex items-center gap-3 px-5 pt-5 pb-3">
        <NuxtLink to="/aluno" aria-label="Sair do treino (o progresso fica salvo)" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card"><AppIcon name="x" /></NuxtLink>
        <div class="flex flex-1 items-center justify-center gap-2 text-sm font-semibold">
          <span class="text-muted">{{ pos + 1 }} de {{ total }}</span>
          <span class="text-faint">·</span>
          <span class="tabular-nums">{{ decorrido }}</span>
        </div>
        <button type="button" aria-label="Ver todos os exercícios" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card" @click="mostrarLista = true"><AppIcon name="list" /></button>
      </header>

      <main class="flex flex-1 flex-col gap-4 px-5 pb-3">
        <div class="relative overflow-hidden rounded-[24px] bg-raised">
          <img v-if="catalogoEx?.images.length" :src="catalogoEx.images[foto % catalogoEx.images.length]" :alt="ex.nome" class="aspect-[16/10] w-full object-cover">
          <div v-else class="flex aspect-[16/10] w-full items-center justify-center text-muted"><AppIcon name="dumbbell" :size="40" /></div>
          <button v-if="ex.observacao" type="button" aria-label="Dica do personal" class="absolute top-3 left-3 flex size-10 items-center justify-center rounded-full bg-ink/80 text-text" @click="mostrarDica = !mostrarDica"><AppIcon name="info" /></button>
          <button v-if="catalogoEx" type="button" :aria-label="catalogoEx.video_url ? 'Ver vídeo' : 'Como fazer'" class="absolute right-3 bottom-3 flex h-10 items-center gap-1.5 rounded-full bg-ink/80 px-3.5 text-sm font-semibold text-text" @click="verDetalhe = true">
            <AppIcon :name="catalogoEx.video_url ? 'play' : 'info'" :size="16" /> {{ catalogoEx.video_url ? 'Vídeo' : 'Como fazer' }}
          </button>
          <div v-if="mostrarDica" class="absolute inset-x-3 top-16 rounded-[16px] bg-ink/90 p-3.5 text-sm leading-relaxed text-text" @click="mostrarDica = false">
            <strong class="text-lime">Dica:</strong> {{ ex.observacao }}
          </div>
        </div>

        <h1 class="font-display text-[24px] leading-tight font-bold">{{ ex.nome }}</h1>

        <!-- Séries em blocos: feitas, atual e próximas -->
        <div class="flex gap-2">
          <button
            v-for="(s, i) in feito.series"
            :key="i"
            type="button"
            class="flex h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-[14px] text-xs font-semibold transition"
            :class="s.feita
              ? 'bg-lime text-ink'
              : i === serie ? 'border-2 border-lime text-text' : 'bg-card text-faint'"
            :aria-label="`Série ${i + 1}${s.feita ? ' feita' : ''}`"
            @click="serie = i"
          >
            <template v-if="s.feita">{{ fmtKg(s.carga_kg) }}×{{ s.reps }} <AppIcon name="check" :size="14" /></template>
            <template v-else-if="i === serie">Série {{ i + 1 }}</template>
            <template v-else>{{ i + 1 }}</template>
          </button>
          <button type="button" aria-label="Adicionar série" class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-card text-muted" @click="serieExtra"><AppIcon name="plus" :size="18" /></button>
        </div>

        <!-- Carga e repetições: toque para mudar -->
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="flex flex-col items-center gap-1 rounded-[20px] bg-card py-4 active:scale-[.98]" @click="editando = 'kg'">
            <span class="font-display text-[40px] leading-none font-bold">{{ fmtKg(atual.carga_kg) }}</span>
            <span class="text-xs text-muted">kg · toque para mudar</span>
          </button>
          <button type="button" class="flex flex-col items-center gap-1 rounded-[20px] bg-card py-4 active:scale-[.98]" @click="editando = 'reps'">
            <span class="font-display text-[40px] leading-none font-bold">{{ atual.reps }}</span>
            <span class="text-xs text-muted">reps · toque para mudar</span>
          </button>
        </div>
        <span class="-mt-1 text-center text-sm text-faint">
          <template v-if="ultimaVez">Última vez: {{ fmtKg(ultimaVez.carga_kg) }} kg × {{ ultimaVez.reps }}</template>
          <template v-else>Meta: {{ ex.series }} × {{ ex.repeticoes }}</template>
        </span>
        <p v-if="saveError" class="text-center text-sm text-[#FFB98A]" role="status">{{ saveError }}</p>
      </main>

      <footer class="sticky bottom-0 flex flex-col gap-2.5 bg-ink px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        <!-- Descanso: card pequeno, a próxima série já está selecionada acima -->
        <div v-if="descanso" class="flex items-center gap-3 rounded-[18px] bg-card p-3" role="timer">
          <svg width="40" height="40" viewBox="0 0 34 34" aria-hidden="true" class="shrink-0">
            <circle cx="17" cy="17" r="14" fill="none" stroke="#262B33" stroke-width="4" />
            <circle cx="17" cy="17" r="14" fill="none" stroke="#C6F432" stroke-width="4" stroke-linecap="round" stroke-dasharray="88" :stroke-dashoffset="restOffset" transform="rotate(-90 17 17)" class="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="font-display text-base leading-tight font-bold whitespace-nowrap tabular-nums">Descanso {{ fmtSeg(descanso.restante) }}</span>
            <span class="truncate text-xs text-muted">
              {{ descanso.trocouExercicio ? `Próximo: ${ex.nome}` : `Próxima: ${fmtKg(atual.carga_kg)} kg × ${atual.reps}` }}
            </span>
          </div>
          <button type="button" class="h-10 shrink-0 rounded-full bg-raised px-3 text-sm font-semibold" @click="descanso.restante += 15; descanso.total += 15">+15</button>
          <button type="button" class="h-10 shrink-0 rounded-full bg-raised px-3 text-sm font-semibold" @click="pararDescanso">Pular</button>
        </div>
        <button v-if="!atual.feita" type="button" class="btn-primary h-16 text-lg" @click="fizSerie"><AppIcon name="check" :size="24" /> Fiz a série</button>
        <button v-else type="button" class="btn-ghost h-16 justify-center rounded-[18px] text-base" @click="atual.feita = false">Série feita · desfazer</button>
      </footer>

      <SeletorNumero
        v-if="editando === 'kg'"
        v-model="cargaModel"
        titulo="Carga"
        unidade="kg"
        :passo="2.5"
        :atalhos="[-5, -1, 1, 5]"
        :referencia="ultimaVez ? `${fmtKg(ultimaVez.carga_kg)} kg` : null"
        @close="editando = null"
      />
      <SeletorNumero
        v-if="editando === 'reps'"
        v-model="repsModel"
        titulo="Repetições"
        unidade="reps"
        :passo="1"
        :atalhos="[-2, -1, 1, 2]"
        :referencia="ultimaVez ? `${ultimaVez.reps} reps` : null"
        @close="editando = null"
      />

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
            class="flex items-center gap-3 rounded-[16px] bg-card p-2 text-left transition"
            :class="i === pos && 'ring-1 ring-lime'"
            @click="irPara(i)"
          >
            <div class="size-12 shrink-0 overflow-hidden rounded-[12px] bg-raised">
              <img v-if="catalogo(e.exercicio_id)?.images[0]" :src="catalogo(e.exercicio_id)!.images[0]" alt="" class="size-full object-cover">
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
