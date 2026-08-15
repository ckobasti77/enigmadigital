import { ConnectionsSettings } from "@/components/app/settings/connections-settings";

export default function SettingsPage() {
  return (
    <div className="w-full max-w-3xl">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Podešavanja
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
        Integracije
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Poveži izvore podataka. Kredencijali se čuvaju enkriptovano i koriste se
        samo pri sinhronizaciji.
      </p>

      <ConnectionsSettings />
    </div>
  );
}
