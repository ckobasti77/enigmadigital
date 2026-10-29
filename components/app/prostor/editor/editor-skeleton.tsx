/**
 * Mesto uređivača dok se njegov komad učitava (SPAJANJE S10, plan S07 §11.2):
 * iste visine kao telo dokumenta, da se ništa ne pomeri kad uređivač stigne.
 * Namerno je u svom fajlu: ulaz `index.tsx` ga crta bez uvoza Tiptap-a.
 */
export function EditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="Učitavam uređivač"
      className="h-[42vh] animate-pulse rounded-2xl bg-muted sm:h-[52vh]"
    />
  );
}
