-- Eu Fitness · Instruções que cada profissional dá ao agente.
-- O personal escreve como quer os treinos; a nutri, como quer as dietas.
-- O agente segue essas instruções em todo rascunho que o profissional gerar.
-- Rode depois das migrações anteriores.

create table public.agent_instructions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.plan_kind not null,
  instructions text not null default '' check (length(instructions) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create trigger agent_instructions_touch before update on public.agent_instructions
  for each row execute function public.touch_updated_at();

alter table public.agent_instructions enable row level security;

-- Cada profissional só vê e altera as próprias instruções, e só do tipo que monta:
-- personal → treino; nutricionista → dieta.
create or replace function public.can_instruct(k public.plan_kind)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.role = case k when 'treino' then 'personal'::public.member_role else 'nutri'::public.member_role end
  );
$$;
revoke execute on function public.can_instruct(public.plan_kind) from public, anon;
grant execute on function public.can_instruct(public.plan_kind) to authenticated;

create policy "ver as próprias instruções" on public.agent_instructions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "criar as próprias instruções" on public.agent_instructions
  for insert to authenticated with check (user_id = (select auth.uid()) and public.can_instruct(kind));

create policy "editar as próprias instruções" on public.agent_instructions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_instruct(kind));

revoke update on public.agent_instructions from authenticated, anon;
grant update (instructions) on public.agent_instructions to authenticated;
