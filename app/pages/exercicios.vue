<script setup lang="ts">
import type { Database } from '~/types/database.types'

// Catálogo de exercícios da assessoria. O admin liga e desliga exercícios,
// renomeia, coloca vídeo e cria exercícios próprios; o agente só monta
// treinos com os exercícios ligados daqui.
definePageMeta({ roles: ['personal'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const { me } = useMe()
const orgId = me.value!.current!.organization_id
const canEdit = computed(() => !!me.value?.current?.is_admin)

const { items, load } = useCatalogo(orgId)
const loadError = ref('')
try {
  await load()
} catch (e) {
  loadError.value = friendlyError(e)
}

const search = ref('')
const musculo = ref('')
const equipamento = ref('')
const mostrar = ref<'ativos' | 'todos' | 'desligados' | 'video' | 'proprios'>('ativos')
const limite = ref(60)
watch([search, musculo, equipamento, mostrar], () => (limite.value = 60))

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filtrados = computed(() => {
  const q = norm(search.value.trim())
  return (items.value ?? []).filter((e) => {
    if (mostrar.value === 'ativos' && !e.enabled) return false
    if (mostrar.value === 'desligados' && e.enabled) return false
    if (mostrar.value === 'video' && !e.video_url) return false
    if (mostrar.value === 'proprios' && !e.proprio) return false
    if (musculo.value && !e.primary_muscles.includes(musculo.value)) return false
    if (equipamento.value && e.equipment !== equipamento.value) return false
    if (q && !norm(`${e.nome} ${e.name_en ?? ''}`).includes(q)) return false
    return true
  })
})
const contagem = computed(() => {
  const all = items.value ?? []
  return { total: all.length, ativos: all.filter((e) => e.enabled).length, video: all.filter((e) => e.video_url).length }
})

const aberto = ref<ItemCatalogo | null>(null)

// ---- Novo exercício próprio ----
const novoAberto = ref(false)
const novo = reactive({ nome: '', musculo: 'chest', equipamento: 'machine', nivel: 'beginner', instrucoes: '', video: '' })
const novoErro = ref('')
const novoSalvando = ref(false)

async function criar() {
  novoErro.value = ''
  if (novo.nome.trim().length < 2) {
    novoErro.value = 'Dê um nome ao exercício.'
    return
  }
  if (novo.video.trim() && !novo.video.trim().startsWith('https://')) {
    novoErro.value = 'O link do vídeo precisa começar com https://'
    return
  }
  novoSalvando.value = true
  const id = `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  const { error } = await supabase.from('exercises').insert({
    id,
    organization_id: orgId,
    name_pt: novo.nome.trim(),
    category: 'strength',
    level: novo.nivel,
    equipment: novo.equipamento,
    primary_muscles: [novo.musculo],
    instructions_pt: novo.instrucoes.split('\n').map((l) => l.trim()).filter(Boolean),
    source: 'proprio',
  })
  if (!error && novo.video.trim()) {
    await supabase.from('organization_exercises').insert({ organization_id: orgId, exercise_id: id, video_url: novo.video.trim() })
  }
  novoSalvando.value = false
  if (error) {
    novoErro.value = friendlyError(error)
    return
  }
  Object.assign(novo, { nome: '', instrucoes: '', video: '' })
  novoAberto.value = false
  await load(true)
  mostrar.value = 'proprios'
}
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:px-0">
    <AppHeader />
    <PageTitle kicker="Catálogo da assessoria" title="Exercícios">
      <button v-if="canEdit" type="button" class="btn-ghost" @click="novoAberto = !novoAberto"><AppIcon name="plus" :size="18" /> Novo exercício</button>
    </PageTitle>

    <div class="flex items-center justify-between gap-3 lg:hidden">
      <h1 class="font-display text-xl font-semibold">Exercícios</h1>
      <button v-if="canEdit" type="button" class="btn-ghost" @click="novoAberto = !novoAberto"><AppIcon name="plus" :size="18" /> Novo</button>
    </div>

    <p v-if="loadError" class="text-sm text-danger" role="alert">Não deu para carregar o catálogo: {{ loadError }}</p>

    <section class="grid grid-cols-3 gap-2.5 lg:gap-4">
      <div class="flex flex-col gap-1 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[22px] font-bold">{{ contagem.ativos }}</span>
        <span class="text-xs text-muted">Disponíveis para o agente</span>
      </div>
      <div class="flex flex-col gap-1 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[22px] font-bold text-violet">{{ contagem.video }}</span>
        <span class="text-xs text-muted">Com vídeo</span>
      </div>
      <div class="flex flex-col gap-1 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[22px] font-bold text-muted">{{ contagem.total }}</span>
        <span class="text-xs text-muted">No catálogo</span>
      </div>
    </section>

    <!-- Novo exercício próprio -->
    <section v-if="novoAberto" class="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4 lg:grid lg:grid-cols-2 lg:gap-4">
      <h2 class="font-display text-lg font-semibold lg:col-span-2">Novo exercício da sua assessoria</h2>
      <label class="flex flex-col gap-1.5 text-sm text-muted lg:col-span-2">Nome
        <input v-model="novo.nome" class="field h-12" maxlength="120" placeholder="Ex.: Agachamento no smith com step">
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">Músculo principal
        <select v-model="novo.musculo" class="field h-12">
          <option v-for="m in musculosLista" :key="m" :value="m">{{ musculoLabel[m] }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">Equipamento
        <select v-model="novo.equipamento" class="field h-12">
          <option v-for="eq in equipamentosLista" :key="eq" :value="eq">{{ equipamentoLabel[eq] }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">Nível
        <select v-model="novo.nivel" class="field h-12">
          <option v-for="(label, n) in nivelLabel" :key="n" :value="n">{{ label }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted">Link do vídeo (opcional)
        <input v-model="novo.video" class="field h-12" type="url" placeholder="https://youtube.com/watch?v=…">
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted lg:col-span-2">Como fazer <span class="text-xs text-faint">(um passo por linha, opcional)</span>
        <textarea v-model="novo.instrucoes" rows="3" class="field h-auto py-3" />
      </label>
      <p v-if="novoErro" class="text-sm text-danger lg:col-span-2" role="alert">{{ novoErro }}</p>
      <div class="flex gap-2 lg:col-span-2">
        <button type="button" class="btn-primary h-12 lg:w-[240px]" :disabled="novoSalvando" @click="criar">{{ novoSalvando ? 'Criando…' : 'Criar exercício' }}</button>
        <button type="button" class="btn-ghost h-12 px-4" @click="novoAberto = false">Cancelar</button>
      </div>
    </section>

    <!-- Filtros -->
    <section class="flex flex-col gap-2.5 lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-3">
      <label for="busca-ex" class="sr-only">Buscar exercício</label>
      <input id="busca-ex" v-model="search" class="field h-12" type="search" placeholder="Buscar (ex.: supino, remada, glúteo)">
      <div class="grid grid-cols-2 gap-2.5 lg:contents">
        <select v-model="musculo" class="field h-12" aria-label="Músculo">
          <option value="">Todos os músculos</option>
          <option v-for="m in musculosLista" :key="m" :value="m">{{ musculoLabel[m] }}</option>
        </select>
        <select v-model="equipamento" class="field h-12" aria-label="Equipamento">
          <option value="">Todo equipamento</option>
          <option v-for="eq in equipamentosLista" :key="eq" :value="eq">{{ equipamentoLabel[eq] }}</option>
        </select>
      </div>
      <select v-model="mostrar" class="field h-12" aria-label="Mostrar">
        <option value="ativos">Disponíveis</option>
        <option value="todos">Todos</option>
        <option value="desligados">Desligados</option>
        <option value="video">Com vídeo</option>
        <option value="proprios">Criados por vocês</option>
      </select>
    </section>

    <p class="-mt-2 text-xs text-faint">{{ filtrados.length }} exercício(s){{ canEdit ? '. Toque em um para ver, desligar, renomear ou colocar vídeo.' : '.' }}</p>

    <section class="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      <button
        v-for="e in filtrados.slice(0, limite)"
        :key="e.id"
        type="button"
        class="flex flex-col overflow-hidden rounded-[18px] bg-card text-left transition hover:ring-1 hover:ring-line"
        :class="!e.enabled && 'opacity-50'"
        @click="aberto = e"
      >
        <div class="relative aspect-[4/3] w-full bg-white">
          <img v-if="e.images[0]" :src="e.images[0]" :alt="e.nome" class="size-full object-contain" loading="lazy">
          <div v-else class="flex size-full items-center justify-center bg-raised text-muted"><AppIcon name="dumbbell" :size="28" /></div>
          <span v-if="e.video_url" class="absolute top-2 left-2 rounded-full bg-violet px-2 py-0.5 text-[10px] font-bold text-ink">VÍDEO</span>
          <span v-if="e.proprio" class="absolute top-2 right-2 rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold text-ink">PRÓPRIO</span>
        </div>
        <div class="flex flex-col gap-0.5 p-3">
          <span class="line-clamp-2 text-[13px] leading-snug font-semibold">{{ e.nome }}</span>
          <span class="truncate text-[11px] text-muted">
            {{ e.primary_muscles.map((m) => musculoLabel[m] ?? m).join(', ') }}<template v-if="e.equipment"> · {{ equipamentoLabel[e.equipment] ?? e.equipment }}</template>
          </span>
          <span v-if="!e.enabled" class="text-[11px] font-semibold text-[#FFB98A]">Desligado</span>
        </div>
      </button>
    </section>

    <button v-if="filtrados.length > limite" type="button" class="btn-ghost self-center" @click="limite += 60">
      Mostrar mais ({{ filtrados.length - limite }})
    </button>

    <ExercicioSheet
      v-if="aberto"
      :key="aberto.id"
      :item="aberto"
      :org-id="orgId"
      :can-edit="canEdit"
      @close="aberto = null"
      @deleted="load(true)"
    />
  </main>
</template>
