"use server";

import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { votoSchema, leadSchema } from "@/lib/schema";
import { getRegiaoPesquisa } from "@/lib/regiao";

const COOKIE_NAME = "poll_session_id";
// Sufixado com a regiao: cada uma das 8 paginas tem seu proprio cookie de
// "ja respondeu", entao responder no Norte nao bloqueia a pagina do Sul.
const VOTED_COOKIE_BASE = "poll_voted";
const TRINTA_DIAS = 60 * 60 * 24 * 30;

function nomeCookieVotou(regiao: string) {
  return `${VOTED_COOKIE_BASE}_${regiao}`;
}

// Marca no cookie que este navegador ja respondeu ESTA regiao
// (camada extra alem do banco).
async function marcarVotouCookie(regiao: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: nomeCookieVotou(regiao),
    value: "1",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRINTA_DIAS,
  });
}

export type VotoResult =
  | { ok: true; voto_id: string; duplicado: boolean }
  | { ok: false; erro: string };

// Valida o token do Cloudflare Turnstile no servidor.
async function validarTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  // Considera "nao configurado" quando vazio ou ainda no valor placeholder
  // do .env.example (contem "..."). Em dev liberamos, em prod bloqueamos.
  if (!secret || secret.includes("...")) {
    return process.env.NODE_ENV !== "production";
  }

  if (!token) return false;

  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  // So envia remoteip se for um IP publico real (localhost = 0.0.0.0 quebra).
  if (
    ip &&
    ip !== "0.0.0.0" &&
    ip !== "::1" &&
    !ip.startsWith("127.") &&
    !ip.startsWith("10.") &&
    !ip.startsWith("192.168.")
  ) {
    body.append("remoteip", ip);
  }

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// Gera o "Hash de Contexto" (IP + User-Agent).
function gerarContextHash(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

type Localizacao = {
  cidade: string | null;
  regiao: string | null;
  pais: string | null;
};

// Consulta cidade/estado/pais a partir do IP (ipwho.is — gratis, sem chave).
// Nunca lanca: em qualquer falha retorna nulls e o voto segue normalmente.
async function consultarLocalizacao(ip: string): Promise<Localizacao> {
  const vazio: Localizacao = { cidade: null, regiao: null, pais: null };

  // Ignora IPs locais/privados/invalidos (ex.: dev em localhost).
  if (
    !ip ||
    ip === "0.0.0.0" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.")
  ) {
    return vazio;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500); // nao trava o voto
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as {
      success?: boolean;
      city?: string;
      region?: string;
      country?: string;
    };
    if (!data || data.success === false) return vazio;
    return {
      cidade: data.city ?? null,
      regiao: data.region ?? null,
      pais: data.country ?? null,
    };
  } catch {
    return vazio;
  }
}

// Le o contexto do request: IP, cookie de sessao, hash de contexto e geo.
async function getContexto() {
  const h = await headers();
  const ipRaw = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  const ip = ipRaw.split(",")[0]?.trim() || "0.0.0.0";
  const userAgent = h.get("user-agent") ?? "unknown";
  const contextHash = gerarContextHash(ip, userAgent);

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value ?? "";

  // Geolocalizacao nativa do Vercel (gratis, instantanea). Fallback: ipwho.is.
  const cidadeVercel = h.get("x-vercel-ip-city");
  const geo: Localizacao = {
    cidade: cidadeVercel ? decodeURIComponent(cidadeVercel) : null,
    regiao: h.get("x-vercel-ip-country-region"),
    pais: h.get("x-vercel-ip-country"),
  };

  return { ip, contextHash, sessionCookie, geo };
}

// Mantem so alfanumerico e hifen (UUID). Remove metacaracteres de filtro do
// PostgREST (virgula, parenteses, ponto, dois-pontos) -> evita injecao no .or().
function limparToken(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 128);
}

// Procura um voto ja existente por cookie OU por (dispositivo + contexto),
// sempre restrito a regiao da campanha (o mesmo aparelho pode responder as 8).
async function buscarVotoExistente(
  regiao: string,
  sessionCookie: string,
  thumbmark: string,
  contextHash: string
): Promise<string | null> {
  const cookieLimpo = limparToken(sessionCookie);
  const tmLimpo = limparToken(thumbmark);
  const ctxLimpo = limparToken(contextHash);
  const orFilter = [
    cookieLimpo ? `session_cookie.eq.${cookieLimpo}` : null,
    tmLimpo
      ? `and(thumbmark_id.eq.${tmLimpo},context_hash.eq.${ctxLimpo})`
      : null,
  ]
    .filter(Boolean)
    .join(",");

  if (!orFilter) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("pesquisa_votos")
    .select("id")
    .eq("regiao_pesquisa", regiao)
    .or(orFilter)
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

// Action chamada na ABERTURA da pagina: ja votou neste dispositivo/sessao?
export async function jaVotou(thumbmark: string): Promise<boolean> {
  try {
    const regiao = getRegiaoPesquisa();
    // Sem regiao configurada nao da pra checar nada com seguranca; o erro
    // real aparece no envio (registrarVoto), com mensagem clara.
    if (!regiao) return false;

    // 1. Cookie de "ja respondeu" — rapido e funciona mesmo se o banco falhar.
    const cookieStore = await cookies();
    if (cookieStore.get(nomeCookieVotou(regiao))?.value === "1") return true;

    // 2. Fallback no banco (cookie limpo, mas cookie de sessao/fingerprint batem).
    const { sessionCookie, contextHash } = await getContexto();
    const id = await buscarVotoExistente(
      regiao,
      sessionCookie,
      thumbmark || "",
      contextHash
    );
    if (id) await marcarVotouCookie(regiao); // re-marca o cookie se sumiu
    return id !== null;
  } catch (e) {
    console.error("jaVotou falhou:", e);
    return false; // Em caso de erro, nao bloqueia o usuario legitimo.
  }
}

export async function registrarVoto(input: unknown): Promise<VotoResult> {
  try {
    return await registrarVotoInterno(input);
  } catch (e) {
    console.error("registrarVoto falhou:", e);
    return { ok: false, erro: "Erro interno ao registrar o voto." };
  }
}

async function registrarVotoInterno(input: unknown): Promise<VotoResult> {
  // 1. Validacao de schema.
  const parsed = votoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, erro: "Dados inválidos" };
  }
  const voto = parsed.data;

  // 1b. Regiao da campanha (env POLL_REGION do deploy, nunca do client).
  const regiao = getRegiaoPesquisa();
  if (!regiao) {
    console.error("POLL_REGION ausente ou invalida:", process.env.POLL_REGION);
    return { ok: false, erro: "Pesquisa mal configurada. Avise o organizador." };
  }

  // 2. Contexto do request (IP + User-Agent + cookie de sessao + geo).
  const { ip, contextHash, sessionCookie, geo } = await getContexto();
  if (!sessionCookie) {
    return { ok: false, erro: "Sessão inválida. Recarregue a página." };
  }

  // 3. Anti-bot (Turnstile).
  const humano = await validarTurnstile(voto.turnstileToken, ip);
  if (!humano) {
    return { ok: false, erro: "Falha na verificação de segurança." };
  }

  // 4. Checagem de duplicidade ANTES de inserir.
  const idExistente = await buscarVotoExistente(
    regiao,
    sessionCookie,
    voto.thumbmark_id || "",
    contextHash
  );
  if (idExistente) {
    // Ja votou: sinaliza duplicado para a UI bloquear de forma visivel.
    await marcarVotouCookie(regiao);
    return { ok: true, voto_id: idExistente, duplicado: true };
  }

  // 5. Geolocalizacao (headers do Vercel; fallback ipwho.is).
  const local = geo.cidade ? geo : await consultarLocalizacao(ip);

  const supabase = getSupabaseAdmin();
  const tmClean = limparToken(voto.thumbmark_id);

  // 6. Insercao do voto.
  const { data: inserido, error } = await supabase
    .from("pesquisa_votos")
    .insert({
      regiao_pesquisa: regiao,
      session_cookie: sessionCookie,
      thumbmark_id: tmClean || null,
      context_hash: contextHash,
      ip_address: ip,
      cidade: local.cidade,
      regiao: local.regiao,
      pais: local.pais,
      faixa_etaria: voto.faixa_etaria,
      genero: voto.genero,
      presidente: voto.presidente,
      temas_melhorar: voto.temas_melhorar,
    })
    .select("id")
    .single();

  if (error) {
    // Corrida: o indice unico pode ter barrado um insert concorrente.
    // Code 23505 = unique_violation. Tratamos como duplicado silencioso.
    if (error.code === "23505") {
      const dupId = await buscarVotoExistente(
        regiao,
        sessionCookie,
        tmClean,
        contextHash
      );
      if (dupId) {
        await marcarVotouCookie(regiao);
        return { ok: true, voto_id: dupId, duplicado: true };
      }
    }
    return { ok: false, erro: "Não foi possível registrar o voto." };
  }

  await marcarVotouCookie(regiao);
  return { ok: true, voto_id: inserido.id, duplicado: false };
}

export type LeadResult = { ok: boolean };

export async function registrarLead(input: unknown): Promise<LeadResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("pesquisa_leads").insert({
    voto_id: parsed.data.voto_id,
    contato: parsed.data.contato.trim(),
  });

  return { ok: !error };
}
