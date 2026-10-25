/** Bez dijakritike i malim slovima — „price" nalazi „Priče", „scan" nalazi „ScanMe". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
