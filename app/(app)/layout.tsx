import { AuthGate } from "@/components/app/auth-gate";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Prijava za hub „Svi projekti“ i za sve ekrane projekta; projekat i ljusku
  // daje layout `[projekat]`.
  return <AuthGate>{children}</AuthGate>;
}
