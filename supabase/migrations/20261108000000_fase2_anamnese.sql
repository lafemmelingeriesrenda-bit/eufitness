-- Eu Fitness · Fase 2: anamnese do aluno.
-- Rode depois da fase 1. Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez.

-- Uma anamnese por aluno. O aluno preenche em 6 passos e o app salva a cada
-- passo (step guarda até onde ele foi). submitted_at marca o envio final.
create table public.anamneses (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- 1. Objetivo
  goal text check (goal in ('emagrecer', 'massa', 'condicionamento', 'saude')),
  goal_notes text check (length(goal_notes) <= 500),

  -- 2. Corpo
  sex text check (sex in ('feminino', 'masculino')),
  birth_date date check (birth_date between '1900-01-01' and current_date),
  height_cm smallint check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 350),

  -- 3. Rotina de treino
  training_days smallint check (training_days between 1 and 7),
  training_place text check (training_place in ('academia', 'casa', 'livre')),
  session_minutes smallint check (session_minutes between 15 and 240),
  training_time text check (training_time in ('manha', 'tarde', 'noite', 'variado')),
  experience text check (experience in ('iniciante', 'intermediario', 'avancado')),

  -- 4. Saúde
  pain text check (length(pain) <= 1000),
  conditions text check (length(conditions) <= 1000),
  medications text check (length(medications) <= 1000),

  -- 5. Alimentação
  diet_restrictions text check (length(diet_restrictions) <= 1000),
  food_dislikes text check (length(food_dislikes) <= 1000),
  meals_per_day smallint check (meals_per_day between 1 and 10),
  water_liters numeric(3, 1) check (water_liters between 0 and 10),

  -- 6. Dia a dia
  activity_level text check (activity_level in ('sedentario', 'leve', 'moderado', 'intenso')),
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 24),
  notes text check (length(notes) <= 2000),

  step smallint not null default 1 check (step between 1 and 6),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index anamneses_org_idx on public.anamneses (organization_id);

create trigger anamneses_touch before update on public.anamneses
  for each row execute function public.touch_updated_at();

-- Quem pode ler a anamnese de um aluno: o próprio aluno, os profissionais
-- com vínculo ativo com ele e o administrador da assessoria.
create or replace function public.can_see_student(org uuid, student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select student = (select auth.uid())
    or public.is_admin(org)
    or exists (
      select 1 from public.coach_students cs
      where cs.organization_id = org and cs.student_id = student
        and cs.professional_id = (select auth.uid()) and cs.status = 'ativo'
    );
$$;

alter table public.anamneses enable row level security;

create policy "ver anamnese" on public.anamneses
  for select to authenticated using (public.can_see_student(organization_id, student_id));

create policy "aluno cria a própria anamnese" on public.anamneses
  for insert to authenticated with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.memberships m
      where m.organization_id = anamneses.organization_id
        and m.user_id = (select auth.uid()) and m.role = 'aluno'
    )
  );

create policy "aluno edita a própria anamnese" on public.anamneses
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- O aluno não pode trocar de dono nem de assessoria depois de criada.
revoke update on public.anamneses from authenticated, anon;
grant update (
  goal, goal_notes, sex, birth_date, height_cm, weight_kg,
  training_days, training_place, session_minutes, training_time, experience,
  pain, conditions, medications,
  diet_restrictions, food_dislikes, meals_per_day, water_liters,
  activity_level, sleep_hours, notes, step, submitted_at
) on public.anamneses to authenticated;
