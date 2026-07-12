"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile } from "@marsidev/react-turnstile";
import { getFingerprint, setOption } from "@thumbmarkjs/thumbmarkjs";
import type { Candidato, Step } from "@/lib/candidates";
import { votoSchema, type VotoInput } from "@/lib/schema";
import { registrarVoto, registrarLead, jaVotou } from "./actions";

// NEXT_PUBLIC_* e inlinado no client em build time.
const BRAND = "AtlasIntel";

type Fase =
  | "checando"
  | "inicio"
  | "perguntas"
  | "processando"
  | "final"
  | "ja_votou";

// Icone Material Symbols.
function Icon({
  name,
  className = "",
  fill = false,
}: {
  name: string;
  className?: string;
  fill?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}

export function Wizard({
  titulo,
  steps,
  turnstileSiteKey,
}: {
  titulo: string;
  steps: Step[];
  turnstileSiteKey: string;
}) {
  // Comeca em "checando" para NAO piscar o botao Iniciar antes da verificacao.
  const [fase, setFase] = useState<Fase>("checando");
  const [stepIndex, setStepIndex] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [thumbmark, setThumbmark] = useState("");
  const [votoId, setVotoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { setValue, getValues, watch } = useForm<VotoInput>({
    resolver: zodResolver(votoSchema),
    defaultValues: {
      faixa_etaria: "",
      genero: "",
      senador_vaga_1: "",
      senador_vaga_2: "",
      governador: "",
      presidente: "",
      temas_melhorar: [],
      turnstileToken: "",
      thumbmark_id: "",
    },
  });

  const values = watch();

  // Fingerprint do dispositivo + checagem de "ja votou" na entrada.
  useEffect(() => {
    let ativo = true;
    // Exclui componentes volateis (randomizados por anti-fingerprint, em
    // especial no modo anonimo do Safari).
    setOption("exclude", ["canvas", "webgl", "audio", "permissions"]);
    getFingerprint()
      .then((fp) => (typeof fp === "string" ? fp : String(fp)))
      .catch(() => "")
      .then(async (id) => {
        if (!ativo) return;
        setThumbmark(id);
        setValue("thumbmark_id", id);
        const votou = await jaVotou(id);
        if (!ativo) return;
        setFase(votou ? "ja_votou" : "inicio");
      });
    return () => {
      ativo = false;
    };
  }, [setValue]);

  // Ao trocar de passo/fase, volta pro topo (a tela do Senador e longa).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stepIndex, fase]);

  const step = steps[stepIndex];
  const multi = !!step?.multi;
  const valorAtual = step ? values[step.field] : "";
  // Normaliza a selecao atual como array (funciona para single e multi).
  const selecionados: string[] = Array.isArray(valorAtual)
    ? valorAtual
    : valorAtual
      ? [valorAtual]
      : [];
  const podeConfirmar = selecionados.length > 0;

  // Esconde o candidato ja escolhido na vaga anterior (senador).
  const candidatos = step?.candidatos.filter((c) => {
    if (!step.excluiEscolhaDe) return true;
    // Branco/Nulo e Indeciso podem repetir nas duas vagas.
    if (c.id === "branco_nulo" || c.id === "indeciso") return true;
    return c.id !== values[step.excluiEscolhaDe];
  });

  function selecionar(candidatoId: string) {
    if (!step) return;
    setErro(null);
    if (multi) {
      // Marca/desmarca dentro do array.
      const novo = selecionados.includes(candidatoId)
        ? selecionados.filter((x) => x !== candidatoId)
        : [...selecionados, candidatoId];
      setValue(step.field, novo, { shouldValidate: true });
    } else {
      // Escolha unica com toggle.
      const novo = selecionados[0] === candidatoId ? "" : candidatoId;
      setValue(step.field, novo, { shouldValidate: true });
    }
  }

  // Botao Confirmar: NUNCA avanca sozinho.
  function confirmar() {
    if (!podeConfirmar) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      enviar();
    }
  }

  function voltar() {
    setErro(null);
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  // Clique fora de qualquer opcao/botao limpa a selecao do passo atual.
  function limparAoClicarFora(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    if (!step) return;
    setErro(null);
    setValue(step.field, multi ? [] : "", { shouldValidate: true });
  }

  async function enviar() {
    setFase("processando");
    setErro(null);

    const payload: VotoInput = {
      ...getValues(),
      turnstileToken,
      thumbmark_id: thumbmark,
    };

    try {
      const res = await registrarVoto(payload);
      if (res.ok) {
        if (res.duplicado) {
          setFase("ja_votou");
          return;
        }
        setVotoId(res.voto_id);
        setFase("final");
        return;
      }
      setErro(res.erro);
    } catch {
      setErro("Não foi possível enviar. Tente novamente.");
    }
    setFase("perguntas");
    setStepIndex(steps.length - 1);
  }

  // ----------------------------------------------------------------
  // Conteudo de cada fase (o Turnstile fica montado por fora, ver return).
  // ----------------------------------------------------------------
  const renderFase = () => {
  if (fase === "checando") {
    return (
      <CenteredShell>
        <Spinner />
        <p className="text-sm font-medium text-on-surface-variant">Carregando...</p>
      </CenteredShell>
    );
  }

  if (fase === "inicio") {
    return (
      <CenteredShell>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="AtlasIntel" className="mb-2 h-14 w-auto" />

        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-primary md:text-3xl">
            {titulo}
          </h1>
          <p className="mx-auto max-w-md text-lg text-secondary">
            Sua opinião é anônima e leva menos de 1 minuto. Toque para começar.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-4 py-1.5 text-secondary">
          <Icon name="lock" className="text-[16px]" fill />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Dados 100% Protegidos
          </span>
        </div>

        <button
          onClick={() => setFase("perguntas")}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 py-4 text-xl font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
        >
          Iniciar pesquisa
          <Icon name="arrow_forward" />
        </button>

        <p className="text-xs leading-relaxed text-outline">
          Ao iniciar, você concorda com a coleta de dados de acesso (como IP e
          localização aproximada) para fins estatísticos e de prevenção a
          fraudes. Nenhum voto é vinculado à sua identidade. Saiba mais na{" "}
          <a
            href="/privacidade"
            target="_blank"
            className="font-medium text-tertiary-blue underline"
          >
            Política de Privacidade
          </a>
          .
        </p>
      </CenteredShell>
    );
  }

  if (fase === "processando") {
    return (
      <CenteredShell>
        <Spinner />
        <p className="font-medium text-on-surface-variant">
          Computando seu voto com segurança...
        </p>
      </CenteredShell>
    );
  }

  if (fase === "ja_votou") {
    return (
      <CenteredShell>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Icon name="lock" className="text-[32px] text-amber-600" fill />
        </div>
        <h2 className="text-2xl font-bold text-primary">Você já participou</h2>
        <p className="mx-auto max-w-md text-lg text-secondary">
          Identificamos um voto registrado neste dispositivo. Cada pessoa pode
          responder à pesquisa apenas uma vez.
        </p>
      </CenteredShell>
    );
  }

  if (fase === "final") {
    return <LeadStep votoId={votoId} />;
  }

  // ----------------------------------------------------------------
  // Tela das perguntas (top bar + opcoes + barra inferior fixa)
  // ----------------------------------------------------------------
  const progresso = ((stepIndex + 1) / steps.length) * 100;
  const ultima = stepIndex === steps.length - 1;
  // Na ultima tela, so envia depois de passar no Turnstile (se configurado).
  const faltaTurnstile = ultima && !!turnstileSiteKey && !turnstileToken;
  let dividerInserido = false;

  return (
    <div
      className="app-screen flex flex-col bg-background md:items-center"
      onClick={limparAoClicarFora}
    >
      <TopAppBar />

      <main className="mt-16 flex w-full max-w-[640px] flex-1 flex-col px-4 pb-28 pt-8 md:pb-8">
        {/* Progresso */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Progresso
            </span>
            <span className="text-xs font-bold text-primary">
              {stepIndex + 1} de {steps.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-1.5 rounded-full bg-tertiary-blue transition-all duration-500 ease-out"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {/* Contexto da pergunta */}
        <div key={stepIndex} className="mb-8 animate-fade-in">
          <span className="mb-4 inline-block rounded-full border border-slate bg-slate-light px-3 py-1 text-xs font-semibold text-on-surface-variant">
            {step.rotulo ?? "Cargo"}
          </span>
          <h2 className="mb-2 text-2xl font-bold leading-tight text-primary md:text-3xl">
            {step.titulo}
          </h2>
          {step.subtitulo && (
            <p className="text-lg text-on-surface-variant">{step.subtitulo}</p>
          )}
          {erro && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
        </div>

        {/* Opcoes */}
        <div className="flex flex-1 flex-col gap-3">
          {candidatos?.map((c) => {
            // Candidatos reais tem avatar; Branco/Nulo, Indeciso e temas ficam simples.
            const temAvatar =
              !step.semAvatar && c.id !== "branco_nulo" && c.id !== "indeciso";
            // Divider antes do 1o item "simples" (Branco/Indeciso).
            const mostraDivider =
              !step.semAvatar &&
              (c.id === "branco_nulo" || c.id === "indeciso") &&
              !dividerInserido;
            if (mostraDivider) dividerInserido = true;
            return (
              <div key={c.id}>
                {mostraDivider && (
                  <div className="mx-auto mb-3 h-px w-full bg-surface-container-highest" />
                )}
                <OptionCard
                  candidato={c}
                  ativo={selecionados.includes(c.id)}
                  temAvatar={temAvatar}
                  multi={multi}
                  onClick={() => selecionar(c.id)}
                />
              </div>
            );
          })}
        </div>

        {/* Turnstile visivel so na ULTIMA tela (custo afundado: a pessoa ja
            investiu, entao raramente desiste aqui). stopPropagation evita que
            o clique no widget limpe a selecao (limparAoClicarFora). */}
        {ultima && turnstileSiteKey && (
          <div
            className="mt-6 flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium text-on-surface-variant">
              Confirme que você não é um robô para enviar
            </p>
            <Turnstile
              siteKey={turnstileSiteKey}
              options={{ refreshExpired: "auto" }}
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken("")}
              onExpire={() => setTurnstileToken("")}
            />
          </div>
        )}
      </main>

      {/* Barra de acao inferior */}
      <div className="fixed bottom-0 z-40 w-full border-t border-slate bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.04)] md:relative md:mt-auto md:border-none md:bg-transparent md:shadow-none">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-4 pb-safe md:py-0 md:pb-8">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={voltar}
              className="flex items-center justify-center rounded-lg border border-slate px-5 py-4 font-semibold text-secondary transition-all duration-200 hover:bg-surface-container-low active:scale-[0.98]"
            >
              <Icon name="arrow_back" className="text-[20px]" />
            </button>
          )}
          <button
            type="button"
            disabled={!podeConfirmar || faltaTurnstile}
            onClick={confirmar}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-900 py-4 text-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ultima ? "Confirmar e enviar" : "Confirmar"}
            <Icon name="arrow_forward" className="text-[20px]" />
          </button>
        </div>
      </div>
    </div>
  );
  };

  return renderFase();
}

function OptionCard({
  candidato,
  ativo,
  temAvatar,
  multi = false,
  onClick,
}: {
  candidato: Candidato;
  ativo: boolean;
  temAvatar: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  // Tenta /public/candidatos/<id>.<ext> em varios formatos; cai no icone se
  // nenhum existir. Se `foto` estiver definido no candidato, usa ele direto.
  const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
  const [extIdx, setExtIdx] = useState(0);
  const [semFoto, setSemFoto] = useState(false);
  const foto = candidato.foto ?? `/candidatos/${candidato.id}${EXTS[extIdx]}`;
  const mostraFoto = temAvatar && !semFoto;

  const aoFalharImg = () => {
    if (candidato.foto || extIdx >= EXTS.length - 1) {
      setSemFoto(true);
    } else {
      setExtIdx((i) => i + 1);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex w-full items-center rounded-lg border bg-surface-container-lowest p-4 text-left transition-all duration-200",
        ativo
          ? "border-2 border-tertiary-blue shadow-[0_4px_12px_rgba(37,99,235,0.08)]"
          : "border-slate hover:border-outline-variant",
      ].join(" ")}
    >
      {/* Indicador: circulo (escolha unica) ou quadrado (multipla) */}
      <span
        className={[
          "mr-4 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors",
          multi ? "rounded-md" : "rounded-full",
          ativo ? "border-tertiary-blue bg-tertiary-blue" : "border-outline-variant",
        ].join(" ")}
      >
        <Icon
          name="check"
          className={[
            "text-[14px] text-white transition-opacity",
            ativo ? "opacity-100" : "opacity-0",
          ].join(" ")}
          fill
        />
      </span>

      {/* Avatar (somente candidatos): foto se existir, senao icone.
          next/image redimensiona pra 56px + WebP (o PNG original vira poucos KB). */}
      {temAvatar && (
        <span className="relative mr-4 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-low">
          {mostraFoto ? (
            <Image
              src={foto}
              alt={candidato.nome}
              fill
              sizes="56px"
              className="object-cover"
              onError={aoFalharImg}
            />
          ) : (
            <Icon name="person" className="text-on-surface-variant" fill />
          )}
        </span>
      )}

      <span className="flex-1">
        <span className="block text-lg font-semibold text-primary">
          {candidato.nome}
        </span>
        {(candidato.numero || candidato.partido) && (
          <span className="mt-0.5 block text-sm text-on-surface-variant">
            {[candidato.numero, candidato.partido].filter(Boolean).join(" • ")}
          </span>
        )}
      </span>
    </button>
  );
}

// Detecta automaticamente se o contato e e-mail ou WhatsApp/telefone.
type TipoContato = "email" | "whatsapp" | null;

function detectarContato(valor: string): TipoContato {
  const v = valor.trim();
  if (!v) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email";
  const digitos = v.replace(/\D/g, "");
  if (digitos.length >= 10 && digitos.length <= 13) return "whatsapp";
  return null;
}

function LeadStep({ votoId }: { votoId: string | null }) {
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch } = useForm<{ contato: string }>({
    defaultValues: { contato: "" },
  });

  const contato = watch("contato");
  const tipo = detectarContato(contato ?? "");
  const valido = tipo !== null;

  async function onSubmit(data: { contato: string }) {
    if (!valido) return;
    if (!votoId) {
      setEnviado(true);
      return;
    }
    setLoading(true);
    await registrarLead({ voto_id: votoId, contato: data.contato.trim() });
    setLoading(false);
    setEnviado(true);
  }

  return (
    <CenteredShell>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <Icon name="check_circle" className="text-[36px] text-green-600" fill />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary">Seu voto foi computado!</h2>
        <p className="text-lg text-secondary">Obrigado por participar da pesquisa.</p>
      </div>

      {enviado ? (
        <p className="w-full rounded-lg bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-700">
          Tudo certo! Avisaremos sobre novas pesquisas.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="w-full text-left">
          <label className="block text-sm font-medium text-on-surface-variant">
            Quer receber mais pesquisas? Deixe seu WhatsApp ou e-mail:
          </label>
          <div className="relative mt-2">
            <input
              type="text"
              autoComplete="off"
              placeholder="seu@email.com ou (00) 90000-0000"
              {...register("contato")}
              className="w-full rounded-lg border border-slate bg-surface-container-lowest px-4 py-3 pr-24 text-on-surface outline-none transition-colors focus:border-tertiary-blue"
            />
            {tipo && (
              <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">
                <Icon
                  name={tipo === "email" ? "mail" : "chat"}
                  className="text-[14px]"
                  fill
                />
                {tipo === "email" ? "E-mail" : "WhatsApp"}
              </span>
            )}
          </div>
          {contato && !valido && (
            <p className="mt-1 text-xs text-amber-600">
              Digite um e-mail válido ou um WhatsApp com DDD.
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-outline">
            Usaremos seu contato apenas para enviar novas pesquisas. Você pode
            pedir a remoção a qualquer momento — veja a{" "}
            <a
              href="/privacidade"
              target="_blank"
              className="font-medium text-tertiary-blue underline"
            >
              Política de Privacidade
            </a>
            .
          </p>
          <button
            type="submit"
            disabled={loading || !valido}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 py-4 text-lg font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Quero receber mais pesquisas"}
          </button>
        </form>
      )}
    </CenteredShell>
  );
}

// ----------------------------------------------------------------
// Componentes de layout compartilhados
// ----------------------------------------------------------------
function TopAppBar() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-outline-variant bg-surface-container-lowest/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[640px] items-center justify-center px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="AtlasIntel" className="h-8 w-auto" />
      </div>
    </header>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
      <div className="ambient-glow left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
      <div className="ambient-glow bottom-0 right-0 translate-x-1/2 translate-y-1/2" />

      <div className="relative z-10 w-full max-w-[640px]">
        <div className="glass-card flex animate-fade-in flex-col items-center gap-6 rounded-2xl p-8 text-center">
          {children}
        </div>
        <div className="mt-6 text-center text-xs text-outline">
          {BRAND} © 2026
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <div className="spinner h-12 w-12 rounded-full border-4 border-surface-container-highest border-t-navy" />
  );
}
