// Formato dos planos de treino e dieta. O mesmo esquema serve para o agente
// (resposta em JSON do DeepSeek, conferida com estes esquemas), para a tela de revisão e para a tela do aluno.
import { z } from 'zod'

export const exercicioSchema = z.object({
  nome: z.string().describe('Nome do exercício em português, como os alunos conhecem. Ex.: "Supino reto com barra"'),
  series: z.number().int().describe('Número de séries'),
  repeticoes: z.string().describe('Repetições ou tempo. Ex.: "8 a 12", "15", "40 s"'),
  descanso_seg: z.number().int().describe('Descanso entre séries, em segundos'),
  observacao: z.string().describe('Dica curta de execução ou cuidado; vazio se não houver'),
})

export const treinoSchema = z.object({
  resumo: z.string().describe('Duas ou três frases para o aluno explicando a lógica do treino'),
  dias: z.array(z.object({
    nome: z.string().describe('Ex.: "Treino A"'),
    foco: z.string().describe('Grupos trabalhados. Ex.: "Peito, ombro e tríceps"'),
    exercicios: z.array(exercicioSchema),
  })).describe('Uma divisão por dia de treino da semana'),
  orientacoes: z.array(z.string()).describe('Orientações gerais para o aluno: aquecimento, progressão, cardio'),
  alertas_para_profissional: z.array(z.string()).describe('Pontos que o personal deve conferir antes de aprovar (dores, condições, dúvidas da anamnese). Não aparece para o aluno.'),
})

export const dietaSchema = z.object({
  resumo: z.string().describe('Duas ou três frases para o aluno explicando a estratégia da dieta'),
  calorias_kcal: z.number().int().describe('Meta diária de calorias'),
  proteina_g: z.number().int(),
  carboidrato_g: z.number().int(),
  gordura_g: z.number().int(),
  refeicoes: z.array(z.object({
    nome: z.string().describe('Ex.: "Café da manhã"'),
    horario: z.string().describe('Horário sugerido no formato HH:MM'),
    itens: z.array(z.object({
      alimento: z.string(),
      quantidade: z.string().describe('Medida caseira e gramas. Ex.: "2 colheres de sopa (30 g)"'),
    })),
    observacao: z.string().describe('Substituições ou dica; vazio se não houver'),
  })),
  orientacoes: z.array(z.string()).describe('Orientações gerais: água, temperos, como substituir'),
  alertas_para_profissional: z.array(z.string()).describe('Pontos que o nutricionista deve conferir antes de aprovar (alergias, condições, remédios, dúvidas). Não aparece para o aluno.'),
})

export type Treino = z.infer<typeof treinoSchema>
export type Dieta = z.infer<typeof dietaSchema>
export type PlanKind = 'treino' | 'dieta'
export type PlanContent = Treino | Dieta

export const planLabel: Record<PlanKind, string> = { treino: 'Treino', dieta: 'Dieta' }

export function emptyTreino(): Treino {
  return { resumo: '', dias: [{ nome: 'Treino A', foco: '', exercicios: [] }], orientacoes: [], alertas_para_profissional: [] }
}

export function emptyDieta(): Dieta {
  return {
    resumo: '', calorias_kcal: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0,
    refeicoes: [], orientacoes: [], alertas_para_profissional: [],
  }
}
