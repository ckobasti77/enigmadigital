/**
 * Brend glifovi koje `lucide-react` nema.
 *
 * Lucide namerno ne isporučuje logotipe (licenca), a Instagram, Facebook,
 * TikTok i Threads su za srpske male firme čest JEDINI kanal — bez ikonice se
 * red platformi čita kao gomila istih sivih linkova. Nacrtani su istim
 * pravilima kao lucide (24×24, `stroke="currentColor"`, `strokeWidth={2}`) da
 * bi stajali u istom redu bez optičkog skoka.
 */
import type { SVGProps } from "react";

function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </Base>
  );
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </Base>
  );
}

export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </Base>
  );
}

export function ThreadsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M16 8.5c-.8-1.6-2.3-2.5-4.2-2.5C8.6 6 6.5 8.4 6.5 12s2.1 6 5.3 6c2.9 0 4.7-1.7 4.7-3.7 0-1.9-1.5-3.1-3.9-3.1-1.6 0-2.7.7-2.7 1.8 0 .9.7 1.5 1.8 1.5 1.6 0 2.6-1.3 2.6-3.4" />
    </Base>
  );
}
