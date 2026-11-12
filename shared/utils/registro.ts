// Registro de um treino feito: o que o aluno fez em cada série.
import type { Treino } from './planos'
export type SerieFeita = { reps: string; carga_kg: number | null; feita: boolean }
export type ExercicioFeito = { exercicio: string; series: SerieFeita[] }

/** Monta o registro vazio de um dia do treino, já com as cargas da última vez. */
export function registroInicial(dia: Treino['dias'][number], anterior?: ExercicioFeito[] | null): ExercicioFeito[] {
  return dia.exercicios.map((ex) => {
    const ultima = anterior?.find((a) => a.exercicio === ex.nome)
    return {
      exercicio: ex.nome,
      series: Array.from({ length: Math.max(1, ex.series) }, (_, i) => ({
        reps: ultima?.series[i]?.reps ?? ex.repeticoes,
        carga_kg: ultima?.series[i]?.carga_kg ?? ultima?.series.at(-1)?.carga_kg ?? null,
        feita: false,
      })),
    }
  })
}

export function seriesFeitas(registro: ExercicioFeito[]) {
  return registro.reduce((n, ex) => n + ex.series.filter((s) => s.feita).length, 0)
}

/** Volume total (carga × repetições) das séries feitas, quando dá para calcular. */
export function volumeKg(registro: ExercicioFeito[]) {
  let total = 0
  for (const ex of registro) {
    for (const s of ex.series) {
      const reps = Number.parseInt(s.reps, 10)
      if (s.feita && s.carga_kg && Number.isFinite(reps)) total += s.carga_kg * reps
    }
  }
  return Math.round(total)
}

/** Dias seguidos (até hoje ou ontem) com pelo menos um treino concluído. */
export function diasSeguidos(datas: string[]) {
  const dias = new Set(datas.map((d) => new Date(d).toLocaleDateString('en-CA')))
  const cursor = new Date()
  if (!dias.has(cursor.toLocaleDateString('en-CA'))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (dias.has(cursor.toLocaleDateString('en-CA'))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

/** Primeiro número de um texto de repetições ("10 a 12" → 10). null se não houver ("40 s" → 40). */
export function numeroReps(reps: string) {
  const m = reps.match(/\d+/)
  return m ? Number(m[0]) : null
}

/** Tempo estimado do treino em minutos: ~40 s por série + descanso + 5 min de aquecimento. */
export function estimarMinutos(dia: Treino['dias'][number]) {
  const seg = dia.exercicios.reduce((n, ex) => n + ex.series * (40 + ex.descanso_seg), 0)
  return Math.max(5, Math.round(seg / 60) + 5)
}

/** Exercícios em que a maior carga de hoje passou a maior carga da última vez. */
export function recordes(hoje: ExercicioFeito[], anterior: ExercicioFeito[] | null | undefined) {
  if (!anterior?.length) return []
  const max = (ex?: ExercicioFeito) => Math.max(0, ...(ex?.series ?? []).filter((s) => s.feita).map((s) => Number(s.carga_kg) || 0))
  return hoje
    .map((ex) => {
      const antes = max(anterior.find((a) => a.exercicio === ex.exercicio))
      const agora = max(ex)
      return { exercicio: ex.exercicio, ganho: agora - antes, antes }
    })
    .filter((r) => r.antes > 0 && r.ganho > 0)
}
