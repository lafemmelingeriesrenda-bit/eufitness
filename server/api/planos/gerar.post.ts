// POST /api/planos/gerar { studentId, kind } → o agente monta o rascunho.
// Roda com a sessão de quem chamou: o RLS do Supabase decide o que pode.
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

const bodySchema = z.object({
  studentId: z.string().uuid(),
  kind: z.enum(['treino', 'dieta']),
  /** Pedido do profissional só para este aluno (opcional). */
  extra: z.string().max(1000).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Faça login para continuar' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Pedido inválido' })
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

  let draft: PlanContent
  try {
    draft = await gerarPlano(kind, anamnese, { instrucoes: instr?.instructions, extra: parsed.data.extra })
  } catch (error) {
    if (error instanceof AgenteError) throw createError({ statusCode: error.status, statusMessage: error.message })
    throw error
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
