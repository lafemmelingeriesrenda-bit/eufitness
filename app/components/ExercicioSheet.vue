<!-- Detalhe de um exercício do catálogo: fotos, instruções, vídeo e ajustes da assessoria. -->
<script setup lang="ts">
import type { Database } from '~/types/database.types'

const props = defineProps<{ item: ItemCatalogo; orgId: string; canEdit: boolean }>()
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>()

const supabase = useSupabaseClient<Database>()
const { salvarAjustes } = useCatalogo(props.orgId)

// Instruções só carregam ao abrir (a lista não traz esse texto, que é grande).
const detalhe = ref<{ instructions_pt: string[]; instructions_en: string[]; secondary_muscles: string[] } | null>(null)
onMounted(async () => {
  const { data } = await supabase
    .from('exercises').select('instructions_pt, instructions_en, secondary_muscles').eq('id', props.item.id).maybeSingle()
  detalhe.value = data
})

const enabled = ref(props.item.enabled)
const customName = ref(props.item.custom_name ?? '')
const videoUrl = ref(props.item.video_url ?? '')
const saving = ref(false)
const error = ref('')
const foto = ref(0)

const instrucoes = computed(() => (detalhe.value?.instructions_pt?.length ? detalhe.value.instructions_pt : detalhe.value?.instructions_en) ?? [])
const emIngles = computed(() => !detalhe.value?.instructions_pt?.length && !!detalhe.value?.instructions_en?.length)
const embed = computed(() => youtubeEmbed(videoUrl.value))

async function save() {
  error.value = ''
  const url = videoUrl.value.trim()
  if (url && !url.startsWith('https://')) {
    error.value = 'O link do vídeo precisa começar com https://'
    return
  }
  saving.value = true
  try {
    await salvarAjustes(props.item.id, { enabled: enabled.value, custom_name: customName.value.trim() || null, video_url: url || null })
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = friendlyError(e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Apagar este exercício da sua assessoria? Planos já aprovados não mudam.')) return
  const { error: e } = await supabase.from('exercises').delete().eq('id', props.item.id)
  if (e) {
    error.value = friendlyError(e)
    return
  }
  emit('deleted')
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-30 flex items-end justify-center bg-black/60 md:items-center md:p-6" @click.self="emit('close')">
    <div class="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-raised md:rounded-[28px] md:border" role="dialog" :aria-label="item.nome">
      <div class="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 class="font-display text-lg leading-tight font-semibold">{{ item.nome }}</h2>
        <button type="button" class="shrink-0 text-sm text-muted" @click="emit('close')">Fechar</button>
      </div>

      <div class="flex flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5">
        <div v-if="item.images.length" class="flex flex-col gap-2">
          <img :src="item.images[foto]" :alt="`${item.nome}, posição ${foto + 1}`" class="aspect-[4/3] w-full rounded-[18px] bg-white object-contain" loading="lazy">
          <div v-if="item.images.length > 1" class="flex gap-2">
            <button
              v-for="(img, i) in item.images"
              :key="img"
              type="button"
              class="rounded-full px-3 py-1 text-xs font-semibold"
              :class="foto === i ? 'bg-lime text-ink' : 'bg-card text-muted'"
              @click="foto = i"
            >
              {{ i === 0 ? 'Início' : i === item.images.length - 1 ? 'Fim' : `Foto ${i + 1}` }}
            </button>
          </div>
        </div>

        <iframe v-if="embed" :src="embed" title="Vídeo do exercício" class="aspect-video w-full rounded-[18px]" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy" />

        <div class="flex flex-wrap gap-2 text-xs font-semibold">
          <span v-for="m in item.primary_muscles" :key="m" class="rounded-full bg-[rgba(198,244,50,0.14)] px-2.5 py-1 text-lime">{{ musculoLabel[m] ?? m }}</span>
          <span v-for="m in detalhe?.secondary_muscles ?? []" :key="m" class="rounded-full bg-card px-2.5 py-1 text-muted">{{ musculoLabel[m] ?? m }}</span>
          <span v-if="item.equipment" class="rounded-full bg-card px-2.5 py-1">{{ equipamentoLabel[item.equipment] ?? item.equipment }}</span>
          <span v-if="item.level" class="rounded-full bg-card px-2.5 py-1">{{ nivelLabel[item.level] ?? item.level }}</span>
        </div>

        <section v-if="instrucoes.length" class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold">Como fazer<span v-if="emIngles" class="font-normal text-faint"> (ainda em inglês)</span></h3>
          <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
            <li v-for="(p, i) in instrucoes" :key="i">{{ p }}</li>
          </ol>
        </section>

        <section v-if="canEdit" class="flex flex-col gap-3 border-t border-line pt-4">
          <h3 class="text-sm font-semibold">Na sua assessoria</h3>
          <label class="flex items-center justify-between gap-3 rounded-[16px] bg-card px-4 py-3 text-sm">
            <span>
              <span class="font-semibold">Disponível para o agente</span><br>
              <span class="text-xs text-muted">Desligado, o agente não usa este exercício.</span>
            </span>
            <input v-model="enabled" type="checkbox" class="size-5 accent-[#C6F432]">
          </label>
          <label class="flex flex-col gap-1.5 text-sm text-muted">Nome na sua assessoria <span class="text-xs text-faint">(opcional)</span>
            <input v-model="customName" class="field h-12" maxlength="120" :placeholder="item.name_pt || item.name_en || ''">
          </label>
          <label class="flex flex-col gap-1.5 text-sm text-muted">Link do vídeo (YouTube)
            <input v-model="videoUrl" class="field h-12" type="url" inputmode="url" placeholder="https://youtube.com/watch?v=…">
          </label>
          <p v-if="videoUrl && !embed" class="text-xs text-[#FFB98A]">Não reconheci como link do YouTube. O aluno vai ver um botão para abrir o link.</p>
          <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
          <button type="button" class="btn-primary h-12" :disabled="saving" @click="save">{{ saving ? 'Salvando…' : 'Salvar' }}</button>
          <button v-if="item.proprio" type="button" class="self-center text-sm text-danger" @click="remove">Apagar exercício</button>
        </section>
      </div>
    </div>
  </div>
</template>
