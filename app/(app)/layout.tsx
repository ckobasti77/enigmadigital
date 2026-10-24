import { AppShell } from "@/components/app/app-shell";
import { ProjekatProvider } from "@/components/app/projekat-provider";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Do rutiranja `/[projekat]` (C08) provider uzima prvi projekat korisnika.
  return (
    <ProjekatProvider>
      <AppShell>{children}</AppShell>
    </ProjekatProvider>
  );
}
