<script setup lang="ts">
const { me } = useMe()

const label = computed(() => {
  const current = me.value?.current
  if (!current) return me.value?.isPlatformAdmin ? 'Dono da plataforma' : ''
  return `${roleLabel[current.role]} · ${current.organization?.name ?? ''}`
})
</script>

<template>
  <header class="flex items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-3">
      <AppAvatar :name="me?.profile.full_name ?? ''" />
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate text-[13px] text-muted">{{ label }}</span>
        <span class="truncate text-lg font-bold">{{ me?.profile.full_name || 'Sem nome' }}</span>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <NuxtLink
        v-if="me?.isPlatformAdmin && me.current"
        to="/admin"
        aria-label="Painel do dono da plataforma"
        class="flex size-[46px] items-center justify-center rounded-full border border-violet-line bg-violet-deep text-violet-soft"
      >
        <AppIcon name="shield" />
      </NuxtLink>
      <NuxtLink to="/conta" aria-label="Conta" class="flex size-[46px] items-center justify-center rounded-full border border-line bg-card">
        <AppIcon name="user" />
      </NuxtLink>
    </div>
  </header>
</template>
