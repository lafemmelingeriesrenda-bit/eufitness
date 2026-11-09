-- Eu Fitness · Registro dos treinos feitos pelo aluno.
-- Cada sessão guarda o dia do plano e as séries feitas, com carga e repetições.
-- Rode depois das migrações anteriores.

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 13),
  day_name text not null check (length(day_name) <= 80),
  -- [{ "exercicio": "Supino", "series": [{ "reps": "10", "carga_kg": 20, "feita": true }] }]
  exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (finished_at is null or finished_at >= started_at)
);
create index workout_logs_student_idx on public.workout_logs (student_id, started_at desc);
create index workout_logs_org_idx on public.workout_logs (organization_id);

alter table public.workout_logs enable row level security;

-- Aluno vê os próprios; profissionais com vínculo e o admin também.
create policy "ver treinos feitos" on public.workout_logs
  for select to authenticated using (public.can_see_student(organization_id, student_id));

create policy "aluno registra o próprio treino" on public.workout_logs
  for insert to authenticated with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.memberships m
      where m.organization_id = workout_logs.organization_id
        and m.user_id = (select auth.uid()) and m.role = 'aluno'
    )
  );

create policy "aluno atualiza o próprio treino" on public.workout_logs
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy "aluno apaga o próprio treino" on public.workout_logs
  for delete to authenticated using (student_id = (select auth.uid()));

revoke update on public.workout_logs from authenticated, anon;
grant update (exercises, finished_at) on public.workout_logs to authenticated;
