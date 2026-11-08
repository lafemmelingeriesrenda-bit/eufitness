-- Eu Fitness · Dono da plataforma (super admin).
-- Vê todas as assessorias e pessoas pelo painel /admin. Só leitura por enquanto.
-- A lista é por e-mail, então vale mesmo antes de a pessoa criar a conta.

create table public.platform_admins (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

-- Ninguém lê nem altera esta tabela pelo app: só pelo SQL Editor.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

insert into public.platform_admins (email) values ('euthiagosilveira@gmail.com');

-- Quem está logado é dono da plataforma? Exige e-mail confirmado.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.platform_admins pa
    join auth.users u on lower(u.email) = pa.email
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;

-- Tudo o que o painel /admin mostra, numa chamada só.
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso só para o dono da plataforma';
  end if;

  return json_build_object(
    'organizations', coalesce((
      select json_agg(x order by x.created_at desc) from (
        select o.id, o.name, o.created_at,
          owner.full_name as owner_name,
          ou.email as owner_email,
          count(*) filter (where m.role = 'personal') as personais,
          count(*) filter (where m.role = 'nutri') as nutris,
          count(*) filter (where m.role = 'aluno') as alunos,
          (select count(*) from public.anamneses a
            where a.organization_id = o.id and a.submitted_at is not null) as anamneses_enviadas
        from public.organizations o
        join public.profiles owner on owner.id = o.owner_id
        join auth.users ou on ou.id = o.owner_id
        left join public.memberships m on m.organization_id = o.id
        group by o.id, owner.full_name, ou.email
      ) x
    ), '[]'::json),
    'users', coalesce((
      select json_agg(y order by y.created_at desc) from (
        select p.id, p.full_name, u.email, p.phone, u.created_at, u.last_sign_in_at,
          u.email_confirmed_at is not null as confirmed,
          coalesce((
            select json_agg(json_build_object('organization', o.name, 'role', m.role, 'is_admin', m.is_admin))
            from public.memberships m join public.organizations o on o.id = m.organization_id
            where m.user_id = p.id
          ), '[]'::json) as roles
        from public.profiles p
        join auth.users u on u.id = p.id
      ) y
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
