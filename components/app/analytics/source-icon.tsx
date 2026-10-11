import type { ComponentType, SVGProps } from "react";
import {
  CornerDownRight,
  Globe,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  Search,
  SquarePlay,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TikTokIcon,
} from "@/components/app/brand-glyphs";

type SourceKind =
  | "instagram"
  | "facebook"
  | "threads"
  | "tiktok"
  | "youtube"
  | "dm"
  | "direct"
  | "email"
  | "paid"
  | "search"
  | "referral"
  | "other";

const ICONS: Record<SourceKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  threads: ThreadsIcon,
  tiktok: TikTokIcon,
  youtube: SquarePlay,
  dm: MessageCircle,
  direct: CornerDownRight,
  email: Mail,
  paid: Megaphone,
  search: Search,
  referral: Link2,
  other: Globe,
};

/**
 * Vrsta izvora saobraćaja — po imenu izvora, pa po mediju. Nepoznat izvor je
 * „other" (globus), ne nagađanje.
 */
function kindOf(source: string, medium: string): SourceKind {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();

  if (s.includes("instagram") || s === "ig") return "instagram";
  if (s.includes("facebook") || s === "fb" || s === "meta") return "facebook";
  if (s.includes("threads")) return "threads";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube") || s === "yt") return "youtube";
  if (s.includes("openreply") || m.includes("dm")) return "dm";
  if (s === "(direct)" || s === "direct") return "direct";
  if (m === "email" || s.includes("mail") || s.includes("newsletter")) return "email";
  if (m === "cpc" || m === "ppc" || m.includes("paid")) return "paid";
  if (
    m === "organic" ||
    s.includes("google") ||
    s.includes("bing") ||
    s.includes("duckduckgo") ||
    s.includes("yahoo")
  ) {
    return "search";
  }
  if (m === "referral") return "referral";
  return "other";
}

/**
 * Ikonica izvora u pločici boje modula. Samo ubrzava čitanje reda; naziv
 * izvora uvek stoji pored, pa ikonica nije jedini nosilac.
 */
export function SourceIcon({
  source,
  medium,
}: {
  source: string;
  medium: string;
}) {
  const Icon = ICONS[kindOf(source, medium)];
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-mod-soft text-mod">
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
