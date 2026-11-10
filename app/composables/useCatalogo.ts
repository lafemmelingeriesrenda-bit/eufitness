import type { Database } from '~/types/database.types'

export type ItemCatalogo = ExercicioRow & {
  nome: string
  enabled: boolean
  custom_name: string | null
  video_url: string | null
  proprio: boolean
}

/**
 * Catálogo de exercícios da assessoria: base global + exercícios próprios,
 * já com os ajustes dela (ligado/desligado, nome próprio, vídeo).
 * Carrega uma vez e fica guardado enquanto o app está aberto.
 */
export function useCatalogo(orgId: string) {
  const supabase = useSupabaseClient<Database>()
  const items = useState<ItemCatalogo[] | null>(`catalogo-${orgId}`, () => null)
  const loading = ref(false)

  async function load(force = false) {
    if (items.value && !force) return items.value
    loading.value = true
    const cols = 'id, organization_id, name_en, name_pt, category, level, equipment, primary_muscles, images'
    // O PostgREST devolve no máximo 1000 linhas por vez; busca em páginas.
    const rows: ExercicioRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('exercises').select(cols).order('id').range(from, from + 999)
      if (error) throw error
      rows.push(...(data as ExercicioRow[]))
      if (!data || data.length < 1000) break
    }
    const { data: ajustes } = await supabase
      .from('organization_exercises').select('exercise_id, enabled, custom_name, video_url').eq('organization_id', orgId)
    const porId = new Map((ajustes ?? []).map((a) => [a.exercise_id, a]))
    items.value = rows
      .filter((r) => r.organization_id === null || r.organization_id === orgId)
      .map((r) => {
        const a = porId.get(r.id)
        return {
          ...r,
          nome: nomeExercicio(r, a?.custom_name),
          enabled: a?.enabled ?? true,
          custom_name: a?.custom_name ?? null,
          video_url: a?.video_url ?? null,
          proprio: r.organization_id !== null,
        }
      })
      .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
    loading.value = false
    return items.value
  }

  /** Grava os ajustes da assessoria para um exercício. */
  async function salvarAjustes(exerciseId: string, ajuste: { enabled: boolean; custom_name: string | null; video_url: string | null }) {
    const { data: existe } = await supabase
      .from('organization_exercises').select('exercise_id').eq('organization_id', orgId).eq('exercise_id', exerciseId).maybeSingle()
    const { error } = existe
      ? await supabase.from('organization_exercises').update(ajuste).eq('organization_id', orgId).eq('exercise_id', exerciseId)
      : await supabase.from('organization_exercises').insert({ organization_id: orgId, exercise_id: exerciseId, ...ajuste })
    if (error) throw error
    const item = items.value?.find((i) => i.id === exerciseId)
    if (item) {
      Object.assign(item, ajuste)
      item.nome = nomeExercicio(item, ajuste.custom_name)
    }
  }

  return { items, loading, load, salvarAjustes }
}

/**
 * Só os exercícios usados num plano (para o aluno e para a tela de leitura):
 * fotos, nome da assessoria e vídeo. Busca pelos ids em vez do catálogo inteiro.
 */
export function useExerciciosDoPlano(orgId: string, ids: () => string[]) {
  const supabase = useSupabaseClient<Database>()
  const porId = ref(new Map<string, ItemCatalogo>())

  async function load() {
    const lista = [...new Set(ids().filter(Boolean))]
    if (!lista.length) return
    const [{ data: rows }, { data: ajustes }] = await Promise.all([
      supabase.from('exercises').select('id, organization_id, name_en, name_pt, category, level, equipment, primary_muscles, images').in('id', lista),
      supabase.from('organization_exercises').select('exercise_id, enabled, custom_name, video_url').eq('organization_id', orgId).in('exercise_id', lista),
    ])
    const aj = new Map((ajustes ?? []).map((a) => [a.exercise_id, a]))
    porId.value = new Map((rows ?? []).map((r) => {
      const a = aj.get(r.id)
      return [r.id, {
        ...(r as ExercicioRow),
        nome: nomeExercicio(r, a?.custom_name),
        enabled: a?.enabled ?? true,
        custom_name: a?.custom_name ?? null,
        video_url: a?.video_url ?? null,
        proprio: r.organization_id !== null,
      }]
    }))
  }

  onMounted(() => load().catch(() => {}))
  return { porId, load }
}
