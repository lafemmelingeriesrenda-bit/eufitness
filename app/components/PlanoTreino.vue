<!-- Treino só para leitura (aluno, ou profissional que não edita). -->
<script setup lang="ts">
defineProps<{ treino: Treino }>()
const open = ref(0)
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

    <section v-if="treino.dias[open]" class="flex flex-col gap-2.5">
      <p class="text-sm text-muted">{{ treino.dias[open]!.foco }}</p>
      <article v-for="(ex, e) in treino.dias[open]!.exercicios" :key="e" class="flex gap-3.5 rounded-[20px] bg-card px-3.5 py-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-raised font-display text-sm font-bold text-lime">{{ e + 1 }}</span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-[15px] font-semibold">{{ ex.nome }}</span>
          <span class="text-[13px] text-muted">{{ ex.series }} × {{ ex.repeticoes }} · descanso {{ descanso(ex.descanso_seg) }}</span>
          <span v-if="ex.observacao" class="text-[13px] text-faint">{{ ex.observacao }}</span>
        </div>
      </article>
    </section>

    <section v-if="treino.orientacoes.length" class="flex flex-col gap-2 rounded-[20px] border border-line p-4">
      <h3 class="text-sm font-semibold">Orientações</h3>
      <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li v-for="(o, i) in treino.orientacoes" :key="i">{{ o }}</li>
      </ul>
    </section>
  </div>
</template>
