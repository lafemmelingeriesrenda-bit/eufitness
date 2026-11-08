<script setup lang="ts">
import type { Database } from '~/types/database.types'

const supabase = useSupabaseClient<Database>()
const { me, load, signOut } = useMe()

await load()
if (!me.value) await navigateTo('/login')

const fullName = ref(me.value?.profile.full_name ?? '')
const phone = ref(me.value?.profile.phone ?? '')
const password = ref('')
const saving = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  message.value = ''
  error.value = ''
  saving.value = true
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName.value.trim(), phone: phone.value.trim() || null })
    .eq('id', me.value!.profile.id)
  let passwordError = null
  if (!profileError && password.value) {
    ;({ error: passwordError } = await supabase.auth.updateUser({ password: password.value }))
  }
  saving.value = false
  if (profileError || passwordError) {
    error.value = friendlyError(profileError ?? passwordError)
    return
  }
  password.value = ''
  message.value = 'Salvo.'
  await load(true)
}
</script>

<template>
  <main class="flex flex-col gap-6 px-5 pt-6 pb-10">
    <div class="flex items-center gap-3">
      <NuxtLink :to="homeFor(me)" aria-label="Voltar" class="flex size-[46px] items-center justify-center rounded-full border border-line bg-card">
        <AppIcon name="arrow" class="rotate-180" />
      </NuxtLink>
      <h1 class="font-display text-xl font-semibold">Conta</h1>
    </div>

    <form class="flex flex-col gap-3" @submit.prevent="save">
      <label for="nome" class="text-sm font-semibold text-muted">Nome</label>
      <input id="nome" v-model="fullName" class="field" autocomplete="name" required>
      <label for="tel" class="mt-2 text-sm font-semibold text-muted">WhatsApp <span class="font-normal text-faint">(para os lembretes)</span></label>
      <input id="tel" v-model="phone" class="field" type="tel" autocomplete="tel" placeholder="(11) 99999-9999">
      <label for="senha" class="mt-2 text-sm font-semibold text-muted">Nova senha <span class="font-normal text-faint">(deixe vazio para manter)</span></label>
      <input id="senha" v-model="password" class="field" type="password" autocomplete="new-password" minlength="6">
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <p v-if="message" class="text-sm text-lime" role="status">{{ message }}</p>
      <button class="btn-primary mt-2" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar' }}</button>
    </form>

    <NuxtLink v-if="me?.isPlatformAdmin" to="/admin" class="flex items-center gap-3 rounded-[20px] border border-violet-line bg-violet-deep p-4 text-sm">
      <AppIcon name="shield" class="text-violet-soft" />
      <span class="flex-1"><strong>Dono da plataforma</strong> · ver todas as assessorias</span>
      <AppIcon name="arrow" :size="18" class="text-violet-soft" />
    </NuxtLink>

    <div v-if="me?.current" class="rounded-[20px] bg-card p-4 text-sm text-muted">
      {{ roleLabel[me.current.role] }} na <strong class="text-text">{{ me.current.organization?.name }}</strong>
      <span v-if="me.current.is_admin"> · administrador</span>
    </div>

    <button type="button" class="btn-ghost justify-center py-3" @click="signOut">
      <AppIcon name="logout" :size="18" /> Sair
    </button>
  </main>
</template>
