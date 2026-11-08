import type { AnamneseAnswers } from '~~/app/types/database.types'

type Options<K extends keyof AnamneseAnswers> = { value: NonNullable<AnamneseAnswers[K]>; label: string; hint?: string }[]

export const goalOptions: Options<'goal'> = [
  { value: 'emagrecer', label: 'Emagrecer', hint: 'Perder gordura' },
  { value: 'massa', label: 'Ganhar massa', hint: 'Hipertrofia e força' },
  { value: 'condicionamento', label: 'Condicionamento', hint: 'Fôlego e disposição' },
  { value: 'saude', label: 'Saúde', hint: 'Qualidade de vida' },
]

export const sexOptions: Options<'sex'> = [
  { value: 'feminino', label: 'Feminino' },
  { value: 'masculino', label: 'Masculino' },
]

export const placeOptions: Options<'training_place'> = [
  { value: 'academia', label: 'Academia' },
  { value: 'casa', label: 'Em casa' },
  { value: 'livre', label: 'Ao ar livre' },
]

export const timeOptions: Options<'training_time'> = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
  { value: 'variado', label: 'Varia' },
]

export const experienceOptions: Options<'experience'> = [
  { value: 'iniciante', label: 'Iniciante', hint: 'Nunca treinei ou parei há mais de 6 meses' },
  { value: 'intermediario', label: 'Intermediário', hint: 'Treino com frequência há menos de 2 anos' },
  { value: 'avancado', label: 'Avançado', hint: 'Treino com frequência há mais de 2 anos' },
]

export const activityOptions: Options<'activity_level'> = [
  { value: 'sedentario', label: 'Sedentário', hint: 'Trabalho sentado, pouco movimento' },
  { value: 'leve', label: 'Leve', hint: 'Ando um pouco no dia a dia' },
  { value: 'moderado', label: 'Moderado', hint: 'Fico bastante em pé ou andando' },
  { value: 'intenso', label: 'Intenso', hint: 'Trabalho braçal ou muito ativo' },
]

export const sessionOptions = [30, 45, 60, 90]

export const anamneseSteps = [
  { title: 'Qual é o seu', accent: 'objetivo?' },
  { title: 'Fale um pouco', accent: 'sobre você' },
  { title: 'Como é sua', accent: 'rotina de treino?' },
  { title: 'Como está', accent: 'sua saúde?' },
  { title: 'Como você', accent: 'se alimenta?' },
  { title: 'E o seu', accent: 'dia a dia?' },
]

/** Campos obrigatórios de cada passo (1 a 6). */
export const requiredByStep: (keyof AnamneseAnswers)[][] = [
  ['goal'],
  ['sex', 'birth_date', 'height_cm', 'weight_kg'],
  ['training_days', 'training_place', 'session_minutes', 'training_time', 'experience'],
  [],
  ['meals_per_day'],
  ['activity_level', 'sleep_hours'],
]

export function missingInStep(answers: Partial<AnamneseAnswers>, step: number) {
  return (requiredByStep[step - 1] ?? []).filter((k) => answers[k] === null || answers[k] === undefined || answers[k] === '')
}

export function labelOf<K extends keyof AnamneseAnswers>(options: Options<K>, value: AnamneseAnswers[K]) {
  return options.find((o) => o.value === value)?.label ?? ''
}

export function ageFrom(birthDate: string | null) {
  if (!birthDate) return null
  const b = new Date(`${birthDate}T12:00`)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--
  return age
}

/** Etiquetas curtas para o resumo no painel dos profissionais. */
export function anamneseChips(a: AnamneseAnswers) {
  const age = ageFrom(a.birth_date)
  return [
    labelOf(goalOptions, a.goal),
    age !== null ? `${age} anos` : '',
    a.training_days ? `${a.training_days}x por semana` : '',
    labelOf(placeOptions, a.training_place),
    a.session_minutes ? `${a.session_minutes} min por treino` : '',
    a.training_time ? `Treina ${labelOf(timeOptions, a.training_time).toLowerCase()}` : '',
  ].filter(Boolean)
}

/** Pontos de atenção: dores, condições, remédios e restrições alimentares. */
export function anamneseCares(a: AnamneseAnswers) {
  return [a.pain, a.conditions, a.medications, a.diet_restrictions].map((t) => t?.trim()).filter(Boolean) as string[]
}
