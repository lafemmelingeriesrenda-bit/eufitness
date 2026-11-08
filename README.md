# Eu Fitness

App de treino e dieta para personais, nutricionistas e alunos. O agente monta o plano a partir da anamnese e os profissionais aprovam antes de o aluno receber.

Stack: Nuxt 4 + Tailwind 4 + Supabase (Auth, Postgres com RLS). Hospedagem na Vercel.

## Como funciona (fase 1)

- **Personal** cria a conta em `/cadastro`, dá nome à assessoria e vira administrador dela.
- O personal gera **links de convite** (válidos por 7 dias, uso único) para alunos e para o nutricionista parceiro, e manda pelo WhatsApp.
- **Nutricionista** e **aluno** abrem o link, criam a conta e entram na assessoria. O aluno fica vinculado a quem convidou.
- No painel, o personal vincula o nutri a cada aluno. Cada um só enxerga o que deve: alunos não veem outros alunos, e ninguém vê outra assessoria.

Telas: `/login`, `/cadastro`, `/convite/[código]`, `/onboarding`, `/personal`, `/nutri`, `/aluno`, `/conta`.

## Fase 2: anamnese

- O **aluno** responde a anamnese em `/aluno/anamnese`, em 6 passos: objetivo, corpo, rotina de treino, saúde, alimentação e dia a dia. O app salva a cada passo, então dá para parar e continuar depois. Depois de enviar, o aluno ainda pode revisar as respostas.
- O **personal** e o **nutri** veem no painel quem já respondeu e abrem a ficha do aluno em `/alunos/[id]`, com peso, altura, IMC, objetivo, cuidados (dores, condições, remédios e restrições) e o resto das respostas.
- Só veem a anamnese o próprio aluno, os profissionais com vínculo ativo com ele e o administrador da assessoria.

## Dono da plataforma

- Quem está na tabela `platform_admins` (por e-mail) vê o painel `/admin` com todas as assessorias e pessoas. Por enquanto é só leitura.
- O e-mail precisa estar confirmado. Quem não tem assessoria cai direto em `/admin` ao entrar; quem também é personal vê um atalho com escudo no topo do painel.
- Para incluir outra pessoa, rode no SQL Editor: `insert into public.platform_admins (email) values ('email@exemplo.com');`

## Banco de dados

O esquema está em `supabase/migrations/`. Para aplicar, abra o projeto no Supabase, vá em **SQL Editor**, cole o conteúdo de cada arquivo, na ordem, e clique em **Run**.

## Rodar no computador

```bash
cp .env.example .env   # preencha a URL e a anon key
npm install
npm run dev            # http://localhost:3000
```

## Publicar na Vercel

Importe este repositório na Vercel (framework: Nuxt) e defina as variáveis `NUXT_PUBLIC_SUPABASE_URL` e `NUXT_PUBLIC_SUPABASE_KEY`. No Supabase, em **Authentication > URL Configuration**, coloque o endereço da Vercel em **Site URL** e `https://SEU-ENDERECO/confirm` em **Redirect URLs**.

## Protótipo das telas

O protótipo navegável continua em `docs/index.html` (publicado em https://eufitness.vercel.app/ por upload manual).
