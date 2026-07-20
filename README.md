# Pesquisa Eleitoral — Sistema com Motor Antifraude

Sistema de pesquisa em formato *wizard* (mobile-first) com camada antifraude híbrida:
cookie de sessão (HTTPOnly), fingerprint de dispositivo (ThumbmarkJS), anti-bot
(Cloudflare Turnstile) e hash de contexto (IP + User-Agent) no servidor.

## Stack
- **Next.js 16** (App Router) + **Tailwind CSS v4**
- **React Hook Form** + **Zod** (formulário e validação)
- **ThumbmarkJS** (fingerprint) + **Cloudflare Turnstile** (anti-bot invisível)
- **Server Actions** (cookie HTTPOnly via `proxy.ts`, hash de contexto, insert)
- **Supabase** (PostgreSQL)

## Estrutura
```
app/
  actions.ts      Server Actions: registrarVoto (antifraude) e registrarLead
  layout.tsx      Layout raiz (no-index, viewport mobile)
  page.tsx        Monta o Wizard com os dados de candidatos
  wizard.tsx      UI do wizard (auto-avanço, Turnstile, ThumbmarkJS, lead)
  globals.css     Tailwind + utilitários
lib/
  candidates.ts   PLACEHOLDER dos candidatos e definição dos passos (edite aqui)
  schema.ts       Schemas Zod (voto e lead)
  supabase.ts     Cliente admin (service_role) — somente servidor
proxy.ts          Injeta o cookie poll_session_id (Barreira do Cookie)
supabase/
  schema.sql      Tabelas pesquisa_votos e pesquisa_leads + índices únicos
```

## Setup

### 1. Supabase
1. Crie um projeto em https://supabase.com
2. Em **SQL Editor**, cole e rode o conteúdo de `supabase/schema.sql`.
3. Em **Settings → API**, copie: `Project URL`, `anon public` e `service_role`.

### 2. Cloudflare Turnstile
1. Em https://dash.cloudflare.com → **Turnstile**, crie um widget para o domínio.
2. Escolha o modo **Invisible**. Copie a **Site Key** e a **Secret Key**.

### 3. Variáveis de ambiente
Copie o exemplo e preencha:
```bash
cp .env.local.example .env.local
```
> Sem `TURNSTILE_SECRET_KEY`, o anti-bot é ignorado em dev e bloqueia em produção.
> A `SUPABASE_SERVICE_ROLE_KEY` é secreta — nunca exponha no client.

### 4. Rodar local
```bash
npm install
npm run dev          # http://localhost:3000
```

## Como a antifraude funciona
1. **Cookie** (`proxy.ts`): ao acessar, cria `poll_session_id` HTTPOnly/Secure (30 dias).
2. **Dispositivo** (`wizard.tsx`): ThumbmarkJS gera `thumbmark_id`; Turnstile gera o token.
3. **Contexto** (`actions.ts`): servidor lê IP (`x-forwarded-for`) + User-Agent e gera
   `context_hash` (SHA-256).
4. **Validação**: descarta o voto se o `session_cookie` já votou **ou** se a combinação
   `thumbmark_id + context_hash` já existe. Duplicado → **sucesso silencioso** (não dá
   pistas ao fraudador). Índices únicos no banco garantem isso mesmo sob concorrência.

## Fluxo das telas
Ordem (1 cargo por tela, **5 telas**): Deputado Federal → Senador (1º voto) →
Senador (2º voto) → Governador → Presidente. Cada tela exige o botão **Confirmar**
para avançar — **não há auto-avanço**. A 2ª tela do Senado esconde o candidato já
escolhido na 1ª. Na tela final, o campo de contato **detecta automaticamente** se é
e-mail ou WhatsApp e só libera o envio com um contato válido.

## Editar a pesquisa
Todo o conteúdo (cargos, ordem das telas, candidatos) está em `lib/candidates.ts`.
Cada item de `STEPS` é uma tela. Os senadores ficam na const `SENADORES`, reutilizada
nas duas vagas; a vaga 2 usa `excluiEscolhaDe: "senador_vaga_1"`.

## Deploy (Vercel)

1. Suba o repositório para o GitHub (ou use `vercel` CLI).
2. Em https://vercel.com → **Add New Project** → importe o repositório. O Vercel
   detecta o Next.js automaticamente (nada a configurar no build).
3. Em **Settings → Environment Variables**, adicione (Production + Preview):

   | Variável | Onde pegar |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (secreta) |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile → widget → Site Key |
   | `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile → widget → Secret Key (secreta) |
   | `NEXT_PUBLIC_POLL_TITLE` | Título exibido (ex.: `Pesquisa Eleitoral 2026`) |

   > `NEXT_PUBLIC_SUPABASE_ANON_KEY` é opcional (o app não usa a anon key — tudo passa
   > pela `service_role` no servidor).

4. **Deploy**. O Vercel roda `next build` e publica.
5. No **Cloudflare Turnstile**, adicione o domínio de produção (ex.:
   `seu-projeto.vercel.app` e seu domínio próprio) na lista de **Hostnames**.

Notas:
- O `proxy.ts` (cookie de sessão) roda como Edge Middleware no Vercel — sem config.
- O IP real chega via `x-forwarded-for` (setado pelo Vercel) — o hash de contexto e a
  auditoria por IP funcionam direto.
- A **geolocalização** usa os headers nativos do Vercel (`x-vercel-ip-city`, etc.) —
  grátis e instantânea; o ipwho.is fica só como fallback.

### Alternativa: Hostinger VPS / Node
```bash
npm run build
npm run start        # respeita a variável PORT (padrão 3000)
```
Atrás de Nginx (SSL + proxy reverso) com PM2, repassando `x-forwarded-for`.

## Testes de fraude sugeridos
- Votar, limpar cookies e votar de novo (mesmo aparelho/rede) → deve bloquear.
- Aba anônima na mesma rede → deve bloquear (thumbmark + contexto).
- Trocar de navegador no mesmo aparelho/rede → deve bloquear pelo contexto.
- Outro aparelho / outra rede → deve permitir (voto legítimo distinto).
