-- Eu Fitness · Fase 3: planos de treino e dieta.
-- O agente escreve um rascunho (draft); o profissional revisa, edita e aprova.
-- Aprovar copia o rascunho para published, que é o que o aluno vê.
-- Rode depois das migrações anteriores.

create type public.plan_kind as enum ('treino', 'dieta');

create table public.plans (
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind public.plan_kind not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- Rascunho em revisão. Só profissionais veem.
  draft jsonb,
  draft_by_agent boolean not null default false,
  draft_updated_at timestamptz,
  draft_updated_by uuid references public.profiles (id) on delete set null,

  -- Versão aprovada que o aluno recebe.
  published jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  primary key (student_id, kind)
);
create index plans_org_idx on public.plans (organization_id);
create index plans_draft_by_idx on public.plans (draft_updated_by);
create index plans_published_by_idx on public.plans (published_by);

-- Quem pode montar e aprovar cada plano:
--   treino: personal com vínculo ativo com o aluno, ou o admin da assessoria;
--   dieta: nutricionista com vínculo ativo com o aluno.
create or replace function public.can_manage_plan(org uuid, student uuid, k public.plan_kind)
returns boolean language sql stable security definer set search_path = '' as $$
  select case k
    when 'treino' then public.is_admin(org) or exists (
      select 1 from public.coach_students cs
      join public.memberships m on m.organization_id = cs.organization_id and m.user_id = cs.professional_id
      where cs.organization_id = org and cs.student_id = student and cs.status = 'ativo'
        and cs.professional_id = (select auth.uid()) and m.role = 'personal'
    )
    when 'dieta' then exists (
      select 1 from public.coach_students cs
      join public.memberships m on m.organization_id = cs.organization_id and m.user_id = cs.professional_id
      where cs.organization_id = org and cs.student_id = student and cs.status = 'ativo'
        and cs.professional_id = (select auth.uid()) and m.role = 'nutri'
    )
  end;
$$;

alter table public.plans enable row level security;

-- Profissionais com vínculo (e o admin) leem os dois planos do aluno, rascunho
-- incluído. O aluno não lê esta tabela: recebe só a versão aprovada por my_plans().
create policy "profissionais veem planos" on public.plans
  for select to authenticated using (
    student_id <> (select auth.uid()) and public.can_see_student(organization_id, student_id)
  );

create policy "quem gerencia cria o plano" on public.plans
  for insert to authenticated with check (
    public.can_manage_plan(organization_id, student_id, kind)
    and exists (
      select 1 from public.memberships m
      where m.organization_id = plans.organization_id and m.user_id = plans.student_id and m.role = 'aluno'
    )
  );

create policy "quem gerencia edita o rascunho" on public.plans
  for update to authenticated
  using (public.can_manage_plan(organization_id, student_id, kind))
  with check (public.can_manage_plan(organization_id, student_id, kind));

-- Pelo app só dá para mexer no rascunho. Publicar é pela função approve_plan.
revoke update on public.plans from authenticated, anon;
grant update (draft, draft_by_agent, draft_updated_at, draft_updated_by) on public.plans to authenticated;

-- Aprova o rascunho: vira a versão que o aluno vê.
create or replace function public.approve_plan(student uuid, k public.plan_kind)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  p public.plans%rowtype;
begin
  select * into p from public.plans where student_id = student and kind = k for update;
  if not found or p.draft is null then
    raise exception 'Não há rascunho para aprovar';
  end if;
  if not public.can_manage_plan(p.organization_id, student, k) then
    raise exception 'Você não pode aprovar este plano';
  end if;

  update public.plans
  set published = p.draft, published_at = now(), published_by = (select auth.uid())
  where student_id = student and kind = k;
  return now();
end;
$$;

-- O que o aluno logado recebe: só as versões aprovadas, com quem aprovou.
create or replace function public.my_plans()
returns table (kind public.plan_kind, content jsonb, published_at timestamptz, published_by_name text)
language sql stable security definer set search_path = '' as $$
  select p.kind, p.published, p.published_at, pr.full_name
  from public.plans p
  left join public.profiles pr on pr.id = p.published_by
  where p.student_id = (select auth.uid()) and p.published is not null;
$$;

revoke execute on function public.can_manage_plan(uuid, uuid, public.plan_kind) from public, anon;
revoke execute on function public.approve_plan(uuid, public.plan_kind) from public, anon;
revoke execute on function public.my_plans() from public, anon;
grant execute on function public.can_manage_plan(uuid, uuid, public.plan_kind) to authenticated;
grant execute on function public.approve_plan(uuid, public.plan_kind) to authenticated;
grant execute on function public.my_plans() to authenticated;
