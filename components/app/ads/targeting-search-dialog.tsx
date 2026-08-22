"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeedbackNote } from "@/components/app/feedback";
import {
  Search,
  Sparkles,
  MapPin,
  Globe,
  Tag,
  Loader2,
  Info,
} from "lucide-react";

const TARGETING_TYPES = [
  { value: "adinterest", label: "Interesovanja", icon: Tag },
  { value: "adgeolocation", label: "Lokacije", icon: MapPin },
  { value: "adtargetingsuggestion", label: "Predlozi", icon: Sparkles },
  { value: "adlocale", label: "Jezici", icon: Globe },
];

interface TargetingSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TargetingItem {
  id: string;
  name: string;
  range: {
    lower?: number;
    upper?: number;
    formatted: string;
  };
  path?: string[];
  topic?: string;
  description?: string;
}

/**
 * Read-only Meta targeting search dialog (C5).
 * Allows researching interests, demographics, and geo-locations without mutating any ad state.
 */
export function TargetingSearchDialog({
  open,
  onOpenChange,
}: TargetingSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("adinterest");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TargetingItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTargeting = useAction(api.metaAds.searchTargetingAction);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setLoading(true);
    setError(null);
    try {
      const res = await searchTargeting({
        query: cleanQuery,
        type,
      });

      if (res.success) {
        setResults(res.results || []);
      } else {
        setError(res.error || "Pretraga nije uspela.");
        setResults([]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Greška pri pretrazi ciljanja.",
      );
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden p-6 gap-4 bg-surface border-line">
        <DialogHeader className="flex flex-col gap-1 pb-2 border-b border-line">
          <DialogTitle className="text-base font-bold text-foreground">
            Istraživanje ciljanja (Targeting Search)
          </DialogTitle>
          <DialogDescription className="text-xs text-text-muted">
            Pregled dostupnih Meta interesovanja, lokacija i procenjenih veličina publike (samo za čitanje).
          </DialogDescription>
        </DialogHeader>

        {/* Search Controls */}
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {TARGETING_TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent-400/10 text-accent-400 border border-accent-400/30"
                      : "bg-surface-raised border border-line text-text-muted hover:text-foreground hover:bg-surface-subtle"
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Unesite pojam za pretragu (npr. fitnes, marketing, Srbija)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 text-xs h-9 bg-surface-raised"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !query.trim()}
              className="text-xs h-9"
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Search className="mr-1.5 size-3.5" />
              )}
              Pretraži
            </Button>
          </div>
        </form>

        {/* Error Note */}
        {error && (
          <FeedbackNote tone="danger" title="Greška pri pretrazi">
            {error}
          </FeedbackNote>
        )}

        {/* Results Container */}
        <div className="flex-1 overflow-auto rounded-lg border border-line bg-surface min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[300px] gap-2 text-text-muted">
              <Loader2 className="size-6 text-accent-400 animate-spin" />
              <span className="text-xs">Pretraga Meta kataloga...</span>
            </div>
          ) : results.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-subtle text-text-muted">
                  <th className="px-3 py-2 font-medium">Naziv</th>
                  <th className="px-3 py-2 font-medium">Veličina publike (Raspon)</th>
                  <th className="px-3 py-2 font-medium">Putanja / Tema</th>
                  <th className="px-3 py-2 font-medium">Opis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-raised/50">
                    <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">
                      {item.range.formatted}
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {item.path && item.path.length > 0
                        ? item.path.join(" > ")
                        : item.topic || "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted max-w-xs truncate" title={item.description}>
                      {item.description || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : searched ? (
            <div className="flex flex-col items-center justify-center h-[300px] gap-2 text-text-muted">
              <Info className="size-5 text-text-muted/60" />
              <span className="text-xs">Nema pronađenih rezultata za uneti pojam.</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] gap-2 text-text-muted">
              <Search className="size-5 text-text-muted/60" />
              <span className="text-xs">Unesite pojam iznad kako biste pretražili Meta bazu ciljanja.</span>
            </div>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
