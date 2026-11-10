<!-- Edição do treino pelo personal: dias, exercícios e orientações. -->
<script setup lang="ts">
const treino = defineModel<Treino>({ required: true })

// Catálogo para sugerir nomes enquanto o personal digita.
const { me } = useMe()
const catalogo = useCatalogo(me.value!.current!.organization_id)
onMounted(() => catalogo.load().catch(() => {}))
const opcoes = computed(() => (catalogo.items.value ?? []).filter((e) => e.enabled))
const porNome = computed(() => new Map(opcoes.value.map((e) => [e.nome.toLowerCase(), e])))
const porId = computed(() => new Map((catalogo.items.value ?? []).map((e) => [e.id, e])))

/** Liga o exercício ao catálogo quando o nome digitado bate com um da lista. */
function onNome(ex: Treino['dias'][number]['exercicios'][number]) {
  ex.exercicio_id = porNome.value.get(ex.nome.trim().toLowerCase())?.id ?? ''
}

function addDia() {
  const letra = String.fromCharCode(65 + treino.value.dias.length)
  treino.value.dias.push({ nome: `Treino ${letra}`, foco: '', exercicios: [] })
}
function addExercicio(d: number) {
  treino.value.dias[d]!.exercicios.push({ exercicio_id: '', nome: '', series: 3, repeticoes: '10 a 12', descanso_seg: 60, observacao: '' })
}
function move<T>(list: T[], i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <label for="resumo" class="text-sm font-semibold text-muted">Resumo para o aluno</label>
      <textarea id="resumo" v-model="treino.resumo" rows="3" class="field h-auto py-3.5" />
    </div>

    <section v-for="(dia, d) in treino.dias" :key="d" class="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4">
      <div class="flex items-start gap-2">
        <div class="grid flex-1 grid-cols-[2fr_3fr] gap-2">
          <input v-model="dia.nome" class="field h-12" aria-label="Nome do dia" placeholder="Treino A">
          <input v-model="dia.foco" class="field h-12" aria-label="Foco do dia" placeholder="Peito e tríceps">
        </div>
        <button type="button" class="flex size-12 shrink-0 items-center justify-center rounded-[14px] text-muted hover:text-danger" :aria-label="`Remover ${dia.nome}`" @click="treino.dias.splice(d, 1)">
          ✕
        </button>
      </div>

      <div v-for="(ex, e) in dia.exercicios" :key="e" class="flex flex-col gap-2 rounded-[16px] bg-raised p-3">
        <div class="flex items-center gap-2">
          <span class="w-5 shrink-0 text-center text-xs font-bold text-faint">{{ e + 1 }}</span>
          <img
            v-if="ex.exercicio_id && porId.get(ex.exercicio_id)?.images[0]"
            :src="porId.get(ex.exercicio_id)!.images[0]"
            alt=""
            class="size-11 shrink-0 rounded-[12px] bg-white object-contain"
            loading="lazy"
          >
          <input
            v-model="ex.nome"
            class="field h-11 flex-1 bg-card"
            aria-label="Exercício"
            placeholder="Digite para buscar no catálogo"
            list="catalogo-exercicios"
            @change="onNome(ex)"
          >
          <div class="flex shrink-0 flex-col">
            <button type="button" class="px-1.5 text-xs text-muted" aria-label="Subir" @click="move(dia.exercicios, e, -1)">▲</button>
            <button type="button" class="px-1.5 text-xs text-muted" aria-label="Descer" @click="move(dia.exercicios, e, 1)">▼</button>
          </div>
          <button type="button" class="shrink-0 px-1.5 text-muted hover:text-danger" aria-label="Remover exercício" @click="dia.exercicios.splice(e, 1)">✕</button>
        </div>
        <div class="grid grid-cols-3 gap-2 pl-7">
          <label class="flex flex-col gap-1 text-[11px] text-muted">Séries
            <input v-model.number="ex.series" type="number" min="1" max="20" inputmode="numeric" class="field h-10 bg-card px-3 text-sm">
          </label>
          <label class="flex flex-col gap-1 text-[11px] text-muted">Repetições
            <input v-model="ex.repeticoes" class="field h-10 bg-card px-3 text-sm">
          </label>
          <label class="flex flex-col gap-1 text-[11px] text-muted">Descanso (s)
            <input v-model.number="ex.descanso_seg" type="number" min="0" max="600" step="15" inputmode="numeric" class="field h-10 bg-card px-3 text-sm">
          </label>
        </div>
        <input v-model="ex.observacao" class="field ml-7 h-10 w-auto bg-card px-3 text-sm" aria-label="Observação" placeholder="Observação (opcional)">
      </div>

      <button type="button" class="btn-ghost self-start" @click="addExercicio(d)">
        <AppIcon name="plus" :size="16" /> Exercício
      </button>
    </section>

    <button type="button" class="btn-ghost self-start" @click="addDia">
      <AppIcon name="plus" :size="16" /> Dia de treino
    </button>

    <EditorLista v-model="treino.orientacoes" label="Orientações para o aluno" placeholder="Ex.: aqueça 5 minutos na esteira antes" />

    <datalist id="catalogo-exercicios">
      <option v-for="o in opcoes" :key="o.id" :value="o.nome" />
    </datalist>
  </div>
</template>
