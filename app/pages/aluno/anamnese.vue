<script setup lang="ts">
import type { AnamneseAnswers, Database } from '~/types/database.types'
import { anamneseSteps } from '~~/shared/utils/anamnese'

// Anamnese em 6 passos. Salva a cada passo, então o aluno pode parar e
// continuar depois de onde estava.
definePageMeta({ roles: ['aluno'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()

const fields: (keyof AnamneseAnswers)[] = [
  'goal', 'goal_notes', 'sex', 'birth_date', 'height_cm', 'weight_kg',
  'training_days', 'training_place', 'session_minutes', 'training_time', 'experience',
  'pain', 'conditions', 'medications',
  'diet_restrictions', 'food_dislikes', 'meals_per_day', 'water_liters',
  'activity_level', 'sleep_hours', 'notes',
]

const { data: row, error: loadError } = await useAsyncData('anamnese-aluno', async () => {
  const uid = user.value!.sub
  const { data, error } = await supabase.from('anamneses').select('*').eq('student_id', uid).maybeSingle()
  if (error) throw error
  if (data) return data
  const created = await supabase
    .from('anamneses')
    .insert({ student_id: uid, organization_id: me.value!.current!.organization_id })
    .select('*')
    .single()
  if (created.error) throw created.error
  return created.data
})

const form = reactive(Object.fromEntries(fields.map((k) => [k, row.value?.[k] ?? null])) as AnamneseAnswers)
const submitted = computed(() => !!row.value?.submitted_at)
// Quem já enviou recomeça do início para revisar; quem parou volta ao passo onde estava.
const step = ref(submitted.value ? 1 : (row.value?.step ?? 1))
const total = anamneseSteps.length
const saving = ref(false)
const error = ref('')
const tried = ref(false)

const missing = computed(() => missingInStep(form, step.value))
const isMissing = (k: keyof AnamneseAnswers) => tried.value && missing.value.includes(k)

const dayOptions = [2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))
const minuteOptions = sessionOptions.map((n) => ({ value: n, label: n < 60 ? `${n} min` : n === 60 ? '1 h' : '1h30' }))
const mealOptions = [2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))
const today = new Date().toISOString().slice(0, 10)

/** Campos vazios viram null e números em texto viram número antes de salvar. */
function clean() {
  const out: Partial<AnamneseAnswers> = {}
  for (const k of fields) {
    let v = form[k] as unknown
    if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
    if (typeof v === 'string' && ['height_cm', 'weight_kg', 'water_liters', 'sleep_hours'].includes(k)) {
      const n = Number(v.replace(',', '.'))
      v = Number.isFinite(n) ? n : null
    }
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

async function save(extra: Database['public']['Tables']['anamneses']['Update'] = {}) {
  error.value = ''
  saving.value = true
  const { data, error: e } = await supabase
    .from('anamneses')
    .update({ ...clean(), ...extra })
    .eq('student_id', user.value!.sub)
    .select('*')
    .single()
  saving.value = false
  if (e) {
    error.value = e.message.includes('check constraint')
      ? 'Algum valor está fora do esperado. Confira os números deste passo.'
      : friendlyError(e)
    return false
  }
  row.value = data
  return true
}

async function next() {
  tried.value = true
  if (missing.value.length) return
  tried.value = false
  if (step.value < total) {
    const target = step.value + 1
    // Não volta o progresso salvo se a pessoa estiver revisando um passo anterior.
    const ok = await save({ step: Math.max(target, row.value?.step ?? 1) })
    if (ok) {
      step.value = target
      window.scrollTo({ top: 0 })
    }
    return
  }
  const ok = await save({ step: total, submitted_at: row.value?.submitted_at ?? new Date().toISOString() })
  if (ok) await navigateTo('/aluno?anamnese=enviada')
}

function back() {
  tried.value = false
  if (step.value > 1) step.value--
  else navigateTo('/aluno')
}

async function later() {
  await save()
  await navigateTo('/aluno')
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-10 flex flex-col gap-3.5 bg-ink px-5 pt-5 pb-3">
      <div class="flex items-center justify-between">
        <button type="button" aria-label="Voltar" class="flex size-11 items-center justify-center rounded-full border border-line bg-card" @click="back">
          <AppIcon name="back" :size="22" />
        </button>
        <span class="text-sm font-semibold text-muted"><span class="text-text">{{ step }}</span> / {{ total }}</span>
        <button type="button" class="min-h-11 px-1 text-sm font-semibold text-muted" :disabled="saving" @click="later">
          {{ submitted ? 'Fechar' : 'Depois' }}
        </button>
      </div>
      <div class="grid grid-cols-6 gap-1.5" aria-hidden="true">
        <div v-for="i in total" :key="i" class="h-1.5 rounded-full" :class="i <= step ? 'bg-lime' : 'bg-raised'" />
      </div>
    </header>

    <p v-if="loadError" class="px-5 pt-6 text-sm text-danger" role="alert">
      Não deu para abrir a anamnese: {{ friendlyError(loadError) }}
    </p>

    <main v-else class="flex flex-1 flex-col gap-7 px-5 pt-4 pb-6">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-[28px] leading-[1.1] font-bold tracking-tight">
          {{ anamneseSteps[step - 1]!.title }}<br><span class="text-lime">{{ anamneseSteps[step - 1]!.accent }}</span>
        </h1>
        <p class="text-[15px] text-muted">Seu personal e sua nutri usam isso para montar o plano.</p>
      </div>

      <!-- 1. Objetivo -->
      <template v-if="step === 1">
        <ChoiceGroup v-model="form.goal" legend="O que você mais quer agora?" :options="goalOptions" variant="card" :cols="2" />
        <p v-if="isMissing('goal')" class="-mt-4 text-sm text-danger">Escolha um objetivo.</p>
        <div class="flex flex-col gap-2">
          <label for="goal_notes" class="text-sm font-semibold text-muted">Quer contar mais? <span class="font-normal text-faint">(opcional)</span></label>
          <textarea id="goal_notes" v-model="form.goal_notes" rows="3" maxlength="500" class="field h-auto py-3.5" placeholder="Ex.: quero perder 8 kg até o casamento, em março" />
        </div>
      </template>

      <!-- 2. Corpo -->
      <template v-else-if="step === 2">
        <ChoiceGroup v-model="form.sex" legend="Sexo biológico" :options="sexOptions" />
        <p v-if="isMissing('sex')" class="-mt-4 text-sm text-danger">Escolha uma opção.</p>
        <div class="flex flex-col gap-2">
          <label for="birth" class="text-sm font-semibold text-muted">Data de nascimento</label>
          <input id="birth" v-model="form.birth_date" type="date" min="1900-01-01" :max="today" class="field" :class="isMissing('birth_date') && 'border-danger'">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <label for="height" class="text-sm font-semibold text-muted">Altura (cm)</label>
            <input id="height" v-model="form.height_cm" type="number" inputmode="numeric" min="100" max="250" placeholder="165" class="field" :class="isMissing('height_cm') && 'border-danger'">
          </div>
          <div class="flex flex-col gap-2">
            <label for="weight" class="text-sm font-semibold text-muted">Peso (kg)</label>
            <input id="weight" v-model="form.weight_kg" type="number" inputmode="decimal" step="0.1" min="25" max="350" placeholder="68,5" class="field" :class="isMissing('weight_kg') && 'border-danger'">
          </div>
        </div>
      </template>

      <!-- 3. Rotina de treino -->
      <template v-else-if="step === 3">
        <ChoiceGroup v-model="form.training_days" legend="Dias por semana" :options="dayOptions" variant="big" />
        <ChoiceGroup v-model="form.training_place" legend="Onde você treina?" :options="placeOptions" />
        <ChoiceGroup v-model="form.session_minutes" legend="Quanto tempo por treino?" :options="minuteOptions" />
        <ChoiceGroup v-model="form.training_time" legend="Em que horário?" :options="timeOptions" />
        <ChoiceGroup v-model="form.experience" legend="Experiência com treino" :options="experienceOptions" variant="card" :cols="1" />
        <p v-if="tried && missing.length" class="-mt-4 text-sm text-danger">Responda todas as perguntas deste passo.</p>
      </template>

      <!-- 4. Saúde -->
      <template v-else-if="step === 4">
        <p class="-mt-4 text-sm text-faint">Deixe em branco o que não se aplica.</p>
        <div class="flex flex-col gap-2">
          <label for="pain" class="text-sm font-semibold text-muted">Sente alguma dor ou tem lesão?</label>
          <textarea id="pain" v-model="form.pain" rows="3" maxlength="1000" class="field h-auto py-3.5" placeholder="Ex.: dor no joelho ao descer escada" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="conditions" class="text-sm font-semibold text-muted">Alguma condição de saúde?</label>
          <textarea id="conditions" v-model="form.conditions" rows="3" maxlength="1000" class="field h-auto py-3.5" placeholder="Ex.: pressão alta, diabetes, gestação, cirurgia recente" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="meds" class="text-sm font-semibold text-muted">Toma algum remédio ou suplemento?</label>
          <textarea id="meds" v-model="form.medications" rows="2" maxlength="1000" class="field h-auto py-3.5" placeholder="Ex.: losartana, creatina" />
        </div>
      </template>

      <!-- 5. Alimentação -->
      <template v-else-if="step === 5">
        <ChoiceGroup v-model="form.meals_per_day" legend="Refeições por dia" :options="mealOptions" variant="big" />
        <p v-if="isMissing('meals_per_day')" class="-mt-4 text-sm text-danger">Escolha quantas refeições.</p>
        <div class="flex flex-col gap-2">
          <label for="restr" class="text-sm font-semibold text-muted">Alergia, intolerância ou restrição?</label>
          <textarea id="restr" v-model="form.diet_restrictions" rows="2" maxlength="1000" class="field h-auto py-3.5" placeholder="Ex.: intolerância à lactose, vegetariana" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="dislikes" class="text-sm font-semibold text-muted">Algo que você não come de jeito nenhum?</label>
          <textarea id="dislikes" v-model="form.food_dislikes" rows="2" maxlength="1000" class="field h-auto py-3.5" placeholder="Ex.: peixe, beterraba" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="water" class="text-sm font-semibold text-muted">Água por dia (litros) <span class="font-normal text-faint">(opcional)</span></label>
          <input id="water" v-model="form.water_liters" type="number" inputmode="decimal" step="0.5" min="0" max="10" placeholder="2" class="field">
        </div>
      </template>

      <!-- 6. Dia a dia -->
      <template v-else>
        <ChoiceGroup v-model="form.activity_level" legend="Fora do treino, você é" :options="activityOptions" variant="card" :cols="2" />
        <div class="flex flex-col gap-2">
          <label for="sleep" class="text-sm font-semibold text-muted">Horas de sono por noite</label>
          <input id="sleep" v-model="form.sleep_hours" type="number" inputmode="decimal" step="0.5" min="0" max="24" placeholder="7" class="field" :class="isMissing('sleep_hours') && 'border-danger'">
        </div>
        <div class="flex flex-col gap-2">
          <label for="notes" class="text-sm font-semibold text-muted">Algo mais que eles devem saber? <span class="font-normal text-faint">(opcional)</span></label>
          <textarea id="notes" v-model="form.notes" rows="3" maxlength="2000" class="field h-auto py-3.5" placeholder="Ex.: viajo muito a trabalho, trabalho em turnos" />
        </div>
        <p v-if="tried && missing.length" class="-mt-4 text-sm text-danger">Responda as perguntas obrigatórias.</p>
      </template>

      <p v-if="tried && missing.length && step === 2" class="-mt-4 text-sm text-danger">Preencha todos os campos.</p>
    </main>

    <footer v-if="!loadError" class="sticky bottom-0 flex flex-col gap-2 bg-ink px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button type="button" class="btn-primary" :disabled="saving" @click="next">
        {{ saving ? 'Salvando…' : step < total ? 'Continuar' : submitted ? 'Salvar alterações' : 'Enviar anamnese' }}
        <AppIcon :name="step < total ? 'arrow' : 'check'" />
      </button>
    </footer>
  </div>
</template>
