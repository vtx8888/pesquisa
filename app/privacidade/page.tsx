import Link from "next/link";
import type { Metadata } from "next";

// TROQUE pelos dados reais do responsavel pela pesquisa.
const RESPONSAVEL = "[Nome do responsável / organização]";
const CONTATO_EMAIL = "[e-mail de contato]";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  robots: { index: false, follow: false },
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-primary">{titulo}</h2>
      <div className="mt-2 space-y-2 text-secondary">{children}</div>
    </section>
  );
}

export default function Privacidade() {
  return (
    <main className="app-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-[720px]">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-tertiary-blue hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Voltar
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-primary">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-outline">
          Tratamento de dados conforme a Lei Geral de Proteção de Dados — LGPD
          (Lei nº 13.709/2018).
        </p>

        <Secao titulo="1. Responsável pelo tratamento">
          <p>
            Esta pesquisa é conduzida por {RESPONSAVEL}. Para exercer seus
            direitos ou tirar dúvidas, contate: {CONTATO_EMAIL}.
          </p>
        </Secao>

        <Secao titulo="2. Dados que coletamos">
          <p className="font-semibold text-on-surface">Coletados automaticamente:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Endereço IP;</li>
            <li>Localização aproximada (cidade, estado e país), derivada do IP;</li>
            <li>Identificador técnico do dispositivo (fingerprint) e do navegador (User-Agent);</li>
            <li>Um cookie de sessão anônimo, para evitar votos duplicados;</li>
            <li>Data e hora do acesso.</li>
          </ul>
          <p className="mt-2 font-semibold text-on-surface">Suas respostas:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Seus votos e os temas selecionados — registrados de forma anônima.</li>
          </ul>
          <p className="mt-2 font-semibold text-on-surface">Fornecidos por você (opcional):</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>E-mail ou WhatsApp, apenas se você optar por recebê-los ao final.</li>
          </ul>
        </Secao>

        <Secao titulo="3. Finalidade">
          <ul className="list-disc space-y-1 pl-5">
            <li>Apurar os resultados da pesquisa de forma estatística e agregada;</li>
            <li>Garantir a integridade da pesquisa, evitando votos duplicados (prevenção a fraudes);</li>
            <li>Se você fornecer contato, enviar convites para novas pesquisas.</li>
          </ul>
        </Secao>

        <Secao titulo="4. Base legal">
          <p>
            O tratamento se apoia no seu <strong>consentimento</strong> (art. 7º,
            I, da LGPD), manifestado ao iniciar a pesquisa e ao fornecer seu
            contato, e no <strong>legítimo interesse</strong> (art. 7º, IX) para
            a prevenção a fraudes.
          </p>
        </Secao>

        <Secao titulo="5. Compartilhamento e operadores">
          <p>
            Não vendemos seus dados. Utilizamos provedores que atuam como
            operadores: <strong>Supabase</strong> (armazenamento do banco de
            dados) e <strong>ipwho.is</strong> (geolocalização aproximada por
            IP). O acesso é protegido por verificação anti-bot (Cloudflare
            Turnstile).
          </p>
        </Secao>

        <Secao titulo="6. Retenção">
          <p>
            Os dados são mantidos pelo tempo necessário às finalidades acima e
            eliminados quando deixarem de ser necessários, salvo obrigação legal
            de guarda.
          </p>
        </Secao>

        <Secao titulo="7. Seus direitos">
          <p>
            Você pode solicitar acesso, correção, anonimização, portabilidade ou
            exclusão dos seus dados, além de revogar o consentimento, pelo
            contato {CONTATO_EMAIL}.
          </p>
        </Secao>

        <p className="mt-10 text-xs text-outline">
          Esta política pode ser atualizada. Consulte esta página periodicamente.
        </p>
      </div>
    </main>
  );
}
