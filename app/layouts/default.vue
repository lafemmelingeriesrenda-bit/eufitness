<!--
  Telas do app depois do login. No celular: uma coluna de até 480 px.
  No PC (a partir de 1024 px): menu lateral fixo e conteúdo largo.
-->
<template>
  <div class="min-h-dvh lg:flex">
    <AppSidebar class="hidden lg:flex" />
    <div class="mx-auto w-full max-w-[480px] lg:max-w-none lg:min-w-0 lg:flex-1">
      <div class="lg:mx-auto lg:max-w-[1120px] lg:px-6 lg:pt-4">
        <slot />
      </div>
    </div>
  </div>
</template>
