<!-- Menu lateral do PC: marca, navegação do papel, conta e sair. -->
<script setup lang="ts">
const { me, signOut } = useMe()
const route = useRoute()

type Item = { to: string; label: string; icon: 'users' | 'dumbbell' | 'leaf' | 'edit' | 'shield' | 'user' | 'sparkle'; exact?: boolean }

const items = computed<Item[]>(() => {
  const role = me.value?.current?.role
  const list: Item[] = []
  if (role === 'personal' || role === 'nutri') {
    list.push({ to: roleHome[role], label: role === 'personal' ? 'Painel' : 'Seus alunos', icon: 'users' })
  } else if (role === 'aluno') {
    list.push(
      { to: '/aluno', label: 'Início', icon: 'sparkle', exact: true },
      { to: '/aluno/plano/treino', label: 'Seu treino', icon: 'dumbbell' },
      { to: '/aluno/plano/dieta', label: 'Sua dieta', icon: 'leaf' },
      { to: '/aluno/anamnese', label: 'Anamnese', icon: 'edit' },
    )
  }
  if (me.value?.isPlatformAdmin) list.push({ to: '/admin', label: 'Plataforma', icon: 'shield' })
  list.push({ to: '/conta', label: 'Conta', icon: 'user' })
  return list
})

function active(item: Item) {
  if (item.exact) return route.path === item.to
  // A ficha do aluno (/alunos/...) faz parte do painel do profissional.
  if ((item.to === '/personal' || item.to === '/nutri') && route.path.startsWith('/alunos')) return true
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const subtitle = computed(() => {
  const current = me.value?.current
  if (current) return `${roleLabel[current.role]} · ${current.organization?.name ?? ''}`
  return me.value?.isPlatformAdmin ? 'Dono da plataforma' : ''
})
</script>

<template>
  <aside class="sticky top-0 flex h-dvh w-[264px] shrink-0 flex-col gap-8 border-r border-line bg-deep px-4 py-6">
    <NuxtLink :to="homeFor(me)" class="flex items-center gap-2.5 px-2">
      <span class="size-3 rounded-full bg-lime" />
      <span class="font-display text-lg font-bold tracking-tight">Eu Fitness</span>
    </NuxtLink>

    <nav class="flex flex-col gap-1" aria-label="Menu principal">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-semibold transition"
        :class="active(item) ? 'bg-card text-text' : 'text-muted hover:bg-card/60 hover:text-text'"
        :aria-current="active(item) ? 'page' : undefined"
      >
        <AppIcon :name="item.icon" :size="18" :class="active(item) ? 'text-lime' : ''" />
        {{ item.label }}
      </NuxtLink>
    </nav>

    <div class="mt-auto flex flex-col gap-3 border-t border-line px-2 pt-5">
      <div class="flex min-w-0 items-center gap-3">
        <AppAvatar :name="me?.profile.full_name ?? ''" :size="40" />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-semibold">{{ me?.profile.full_name || 'Sem nome' }}</span>
          <span class="truncate text-xs text-muted">{{ subtitle }}</span>
        </div>
      </div>
      <button type="button" class="flex items-center gap-2 text-sm text-muted hover:text-text" @click="signOut">
        <AppIcon name="logout" :size="16" /> Sair
      </button>
    </div>
  </aside>
</template>
