// O agente: monta o rascunho do treino ou da dieta a partir da anamnese.
// Usa a API do DeepSeek (compatível com a da OpenAI) no modo JSON. O DeepSeek
// não garante o formato, então o esquema vai no prompt e a resposta é conferida
// com o zod de shared/utils/planos.ts; se vier errada, pede de novo uma vez.
import OpenAI from 'openai'
import { z } from 'zod'
import type { AnamneseAnswers } from '~~/app/types/database.types'

// deepseek-flash é o modelo indicado pela documentação; dá para trocar por
// deepseek-v4-pro definindo DEEPSEEK_MODEL na Vercel.
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

const SYSTEM_TREINO = `Você é o assistente de um personal trainer brasileiro. A partir da anamnese de um aluno, monte um RASCUNHO de treino de musculação para o personal revisar, editar e aprovar antes de o aluno receber.

Regras:
- Respeite exatamente os dias por semana, o tempo por treino, o local (academia, casa ou ao ar livre, com o que esse local costuma ter) e o nível de experiência informados.
- Monte uma divisão por dia de treino. Para iniciantes, prefira treinos de corpo inteiro ou divisões simples, com exercícios guiados ou em máquina quando estiver na academia.
- Ajuste o volume ao tempo disponível: conte cerca de 2 a 3 minutos por série, incluindo o descanso.
- Dores, lesões e condições de saúde: evite ou adapte os exercícios que pioram o quadro, diga a adaptação no campo observacao e registre o ponto em alertas_para_profissional. Nunca faça diagnóstico.
- Use os nomes de exercícios como as academias brasileiras chamam.
- Escreva para um aluno leigo, em português do Brasil, com frases curtas.
- Se alguma resposta da anamnese parecer arriscada ou contraditória (gestação, cirurgia recente, doença cardíaca, idade avançada sem liberação médica), monte um plano conservador e explique em alertas_para_profissional.`

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

/** Instruções de formato: o esquema JSON exato que a resposta precisa seguir. */
function formatoJson(schema: z.ZodType) {
  return `\n\nResponda APENAS com um objeto json válido, sem texto antes ou depois, que siga exatamente este JSON Schema (todos os campos são obrigatórios; use "" ou [] quando não houver conteúdo):\n${JSON.stringify(z.toJSONSchema(schema))}`
}

export async function gerarPlano(kind: PlanKind, anamnese: AnamneseAnswers): Promise<PlanContent> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new AgenteError('O agente ainda não está configurado: falta a variável DEEPSEEK_API_KEY na Vercel.', 503)
  }

  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    timeout: 240_000,
    maxRetries: 1,
  })
  const schema: z.ZodType<PlanContent> = kind === 'treino' ? treinoSchema : dietaSchema

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: (kind === 'treino' ? SYSTEM_TREINO : SYSTEM_DIETA) + formatoJson(schema) },
    {
      role: 'user',
      content: `Anamnese do aluno (json):\n${JSON.stringify(anamneseParaAgente(anamnese), null, 2)}\n\nMonte o rascunho de ${kind === 'treino' ? 'treino' : 'plano alimentar'}.`,
    },
  ]

  try {
    // Até duas tentativas: se a primeira vier fora do formato, mostra o erro e pede de novo.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 8192,
      })
      const choice = response.choices[0]
      const text = choice?.message.content?.trim() ?? ''

      let problem: string
      if (choice?.finish_reason === 'length') {
        problem = 'A resposta foi cortada por ser longa demais. Seja mais conciso nas observações.'
      } else if (!text) {
        problem = 'A resposta veio vazia ou não era um json válido.'
      } else {
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        const parsed = schema.safeParse(json)
        if (parsed.success) return parsed.data
        problem = json === undefined
          ? 'A resposta não era um json válido.'
          : `O json não segue o esquema: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
        if (text) messages.push({ role: 'assistant', content: text })
      }
      messages.push({ role: 'user', content: `${problem} Responda de novo com o json completo e correto.` })
    }
    throw new AgenteError('O agente devolveu o plano em um formato inesperado. Tente gerar de novo.')
  } catch (error) {
    if (error instanceof AgenteError) throw error
    if (error instanceof OpenAI.AuthenticationError) {
      throw new AgenteError('A chave da API do DeepSeek é inválida. Confira DEEPSEEK_API_KEY na Vercel.', 503)
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new AgenteError('O agente está com muitos pedidos agora. Espere um minuto e tente de novo.', 429)
    }
    if (error instanceof OpenAI.APIError) {
      console.error('Erro na API do DeepSeek', error.status, error.message)
      // 402 = saldo insuficiente na conta do DeepSeek.
      if (error.status === 402) throw new AgenteError('A conta do DeepSeek está sem saldo. Recarregue em platform.deepseek.com.', 503)
      throw new AgenteError('O agente está fora do ar no momento. Tente de novo em alguns minutos.')
    }
    throw error
  }
}
