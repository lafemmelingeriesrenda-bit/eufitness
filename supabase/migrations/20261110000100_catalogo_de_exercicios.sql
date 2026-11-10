-- Eu Fitness · Catálogo de exercícios.
-- Base global importada do free-exercise-db (domínio público, Unlicense):
-- https://github.com/yuhonas/free-exercise-db. Cada assessoria pode criar
-- exercícios próprios, desligar os que não usa, renomear e colocar vídeo.
-- Rode depois das migrações anteriores.

create table public.exercises (
  id text primary key check (id ~ '^[A-Za-z0-9_\-]{1,120}$'),
  -- null = catálogo global; preenchido = exercício próprio da assessoria
  organization_id uuid references public.organizations (id) on delete cascade,
  name_en text,
  name_pt text check (length(name_pt) <= 120),
  category text,
  level text,
  equipment text,
  mechanic text,
  force text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  instructions_en text[] not null default '{}',
  instructions_pt text[] not null default '{}',
  images text[] not null default '{}',
  source text not null default 'proprio',
  created_at timestamptz not null default now(),
  check (name_pt is not null or name_en is not null)
);
create index exercises_org_idx on public.exercises (organization_id);

-- Ajustes da assessoria sobre cada exercício (global ou próprio).
create table public.organization_exercises (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  exercise_id text not null references public.exercises (id) on delete cascade,
  enabled boolean not null default true,
  custom_name text check (length(custom_name) <= 120),
  video_url text check (video_url ~ '^https://' and length(video_url) <= 500),
  updated_at timestamptz not null default now(),
  primary key (organization_id, exercise_id)
);
create index organization_exercises_exercise_idx on public.organization_exercises (exercise_id);

create trigger organization_exercises_touch before update on public.organization_exercises
  for each row execute function public.touch_updated_at();

alter table public.exercises enable row level security;
alter table public.organization_exercises enable row level security;

-- Catálogo global: qualquer pessoa logada lê. Exercício próprio: só a assessoria.
create policy "ver exercícios" on public.exercises
  for select to authenticated using (organization_id is null or public.is_member(organization_id));

-- Exercícios próprios: o admin da assessoria cria, edita e apaga.
-- Catálogo global: só o dono da plataforma (importar e traduzir).
create policy "criar exercícios" on public.exercises
  for insert to authenticated with check (
    (organization_id is not null and public.is_admin(organization_id))
    or (organization_id is null and public.is_platform_admin())
  );
create policy "editar exercícios" on public.exercises
  for update to authenticated
  using ((organization_id is not null and public.is_admin(organization_id)) or (organization_id is null and public.is_platform_admin()))
  with check ((organization_id is not null and public.is_admin(organization_id)) or (organization_id is null and public.is_platform_admin()));
create policy "apagar exercícios próprios" on public.exercises
  for delete to authenticated using (organization_id is not null and public.is_admin(organization_id));

-- Ninguém troca um exercício de assessoria nem muda o id depois de criado.
revoke update on public.exercises from authenticated, anon;
grant update (name_pt, category, level, equipment, mechanic, force, primary_muscles, secondary_muscles, instructions_pt, images)
  on public.exercises to authenticated;

create policy "ver ajustes da assessoria" on public.organization_exercises
  for select to authenticated using (public.is_member(organization_id));
create policy "admin cria ajustes" on public.organization_exercises
  for insert to authenticated with check (public.is_admin(organization_id));
create policy "admin edita ajustes" on public.organization_exercises
  for update to authenticated using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));
create policy "admin apaga ajustes" on public.organization_exercises
  for delete to authenticated using (public.is_admin(organization_id));

revoke update on public.organization_exercises from authenticated, anon;
grant update (enabled, custom_name, video_url) on public.organization_exercises to authenticated;
