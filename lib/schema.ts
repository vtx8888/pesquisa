import { z } from "zod";
import { STEPS } from "./candidates";

// Conjunto de IDs validos por campo, derivado das listas de candidatos.
// So aceita valores que existem na pesquisa (bloqueia IDs inventados).
const VALIDOS: Record<string, Set<string>> = Object.fromEntries(
  STEPS.map((s) => [s.field, new Set(s.candidatos.map((c) => c.id))])
);

const naLista = (field: string) => (v: string) => VALIDOS[field]?.has(v);

// Schema do voto enviado pelo client para a Server Action.
export const votoSchema = z
  .object({
    faixa_etaria: z
      .string()
      .refine(naLista("faixa_etaria"), "Faixa etária inválida"),
    genero: z.string().refine(naLista("genero"), "Gênero inválido"),
    senador_vaga_1: z
      .string()
      .refine(naLista("senador_vaga_1"), "Senador inválido"),
    senador_vaga_2: z
      .string()
      .refine(naLista("senador_vaga_2"), "Senador inválido"),
    governador: z.string().refine(naLista("governador"), "Candidato inválido"),
    presidente: z.string().refine(naLista("presidente"), "Candidato inválido"),
    temas_melhorar: z
      .array(z.string())
      .default([])
      .refine(
        (arr) => arr.every((t) => VALIDOS["temas_melhorar"]?.has(t)),
        "Tema inválido"
      ),
    // Token do Turnstile + fingerprint do dispositivo.
    // O token pode vir vazio (ex.: dev sem Turnstile). A validacao real e
    // feita na Server Action via siteverify — nao aqui no schema.
    turnstileToken: z.string().optional().default(""),
    thumbmark_id: z.string().optional().default(""),
  })
  // Nao permite os dois votos de senador iguais (exceto Branco/Nulo, Indeciso).
  .refine(
    (v) =>
      v.senador_vaga_1 !== v.senador_vaga_2 ||
      ["branco_nulo", "indeciso"].includes(v.senador_vaga_1),
    { message: "Os dois votos de senador não podem ser iguais", path: ["senador_vaga_2"] }
  );

export type VotoInput = z.infer<typeof votoSchema>;

// Schema do lead (ultima tela).
export const leadSchema = z.object({
  voto_id: z.string().uuid("voto inválido"),
  contato: z
    .string()
    .min(5, "Informe um e-mail ou telefone válido")
    .max(120, "Contato muito longo"),
});

export type LeadInput = z.infer<typeof leadSchema>;
