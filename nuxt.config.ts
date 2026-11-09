import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Eu Fitness',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0B0D10' },
        { name: 'description', content: 'Treino e dieta montados para você e aprovados por quem entende.' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700&display=swap' },
      ],
    },
  },
  nitro: {
    // O agente pode levar até uns 2 minutos para montar um plano.
    vercel: { functions: { maxDuration: 300 } },
  },
  supabase: {
    // URL e chave vêm de NUXT_PUBLIC_SUPABASE_URL e NUXT_PUBLIC_SUPABASE_KEY (.env ou Vercel)
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/cadastro', '/convite/*'],
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: true,
    },
  },
})
