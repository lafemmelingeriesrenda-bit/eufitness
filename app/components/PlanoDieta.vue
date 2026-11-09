<!-- Dieta só para leitura (aluno, ou profissional que não edita). -->
<script setup lang="ts">
defineProps<{ dieta: Dieta }>()
</script>

<template>
  <div class="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
    <p v-if="dieta.resumo" class="text-[15px] leading-relaxed text-muted lg:col-span-2">{{ dieta.resumo }}</p>

    <section class="flex flex-col gap-2 lg:col-span-2 lg:grid lg:grid-cols-[1fr_2fr]">
      <div class="flex items-baseline gap-1.5 rounded-[20px] bg-card p-3.5">
        <span class="font-display text-[26px] font-bold text-lime">{{ dieta.calorias_kcal }}</span>
        <span class="text-sm text-muted">kcal por dia</span>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div v-for="m in [['Proteína', dieta.proteina_g], ['Carbo', dieta.carboidrato_g], ['Gordura', dieta.gordura_g]]" :key="m[0]" class="flex flex-col gap-0.5 rounded-[16px] bg-card p-3">
          <span class="font-display text-lg font-bold">{{ m[1] }} g</span>
          <span class="text-xs text-muted">{{ m[0] }}</span>
        </div>
      </div>
    </section>

    <article v-for="(r, i) in dieta.refeicoes" :key="i" class="flex flex-col gap-2 rounded-[20px] bg-card p-4">
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-[15px] font-semibold">{{ r.nome }}</h3>
        <span class="shrink-0 text-sm text-muted">{{ r.horario }}</span>
      </div>
      <ul class="flex flex-col divide-y divide-line">
        <li v-for="(item, j) in r.itens" :key="j" class="flex items-start justify-between gap-3 py-2 text-sm">
          <span>{{ item.alimento }}</span>
          <span class="shrink-0 text-right text-muted">{{ item.quantidade }}</span>
        </li>
      </ul>
      <p v-if="r.observacao" class="text-[13px] text-faint">{{ r.observacao }}</p>
    </article>

    <section v-if="dieta.orientacoes.length" class="flex flex-col gap-2 rounded-[20px] border border-line p-4 lg:col-span-2">
      <h3 class="text-sm font-semibold">Orientações</h3>
      <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li v-for="(o, i) in dieta.orientacoes" :key="i">{{ o }}</li>
      </ul>
    </section>
  </div>
</template>
