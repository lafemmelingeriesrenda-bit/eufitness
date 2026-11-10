<!-- Treino só para leitura (aluno, ou profissional que não edita). -->
<script setup lang="ts">
const props = defineProps<{
  treino: Treino
  /** Mostra o botão de começar (só para o aluno). */
  startable?: boolean
  /** Dia sugerido para hoje (o seguinte ao último feito). */
  suggested?: number
}>()
const open = ref(props.suggested ?? 0)

// Fotos e vídeo dos exercícios que vieram do catálogo.
const { me } = useMe()
const orgId = me.value?.current?.organization_id ?? ''
const { porId } = useExerciciosDoPlano(orgId, () => props.treino.dias.flatMap((d) => d.exercicios.map((ex) => ex.exercicio_id ?? '')))
const detalhe = ref<ItemCatalogo | null>(null)

const descanso = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`)
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="treino.resumo" class="text-[15px] leading-relaxed text-muted">{{ treino.resumo }}</p>

    <div class="flex gap-2 overflow-x-auto pb-1" role="tablist">
      <button
        v-for="(dia, d) in treino.dias"
        :key="d"
        type="button"
        role="tab"
        :aria-selected="open === d"
        class="min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition"
        :class="open === d ? 'bg-lime text-ink' : 'border border-line bg-card text-muted'"
        @click="open = d"
      >
        {{ dia.nome }}
      </button>
    </div>

    <section v-if="treino.dias[open]" class="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
      <p class="text-sm text-muted lg:col-span-2">{{ treino.dias[open]!.foco }}</p>
      <NuxtLink v-if="startable && treino.dias[open]!.exercicios.length" :to="`/aluno/treino/${open}`" class="btn-primary lg:col-span-2 lg:w-[320px]">
        Começar {{ treino.dias[open]!.nome }} <AppIcon name="arrow" />
      </NuxtLink>
      <p v-if="startable && open === suggested" class="-mt-1 text-center text-xs text-faint lg:col-span-2 lg:mt-0 lg:text-left">Sugestão para hoje</p>
      <article v-for="(ex, e) in treino.dias[open]!.exercicios" :key="e" class="flex gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <button
          v-if="ex.exercicio_id && porId.get(ex.exercicio_id)"
          type="button"
          class="relative size-16 shrink-0 overflow-hidden rounded-[14px] bg-white"
          :aria-label="`Ver como fazer: ${ex.nome}`"
          @click="detalhe = porId.get(ex.exercicio_id)!"
        >
          <img v-if="porId.get(ex.exercicio_id)!.images[0]" :src="porId.get(ex.exercicio_id)!.images[0]" alt="" class="size-full object-contain" loading="lazy">
          <span class="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-ink font-display text-[10px] font-bold text-lime">{{ e + 1 }}</span>
        </button>
        <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-raised font-display text-sm font-bold text-lime">{{ e + 1 }}</span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[15px] font-semibold">{{ ex.nome }}</span>
          <span class="text-[13px] text-muted">{{ ex.series }} × {{ ex.repeticoes }} · descanso {{ descanso(ex.descanso_seg) }}</span>
          <span v-if="ex.observacao" class="text-[13px] text-faint">{{ ex.observacao }}</span>
          <button
            v-if="ex.exercicio_id && porId.get(ex.exercicio_id)"
            type="button"
            class="self-start text-xs font-semibold text-violet-soft"
            @click="detalhe = porId.get(ex.exercicio_id)!"
          >
            {{ porId.get(ex.exercicio_id)!.video_url ? '▶ Ver vídeo e como fazer' : 'Ver como fazer' }}
          </button>
        </div>
      </article>
    </section>

    <section v-if="treino.orientacoes.length" class="flex flex-col gap-2 rounded-[20px] border border-line p-4 lg:max-w-3xl">
      <h3 class="text-sm font-semibold">Orientações</h3>
      <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li v-for="(o, i) in treino.orientacoes" :key="i">{{ o }}</li>
      </ul>
    </section>

    <ExercicioSheet v-if="detalhe" :key="detalhe.id" :item="detalhe" :org-id="orgId" :can-edit="false" @close="detalhe = null" />
  </div>
</template>
