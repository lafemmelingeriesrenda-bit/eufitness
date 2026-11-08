// O agente: monta o rascunho do treino ou da dieta a partir da anamnese.
// Uma chamada ao Claude com saída estruturada no formato de shared/utils/planos.ts.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AnamneseAnswers } from '~~/app/types/database.types'

const MODEL = 'claude-opus-5-5'

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

export async function gerarPlano(kind: PlanKind, anamnese: AnamneseAnswers): Promise<PlanContent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgenteError('O agente ainda não está configurado: falta a variável ANTHROPIC_API_KEY na Vercel.', 503)
  }

  const client = new Anthropic()
  const schema = kind === 'treino' ? treinoSchema : dietaSchema

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system: kind === 'treino' ? SYSTEM_TREINO : SYSTEM_DIETA,
      messages: [{
        role: 'user',
        content: `Anamnese do aluno (JSON):\n${JSON.stringify(anamneseParaAgente(anamnese), null, 2)}\n\nMonte o rascunho de ${kind === 'treino' ? 'treino' : 'plano alimentar'}.`,
      }],
    })

    if (response.stop_reason === 'refusal') {
      throw new AgenteError('O agente não conseguiu montar este plano. Monte à mão ou ajuste a anamnese e tente de novo.', 422)
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new AgenteError('O agente devolveu uma resposta incompleta. Tente gerar de novo.')
    }
    return response.parsed_output as PlanContent
  } catch (error) {
    if (error instanceof AgenteError) throw error
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AgenteError('A chave da API da Anthropic é inválida. Confira ANTHROPIC_API_KEY na Vercel.', 503)
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AgenteError('O agente está com muitos pedidos agora. Espere um minuto e tente de novo.', 429)
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Erro na API do Claude', error.status, error.message)
      throw new AgenteError('O agente está fora do ar no momento. Tente de novo em alguns minutos.')
    }
    throw error
  }
}
