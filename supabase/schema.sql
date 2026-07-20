-- ==============================================================
-- Pesquisa de Opiniao - Schema Supabase (PostgreSQL)
-- Rode no SQL Editor do Supabase.
--
-- ATENCAO: este script recria tudo DO ZERO. O bloco de drop abaixo
-- APAGA as tabelas e todos os dados ja coletados (votos e leads).
-- Faca backup antes se precisar preservar respostas.
-- ==============================================================

-- Extensao para gen_random_uuid() (geralmente ja vem habilitada)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Limpeza: remove views e tabelas anteriores.
-- O "cascade" nas tabelas leva junto indices, FKs e views dependentes.
-- ------------------------------------------------------------
drop view if exists public.resultado_totais;
drop view if exists public.resultado_presidente;
drop view if exists public.resultado_temas;
drop view if exists public.resultado_tema_por_presidente;
drop view if exists public.resultado_faixa_etaria;
drop view if exists public.resultado_genero;
drop view if exists public.votos_por_ip;
-- Views de versoes antigas (cargos que sairam da pesquisa).
drop view if exists public.resultado_governador;
drop view if exists public.resultado_senado;

drop table if exists public.pesquisa_leads cascade;
drop table if exists public.pesquisa_votos cascade;

-- ------------------------------------------------------------
-- Tabela: pesquisa_votos
-- ------------------------------------------------------------
create table public.pesquisa_votos (
  id                uuid primary key default gen_random_uuid(),
  -- Regiao da CAMPANHA: identifica de qual das 8 paginas veio a resposta.
  -- Vem da env POLL_REGION do deploy (nao do usuario). Nao confundir com
  -- `regiao` abaixo, que e o estado do respondente detectado pelo IP.
  regiao_pesquisa   text not null,
  session_cookie    text not null,
  thumbmark_id      text,
  context_hash      text not null,
  ip_address        text,
  cidade            text,
  regiao            text,
  pais              text,
  faixa_etaria      text,
  genero            text,
  presidente        text,
  temas_melhorar    text[],
  created_at        timestamptz not null default now()
);

-- Antifraude com escopo POR REGIAO: a unicidade inclui `regiao_pesquisa`,
-- entao a mesma pessoa pode responder uma vez a cada uma das 8 pesquisas,
-- mas nao duas vezes na mesma.

-- Garante 1 resposta por cookie de sessao, dentro da regiao.
create unique index pesquisa_votos_regiao_session_key
  on public.pesquisa_votos (regiao_pesquisa, session_cookie);

-- Garante 1 resposta por combinacao dispositivo + contexto (IP+UA), na regiao.
-- Bloqueia aba anonima / cookie limpo na mesma rede e mesmo aparelho.
create unique index pesquisa_votos_regiao_device_context_key
  on public.pesquisa_votos (regiao_pesquisa, thumbmark_id, context_hash);

create index pesquisa_votos_created_at_idx
  on public.pesquisa_votos (created_at);

-- Filtro/agrupamento por regiao da campanha (dashboards e apuracao).
create index pesquisa_votos_regiao_pesquisa_idx
  on public.pesquisa_votos (regiao_pesquisa);

-- Acelera auditoria/contagem de respostas por IP.
create index pesquisa_votos_ip_address_idx
  on public.pesquisa_votos (ip_address);

-- ------------------------------------------------------------
-- Tabela: pesquisa_leads
-- ------------------------------------------------------------
create table public.pesquisa_leads (
  id          uuid primary key default gen_random_uuid(),
  voto_id     uuid not null references public.pesquisa_votos (id) on delete cascade,
  contato     text not null,
  created_at  timestamptz not null default now()
);

create index pesquisa_leads_voto_id_idx
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
-- Todas as views quebram por `regiao_pesquisa`. Para o consolidado das 8
-- regioes, some no dashboard (ex.: select candidato, sum(votos) ... group by 1)
-- ou filtre uma regiao com where regiao_pesquisa = 'norte'.

-- Total de respostas por regiao (base para calcular percentuais).
create view public.resultado_totais
  with (security_invoker = on) as
  select regiao_pesquisa, count(*) as respostas
  from public.pesquisa_votos
  group by regiao_pesquisa
  order by respostas desc;

create view public.resultado_presidente
  with (security_invoker = on) as
  select regiao_pesquisa, presidente as candidato, count(*) as votos
  from public.pesquisa_votos
  where presidente is not null
  group by regiao_pesquisa, presidente
  order by regiao_pesquisa, votos desc;

-- Temas mais citados (desmembra o array).
create view public.resultado_temas
  with (security_invoker = on) as
  select regiao_pesquisa, unnest(temas_melhorar) as tema, count(*) as votos
  from public.pesquisa_votos
  where temas_melhorar is not null
  group by regiao_pesquisa, tema
  order by regiao_pesquisa, votos desc;

-- Cruzamento tema x voto para Presidente (foco da pesquisa).
create view public.resultado_tema_por_presidente
  with (security_invoker = on) as
  select regiao_pesquisa, unnest(temas_melhorar) as tema, presidente, count(*) as votos
  from public.pesquisa_votos
  where temas_melhorar is not null and presidente is not null
  group by regiao_pesquisa, tema, presidente
  order by regiao_pesquisa, tema, votos desc;

-- Demografia.
create view public.resultado_faixa_etaria
  with (security_invoker = on) as
  select regiao_pesquisa, faixa_etaria, count(*) as votos
  from public.pesquisa_votos
  where faixa_etaria is not null
  group by regiao_pesquisa, faixa_etaria
  order by regiao_pesquisa, faixa_etaria;

create view public.resultado_genero
  with (security_invoker = on) as
  select regiao_pesquisa, genero, count(*) as votos
  from public.pesquisa_votos
  where genero is not null
  group by regiao_pesquisa, genero
  order by regiao_pesquisa, votos desc;

-- Auditoria: quantas respostas por IP (para identificar abuso e limpar manualmente).
-- `regioes` alto (proximo de 8) sinaliza alguem varrendo todas as paginas.
create view public.votos_por_ip
  with (security_invoker = on) as
  select
    ip_address,
    count(*) as votos,
    count(distinct regiao_pesquisa) as regioes,
    min(created_at) as primeiro,
    max(created_at) as ultimo
  from public.pesquisa_votos
  group by ip_address
  order by votos desc;

-- Remove o acesso das views pela API publica (chaves anon/authenticated).
-- Ficam acessiveis apenas via service_role (server-side) e SQL Editor.
revoke all on
  public.resultado_totais,
  public.resultado_presidente,
  public.resultado_temas,
  public.resultado_tema_por_presidente,
  public.resultado_faixa_etaria,
  public.resultado_genero,
  public.votos_por_ip
from anon, authenticated;
