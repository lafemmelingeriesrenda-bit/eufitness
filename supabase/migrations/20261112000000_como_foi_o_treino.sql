-- Eu Fitness · "Como foi o treino?" no fim de cada treino do aluno.
-- leve | na_medida | pesado. O personal vê na ficha do aluno.

alter table public.workout_logs
  add column feeling text check (feeling in ('leve', 'na_medida', 'pesado'));

grant update (feeling) on public.workout_logs to authenticated;
