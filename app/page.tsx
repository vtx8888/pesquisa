import { STEPS } from "@/lib/candidates";
import { Wizard } from "./wizard";

export default function Home() {
  const titulo = process.env.NEXT_PUBLIC_POLL_TITLE ?? "Pesquisa de Opinião 2026";
  const siteKeyRaw = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  // Ignora valor placeholder do .env.example (contem "...").
  const siteKey = siteKeyRaw.includes("...") ? "" : siteKeyRaw;

  return <Wizard titulo={titulo} steps={STEPS} turnstileSiteKey={siteKey} />;
}
