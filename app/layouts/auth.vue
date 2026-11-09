<!--
  Entrar, criar conta, convite e primeiro acesso. No celular a tela é a mesma
  de sempre. No PC: painel da marca à esquerda e o formulário à direita.
-->
<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
    <aside class="relative hidden overflow-hidden border-r border-line bg-deep lg:flex lg:flex-col lg:justify-between lg:p-12">
      <svg aria-hidden="true" viewBox="0 0 420 420" class="pointer-events-none absolute -top-48 -right-48 w-[560px] opacity-90">
        <circle cx="210" cy="210" r="190" fill="none" stroke="#1A1E24" stroke-width="28" />
        <circle cx="210" cy="210" r="190" fill="none" stroke="#C6F432" stroke-width="28" stroke-linecap="round" stroke-dasharray="1194" stroke-dashoffset="380" transform="rotate(100 210 210)" />
        <circle cx="210" cy="210" r="140" fill="none" stroke="#1A1E24" stroke-width="28" />
        <circle cx="210" cy="210" r="140" fill="none" stroke="#8B7CFF" stroke-width="28" stroke-linecap="round" stroke-dasharray="880" stroke-dashoffset="420" transform="rotate(140 210 210)" />
        <circle cx="210" cy="210" r="90" fill="none" stroke="#1A1E24" stroke-width="28" />
        <circle cx="210" cy="210" r="90" fill="none" stroke="#FF8A3D" stroke-width="28" stroke-linecap="round" stroke-dasharray="565" stroke-dashoffset="250" transform="rotate(180 210 210)" />
      </svg>
      <div class="relative flex items-center gap-2.5">
        <span class="size-3 rounded-full bg-lime" />
        <span class="font-display text-xl font-bold tracking-tight">Eu Fitness</span>
      </div>
      <div class="relative flex max-w-md flex-col gap-4">
        <h2 class="font-display text-[44px] leading-[1.05] font-bold tracking-tight">
          Treino e dieta<br><span class="text-lime">sob medida.</span>
        </h2>
        <p class="text-lg leading-relaxed text-muted">
          Montados a partir da anamnese do aluno e aprovados por quem entende: o personal e a nutricionista.
        </p>
      </div>
    </aside>
    <div class="mx-auto w-full max-w-[480px] lg:flex lg:max-w-[460px] lg:flex-col lg:justify-center">
      <slot />
    </div>
  </div>
</template>
