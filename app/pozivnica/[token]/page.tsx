import { PozivnicaClient } from "./pozivnica-client";

/**
 * Javna ruta `/pozivnica/<token>` — van `(app)` grupe, pa nije pod auth gate-om
 * (poziva je neko ko još nema nalog). Token dolazi iz URL-a; sve ostalo radi
 * klijentski deo.
 */
export default async function PozivnicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PozivnicaClient token={token} />;
}
