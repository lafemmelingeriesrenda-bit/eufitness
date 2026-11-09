<script setup lang="ts">
import type { Database } from '~/types/database.types'

// O aluno vê o treino ou a dieta aprovados. Rascunhos nunca chegam aqui:
// my_plans() só devolve a versão publicada.
definePageMeta({
  roles: ['aluno'],
  middleware: 'role',
  validate: (route) => ['treino', 'dieta'].includes(route.params.kind as string),
})

const supabase = useSupabaseClient<Database>()
const route = useRoute()
const kind = route.params.kind as PlanKind

const user = useSupabaseUser()

const { data: plan } = await useAsyncData(`meu-plano-${kind}`, async () => {
  const { data } = await supabase.rpc('my_plans')
  return data?.find((p) => p.kind === kind) ?? null
})

// Treino: sugere o dia seguinte ao último concluído (A → B → C → A…).
const { data: lastDone } = await useAsyncData(`ultimo-treino-${kind}`, async () => {
  if (kind !== 'treino') return null
  const { data } = await supabase
    .from('workout_logs').select('day_index')
    .eq('student_id', user.value!.sub).not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  return data?.day_index ?? null
})
const suggested = computed(() => {
  const dias = (plan.value?.content as unknown as Treino | undefined)?.dias.length ?? 0
  return lastDone.value === null || lastDone.value === undefined || !dias ? 0 : (lastDone.value + 1) % dias
})
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:max-w-4xl lg:px-0">
    <div class="flex items-center gap-3">
      <NuxtLink to="/aluno" aria-label="Voltar" class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card lg:hidden">
        <AppIcon name="back" :size="22" />
      </NuxtLink>
      <h1 class="font-display text-xl font-semibold lg:text-[32px] lg:font-bold lg:tracking-tight">{{ kind === 'treino' ? 'Seu treino' : 'Sua dieta' }}</h1>
    </div>

    <template v-if="plan">
      <p class="text-xs text-faint">
        Aprovado por {{ plan.published_by_name || 'seu profissional' }} em {{ new Date(plan.published_at).toLocaleDateString('pt-BR') }}
      </p>
      <PlanoTreino v-if="kind === 'treino'" :treino="plan.content as unknown as Treino" startable :suggested="suggested" />
      <PlanoDieta v-else :dieta="plan.content as unknown as Dieta" />
    </template>

    <div v-else class="flex flex-col gap-2 rounded-[20px] border border-dashed border-line p-5 text-center">
      <p class="font-semibold">Ainda não chegou</p>
      <p class="text-sm text-muted">
        {{ kind === 'treino' ? 'Seu personal' : 'Sua nutricionista' }} está preparando. Você recebe assim que for aprovado.
      </p>
    </div>
  </main>
</template>
