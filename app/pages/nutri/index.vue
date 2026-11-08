<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ roles: ['nutri'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { me } = useMe()

const orgId = computed(() => me.value!.current!.organization_id)
const showInvite = ref(false)

const { data: students, refresh } = await useAsyncData('painel-nutri', async () => {
  const [{ data }, { data: anamneses }, { data: dietas }] = await Promise.all([
    supabase
      .from('coach_students')
      .select('student_id, status, since, student:profiles!coach_students_student_id_fkey(full_name)')
      .eq('professional_id', user.value!.sub)
      .order('since', { ascending: false }),
    supabase.from('anamneses').select('student_id, submitted_at').eq('organization_id', orgId.value),
    supabase.from('plans').select('student_id, draft_updated_at, published_at').eq('organization_id', orgId.value).eq('kind', 'dieta'),
  ])
  const sent = new Set((anamneses ?? []).filter((a) => a.submitted_at).map((a) => a.student_id))
  // Dieta com rascunho que ainda não foi aprovado (ou foi alterado depois de aprovado).
  const toReview = new Set((dietas ?? [])
    .filter((p) => p.draft_updated_at && (!p.published_at || p.draft_updated_at > p.published_at))
    .map((p) => p.student_id))
  return (data ?? []).map((s) => ({ ...s, hasAnamnese: sent.has(s.student_id), dietToReview: toReview.has(s.student_id) }))
})

const active = computed(() => (students.value ?? []).filter((s) => s.status === 'ativo'))
const toReviewCount = computed(() => active.value.filter((s) => s.dietToReview).length)
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10">
    <AppHeader />

    <section class="grid grid-cols-2 gap-2.5">
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold">{{ active.length }}</span>
        <span class="text-xs text-muted">Alunos ativos</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-orange">{{ toReviewCount }}</span>
        <span class="text-xs text-muted">Dietas para revisar</span>
      </div>
    </section>

    <section class="flex flex-col gap-4 rounded-[26px] border border-violet-line bg-violet-deep p-5">
      <span class="flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-violet-soft uppercase">
        <AppIcon name="leaf" :size="16" /> Dietas
      </span>
      <p class="font-display text-xl leading-tight font-semibold">Abra um aluno e toque em Dieta para o agente montar o rascunho</p>
      <p class="text-sm text-muted">Nada vai para o aluno sem a sua assinatura.</p>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="font-display text-lg font-semibold">Seus alunos</h2>
        <button type="button" class="btn-ghost" @click="showInvite = true">
          <AppIcon name="plus" :size="18" /> Convidar
        </button>
      </div>

      <div v-if="!active.length" class="flex flex-col gap-2 rounded-[20px] border border-dashed border-line p-5 text-center">
        <p class="font-semibold">Nenhum aluno vinculado</p>
        <p class="text-sm text-muted">O personal vincula você aos alunos dele, ou você convida um aluno direto.</p>
      </div>

      <NuxtLink v-for="s in active" :key="s.student_id" :to="`/alunos/${s.student_id}`" class="flex items-center gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <AppAvatar :name="s.student?.full_name ?? ''" :size="42" color="#FF8A3D" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-[15px] font-semibold">{{ s.student?.full_name || 'Sem nome' }}</span>
          <span class="text-[13px] text-muted">Desde {{ new Date(`${s.since}T12:00`).toLocaleDateString('pt-BR') }}</span>
        </div>
        <span
          class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          :class="s.hasAnamnese ? 'bg-[rgba(198,244,50,0.14)] text-lime' : 'bg-raised text-muted'"
        >{{ s.hasAnamnese ? 'Anamnese ok' : 'Sem anamnese' }}</span>
      </NuxtLink>
    </section>

    <InviteSheet
      v-if="showInvite"
      :organization-id="orgId"
      :allow-nutri="false"
      @close="showInvite = false"
      @created="refresh()"
    />
  </main>
</template>
