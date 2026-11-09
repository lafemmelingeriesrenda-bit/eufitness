<script setup lang="ts">
import type { Database, MemberRole } from '~/types/database.types'

// Cria um convite e mostra o link para copiar ou mandar pelo WhatsApp.
const props = defineProps<{ organizationId: string; allowNutri: boolean }>()
const emit = defineEmits<{ close: []; created: [] }>()

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const role = ref<MemberRole>('aluno')
const name = ref('')
const loading = ref(false)
const error = ref('')
const link = ref('')
const copied = ref(false)

const message = computed(() => {
  const who = role.value === 'nutri' ? 'nutricionista parceiro' : 'aluno'
  const hello = name.value.trim() ? `Oi, ${name.value.trim().split(' ')[0]}! ` : 'Oi! '
  return `${hello}Te convidei como ${who} no Eu Fitness. Crie sua conta por este link: ${link.value}`
})

async function create() {
  error.value = ''
  loading.value = true
  const { data, error: insertError } = await supabase
    .from('invites')
    .insert({
      organization_id: props.organizationId,
      invited_by: user.value!.sub,
      role: role.value,
      name: name.value.trim() || null,
    })
    .select('code')
    .single()
  loading.value = false
  if (insertError) {
    error.value = friendlyError(insertError)
    return
  }
  link.value = `${location.origin}/convite/${data.code}`
  emit('created')
}

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = 'Não deu para copiar. Segure o link para copiar manualmente.'
  }
}
</script>

<template>
  <div class="fixed inset-0 z-20 flex items-end justify-center bg-black/60 md:items-center md:p-6" @click.self="emit('close')">
    <div class="flex w-full max-w-[480px] flex-col gap-4 rounded-t-[28px] border-t border-line bg-raised px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:rounded-[28px] md:border md:p-6" role="dialog" aria-label="Convidar">
      <div class="flex items-center justify-between">
        <h2 class="font-display text-lg font-semibold">Convidar</h2>
        <button type="button" class="text-sm text-muted" @click="emit('close')">Fechar</button>
      </div>

      <template v-if="!link">
        <div v-if="allowNutri" class="grid grid-cols-2 gap-1.5 rounded-full bg-card p-1.5">
          <button
            v-for="option in (['aluno', 'nutri'] as const)"
            :key="option"
            type="button"
            class="min-h-11 rounded-full text-sm font-bold transition"
            :class="role === option ? 'bg-lime text-ink' : 'text-muted'"
            @click="role = option"
          >
            {{ option === 'aluno' ? 'Aluno' : 'Nutricionista' }}
          </button>
        </div>
        <label for="convite-nome" class="sr-only">Nome</label>
        <input id="convite-nome" v-model="name" class="field" placeholder="Nome (opcional)">
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <button type="button" class="btn-primary" :disabled="loading" @click="create">
          {{ loading ? 'Gerando…' : 'Gerar link de convite' }}
        </button>
        <p class="text-xs text-faint">O link vale por 7 dias e só pode ser usado uma vez.</p>
      </template>

      <template v-else>
        <p class="text-sm text-muted">Mande este link para {{ name.trim() || (role === 'nutri' ? 'o nutricionista' : 'o aluno') }}:</p>
        <div class="break-all rounded-[18px] border border-line bg-card p-4 text-sm">{{ link }}</div>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="btn-ghost justify-center py-3" @click="copy">
            <AppIcon :name="copied ? 'check' : 'copy'" :size="18" /> {{ copied ? 'Copiado' : 'Copiar' }}
          </button>
          <a
            :href="`https://wa.me/?text=${encodeURIComponent(message)}`"
            target="_blank"
            rel="noopener"
            class="flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-lime px-3.5 py-3 text-sm font-bold text-ink"
          >
            <AppIcon name="whatsapp" :size="18" /> WhatsApp
          </a>
        </div>
      </template>
    </div>
  </div>
</template>
