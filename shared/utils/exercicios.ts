// Catálogo de exercícios: rótulos em português e regras de filtro.
// Os valores em inglês vêm do free-exercise-db (domínio público).

export const musculoLabel: Record<string, string> = {
  abdominals: 'Abdômen',
  abductors: 'Abdutores',
  adductors: 'Adutores',
  biceps: 'Bíceps',
  calves: 'Panturrilha',
  chest: 'Peito',
  forearms: 'Antebraço',
  glutes: 'Glúteos',
  hamstrings: 'Posterior de coxa',
  lats: 'Dorsal',
  'lower back': 'Lombar',
  'middle back': 'Meio das costas',
  neck: 'Pescoço',
  quadriceps: 'Quadríceps',
  shoulders: 'Ombros',
  traps: 'Trapézio',
  triceps: 'Tríceps',
}

export const equipamentoLabel: Record<string, string> = {
  bands: 'Elástico',
  barbell: 'Barra',
  'body only': 'Peso do corpo',
  cable: 'Polia / cabo',
  dumbbell: 'Halter',
  'e-z curl bar': 'Barra W',
  'exercise ball': 'Bola suíça',
  'foam roll': 'Rolo de espuma',
  kettlebells: 'Kettlebell',
  machine: 'Máquina',
  'medicine ball': 'Medicine ball',
  other: 'Outro',
}

export const nivelLabel: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  expert: 'Avançado',
}

export const categoriaLabel: Record<string, string> = {
  strength: 'Musculação',
  cardio: 'Cardio',
  plyometrics: 'Pliometria',
  stretching: 'Alongamento',
  powerlifting: 'Powerlifting',
  'olympic weightlifting': 'Levantamento olímpico',
  strongman: 'Strongman',
}

export const musculosLista = Object.keys(musculoLabel)
export const equipamentosLista = Object.keys(equipamentoLabel)

/** Equipamentos que costumam existir em cada local de treino da anamnese. */
export const equipamentosPorLocal: Record<'academia' | 'casa' | 'livre', string[] | null> = {
  academia: null, // tudo
  casa: ['body only', 'dumbbell', 'bands', 'kettlebells', 'exercise ball', 'medicine ball', 'foam roll', 'other'],
  livre: ['body only', 'bands', 'other'],
}

/** Categorias que o agente usa para montar treino (sem strongman, olímpico etc.). */
export const categoriasParaTreino = ['strength', 'cardio', 'plyometrics', 'powerlifting']

export type ExercicioRow = {
  id: string
  organization_id: string | null
  name_en: string | null
  name_pt: string | null
  category: string | null
  level: string | null
  equipment: string | null
  primary_muscles: string[]
  images: string[]
}

/** Nome que aparece no app: o da assessoria, senão o traduzido, senão o original. */
export function nomeExercicio(e: { name_pt: string | null; name_en: string | null }, customName?: string | null) {
  return customName?.trim() || e.name_pt || e.name_en || 'Exercício'
}

/** Link do YouTube → link de incorporação (para tocar dentro do app). */
export function youtubeEmbed(url: string | null | undefined) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
}
