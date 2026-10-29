"use client";

import { useRef, useState } from "react";
import { FileText, FolderInput, Pencil, Trash2 } from "lucide-react";
import { AnimatedCheck } from "@/components/motion/animated-check";
import { FlipGroup } from "@/components/motion/flip-group";
import { Toaster } from "@/components/app/toaster";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Drawer } from "@/components/ui/drawer";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { Grupa, Sekcija } from "./delovi";

/**
 * Primitivi radnog dela (SPAJANJE S08, plan S07 §5): kartice, kontekstni
 * meni, avatar, traka za skrol, napredak, fioka, taster, oznaka, toast i
 * preneti pokret (kvačica, FLIP). Svaki primitiv ima ovde primer, da se vidi
 * u tamnoj temi pre nego što ga koristi prvi preneti ekran.
 */
const STAVKE_SKROLA = Array.from({ length: 18 }, (_, i) => `Stranica ${i + 1}`);
const POCETNI_RED = ["Ponuda za ScanMe", "Plan objava", "Ugovor sa klijentom", "Faktura za hosting"];

export function VodicProstor() {
  const [fioka, setFioka] = useState<"desno" | "dole" | null>(null);
  const [zavrseno, setZavrseno] = useState(false);
  const [red, setRed] = useState(POCETNI_RED);
  const listaRef = useRef<HTMLUListElement>(null);

  return (
    <Sekcija
      naslov="Radni deo: primitivi"
      opis="Base UI primitivi i pokret koje koriste ekrani dokumenata, zadataka, ideja i poruka."
    >
      <Toaster />

      <Grupa naslov="Kartice">
        <Tabs defaultValue="pregled">
          <TabsList>
            <TabsTrigger value="pregled">Pregled</TabsTrigger>
            <TabsTrigger value="zadaci">Zadaci</TabsTrigger>
            <TabsTrigger value="dokumenti">Dokumenti</TabsTrigger>
            <TabsTrigger value="mapa">Mapa</TabsTrigger>
          </TabsList>
          <TabsContent value="pregled" className="text-ui text-text-secondary">
            Opis oblasti i poslednje izmene.
          </TabsContent>
          <TabsContent value="zadaci" className="text-ui text-text-secondary">
            Zadaci ove oblasti.
          </TabsContent>
          <TabsContent value="dokumenti" className="text-ui text-text-secondary">
            Stablo stranica.
          </TabsContent>
          <TabsContent value="mapa" className="text-ui text-text-secondary">
            Mapa oblasti.
          </TabsContent>
        </Tabs>
        <Tabs defaultValue="tabla">
          <TabsList variant="pill" aria-label="Prikaz ideja">
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
          </TabsList>
        </Tabs>
      </Grupa>

      <Grupa naslov="Kontekstni meni">
        <ContextMenu>
          <ContextMenuTrigger className="grid h-24 max-w-md place-items-center rounded-lg border border-dashed border-line text-ui text-text-muted">
            Desni klik ili dug dodir
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => toast("Otvoreno.")}>
              <FileText />
              Otvori
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toast("Preimenovanje.")}>
              <Pencil />
              Preimenuj
            </ContextMenuItem>
            <ContextMenuItem closeOnClick={false}>
              <FolderInput />
              Premesti u oblast
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => toast.success("Premešteno u Korpu.")}
            >
              <Trash2 />
              Premesti u Korpu
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Grupa>

      <Grupa naslov="Avatar, taster, oznaka">
        <div className="flex flex-wrap items-center gap-3">
          {(["xs", "sm", "md", "lg"] as const).map((size) => (
            <Avatar key={size} size={size}>
              <AvatarFallback>AT</AvatarFallback>
            </Avatar>
          ))}
          <span className="mx-2 h-6 w-px bg-line-soft" />
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
          <Kbd>Q</Kbd>
          <Kbd>?</Kbd>
          <span className="mx-2 h-6 w-px bg-line-soft" />
          <Badge>Nacrt</Badge>
          <Badge ton="muted">Arhivirano</Badge>
          <Badge ton="success">Završeno</Badge>
          <Badge ton="warning">Rok sutra</Badge>
          <Badge ton="danger">Kasni 2 dana</Badge>
          <Badge ton="info">Novo</Badge>
        </div>
      </Grupa>

      <Grupa naslov="Traka za skrol i napredak">
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <ScrollArea className="h-40 rounded-lg border border-line">
            <ul className="divide-y divide-line-soft">
              {STAVKE_SKROLA.map((s) => (
                <li key={s} className="flex h-9 items-center px-3 text-ui text-foreground">
                  {s}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div className="flex flex-col justify-center gap-4">
            <Progress label="Završeni zadaci ove nedelje" value={64} />
            <Progress label="Otpremanje priloga" value={30} ton="info" size="sm" />
            <Progress label="Rokovi koji kasne" value={85} ton="warning" />
          </div>
        </div>
      </Grupa>

      <Grupa naslov="Fioka">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setFioka("desno")}>
            Fioka sa desne strane
          </Button>
          <Button variant="outline" onClick={() => setFioka("dole")}>
            Fioka odozdo
          </Button>
        </div>
        <Drawer
          open={fioka !== null}
          onOpenChange={(otvorena) => {
            if (!otvorena) setFioka(null);
          }}
          strana={fioka ?? "desno"}
          title="Ponuda za ScanMe"
          description="Zadatak · Prodaja"
          footer={
            <>
              <Button variant="ghost" onClick={() => setFioka(null)}>
                Zatvori
              </Button>
              <Button variant="primary" onClick={() => setFioka(null)}>
                Otvori zadatak
              </Button>
            </>
          }
        >
          <p className="text-copy text-text-secondary">
            Panel zadatka, detalj ideje ili istorija izmena. Stranica ispod ostaje na mestu.
          </p>
        </Drawer>
      </Grupa>

      <Grupa naslov="Toast">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast.success("Stranica je sačuvana.")}>
            Uspeh
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast("Završeno: Ponuda za ScanMe", {
                duration: 8000,
                action: { label: "Poništi", onClick: () => toast.info("Vraćeno.") },
              })
            }
          >
            Sa radnjom
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.error("Izmena nije sačuvana.", {
                description: "Neko iz tima je u međuvremenu izmenio ovu stranicu.",
              })
            }
          >
            Greška
          </Button>
          <Button variant="secondary" onClick={() => toast.warning("Rok je prošao juče.")}>
            Upozorenje
          </Button>
        </div>
      </Grupa>

      <Grupa naslov="Pokret: kvačica i promena redosleda">
        <div className="flex flex-wrap items-start gap-8">
          <label className="flex items-center gap-2 text-ui text-foreground">
            <AnimatedCheck
              checked={zavrseno}
              onCheckedChange={setZavrseno}
              label="Završi: Ponuda za ScanMe"
            />
            Ponuda za ScanMe
          </label>
          <div className="flex flex-col gap-2">
            <FlipGroup scope={listaRef} layoutKey={red.join("|")}>
              <ul ref={listaRef} className="flex w-64 flex-col gap-1">
                {red.map((s) => (
                  <li
                    key={s}
                    data-flip-id={s}
                    className="flex h-9 items-center rounded-md border border-line-soft bg-surface px-3 text-ui text-foreground"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </FlipGroup>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setRed((r) => [...r.slice(1), r[0]])}
            >
              Pomeri prvi na kraj
            </Button>
          </div>
        </div>
      </Grupa>
    </Sekcija>
  );
}
