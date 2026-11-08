import type { MemberRole } from '~/types/database.types'

declare module '#app' {
  interface PageMeta {
    /** Papéis que podem abrir a página. */
    roles?: MemberRole[]
    /** Só o dono da plataforma abre a página. */
    platformAdmin?: boolean
  }
}

// Garante que só o papel certo abre cada painel; quem cai no lugar errado
// volta para o próprio painel.
export default defineNuxtRouteMiddleware(async (to) => {
  const roles = to.meta.roles
  if (!roles?.length && !to.meta.platformAdmin) return

  const { load } = useMe()
  const me = await load()
  if (!me) return navigateTo('/login')

  if (to.meta.platformAdmin) {
    if (!me.isPlatformAdmin) return navigateTo(homeFor(me))
    return
  }

  const role = me.current?.role
  if (!role || !roles?.includes(role)) return navigateTo(homeFor(me))
})
