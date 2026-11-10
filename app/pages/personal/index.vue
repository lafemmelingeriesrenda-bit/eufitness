<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ roles: ['personal'], middleware: 'role' })

const supabase = useSupabaseClient<Database>()
const { me } = useMe()

const orgId = computed(() => me.value!.current!.organization_id)
const isAdmin = computed(() => me.value!.current!.is_admin)
const showInvite = ref(false)
const linkError = ref('')

const { data, refresh } = await useAsyncData('painel-personal', async () => {
  const [members, links, invites, anamneses] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id, role, registry, created_at, profile:profiles(full_name, phone)')
      .eq('organization_id', orgId.value)
      .order('created_at', { ascending: false }),
    supabase.from('coach_students').select('*').eq('organization_id', orgId.value),
    supabase
      .from('invites')
      .select('id, role, name, code, expires_at')
      .eq('organization_id', orgId.value)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    supabase.from('anamneses').select('student_id, step, submitted_at').eq('organization_id', orgId.value),
  ])
  return {
    members: members.data ?? [],
    links: links.data ?? [],
    invites: invites.data ?? [],
    anamneses: anamneses.data ?? [],
  }
})

const nameOf = (id: string) => data.value?.members.find((m) => m.user_id === id)?.profile?.full_name ?? ''
const students = computed(() => (data.value?.members ?? []).filter((m) => m.role === 'aluno'))
const nutris = computed(() => (data.value?.members ?? []).filter((m) => m.role === 'nutri'))
const activeStudents = computed(() => students.value.filter((s) => linksOf(s.user_id).length > 0).length)

function linksOf(studentId: string) {
  return (data.value?.links ?? []).filter((l) => l.student_id === studentId && l.status === 'ativo')
}

function missingNutris(studentId: string) {
  const linked = new Set(linksOf(studentId).map((l) => l.professional_id))
  return nutris.value.filter((n) => !linked.has(n.user_id))
}

async function linkNutri(nutriId: string, studentId: string) {
  linkError.value = ''
  const { error } = await supabase.rpc('link_student', { org: orgId.value, professional: nutriId, student: studentId })
  if (error) linkError.value = friendlyError(error)
  await refresh()
}

async function cancelInvite(id: string) {
  await supabase.from('invites').delete().eq('id', id)
  await refresh()
}

const firstName = (name: string) => name.split(' ')[0]

function anamneseTag(studentId: string) {
  const a = data.value?.anamneses.find((x) => x.student_id === studentId)
  if (a?.submitted_at) return { text: 'Anamnese ok', cls: 'bg-[rgba(198,244,50,0.14)] text-lime' }
  if (a) return { text: `Anamnese ${a.step}/6`, cls: 'bg-[rgba(255,138,61,0.16)] text-[#FFB98A]' }
  return { text: 'Sem anamnese', cls: 'bg-raised text-muted' }
}
</script>

<template>
  <main class="flex flex-col gap-[22px] px-5 pt-6 pb-10 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0">
    <AppHeader />
    <PageTitle class="lg:col-span-2" :kicker="me?.current?.organization?.name" title="Painel" />

    <section class="grid grid-cols-3 gap-2.5 lg:col-span-2 lg:gap-4">
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold">{{ activeStudents }}</span>
        <span class="text-xs text-muted">Alunos ativos</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-lime">{{ nutris.length }}</span>
        <span class="text-xs text-muted">Nutricionistas</span>
      </div>
      <div class="flex flex-col gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-orange">{{ data?.invites.length ?? 0 }}</span>
        <span class="text-xs text-muted">Convites abertos</span>
      </div>
    </section>

    <section class="flex flex-col gap-4 rounded-[26px] border border-violet-line bg-violet-deep p-5 lg:col-start-2 lg:row-start-3">
      <span class="flex items-center gap-1.5 text-xs font-bold tracking-[.08em] text-violet-soft uppercase">
        <AppIcon name="sparkle" :size="16" /> Agente
      </span>
      <p class="font-display text-xl leading-tight font-semibold">O agente monta treino e dieta a partir da anamnese</p>
      <p class="text-sm text-muted">Abra um aluno, toque em Treino e gere o rascunho. Você revisa o treino, o nutricionista revisa a dieta, e só então o aluno recebe.</p>
      <NuxtLink to="/agente" class="btn-ghost self-start"><AppIcon name="edit" :size="16" /> Configurar instruções do agente</NuxtLink>
    </section>

    <section class="flex flex-col gap-3 lg:col-start-1 lg:row-span-3 lg:row-start-3">
      <div class="flex items-center justify-between">
        <h2 class="font-display text-lg font-semibold">Alunos</h2>
        <button type="button" class="btn-ghost" @click="showInvite = true">
          <AppIcon name="plus" :size="18" /> Convidar
        </button>
      </div>

      <p v-if="linkError" class="text-sm text-danger" role="alert">{{ linkError }}</p>

      <div v-if="!students.length" class="flex flex-col gap-2 rounded-[20px] border border-dashed border-line p-5 text-center">
        <p class="font-semibold">Nenhum aluno ainda</p>
        <p class="text-sm text-muted">Toque em Convidar e mande o link pelo WhatsApp.</p>
      </div>

      <div v-for="s in students" :key="s.user_id" class="flex flex-col gap-3 rounded-[20px] bg-card px-3.5 py-3">
        <NuxtLink :to="`/alunos/${s.user_id}`" class="flex items-center gap-3.5">
          <AppAvatar :name="s.profile?.full_name ?? ''" :size="42" color="#FF8A3D" />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-[15px] font-semibold">{{ s.profile?.full_name || 'Sem nome' }}</span>
            <span class="truncate text-[13px] text-muted">
              {{ linksOf(s.user_id).map((l) => firstName(nameOf(l.professional_id))).join(' + ') || 'Sem profissional' }}
            </span>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" :class="anamneseTag(s.user_id).cls">{{ anamneseTag(s.user_id).text }}</span>
        </NuxtLink>
        <div v-if="isAdmin && missingNutris(s.user_id).length" class="flex flex-wrap gap-2">
          <button
            v-for="n in missingNutris(s.user_id)"
            :key="n.user_id"
            type="button"
            class="btn-ghost min-h-9 text-xs"
            @click="linkNutri(n.user_id, s.user_id)"
          >
            <AppIcon name="leaf" :size="14" /> Vincular {{ firstName(n.profile?.full_name ?? 'nutri') }}
          </button>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3 lg:col-start-2 lg:row-start-4">
      <h2 class="font-display text-lg font-semibold">Equipe</h2>
      <div v-for="n in nutris" :key="n.user_id" class="flex items-center gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <AppAvatar :name="n.profile?.full_name ?? ''" :size="42" color="#8B7CFF" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-[15px] font-semibold">{{ n.profile?.full_name }}</span>
          <span class="truncate text-[13px] text-muted">Nutricionista{{ n.registry ? ` · ${n.registry}` : '' }}</span>
        </div>
      </div>
      <p v-if="!nutris.length" class="text-sm text-muted">
        Convide seu nutricionista parceiro: ele cria e assina as dietas dos alunos.
      </p>
    </section>

    <section v-if="data?.invites.length" class="flex flex-col gap-3 lg:col-start-2 lg:row-start-5">
      <h2 class="font-display text-lg font-semibold">Convites abertos</h2>
      <div v-for="i in data.invites" :key="i.id" class="flex items-center gap-3 rounded-[20px] border border-line px-3.5 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm font-semibold">{{ i.name || 'Sem nome' }}</span>
          <span class="text-xs text-muted">
            {{ i.role === 'nutri' ? 'Nutricionista' : 'Aluno' }} · vence {{ new Date(i.expires_at).toLocaleDateString('pt-BR') }}
          </span>
        </div>
        <button type="button" class="text-xs text-muted underline-offset-4 hover:underline" @click="cancelInvite(i.id)">Cancelar</button>
      </div>
    </section>

    <InviteSheet
      v-if="showInvite"
      :organization-id="orgId"
      :allow-nutri="isAdmin"
      @close="showInvite = false"
      @created="refresh()"
    />
  </main>
</template>
