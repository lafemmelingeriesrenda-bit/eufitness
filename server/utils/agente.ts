// O agente: monta o rascunho do treino ou da dieta a partir da anamnese.
// Usa o Claude (API da Anthropic) com saída estruturada: a API garante que a
// resposta segue o esquema zod de shared/utils/planos.ts.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { AnamneseAnswers } from '~~/app/types/database.types'
import { PROMPT_TREINO } from './prompts/treino'

const MODEL = 'claude-opus-5-5'

// Treino: o texto completo está em server/utils/prompts/treino.ts.
const SYSTEM_TREINO = PROMPT_TREINO

const SYSTEM_DIETA = `Você é o assistente de um nutricionista brasileiro. A partir da anamnese de um paciente que também treina, monte um RASCUNHO de plano alimentar para o nutricionista revisar, editar e aprovar antes de o paciente receber.

Regras:
- Estime o gasto energético com Mifflin-St Jeor e o nível de atividade e de treino informados, e ajuste ao objetivo: déficit moderado para emagrecer, superávit leve para ganhar massa, manutenção para condicionamento ou saúde. Proteína entre 1,6 e 2,2 g por kg.
- Use exatamente o número de refeições por dia informado, com horários coerentes com o horário de treino.
- Respeite TODAS as alergias, intolerâncias, restrições e alimentos que a pessoa não come. Nunca inclua um alimento que conflite com elas.
- Use comida brasileira do dia a dia, fácil de achar e de preparar, com medida caseira e gramas.
- Confira que a soma aproximada das refeições bate com as metas de calorias e macronutrientes.
- Condições de saúde e remédios que afetam a dieta (diabetes, hipertensão, doença renal, gestação, anticoagulantes): seja conservador e registre o ponto em alertas_para_profissional. Nunca faça diagnóstico.
- Escreva para um leigo, em português do Brasil, com frases curtas.`

/** Respostas que vão para o agente, sem nome nem contatos do aluno. */
function anamneseParaAgente(a: AnamneseAnswers) {
  return {
    idade: ageFrom(a.birth_date),
    sexo: a.sex,
    altura_cm: a.height_cm,
    peso_kg: a.weight_kg !== null ? Number(a.weight_kg) : null,
    objetivo: labelOf(goalOptions, a.goal),
    objetivo_detalhes: a.goal_notes,
    dias_de_treino_por_semana: a.training_days,
    local_de_treino: labelOf(placeOptions, a.training_place),
    minutos_por_treino: a.session_minutes,
    horario_de_treino: labelOf(timeOptions, a.training_time),
    experiencia: labelOf(experienceOptions, a.experience),
    dores_ou_lesoes: a.pain,
    condicoes_de_saude: a.conditions,
    remedios_e_suplementos: a.medications,
    alergias_intolerancias_restricoes: a.diet_restrictions,
    alimentos_que_nao_come: a.food_dislikes,
    refeicoes_por_dia: a.meals_per_day,
    agua_litros_por_dia: a.water_liters !== null ? Number(a.water_liters) : null,
    atividade_fora_do_treino: labelOf(activityOptions, a.activity_level),
    horas_de_sono: a.sleep_hours !== null ? Number(a.sleep_hours) : null,
    observacoes: a.notes,
  }
}

export class AgenteError extends Error {
  constructor(message: string, public status = 502) {
    super(message)
  }
}

/**
 * Instruções do profissional: o "jeito" dele de montar planos (tela Agente) e,
 * opcionalmente, um pedido só para este aluno. Entram depois das regras base;
 * as regras de segurança (dores, alergias, condições) continuam valendo.
 */
function instrucoesDoProfissional(kind: PlanKind, geral?: string | null, extra?: string | null) {
  const quem = kind === 'treino' ? 'personal' : 'nutricionista'
  let texto = ''
  if (geral?.trim()) {
    texto += `Instruções do ${quem} responsável (siga em todo plano dele):\n"""\n${geral.trim()}\n"""\n\n`
  }
  if (extra?.trim()) {
    texto += `Pedido do ${quem} só para este aluno (tem prioridade sobre as instruções gerais):\n"""\n${extra.trim()}\n"""\n\n`
  }
  if (texto) {
    texto += `Se alguma instrução do ${quem} conflitar com a segurança do aluno (dores, lesões, alergias, condições de saúde), priorize a segurança e explique o conflito em alertas_para_profissional.`
  }
  return texto.trim()
}

/**
 * Chama o Claude com saída estruturada e devolve o objeto já conferido.
 * `system` vem em partes: as que se repetem entre pedidos (prompt e catálogo)
 * ficam em cache por 5 minutos, o que barateia gerações seguidas.
 */
export async function pedirJson<T>(
  system: { texto: string; cache?: boolean }[],
  user: string,
  schema: z.ZodType<T>,
  opcoes: { maxTokens?: number; effort?: 'low' | 'medium' | 'high' } = {},
): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgenteError('O agente ainda não está configurado: falta a variável ANTHROPIC_API_KEY na Vercel.', 503)
  }
  const client = new Anthropic({ timeout: 240_000, maxRetries: 1 })

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: opcoes.maxTokens ?? 16000,
      // Se o Claude recusar o pedido, a própria API tenta com outro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: opcoes.effort ?? 'medium', format: betaZodOutputFormat(schema) },
      system: system
        .filter((s) => s.texto.trim())
        .map((s) => ({ type: 'text' as const, text: s.texto, ...(s.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) })),
      messages: [{ role: 'user', content: user }],
    })

    if (response.stop_reason === 'refusal') {
      throw new AgenteError('O agente não conseguiu montar este pedido. Monte à mão ou ajuste os dados e tente de novo.', 422)
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new AgenteError('O agente devolveu uma resposta incompleta. Tente de novo.')
    }
    return response.parsed_output as T
  } catch (error) {
    if (error instanceof AgenteError) throw error
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AgenteError('A chave da API da Anthropic é inválida. Confira ANTHROPIC_API_KEY na Vercel.', 503)
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new AgenteError('A chave da Anthropic não tem permissão para usar este modelo. Confira a conta em console.anthropic.com.', 503)
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AgenteError('O agente está com muitos pedidos agora. Espere um minuto e tente de novo.', 429)
    }
    if (error instanceof Anthropic.BadRequestError) {
      // Ex.: conta sem créditos. A mensagem da API diz o motivo.
      console.error('Pedido recusado pela API da Anthropic', error.status, error.message)
      throw new AgenteError('A API da Anthropic recusou o pedido. Confira se a conta tem créditos em console.anthropic.com.', 503)
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Erro na API da Anthropic', error.status, error.message)
      throw new AgenteError('O agente está fora do ar no momento. Tente de novo em alguns minutos.')
    }
    throw error
  }
}

/**
 * Um exercício do catálogo como o agente recebe:
 * "id | nome | categoria | equipamento | músculos principais | músculos secundários | nível".
 */
export type ExercicioCatalogo = {
  id: string
  nome: string
  categoria: string
  equipamento: string
  musculos: string
  secundarios: string
  nivel: string
}

/** Catálogo filtrado, no fim do prompt de sistema (seção 5 do prompt de treino). */
function catalogoParaAgente(catalogo: ExercicioCatalogo[]) {
  if (!catalogo.length) {
    return '\n\nCATÁLOGO DE EXERCÍCIOS: nenhum exercício disponível para este aluno. Não monte exercícios; explique a limitação em alertas_para_profissional.'
  }
  return `\n\nCATÁLOGO DE EXERCÍCIOS (já filtrado pelo sistema: exercícios ligados pela assessoria e compatíveis com o local de treino do aluno).
Formato de cada linha: id | nome | categoria | equipamento | músculos principais | músculos secundários | nível.
Use em "exercicio_id" exatamente o id (o texto antes do primeiro "|") e em "nome" exatamente o nome da mesma linha.
${catalogo.map((e) => `${e.id} | ${e.nome} | ${e.categoria} | ${e.equipamento} | ${e.musculos} | ${e.secundarios || '-'} | ${e.nivel}`).join('\n')}`
}


export async function gerarPlano(
  kind: PlanKind,
  anamnese: AnamneseAnswers,
  opcoes: {
    instrucoes?: string | null
    extra?: string | null
    catalogo?: ExercicioCatalogo[]
    /** Plano atual: quando vem, a operação é ATUALIZAR (ajustar), não CRIAR. */
    atual?: PlanContent
  } = {},
): Promise<PlanContent> {
  const schema: z.ZodType<PlanContent> = kind === 'treino' ? treinoSchema : dietaSchema
  // Ordem pensada para o cache: o que muda menos vem primeiro.
  const system = kind === 'treino'
    ? [
        { texto: SYSTEM_TREINO },
        { texto: catalogoParaAgente(opcoes.catalogo ?? []).trim(), cache: true },
        { texto: instrucoesDoProfissional(kind, opcoes.instrucoes, opcoes.atual ? null : opcoes.extra) },
      ]
    : [
        { texto: SYSTEM_DIETA, cache: true },
        { texto: instrucoesDoProfissional(kind, opcoes.instrucoes, opcoes.atual ? null : opcoes.extra) },
      ]
  const anamneseJson = JSON.stringify(anamneseParaAgente(anamnese), null, 2)
  const nomePlano = kind === 'treino' ? 'treino' : 'plano alimentar'

  let user: string
  if (opcoes.atual) {
    // Os avisos antigos saem: o agente escreve avisos novos para esta versão.
    const atual = { ...opcoes.atual, alertas_para_profissional: [] }
    user = `OPERAÇÃO: ${kind === 'treino' ? 'ATUALIZAR_TREINO' : 'ATUALIZAR_PLANO_ALIMENTAR'}

${kind === 'treino' ? 'Treino' : 'Plano alimentar'} atual do aluno (json):
${JSON.stringify(atual, null, 2)}

Pedido do ${kind === 'treino' ? 'personal' : 'nutricionista'} para esta atualização:
"""
${opcoes.extra?.trim() ?? ''}
"""

Anamnese do aluno (json):
${anamneseJson}

Ajuste o ${nomePlano} atual conforme o pedido. Preserve tudo o que continua adequado e modifique somente o que for necessário para atender ao pedido; não recomece o planejamento. Devolva o ${nomePlano} completo, já com as mudanças. No início do "resumo", diga em uma frase o que mudou nesta versão. Escreva todos os textos em português do Brasil.`
  } else {
    user = kind === 'treino'
      // Operação explícita, como pede a seção "Diretrizes para operações futuras" do prompt.
      ? `OPERAÇÃO: CRIAR_TREINO\n\nAnamnese do aluno (json):\n${anamneseJson}\n\nMonte o rascunho de treino. Escreva todos os textos em português do Brasil.`
      : `Anamnese do aluno (json):\n${anamneseJson}\n\nMonte o rascunho de plano alimentar.`
  }
  return pedirJson(system, user, schema, { effort: 'medium' })
}
