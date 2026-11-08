<!-- Edição da dieta pela nutri: metas, refeições, alimentos e orientações. -->
<script setup lang="ts">
const dieta = defineModel<Dieta>({ required: true })

const metas = [
  { key: 'calorias_kcal', label: 'Calorias', unit: 'kcal' },
  { key: 'proteina_g', label: 'Proteína', unit: 'g' },
  { key: 'carboidrato_g', label: 'Carboidrato', unit: 'g' },
  { key: 'gordura_g', label: 'Gordura', unit: 'g' },
] as const

/** Calorias que os macros somam, para a nutri conferir com a meta. */
const kcalDosMacros = computed(() => Math.round(dieta.value.proteina_g * 4 + dieta.value.carboidrato_g * 4 + dieta.value.gordura_g * 9))

function addRefeicao() {
  dieta.value.refeicoes.push({ nome: '', horario: '', itens: [{ alimento: '', quantidade: '' }], observacao: '' })
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <label for="resumo" class="text-sm font-semibold text-muted">Resumo para o aluno</label>
      <textarea id="resumo" v-model="dieta.resumo" rows="3" class="field h-auto py-3.5" />
    </div>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-2 text-sm font-semibold text-muted">Metas do dia</legend>
      <div class="grid grid-cols-2 gap-2">
        <label v-for="m in metas" :key="m.key" class="flex flex-col gap-1 text-xs text-muted">
          {{ m.label }} ({{ m.unit }})
          <input v-model.number="dieta[m.key]" type="number" min="0" inputmode="numeric" class="field h-12">
        </label>
      </div>
      <p class="text-xs" :class="Math.abs(kcalDosMacros - dieta.calorias_kcal) > 100 ? 'text-[#FFB98A]' : 'text-faint'">
        Os macros somam {{ kcalDosMacros }} kcal.
      </p>
    </fieldset>

    <section v-for="(r, i) in dieta.refeicoes" :key="i" class="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4">
      <div class="flex items-center gap-2">
        <input v-model="r.nome" class="field h-12 flex-1" aria-label="Refeição" placeholder="Café da manhã">
        <input v-model="r.horario" type="time" class="field h-12 w-[110px] shrink-0 px-3" aria-label="Horário">
        <button type="button" class="shrink-0 px-2 text-muted hover:text-danger" :aria-label="`Remover ${r.nome}`" @click="dieta.refeicoes.splice(i, 1)">✕</button>
      </div>
      <div v-for="(item, j) in r.itens" :key="j" class="grid grid-cols-[3fr_2fr_auto] items-center gap-2">
        <input v-model="item.alimento" class="field h-11 bg-raised px-3 text-sm" aria-label="Alimento" placeholder="Alimento">
        <input v-model="item.quantidade" class="field h-11 bg-raised px-3 text-sm" aria-label="Quantidade" placeholder="Quantidade">
        <button type="button" class="px-1.5 text-muted hover:text-danger" aria-label="Remover alimento" @click="r.itens.splice(j, 1)">✕</button>
      </div>
      <button type="button" class="btn-ghost self-start" @click="r.itens.push({ alimento: '', quantidade: '' })">
        <AppIcon name="plus" :size="16" /> Alimento
      </button>
      <input v-model="r.observacao" class="field h-11 px-3 text-sm" aria-label="Observação" placeholder="Substituições ou dica (opcional)">
    </section>

    <button type="button" class="btn-ghost self-start" @click="addRefeicao">
      <AppIcon name="plus" :size="16" /> Refeição
    </button>

    <EditorLista v-model="dieta.orientacoes" label="Orientações para o aluno" placeholder="Ex.: beba 2,5 L de água por dia" />
  </div>
</template>
