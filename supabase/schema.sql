-- ============================================================
-- Pesquisa Eleitoral - Schema Supabase (PostgreSQL)
-- Rode no SQL Editor do Supabase.
-- ============================================================

-- Extensao para gen_random_uuid() (geralmente ja vem habilitada)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabela: pesquisa_votos
-- ------------------------------------------------------------
create table if not exists public.pesquisa_votos (
  id                uuid primary key default gen_random_uuid(),
  session_cookie    text not null,
  thumbmark_id      text,
  context_hash      text not null,
  ip_address        text,
  cidade            text,
  regiao            text,
  pais              text,
  faixa_etaria      text,
  genero            text,
  senador_vaga_1    text,
  senador_vaga_2    text,
  governador        text,
  presidente        text,
  temas_melhorar    text[],
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Migracao para tabelas JA existentes (idempotente).
-- Precisa vir ANTES dos indices/views, pois o "create table if not exists"
-- nao altera uma tabela que ja existe. Seguro reexecutar sempre.
-- ------------------------------------------------------------
alter table public.pesquisa_votos add column if not exists ip_address     text;
alter table public.pesquisa_votos add column if not exists cidade         text;
alter table public.pesquisa_votos add column if not exists regiao         text;
alter table public.pesquisa_votos add column if not exists pais           text;
alter table public.pesquisa_votos add column if not exists faixa_etaria   text;
alter table public.pesquisa_votos add column if not exists genero         text;
alter table public.pesquisa_votos add column if not exists temas_melhorar text[];

-- Coluna antiga, nao mais usada (cargo de Deputado Federal removido).
-- Descomente para apagar de vez (isto REMOVE os dados dessa coluna):
-- alter table public.pesquisa_votos drop column if exists deputado_federal;

-- Garante 1 voto por cookie de sessao.
create unique index if not exists pesquisa_votos_session_cookie_key
  on public.pesquisa_votos (session_cookie);

-- Garante 1 voto por combinacao dispositivo + contexto (IP+UA).
-- Bloqueia aba anonima / cookie limpo na mesma rede e mesmo aparelho.
create unique index if not exists pesquisa_votos_device_context_key
  on public.pesquisa_votos (thumbmark_id, context_hash);

create index if not exists pesquisa_votos_created_at_idx
  on public.pesquisa_votos (created_at);

-- Acelera auditoria/contagem de votos por IP.
create index if not exists pesquisa_votos_ip_address_idx
  on public.pesquisa_votos (ip_address);

-- ------------------------------------------------------------
-- Tabela: pesquisa_leads
-- ------------------------------------------------------------
create table if not exists public.pesquisa_leads (
  id          uuid primary key default gen_random_uuid(),
  voto_id     uuid not null references public.pesquisa_votos (id) on delete cascade,
  contato     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists pesquisa_leads_voto_id_idx
  on public.pesquisa_leads (voto_id);

-- ------------------------------------------------------------
-- Row Level Security
-- As Server Actions usam a service_role key, que ignora RLS.
-- Habilitamos RLS e NAO criamos policies publicas: assim a anon key
-- (exposta no client) nao consegue ler nem escrever nada diretamente.
-- ------------------------------------------------------------
alter table public.pesquisa_votos enable row level security;
alter table public.pesquisa_leads enable row level security;

-- ------------------------------------------------------------
-- Views de resultado (apuracao agregada para dashboards internos).
-- IMPORTANTE: views nao tem RLS. Usamos "security_invoker = on" para que
-- respeitem o RLS da tabela base (quem consulta como anon nao ve nada) e,
-- abaixo, revogamos o acesso de anon/authenticated de vez.
-- ------------------------------------------------------------
create or replace view public.resultado_presidente
  with (security_invoker = on) as
  select presidente as candidato, count(*) as votos
  from public.pesquisa_votos
  where presidente is not null
  group by presidente
  order by votos desc;

create or replace view public.resultado_governador
  with (security_invoker = on) as
  select governador as candidato, count(*) as votos
  from public.pesquisa_votos
  where governador is not null
  group by governador
  order by votos desc;

-- Senado: soma os dois votos (vaga 1 + vaga 2) por candidato.
create or replace view public.resultado_senado
  with (security_invoker = on) as
  select candidato, count(*) as votos
  from (
    select senador_vaga_1 as candidato from public.pesquisa_votos where senador_vaga_1 is not null
    union all
    select senador_vaga_2 as candidato from public.pesquisa_votos where senador_vaga_2 is not null
  ) s
  group by candidato
  order by votos desc;

-- Temas mais citados (desmembra o array).
create or replace view public.resultado_temas
  with (security_invoker = on) as
  select unnest(temas_melhorar) as tema, count(*) as votos
  from public.pesquisa_votos
  where temas_melhorar is not null
  group by tema
  order by votos desc;

-- Demografia.
create or replace view public.resultado_faixa_etaria
  with (security_invoker = on) as
  select faixa_etaria, count(*) as votos
  from public.pesquisa_votos
  where faixa_etaria is not null
  group by faixa_etaria
  order by faixa_etaria;

create or replace view public.resultado_genero
  with (security_invoker = on) as
  select genero, count(*) as votos
  from public.pesquisa_votos
  where genero is not null
  group by genero
  order by votos desc;

-- Auditoria: quantos votos por IP (para identificar abuso e limpar manualmente).
create or replace view public.votos_por_ip
  with (security_invoker = on) as
  select ip_address, count(*) as votos, min(created_at) as primeiro, max(created_at) as ultimo
  from public.pesquisa_votos
  group by ip_address
  order by votos desc;

-- Remove o acesso das views pela API publica (chaves anon/authenticated).
-- Ficam acessiveis apenas via service_role (server-side) e SQL Editor.
revoke all on
  public.resultado_presidente,
  public.resultado_governador,
  public.resultado_senado,
  public.resultado_temas,
  public.resultado_faixa_etaria,
  public.resultado_genero,
  public.votos_por_ip
from anon, authenticated;
