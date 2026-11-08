<script setup lang="ts">
import type { Database, Json } from '~/types/database.types'

// Revisão do plano: o agente gera o rascunho, o profissional edita e aprova.
// Treino é do personal, dieta é da nutri; o outro profissional só lê.
definePageMeta({
  roles: ['personal', 'nutri'],
  middleware: 'role',
  validate: (route) => ['treino', 'dieta'].includes(route.params.kind as string),
})

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()
const route = useRoute()
const studentId = route.params.id as string
const kind = route.params.kind as PlanKind
const orgId = me.value!.current!.organization_id

const { data, refresh } = await useAsyncData(`plano-${studentId}-${kind}`, async () => {
  const [profile, anamnese, plan, canManage] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', studentId).maybeSingle(),
    supabase.from('anamneses').select('submitted_at').eq('student_id', studentId).maybeSingle(),
    supabase.from('plans').select('*').eq('student_id', studentId).eq('kind', kind).maybeSingle(),
    supabase.rpc('can_manage_plan', { org: orgId, student: studentId, k: kind }),
  ])
  return {
    name: profile.data?.full_name ?? '',
    anamneseSent: !!anamnese.data?.submitted_at,
    plan: plan.data,
    canManage: canManage.data === true,
  }
})

const schema = kind === 'treino' ? treinoSchema : dietaSchema
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const draft = ref<PlanContent | null>(data.value?.plan?.draft ? clone(data.value.plan.draft as PlanContent) : null)
const saved = ref(JSON.stringify(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== saved.value)
const pendingApproval = computed(() => {
  const p = data.value?.plan
  return !!p?.draft && (!p.published_at || (p.draft_updated_at ?? '') > p.published_at || dirty.value)
})

const generating = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const firstName = computed(() => data.value?.name.split(' ')[0] || 'o aluno')
const owner = kind === 'treino' ? 'personal' : 'nutricionista'

async function generate() {
  if (draft.value && !confirm('Gerar de novo substitui o rascunho atual, inclusive as suas edições. Continuar?')) return
  error.value = ''
  notice.value = ''
  generating.value = true
  try {
    const res = await $fetch<{ draft: PlanContent }>('/api/planos/gerar', { method: 'POST', body: { studentId, kind } })
    draft.value = clone(res.draft)
    saved.value = JSON.stringify(draft.value)
    await refresh()
    notice.value = 'Rascunho pronto. Revise, ajuste o que precisar e aprove.'
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    error.value = err.data?.statusMessage || err.data?.message || err.statusMessage || 'Não deu para gerar agora. Tente de novo.'
  } finally {
    generating.value = false
  }
}

function startBlank() {
  draft.value = kind === 'treino' ? emptyTreino() : emptyDieta()
}

/** Confere o formato e limpa linhas vazias antes de salvar. */
function cleaned(): PlanContent | null {
  const d = clone(draft.value!)
  d.orientacoes = d.orientacoes.map((o) => o.trim()).filter(Boolean)
  if ('dias' in d) {
    for (const dia of d.dias) dia.exercicios = dia.exercicios.filter((ex) => ex.nome.trim())
  } else {
    for (const r of d.refeicoes) r.itens = r.itens.filter((i) => i.alimento.trim())
  }
  const ok = schema.safeParse(d)
  if (!ok.success) {
    error.value = 'Algum campo ficou vazio ou com número inválido. Confira séries, descansos e metas.'
    return null
  }
  return ok.data
}

async function save() {
  error.value = ''
  notice.value = ''
  const content = cleaned()
  if (!content) return false
  busy.value = true
  const fields = {
    draft: content as unknown as Json,
    draft_updated_at: new Date().toISOString(),
    draft_updated_by: user.value!.sub,
  }
  const { error: e } = data.value?.plan
    ? await supabase.from('plans').update(fields).eq('student_id', studentId).eq('kind', kind)
    : await supabase.from('plans').insert({ student_id: studentId, kind, organization_id: orgId, draft_by_agent: false, ...fields })
  busy.value = false
  if (e) {
    error.value = friendlyError(e)
    return false
  }
  draft.value = content
  saved.value = JSON.stringify(content)
  await refresh()
  return true
}

async function approve() {
  if (!(await save())) return
  busy.value = true
  const { error: e } = await supabase.rpc('approve_plan', { student: studentId, k: kind })
  busy.value = false
  if (e) {
    error.value = friendlyError(e)
    return
  }
  await refresh()
  notice.value = `Enviado! ${firstName.value} já pode ver o ${kind === 'treino' ? 'treino' : 'plano alimentar'} no app.`
}

onBeforeRouteLeave(() => {
  if (dirty.value && !confirm('Você tem alterações não salvas. Sair mesmo assim?')) return false
})

const treinoDraft = computed({ get: () => draft.value as Treino, set: (v) => (draft.value = v) })
const dietaDraft = computed({ get: () => draft.value as Dieta, set: (v) => (draft.value = v) })
const readOnlyContent = computed(() => (data.value?.plan?.published ?? data.value?.plan?.draft ?? null) as PlanContent | null)
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <main class="flex flex-1 flex-col gap-[22px] px-5 pt-6 pb-6">
      <div class="flex items-center gap-3">
        <NuxtLink :to="`/alunos/${studentId}`" aria-label="Voltar para a ficha" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card">
          <AppIcon name="back" :size="22" />
        </NuxtLink>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[13px] text-muted">{{ data?.name }}</span>
          <h1 class="font-display text-xl font-semibold">{{ planLabel[kind] }}</h1>
        </div>
      </div>

      <!-- Quem não aprova este plano só lê. -->
      <template v-if="!data?.canManage">
        <p class="rounded-[20px] border border-line p-4 text-sm text-muted">
          {{ kind === 'treino' ? 'O treino é montado e aprovado pelo personal do aluno.' : 'A dieta é montada e aprovada pela nutricionista do aluno.' }}
          <template v-if="data?.plan?.published_at"> Esta é a versão enviada em {{ new Date(data.plan.published_at).toLocaleDateString('pt-BR') }}.</template>
          <template v-else-if="readOnlyContent"> Ainda não foi enviado ao aluno; este é o rascunho.</template>
        </p>
        <PlanoTreino v-if="readOnlyContent && kind === 'treino'" :treino="readOnlyContent as Treino" />
        <PlanoDieta v-else-if="readOnlyContent" :dieta="readOnlyContent as Dieta" />
        <p v-else class="text-center text-sm text-muted">Nada montado ainda.</p>
      </template>

      <template v-else>
        <div v-if="!data.anamneseSent && !draft" class="flex flex-col gap-2 rounded-[20px] border border-dashed border-line p-5 text-center">
          <p class="font-semibold">Falta a anamnese</p>
          <p class="text-sm text-muted">O agente precisa das respostas de {{ firstName }} para montar o plano. Você ainda pode montar à mão.</p>
          <button type="button" class="btn-ghost self-center" @click="startBlank">Montar à mão</button>
        </div>

        <section v-else-if="!draft || generating" class="flex flex-col gap-4 rounded-[26px] border border-violet-line bg-violet-deep p-5">
          <span class="flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-violet-soft uppercase">
            <AppIcon name="sparkle" :size="16" /> Agente
          </span>
          <template v-if="generating">
            <div class="flex items-center gap-3">
              <div class="size-7 shrink-0 animate-spin rounded-full border-4 border-raised border-t-violet" />
              <p class="font-display text-lg leading-tight font-semibold">Montando o {{ kind === 'treino' ? 'treino' : 'plano alimentar' }} de {{ firstName }}…</p>
            </div>
            <p class="text-sm text-muted">Leva de 30 segundos a 2 minutos. Não feche esta tela.</p>
          </template>
          <template v-else>
            <p class="font-display text-xl leading-tight font-semibold">
              O agente monta um rascunho a partir da anamnese de {{ firstName }}
            </p>
            <p class="text-sm text-muted">Você revisa, ajusta o que quiser e aprova. {{ firstName }} só recebe depois da sua aprovação.</p>
            <button type="button" class="btn-primary" @click="generate">
              <AppIcon name="sparkle" /> Gerar rascunho
            </button>
            <button type="button" class="self-center py-1 text-sm text-muted underline-offset-4 hover:underline" @click="startBlank">
              Prefiro montar à mão
            </button>
          </template>
        </section>

        <template v-if="draft && !generating">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span v-if="data.plan?.draft_by_agent" class="flex items-center gap-1 rounded-full bg-violet-deep px-2.5 py-1 font-semibold text-violet-soft">
              <AppIcon name="sparkle" :size="12" /> Rascunho do agente
            </span>
            <span v-if="data.plan?.published_at" class="rounded-full bg-[rgba(198,244,50,0.14)] px-2.5 py-1 font-semibold text-lime">
              Enviado em {{ new Date(data.plan.published_at).toLocaleDateString('pt-BR') }}
            </span>
            <span v-if="pendingApproval" class="rounded-full bg-[rgba(255,138,61,0.16)] px-2.5 py-1 font-semibold text-[#FFB98A]">
              {{ data.plan?.published_at ? 'Alterações ainda não enviadas' : 'Ainda não enviado ao aluno' }}
            </span>
            <button v-if="data.anamneseSent" type="button" class="ml-auto flex items-center gap-1 font-semibold text-violet-soft" @click="generate">
              <AppIcon name="sparkle" :size="14" /> Gerar de novo
            </button>
          </div>

          <section v-if="draft.alertas_para_profissional.length" class="flex gap-3 rounded-[20px] border border-[rgba(255,138,61,0.35)] bg-[rgba(255,138,61,0.08)] p-4">
            <AppIcon name="alert" class="shrink-0 text-[#FFB98A]" />
            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold text-[#FFB98A]">Confira antes de aprovar</span>
              <ul class="flex list-disc flex-col gap-1 pl-4 text-sm">
                <li v-for="(al, i) in draft.alertas_para_profissional" :key="i">{{ al }}</li>
              </ul>
              <span class="text-xs text-faint">O aluno não vê estes avisos.</span>
            </div>
          </section>

          <EditorTreino v-if="kind === 'treino'" v-model="treinoDraft" />
          <EditorDieta v-else v-model="dietaDraft" />
        </template>
      </template>
    </main>

    <footer v-if="data?.canManage && draft && !generating" class="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-ink px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <p v-if="notice" class="text-sm text-lime" role="status">{{ notice }}</p>
      <div class="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" class="btn-ghost h-[58px] rounded-[18px] px-5" :disabled="busy || !dirty" @click="save">Salvar</button>
        <button type="button" class="btn-primary" :disabled="busy || !pendingApproval" @click="approve">
          <AppIcon name="check" /> {{ busy ? 'Enviando…' : `Aprovar e enviar` }}
        </button>
      </div>
      <p class="text-center text-xs text-faint">Ao aprovar, você assina este plano como {{ owner }} de {{ firstName }}.</p>
    </footer>
    <p v-else-if="error" class="px-5 pb-6 text-sm text-danger" role="alert">{{ error }}</p>
  </div>
</template>
