-- Eu Fitness · As funções que checam permissão só servem para as regras de
-- acesso (RLS) de quem está logado. Tira a execução de quem não fez login.
-- Rode depois da fase 2.

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.is_professional(uuid) from public, anon;
revoke execute on function public.can_see_profile(uuid) from public, anon;
revoke execute on function public.can_see_student(uuid, uuid) from public, anon;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_professional(uuid) to authenticated;
grant execute on function public.can_see_profile(uuid) to authenticated;
grant execute on function public.can_see_student(uuid, uuid) to authenticated;
