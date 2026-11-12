// POST /api/planos/gerar { studentId, kind, operacao, extra } → o agente monta
// um rascunho novo (criar) ou ajusta o plano atual conforme o pedido (atualizar).
// Roda com a sessão de quem chamou: o RLS do Supabase decide o que pode.
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

const bodySchema = z.object({
  studentId: z.string().uuid(),
  kind: z.enum(['treino', 'dieta']),
  /** criar = do zero, a partir da anamnese; atualizar = parte do plano atual. */
  operacao: z.enum(['criar', 'atualizar']).default('criar'),
  /** Pedido do profissional só para este aluno (obrigatório para atualizar). */
  extra: z.string().max(1000).optional(),
}).refine((b) => b.operacao === 'criar' || !!b.extra?.trim(), { message: 'Diga o que ajustar' })

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Faça login para continuar' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message === 'Diga o que ajustar' ? 'Escreva o que você quer ajustar no plano.' : 'Pedido inválido' })
  const { studentId, kind } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: anamnese } = await supabase.from('anamneses').select('*').eq('student_id', studentId).maybeSingle()
  if (!anamnese?.submitted_at) {
    throw createError({ statusCode: 400, statusMessage: 'O aluno ainda não enviou a anamnese' })
  }

  const { data: canManage } = await supabase.rpc('can_manage_plan', {
    org: anamnese.organization_id,
    student: studentId,
    k: kind,
  })
  if (!canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: kind === 'treino' ? 'Só o personal do aluno monta o treino' : 'Só o nutricionista do aluno monta a dieta',
    })
  }

  // Instruções gerais de quem está gerando (tela Agente).
  const { data: instr } = await supabase
    .from('agent_instructions').select('instructions')
    .eq('user_id', user.sub).eq('kind', kind).maybeSingle()

  // Treino: exercícios do catálogo que a assessoria deixou ligados e que
  // combinam com o local onde o aluno treina.
  const catalogo = kind === 'treino' ? await carregarCatalogo(supabase, anamnese.organization_id, anamnese.training_place) : []

  // Atualizar: parte do rascunho salvo (que, depois de aprovado, é igual ao que o aluno vê).
  let atual: PlanContent | undefined
  if (parsed.data.operacao === 'atualizar') {
    const { data: plano } = await supabase.from('plans').select('draft, published').eq('student_id', studentId).eq('kind', kind).maybeSingle()
    const base = (plano?.draft ?? plano?.published) as PlanContent | null | undefined
    if (!base) throw createError({ statusCode: 400, statusMessage: 'Ainda não há plano para ajustar. Gere um primeiro.' })
    atual = base
  }

  let draft: PlanContent
  try {
    draft = await gerarPlano(kind, anamnese, { instrucoes: instr?.instructions, extra: parsed.data.extra, catalogo, atual })
  } catch (error) {
    if (error instanceof AgenteError) throw createError({ statusCode: error.status, statusMessage: error.message })
    throw error
  }

  // Confere os ids devolvidos: nome sempre igual ao do catálogo. Exercício fora do
  // catálogo (id vazio ou inventado) fica no rascunho, mas vira um aviso para o personal.
  if (kind === 'treino') {
    const treino = draft as Treino
    const porId = new Map(catalogo.map((e) => [e.id, e]))
    const foraDoCatalogo: string[] = []
    for (const dia of treino.dias) {
      for (const ex of dia.exercicios) {
        const c = ex.exercicio_id ? porId.get(ex.exercicio_id) : undefined
        if (c) {
          ex.nome = c.nome
        } else {
          ex.exercicio_id = ''
          foraDoCatalogo.push(`${ex.nome} (${dia.nome})`)
        }
      }
    }
    if (foraDoCatalogo.length) {
      treino.alertas_para_profissional.push(
        `Fora do catálogo da assessoria: ${foraDoCatalogo.join('; ')}. Troque por um exercício do catálogo ou confira antes de aprovar.`,
      )
    }
  }

  const fields = {
    draft: draft as unknown as Database['public']['Tables']['plans']['Row']['draft'],
    draft_by_agent: true,
    draft_updated_at: new Date().toISOString(),
    draft_updated_by: user.sub,
  }
  const { data: existing } = await supabase.from('plans').select('student_id').eq('student_id', studentId).eq('kind', kind).maybeSingle()
  const { error } = existing
    ? await supabase.from('plans').update(fields).eq('student_id', studentId).eq('kind', kind)
    : await supabase.from('plans').insert({ student_id: studentId, kind, organization_id: anamnese.organization_id, ...fields })
  if (error) throw createError({ statusCode: 500, statusMessage: `Não deu para salvar o rascunho: ${error.message}` })

  return { draft }
})

/** Exercícios ligados da assessoria (globais + próprios), filtrados pelo local de treino. */
async function carregarCatalogo(
  supabase: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>,
  orgId: string,
  local: 'academia' | 'casa' | 'livre' | null,
): Promise<ExercicioCatalogo[]> {
  const rows: Pick<Database['public']['Tables']['exercises']['Row'], 'id' | 'organization_id' | 'name_pt' | 'name_en' | 'category' | 'level' | 'equipment' | 'primary_muscles' | 'secondary_muscles'>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('exercises').select('id, organization_id, name_pt, name_en, category, level, equipment, primary_muscles, secondary_muscles')
      .order('id').range(from, from + 999)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const { data: ajustes } = await supabase
    .from('organization_exercises').select('exercise_id, enabled, custom_name').eq('organization_id', orgId)
  const porId = new Map((ajustes ?? []).map((a) => [a.exercise_id, a]))
  const permitidos = equipamentosPorLocal[local ?? 'academia']

  return rows
    .filter((r) => r.organization_id === null || r.organization_id === orgId)
    .filter((r) => porId.get(r.id)?.enabled !== false)
    // Exercício próprio da assessoria sempre entra; os globais passam pelos filtros.
    .filter((r) => r.organization_id !== null || categoriasParaTreino.includes(r.category ?? ''))
    .filter((r) => r.organization_id !== null || !permitidos || permitidos.includes(r.equipment ?? 'other'))
    .map((r) => ({
      id: r.id,
      nome: nomeExercicio(r, porId.get(r.id)?.custom_name),
      categoria: categoriaLabel[r.category ?? ''] ?? 'Musculação',
      equipamento: equipamentoLabel[r.equipment ?? ''] ?? 'Outro',
      musculos: r.primary_muscles.map((m) => musculoLabel[m] ?? m).join(', '),
      secundarios: r.secondary_muscles.map((m) => musculoLabel[m] ?? m).join(', '),
      nivel: nivelLabel[r.level ?? ''] ?? '-',
    }))
}
