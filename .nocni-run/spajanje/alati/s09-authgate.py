# SPAJANJE S09: kapija prijave pravi profil radnog dela i crta traku u zameni ljuske.
import sys
p = 'components/app/auth-gate.tsx'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    if a not in s:
        sys.exit('NEMA: ' + a[:80])
    s = s.replace(a, b, 1)
rep('''import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";''', '''import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";''')
rep('''      <Authenticated>
        <PozivnicaCatcher />
        {children}
      </Authenticated>''', '''      <Authenticated>
        <PozivnicaCatcher />
        <ProfilRadnogDela />
        {children}
      </Authenticated>''')
rep('''/**
 * Parks an incoming Instagram OAuth code''', '''/**
 * Profil radnog dela (SPAJANJE P6): ime i avatar koje tim vidi uz zadatke i
 * poruke. Nastaje lenjo, posle prijave, jednom po ulasku; poziv je
 * idempotentan. Početno ime je ime naloga. Greška se ne prikazuje: sledeći
 * ulaz pokušava ponovo, a ekrani radnog dela do tada čekaju profil.
 */
function ProfilRadnogDela() {
  const ja = useQuery(api.projekti.ja);
  const obezbedi = useMutation(api.prostor.profiles.ensureCurrent);
  const pozvano = useRef(false);
  useEffect(() => {
    if (ja === undefined || pozvano.current) return;
    pozvano.current = true;
    void obezbedi(ja.ime ? { displayName: ja.ime } : {}).catch(() => {
      // tiho: sledeći ulaz pokušava ponovo
    });
  }, [ja, obezbedi]);
  return null;
}

/**
 * Parks an incoming Instagram OAuth code''')
rep('''function ShellFallback() {
  return (
    <>
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] md:block" />
      <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]">''', '''function ShellFallback() {
  // Traka projekata i meni stoje na istom mestu kao u ljusci (SPAJANJE P14);
  // u panelu je širina trake nula (`data-traka="ne"`).
  return (
    <>
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--traka-width)] md:block" />
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] md:left-[var(--traka-width)] md:block" />
      <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[calc(var(--traka-width)_+_var(--sidebar-width))]">''')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
