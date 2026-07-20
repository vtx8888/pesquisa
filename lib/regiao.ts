// ============================================================
// Regiao da CAMPANHA (nao confundir com a geolocalizacao por IP).
//
// Todos os deploys usam o MESMO codigo e se diferenciam apenas pela
// variavel de ambiente POLL_REGION. O valor vai gravado na coluna
// `regiao_pesquisa` de pesquisa_votos e e o que separa os resultados.
//
// POLL_REGION e server-only (sem NEXT_PUBLIC_): o navegador nunca ve nem
// envia esse valor, entao ninguem consegue forjar a regiao de um voto.
// ============================================================

// Regioes aceitas — pode ter quantas quiser, nada no codigo depende do total.
// Escreva com acento e espaco a vontade: a comparacao normaliza os dois lados,
// entao "Bico do Papagaio", "bico do papagaio" e "bico_do_papagaio" sao a mesma.
// Deixe a lista VAZIA para aceitar qualquer slug (util em testes).
export const REGIOES = [
  "Bico do Papagaio",
  "Norte",
  "Meio Norte",
  "Central",
  "Sul",
  "Sudeste",
  "Jalapão",
] as const;

// Normaliza para slug: sem acento, minusculo, espacos viram "_".
// O NFD separa a letra do acento e o range ̀-ͯ remove so o acento —
// sem isso "Jalapão" viraria "jalapo" em vez de "jalapao".
export function slugRegiao(v: string): string {
  return v
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

// Slugs validos, derivados da lista acima (calculado uma vez).
const SLUGS_VALIDOS = new Set(REGIOES.map(slugRegiao));

// Rotulo bonito a partir do slug gravado no banco — util em dashboards:
// "bico_do_papagaio" -> "Bico do Papagaio".
const ROTULOS = new Map(REGIOES.map((r) => [slugRegiao(r), r as string]));
export function rotuloRegiao(slug: string): string {
  return ROTULOS.get(slug) ?? slug;
}

// Le e valida POLL_REGION. Retorna null quando ausente/invalida — a Server
// Action trata isso como erro de configuracao em vez de gravar lixo no banco.
export function getRegiaoPesquisa(): string | null {
  const valor = slugRegiao(process.env.POLL_REGION ?? "");
  if (!valor) return null;
  if (SLUGS_VALIDOS.size > 0 && !SLUGS_VALIDOS.has(valor)) return null;
  return valor;
}
