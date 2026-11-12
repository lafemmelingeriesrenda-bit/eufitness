// POST /api/admin/catalogo/traduzir { ids } → o agente traduz nome e
// instruções desses exercícios do catálogo global para o português do Brasil.
// Só o dono da plataforma pode chamar (o RLS também só deixa ele gravar).
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

const bodySchema = z.object({ ids: z.array(z.string().max(120)).min(1).max(20) })

const respostaSchema = z.object({
  itens: z.array(z.object({
    id: z.string(),
    nome: z.string().min(2).max(120).describe('Nome como as academias brasileiras chamam'),
    instrucoes: z.array(z.string()).describe('Passos traduzidos, na mesma ordem'),
  })),
})

const SYSTEM = `Você traduz um catálogo de exercícios de musculação do inglês para o português do Brasil, para um app usado por personal trainers brasileiros.

Regras:
- "nome": use o nome que as academias brasileiras realmente usam (ex.: "Barbell Bench Press - Medium Grip" → "Supino reto com barra"; "Leg Extensions" → "Cadeira extensora"; "Wide-Grip Lat Pulldown" → "Puxada frontal aberta"; "Seated Cable Rows" → "Remada baixa no cabo"; "Dumbbell Bicep Curl" → "Rosca direta com halteres"). Mantenha termos consagrados em inglês quando é assim que se fala no Brasil (ex.: "Leg press", "Crossover", "Stiff", "Kettlebell swing", "Burpee").
- Diferencie variações no nome (pegada, inclinação, equipamento, unilateral), para não haver dois exercícios com o mesmo nome.
- "instrucoes": traduza cada passo de forma clara e curta, na segunda pessoa ("Deite-se no banco…"), com o mesmo número de passos.
- Devolva todos os itens recebidos, com o mesmo "id".`

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Faça login para continuar' })

  const supabase = await serverSupabaseClient<Database>(event)
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Só o dono da plataforma traduz o catálogo' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Pedido inválido' })

  const { data: rows, error } = await supabase
    .from('exercises').select('id, name_en, instructions_en')
    .in('id', parsed.data.ids).is('organization_id', null).is('name_pt', null)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!rows?.length) return { traduzidos: 0 }

  let resposta: z.infer<typeof respostaSchema>
  try {
    resposta = await pedirJson(
      [{ texto: SYSTEM, cache: true }],
      `Traduza estes exercícios (json):\n${JSON.stringify(rows.map((r) => ({ id: r.id, nome: r.name_en, instrucoes: r.instructions_en })))}`,
      respostaSchema,
      { maxTokens: 16000, effort: 'low' },
    )
  } catch (e) {
    if (e instanceof AgenteError) throw createError({ statusCode: e.status, statusMessage: e.message })
    throw e
  }

  let traduzidos = 0
  for (const item of resposta.itens) {
    const original = rows.find((r) => r.id === item.id)
    if (!original) continue
    const { error: upErr } = await supabase
      .from('exercises')
      .update({
        name_pt: item.nome.trim(),
        // Só aceita as instruções se vierem completas; senão deixa vazio para traduzir de novo depois.
        instructions_pt: item.instrucoes.length === original.instructions_en.length ? item.instrucoes.map((s) => s.trim()) : [],
      })
      .eq('id', item.id)
    if (!upErr) traduzidos++
  }
  return { traduzidos }
})
