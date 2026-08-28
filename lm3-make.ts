import * as XLSX from "xlsx";

const H = ["#","Ime_Salona","Lokacija","Telefon","Ime_osobe","Pozicija","Ocena","Napomena_za_prodaju","Izvor_podataka"];
const r1 = [1,"Hair Lab","Jurija Gagarina 14lj, Novi Beograd","0605020620","Bojan Lalić","Vlasnik","5.0 (Google, 53 rec.)","Nema sajt — koristi Setmore za zakazivanje.","Google/Setmore\nCompanyWall: https://www.companywall.rs/firma/bojan-lalic-pr-hair-lab/MMx7SNOyD"];
const r2 = [2,"Hair Salon Nada","Ismeta Mujezinovića 18a","Proveriti na 011info",null,null,"Na 011info","Nema sajt. Kompletan frizerski.","011info"];
const r3 = [3,"Pro Team Borča","Bratstva i Jedinstva 25","0611450415","Adaleta Krasnić","Vlasnik","9.4/10 (SrediMe, 143 rec.)","Nema sajt. Vlasnik: Ana Krasnić.","SrediMe\nCompanyWall (aproks.): https://www.companywall.rs/firma/proteam-by-glam/MMxBftwlR"];

function sheet(title: string, rows: any[][]) {
  return XLSX.utils.aoa_to_sheet([[title],H,["BATCH 1 — Lidovi 1-3 (top kvalitet)"],...rows]);
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet("MASTER LISTA — 3 salona", [r1,r2,r3]), "Svi lidovi (3)");
XLSX.utils.book_append_sheet(wb, sheet("BATCH 1", [r1,r2,r3]), "Batch 1 (1-3)");
XLSX.writeFile(wb, "lm3-uzorak.xlsx");
console.log("napravljen lm3-uzorak.xlsx: 2 sheeta, naslov u redu 1, zaglavlje u redu 2, razdelnik u redu 3");
