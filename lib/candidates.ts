// ============================================================
// Dados dos candidatos
// O `id` e o que vai gravado no banco. `partido`/`numero` sao opcionais
// (se preencher, aparecem como subtitulo no card).
// ============================================================

export type Candidato = {
  id: string;
  nome: string;
  partido?: string;
  numero?: string;
  foto?: string;
};

// Campos do formulario/banco. Cada passo (tela) preenche exatamente um.
export type FieldKey =
  | "faixa_etaria"
  | "genero"
  | "senador_vaga_1"
  | "senador_vaga_2"
  | "governador"
  | "presidente"
  | "temas_melhorar";

export type Step = {
  field: FieldKey;
  titulo: string;
  subtitulo?: string;
  candidatos: Candidato[];
  // Esconde o candidato ja escolhido neste outro campo (ex.: senador vaga 2
  // nao pode repetir o nome da vaga 1).
  excluiEscolhaDe?: FieldKey;
  // Multipla escolha (marca varios).
  multi?: boolean;
  // Nao mostra avatar (ex.: temas, nao candidatos).
  semAvatar?: boolean;
  // Rotulo do "chip" no topo da pergunta (padrao "Cargo").
  rotulo?: string;
};

// Lista de senadores reaproveitada nas duas vagas (2 telas).
const SENADORES: Candidato[] = [
  { id: "alexandre_guimaraes", nome: "Alexandre Guimarães" },
  { id: "carlos_gaguim", nome: "Carlos Gaguim" },
  { id: "paulo_mourao", nome: "Paulo Mourão" },
  { id: "eduardo_gomes", nome: "Eduardo Gomes" },
  { id: "iraja_abreu", nome: "Irajá Abreu" },
  { id: "eli_borges", nome: "Eli Borges" },
  { id: "ronaldo_dimas", nome: "Ronaldo Dimas" },
  { id: "branco_nulo", nome: "Branco / Nulo" },
  { id: "indeciso", nome: "Não sei / Indeciso" },
];

export const STEPS: Step[] = [
  // Perguntas demograficas primeiro (toque unico, baixo atrito) para reduzir churn.
  {
    field: "faixa_etaria",
    titulo: "Faixa etária",
    subtitulo: "Qual a sua idade?",
    rotulo: "Perfil",
    semAvatar: true,
    // Padrao Meta (Facebook/Instagram Ads).
    candidatos: [
      { id: "18-24", nome: "18 a 24 anos" },
      { id: "25-34", nome: "25 a 34 anos" },
      { id: "35-44", nome: "35 a 44 anos" },
      { id: "45-54", nome: "45 a 54 anos" },
      { id: "55-64", nome: "55 a 64 anos" },
      { id: "65+", nome: "65 anos ou mais" },
    ],
  },
  {
    field: "genero",
    titulo: "Gênero",
    subtitulo: "Com qual gênero você se identifica?",
    rotulo: "Perfil",
    semAvatar: true,
    candidatos: [
      { id: "feminino", nome: "Feminino" },
      { id: "masculino", nome: "Masculino" },
      { id: "outro", nome: "Outro" },
      { id: "nao_informado", nome: "Prefiro não informar" },
    ],
  },
  {
    field: "governador",
    titulo: "Governador",
    subtitulo: "Em quem você votaria para Governador?",
    candidatos: [
      { id: "professora_dorinha", nome: "Professora Dorinha" },
      { id: "laurez_moreira", nome: "Laurez Moreira" },
      { id: "vicentinho_jr", nome: "Vicentinho Jr" },
      { id: "ataides_oliveira", nome: "Ataídes Oliveira" },
      { id: "branco_nulo", nome: "Branco / Nulo" },
      { id: "indeciso", nome: "Não sei / Indeciso" },
    ],
  },
  {
    field: "senador_vaga_1",
    titulo: "Senador — primeiro voto",
    subtitulo: "Em quem você votaria para o Senado? (primeiro voto)",
    candidatos: SENADORES,
  },
  {
    field: "senador_vaga_2",
    titulo: "Senador — segundo voto",
    subtitulo: "Em quem você votaria para o Senado? (segundo voto)",
    candidatos: SENADORES,
    excluiEscolhaDe: "senador_vaga_1",
  },
  {
    field: "presidente",
    titulo: "Presidente",
    subtitulo: "Em quem você votaria para Presidente?",
    candidatos: [
      { id: "lula", nome: "Lula" },
      { id: "flavio_bolsonaro", nome: "Flávio Bolsonaro" },
      { id: "branco_nulo", nome: "Branco / Nulo" },
      { id: "indeciso", nome: "Não sei / Indeciso" },
    ],
  },
  {
    field: "temas_melhorar",
    titulo: "Temas prioritários",
    subtitulo:
      "Quais desses temas você considera que o Tocantins precisa melhorar? (pode escolher vários)",
    rotulo: "Opinião",
    multi: true,
    semAvatar: true,
    candidatos: [
      { id: "saude", nome: "Saúde" },
      { id: "seguranca", nome: "Segurança" },
      { id: "tecnologia", nome: "Tecnologia" },
      { id: "educacao", nome: "Educação" },
      { id: "infraestrutura", nome: "Infraestrutura" },
      { id: "emprego_renda", nome: "Geração de emprego e renda" },
      { id: "programas_sociais", nome: "Programas sociais" },
      { id: "transparencia_estatal", nome: "Transparência estatal" },
    ],
  },
];
