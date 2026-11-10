<script setup lang="ts">
import type { Database } from '~/types/database.types'

// Instruções que o profissional dá ao agente: o jeito dele de montar planos.
// O personal configura o treino; a nutricionista, a dieta. Valem para todos
// os rascunhos que ele gerar, junto com a anamnese de cada aluno.
definePageMeta({ roles: ['personal', 'nutri'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()

const kind = computed<PlanKind>(() => (me.value?.current?.role === 'nutri' ? 'dieta' : 'treino'))
const LIMIT = 4000

const { data: saved, refresh } = await useAsyncData('instrucoes-agente', async () => {
  const { data } = await supabase
    .from('agent_instructions').select('instructions, updated_at')
    .eq('user_id', user.value!.sub).eq('kind', kind.value).maybeSingle()
  return data
})

const text = ref(saved.value?.instructions ?? '')
const dirty = computed(() => text.value !== (saved.value?.instructions ?? ''))
const saving = ref(false)
const error = ref('')
const notice = ref('')

const suggestions: Record<PlanKind, string[]> = {
  treino: [
    'Prefiro divisão ABC para quem treina 3 vezes por semana e ABCD para 4 ou mais.',
    'Comece todo treino com 5 a 10 minutos de aquecimento.',
    'Para iniciantes, priorize máquinas e exercícios guiados nas primeiras 4 semanas.',
    'Use repetições em faixas (ex.: 8 a 12) em vez de número fixo.',
    'Inclua 20 minutos de cardio leve no fim para quem quer emagrecer.',
    'Não passe de 6 exercícios por treino.',
    'Inclua um exercício de core (abdômen e lombar) em todo treino.',
    'Evite exercícios com barra livre acima da cabeça para quem tem dor no ombro.',
  ],
  dieta: [
    'Use sempre medida caseira junto com os gramas.',
    'Dê pelo menos uma opção de substituição em cada refeição.',
    'Prefira alimentos simples, baratos e fáceis de achar no mercado.',
    'Café da manhã rápido, que dê para preparar em 5 minutos.',
    'Não inclua suplementos; eu decido isso na consulta.',
    'Inclua frutas em pelo menos duas refeições.',
    'Evite ultraprocessados e embutidos.',
    'Para quem treina à noite, coloque um lanche reforçado 1 a 2 horas antes.',
  ],
}

function addSuggestion(s: string) {
  if (text.value.includes(s)) return
  const base = text.value.trimEnd()
  text.value = (base ? `${base}\n` : '') + `- ${s}`
}

async function save() {
  error.value = ''
  notice.value = ''
  if (text.value.length > LIMIT) {
    error.value = `O texto passou de ${LIMIT} caracteres. Resuma um pouco.`
    return
  }
  saving.value = true
  const { error: e } = saved.value
    ? await supabase.from('agent_instructions').update({ instructions: text.value.trim() })
        .eq('user_id', user.value!.sub).eq('kind', kind.value)
    : await supabase.from('agent_instructions').insert({ user_id: user.value!.sub, kind: kind.value, instructions: text.value.trim() })
  saving.value = false
  if (e) {
    error.value = friendlyError(e)
    return
  }
  await refresh()
  text.value = saved.value?.instructions ?? ''
  notice.value = 'Salvo. Os próximos rascunhos já seguem estas instruções.'
}

onBeforeRouteLeave(() => {
  if (dirty.value && !confirm('Você tem alterações não salvas. Sair mesmo assim?')) return false
})
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:px-0">
    <AppHeader />
    <PageTitle :kicker="kind === 'treino' ? 'Treinos' : 'Dietas'" title="Agente" />

    <section class="flex flex-col gap-3 rounded-[26px] border border-violet-line bg-violet-deep p-5">
      <span class="flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-violet-soft uppercase">
        <AppIcon name="sparkle" :size="16" /> Como o agente monta {{ kind === 'treino' ? 'seus treinos' : 'suas dietas' }}
      </span>
      <p class="font-display text-xl leading-tight font-semibold">
        Escreva aqui o seu jeito de {{ kind === 'treino' ? 'montar treinos' : 'montar dietas' }}
      </p>
      <p class="text-sm leading-relaxed text-muted">
        O agente lê estas instruções junto com a anamnese de cada aluno, em todo rascunho que você gerar.
        Escreva como explicaria para um estagiário: divisão, volume, exercícios ou alimentos que prefere, o que evitar.
        As regras de segurança (dores, lesões, alergias) continuam valendo sempre, e você ainda revisa tudo antes de aprovar.
      </p>
    </section>

    <div class="flex flex-col gap-[22px] lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <section class="flex flex-col gap-2">
        <label for="instrucoes" class="text-sm font-semibold text-muted">Suas instruções para {{ kind === 'treino' ? 'os treinos' : 'as dietas' }}</label>
        <textarea
          id="instrucoes"
          v-model="text"
          rows="14"
          :maxlength="LIMIT"
          class="field h-auto min-h-[320px] py-4 leading-relaxed"
          :placeholder="kind === 'treino'
            ? 'Ex.:\n- Prefiro ABC para 3x por semana.\n- Sempre começar com aquecimento.\n- Iniciantes: máquinas nas primeiras 4 semanas.'
            : 'Ex.:\n- Medidas caseiras e gramas.\n- Uma substituição em cada refeição.\n- Sem suplementos.'"
        />
        <div class="flex items-center justify-between gap-3 text-xs text-faint">
          <span>
            <template v-if="saved?.updated_at">Salvo em {{ new Date(saved.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }}</template>
            <template v-else>Ainda sem instruções: o agente usa só as regras padrão.</template>
          </span>
          <span :class="text.length > LIMIT * 0.9 ? 'text-[#FFB98A]' : ''">{{ text.length }}/{{ LIMIT }}</span>
        </div>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <p v-if="notice" class="text-sm text-lime" role="status">{{ notice }}</p>
        <button type="button" class="btn-primary mt-1 lg:w-[260px]" :disabled="saving || !dirty" @click="save">
          <AppIcon name="check" /> {{ saving ? 'Salvando…' : 'Salvar instruções' }}
        </button>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="font-display text-lg font-semibold">Sugestões</h2>
        <p class="text-sm text-muted">Toque para adicionar ao texto. Depois ajuste do seu jeito.</p>
        <div class="flex flex-col gap-2">
          <button
            v-for="s in suggestions[kind]"
            :key="s"
            type="button"
            class="flex items-start gap-2.5 rounded-[16px] border px-3.5 py-3 text-left text-sm transition"
            :class="text.includes(s) ? 'border-lime/40 bg-[#1F2611] text-text' : 'border-line bg-card text-muted hover:text-text'"
            :disabled="text.includes(s)"
            @click="addSuggestion(s)"
          >
            <AppIcon :name="text.includes(s) ? 'check' : 'plus'" :size="16" class="mt-0.5 shrink-0" :class="text.includes(s) ? 'text-lime' : ''" />
            {{ s }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
