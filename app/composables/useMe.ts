import type { Database, MemberRole } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Membership = Database['public']['Tables']['memberships']['Row'] & {
  organization: { id: string; name: string } | null
}

export type Me = {
  profile: Profile
  memberships: Membership[]
  /** Assessoria em uso. Na fase 1 cada pessoa fica em uma só. */
  current: Membership | null
  /** Dono da plataforma: vê todas as assessorias em /admin. */
  isPlatformAdmin: boolean
}

// Ordem de preferência quando a pessoa tem mais de um papel.
const rolePriority: Record<MemberRole, number> = { personal: 0, nutri: 1, aluno: 2 }

export const roleHome: Record<MemberRole, string> = {
  personal: '/personal',
  nutri: '/nutri',
  aluno: '/aluno',
}

export const roleLabel: Record<MemberRole, string> = {
  personal: 'Personal',
  nutri: 'Nutricionista',
  aluno: 'Aluno',
}

/** Perfil e papéis de quem está logado, carregados uma vez e compartilhados. */
export function useMe() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const me = useState<Me | null>('me', () => null)

  async function load(force = false) {
    const uid = user.value?.sub
    if (!uid) {
      me.value = null
      return null
    }
    if (me.value && me.value.profile.id === uid && !force) return me.value

    const [{ data: profile, error: profileError }, { data: memberships, error: membershipsError }, { data: isPlatformAdmin }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('memberships').select('*, organization:organizations(id, name)').eq('user_id', uid),
      supabase.rpc('is_platform_admin'),
    ])
    if (profileError) throw profileError
    if (membershipsError) throw membershipsError

    const sorted = [...(memberships ?? [])].sort((a, b) => rolePriority[a.role] - rolePriority[b.role])
    me.value = { profile, memberships: sorted, current: sorted[0] ?? null, isPlatformAdmin: isPlatformAdmin === true }
    return me.value
  }

  async function signOut() {
    await supabase.auth.signOut()
    me.value = null
    await navigateTo('/login')
  }

  return { me, load, signOut }
}

/** Para onde mandar a pessoa logo depois do login. */
export function homeFor(me: Me | null) {
  if (!me?.current) return me?.isPlatformAdmin ? '/admin' : '/onboarding'
  return roleHome[me.current.role]
}
