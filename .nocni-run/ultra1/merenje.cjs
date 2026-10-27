// ULTRA1: merenje ekrana razvojnog prikaza (isti alat kojim je rađena revizija 27. 10. 2026,
// bez axe-a). Meri tekst ispod 12 px, dodirne mete, primarna dugmad iznad preloma, dužinu strane
// i broj boja, na 1536x695 i 390x844.
// Upotreba (dev server mora da radi: npx next dev -p 3105):
//   node .nocni-run/ultra1/merenje.cjs --oznaka T14 [--port 3105] [--only a,b] [--vp 1536x695,390x844]
// Izlaz: docs/ultra/merenja/<oznaka>.jsonl, <oznaka>-sazetak.json i <oznaka>-sazetak.md
// axe (kontrast) se pokreće samo ako je zadata putanja do axe.min.js u env AXE_PATH.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const PORT = opt("--port", "3105");
const ONLY = opt("--only", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const VPS = opt("--vp", "1536x695,390x844").split(",");
const OZNAKA = opt("--oznaka", "merenje");
const OUT_DIR = path.join(__dirname, "..", "..", "docs", "ultra", "merenja");
const OUT = path.join(OUT_DIR, `${OZNAKA}.jsonl`);
const AXE = process.env.AXE_PATH || null;
const BASE = `http://localhost:${PORT}`;

// --- fixtures copied from ED/scripts/ux-snapshots.mjs (B phase) ---
const LEAD_PROFIL_ID = "lc_ux_test_002";
const UX_WS = "ws_ux_test_000000000000000";
const SADA = Date.now();
const lokalniPost = (n, status, title, kind, category, danaUnazad) => ({
  _id: `post_ux_lokalni_${n}`, _creationTime: SADA - danaUnazad * 86_400_000, workspaceId: UX_WS,
  slug: `test-${status}-${n}`, locale: "sr", kind, category, title, dek: "Probni podnaslov.", body: "",
  authorName: "Test Operater", tags: ["test"], status, updatedAt: SADA - danaUnazad * 86_400_000, ownProofChecked: false,
});
const NOVOSTI_LOKALNO = {
  [`enigma:novosti:drafts:${UX_WS}`]: JSON.stringify([
    lokalniPost(1, "draft", "Test nacrt 1: beleška u pripremi", "note", "greske", 1),
    lokalniPost(2, "draft", "Test nacrt 2: tekst koji čeka kapije", "article", "novac_rokovi", 4),
    lokalniPost(3, "draft", "Test nacrt 3", "note", "ai_razvoj", 9),
    lokalniPost(4, "archived", "Test arhiviran post", "article", "srpski_kontekst", 60),
  ]),
};
const D = "1536x695", M = "390x844";
// vp: which viewports to measure. Plain screens: both. Click/overlay states: as designated by the snapshot list.
const EKRANI = [
  { ime: "kontrolna-tabla", putanja: "/" },
  { ime: "leadovi", putanja: "/leadovi" },
  { ime: "leadovi-tabela", putanja: "/leadovi?tab=leads" },
  { ime: "leadovi-zaostali", putanja: "/leadovi?tab=overdue" },
  { ime: "leadovi-rupe", putanja: "/leadovi?tab=gaps" },
  { ime: "leadovi-sastanci", putanja: "/leadovi?tab=meetings" },
  { ime: "leadovi-mapa", putanja: "/leadovi?tab=map" },
  { ime: "uvoz", putanja: "/leadovi/uvoz" },
  { ime: "uvoz-pregled", putanja: "/leadovi/uvoz?import=imp_ux_4" },
  { ime: "uvoz-istorija", putanja: "/leadovi/uvoz", klik: ['[data-tab-id="history"]', 'table button[aria-expanded="false"]'] },
  { ime: "instagram", putanja: "/instagram" },
  { ime: "openreply", putanja: "/openreply" },
  { ime: "novosti", putanja: "/novosti", lokalno: NOVOSTI_LOKALNO },
  { ime: "novosti-prazno", putanja: "/novosti", prazno: true },
  { ime: "analitika", putanja: "/analytics" },
  { ime: "atribucija", putanja: "/atribucija" },
  { ime: "facebook", putanja: "/facebook" },
  { ime: "threads", putanja: "/threads" },
  { ime: "youtube", putanja: "/youtube" },
  { ime: "oglasi", putanja: "/ads" },
  { ime: "leadovi-profil", putanja: `/leadovi/${LEAD_PROFIL_ID}` },
  { ime: "pravila", putanja: "/rules" },
  { ime: "podesavanja", putanja: "/settings" },
  { ime: "ljuska-sina", putanja: "/instagram", klik: ['button[aria-label="Skupi bočnu traku"]'], vp: [D], ljuska: true },
  { ime: "ljuska-paleta", putanja: "/leadovi", klik: ['button[aria-label="Komandna paleta"]'], ljuska: true },
  { ime: "ljuska-meni", putanja: "/leadovi", klik: ['button[aria-label^="Meni korisnika"]'], ljuska: true },
  { ime: "ljuska-vise", putanja: "/analytics", klik: ['nav.fixed > button[aria-haspopup="dialog"]'], vp: [M], ljuska: true },
  { ime: "ljuska-danas", putanja: "/leadovi", klik: ['nav.fixed button[aria-label^="Šta me čeka"]'], vp: [M], ljuska: true },
  { ime: "napredak", putanja: "/napredak" },
  { ime: "napredak-prazno", putanja: "/napredak", prazno: true },
  { ime: "podesavanja-napredak", putanja: "/settings", klik: ['[data-tab-id="napredak"]'] },
  { ime: "napredak-paleta", putanja: "/napredak", klik: ['button[aria-label="Komandna paleta"]'], vp: [D], ljuska: true },
  { ime: "napredak-pad", putanja: "/napredak?pad=napredak", ocekivanaGreska: true },
  { ime: "ljuska-pad-napretka", putanja: "/leadovi?pad=napredak", vp: [D], ljuska: true, ocekivanaGreska: true },
  { ime: "leadovi-poziv", putanja: "/leadovi?rezim=poziv" },
  { ime: "leadovi-poziv-tok", putanja: "/leadovi?rezim=poziv", klik: ['[data-ishod="nije_se_javio"]', '[data-ishod="zainteresovan"]'] },
  { ime: "kontrolna-tabla-prazno", putanja: "/", prazno: true },
  { ime: "leadovi-tabela-kolone", putanja: "/leadovi?tab=leads", klik: ['button[aria-pressed="false"]:has-text("Prikaži")'], vp: [D] },
  { ime: "leadovi-profil-radnje", putanja: `/leadovi/${LEAD_PROFIL_ID}`, klik: ['button:has-text("Još radnji")'], vp: [D] },
  { ime: "uvoz-nereseno", putanja: "/leadovi/uvoz?prikaz=nerazreseno" },
  { ime: "leadovi-mapa-panel", putanja: `/leadovi?tab=map&firma=${LEAD_PROFIL_ID}` },
  { ime: "instagram-prazno", putanja: "/instagram", prazno: true },
  { ime: "analitika-prazno", putanja: "/analytics", prazno: true },
  { ime: "facebook-prazno", putanja: "/facebook", prazno: true },
  { ime: "threads-prazno", putanja: "/threads", prazno: true },
  { ime: "youtube-prazno", putanja: "/youtube", prazno: true },
  { ime: "oglasi-prazno", putanja: "/ads", prazno: true },
  { ime: "instagram-komentari", putanja: "/instagram/komentari" },
  { ime: "facebook-komentari", putanja: "/facebook/komentari" },
  { ime: "youtube-automatizacije", putanja: "/youtube/automatizacije" },
  { ime: "oglasi-nova-kampanja", putanja: "/ads/nova-kampanja" },
  { ime: "oglasi-publike", putanja: "/ads/publike" },
  { ime: "analitika-sticanje", putanja: "/analytics/sticanje" },
  { ime: "analitika-oglasi", putanja: "/analytics/oglasi" },
  { ime: "analitika-sadrzaj", putanja: "/analytics/sadrzaj" },
  { ime: "analitika-posetioci", putanja: "/analytics/posetioci" },
  { ime: "analitika-uzivo", putanja: "/analytics/uzivo" },
  { ime: "analitika-retencija", putanja: "/analytics/retencija" },
  { ime: "openreply-automatizacije", putanja: "/openreply/automatizacije" },
  { ime: "pravila-istorija", putanja: "/rules", klik: ['[data-tab-id="firings"]'] },
  { ime: "openreply-prazno", putanja: "/openreply", prazno: true },
  { ime: "threads-objavi", putanja: "/threads", klik: ['[data-variant="primary"]:has-text("Objavi")'], vp: [D] },
  // Klik na jezičak u Podešavanjima radi router.replace("…/settings?tab=X") i gubi ?ux=1 → strana prijave.
  // Zato se stanje „Napredak" meri direktnom adresom (samo uz --only).
  { ime: "podesavanja-napredak-direkt", putanja: "/settings?tab=napredak", samoOnly: true },
].filter((e) => (ONLY ? ONLY.includes(e.ime) : !e.samoOnly));

// ---------------------------------------------------------------- in-page measurement
function measureInPage({ vw, vh, mobile }) {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const norm = (c) => {
    if (cache.has(c)) return cache.get(c);
    let v;
    ctx.fillStyle = "#010203";
    ctx.fillStyle = c;
    if (ctx.fillStyle === "#010203" && !/^#010203$/i.test(c)) {
      v = "raw:" + c;
    } else {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      v = `${d[0]},${d[1]},${d[2]},${(d[3] / 255).toFixed(2)}`;
    }
    cache.set(c, v);
    return v;
  };
  const rgba = (c) => norm(c).split(",").map(Number);
  const lum = ([r, g, b]) => {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const hiddenTree = (el) => !!el.closest('[inert], [aria-hidden="true"]');
  // visually-hidden (sr-only): clip-path inset(50%) / clip rect(0 0 0 0) on the element or a close ancestor
  const srOnly = (el) => {
    for (let q = el, i = 0; q && i < 4; q = q.parentElement, i++) {
      const cs = getComputedStyle(q);
      if (cs.clipPath === "inset(50%)" || /^rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)$/.test(cs.clip)) return true;
    }
    return false;
  };
  const visible = (el) => {
    if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    if (srOnly(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.bottom + window.scrollY <= 0 || r.right + window.scrollX <= 0) return false; // parked off-screen (skip link)
    return r.width >= 2 && r.height >= 2;
  };
  const label = (el) => {
    const t = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
    const role = el.getAttribute("role");
    const tag = el.tagName.toLowerCase() + (role ? `[role=${role}]` : "") + (el.dataset?.variant ? `[${el.dataset.variant}]` : "");
    return `${tag} "${t.slice(0, 40)}"`;
  };
  const inViewport = (r) => r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;

  // ---------- interactive elements
  const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';
  const inter = [...document.querySelectorAll(SEL)].filter((el) => visible(el) && !hiddenTree(el));
  const enabled = inter.filter((el) => !el.matches(":disabled, [aria-disabled='true']"));
  const isInlineLink = (el) => {
    if (el.tagName !== "A") return false;
    if (getComputedStyle(el).display !== "inline") return false;
    const p = el.parentElement;
    if (!p) return false;
    return [...p.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 0);
  };
  const minSide = mobile ? 44 : 24;
  const rects = enabled.map((el) => el.getBoundingClientRect());
  const small = [];
  enabled.forEach((el, i) => {
    const r = rects[i];
    if (r.width < minSide || r.height < minSide) small.push({ el, r, inline: isInlineLink(el) });
  });
  // WCAG 2.5.8 spacing exception (desktop, 24px): undersized target passes if a 24px circle
  // centred on it does not intersect another target or another undersized target's circle.
  let failSpacing = null;
  if (!mobile) {
    const smallSet = new Set(small.map((s) => s.el));
    const distRect = (cx, cy, r) => {
      const dx = Math.max(r.left - cx, 0, cx - r.right);
      const dy = Math.max(r.top - cy, 0, cy - r.bottom);
      return Math.hypot(dx, dy);
    };
    failSpacing = small.filter((s) => {
      if (s.inline) return false;
      const cx = s.r.left + s.r.width / 2, cy = s.r.top + s.r.height / 2;
      for (let j = 0; j < enabled.length; j++) {
        const o = enabled[j];
        if (o === s.el || o.contains(s.el) || s.el.contains(o)) continue;
        const ro = rects[j];
        if (smallSet.has(o)) {
          const ox = ro.left + ro.width / 2, oy = ro.top + ro.height / 2;
          if (Math.hypot(cx - ox, cy - oy) < 24) return true;
        } else if (distRect(cx, cy, ro) < 12) return true;
      }
      return false;
    }).length;
  }
  const smallNonInline = small.filter((s) => !s.inline);
  const ex = (arr) => arr.slice(0, 200).map((s) => `${label(s.el)} ${Math.round(s.r.width)}x${Math.round(s.r.height)}`);
  // most common undersized sizes (signature)
  const sig = {};
  for (const s of smallNonInline) { const k = `${Math.round(s.r.width)}x${Math.round(s.r.height)}`; sig[k] = (sig[k] || 0) + 1; }

  // above the fold (scrollY = 0)
  const atf = inter.filter((el) => inViewport(el.getBoundingClientRect()));
  const atfMain = atf.filter((el) => el.closest("main"));
  const primaryVis = [...document.querySelectorAll('[data-variant="primary"]')].filter((el) => visible(el) && !hiddenTree(el));
  const defaultVis = [...document.querySelectorAll('[data-variant="default"]')].filter((el) => visible(el) && !hiddenTree(el));
  const primaryAtf = primaryVis.filter((el) => inViewport(el.getBoundingClientRect()));
  const defaultAtf = defaultVis.filter((el) => inViewport(el.getBoundingClientRect()));
  // computed "filled CTA": opaque saturated fill + dark text, on an interactive element
  const filled = inter.filter((el) => {
    const cs = getComputedStyle(el);
    const bg = rgba(cs.backgroundColor);
    if (bg.length < 4 || bg[3] < 0.85) return false;
    const sat = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]);
    if (sat < 60) return false;
    const fg = rgba(cs.color);
    return lum(fg) < 0.12 && lum(bg) > 0.2;
  });
  const filledAtf = filled.filter((el) => inViewport(el.getBoundingClientRect()));

  // ---------- text nodes, font sizes, colors
  const sizes = {};
  const textColors = {};
  const tiny = [];
  let textNodes = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const rng = document.createRange();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(p.tagName)) continue;
    if (p.closest(".impeccable-overlay, nextjs-portal")) continue;
    if (!p.checkVisibility || !p.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const pr = p.getBoundingClientRect();
    if (pr.width <= 1 || pr.height <= 1 || srOnly(p)) continue; // sr-only
    rng.selectNodeContents(n);
    const rr = [...rng.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rr.length) continue;
    const cs = getComputedStyle(p);
    let fs = parseFloat(cs.fontSize);
    if (p instanceof SVGElement && p.getScreenCTM) {
      const m = p.getScreenCTM();
      if (m) fs = fs * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    }
    fs = Math.round(fs * 2) / 2;
    textNodes++;
    sizes[fs] = (sizes[fs] || 0) + 1;
    const col = norm(cs.color);
    textColors[col] = (textColors[col] || 0) + 1;
    if (fs < 12) tiny.push(`${fs}px "${n.nodeValue.trim().slice(0, 30)}" <${p.tagName.toLowerCase()}${p.closest("svg") ? " svg" : ""}>`);
  }
  // ---------- background colours
  const bgColors = {};
  let gradients = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(".impeccable-overlay, nextjs-portal")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) gradients++;
    const c = norm(cs.backgroundColor);
    if (c.startsWith("raw:") || Number(c.split(",")[3]) > 0) bgColors[c] = (bgColors[c] || 0) + 1;
  }
  // ---------- headings
  const hv = (sel) => {
    const all = [...document.querySelectorAll(sel)];
    return { dom: all.length, visible: all.filter((h) => visible(h)).length, texts: all.slice(0, 4).map((h) => h.textContent.replace(/\s+/g, " ").trim().slice(0, 50)) };
  };
  // ---------- overflow
  const cw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
      const ox = getComputedStyle(q).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  let protrude = 0; const protrudeEx = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > cw + 1 && !clipped(el)) {
      protrude++;
      if (protrudeEx.length < 5) protrudeEx.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} (+${Math.round(r.right - cw)}px)`);
    }
  }
  // ---------- fixed chrome at the fold
  let topChrome = 0, bottomChrome = 0;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (!visible(el) || hiddenTree(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= vh / 2 || r.width < vw * 0.6) continue;
    if (r.top <= 1 && r.bottom > 0) topChrome = Math.max(topChrome, r.bottom);
    if (r.bottom >= vh - 1 && r.top < vh) bottomChrome = Math.max(bottomChrome, vh - r.top);
  }
  const firstPrimaryY = primaryVis.length ? Math.round(Math.min(...primaryVis.map((el) => el.getBoundingClientRect().top + window.scrollY))) : null;
  return {
    docHeight: document.documentElement.scrollHeight,
    viewportsTall: +(document.documentElement.scrollHeight / vh).toFixed(2),
    hOverflow: document.documentElement.scrollWidth > cw + 1,
    scrollWidth: document.documentElement.scrollWidth,
    protrude, protrudeEx,
    coarse: matchMedia("(pointer: coarse)").matches,
    hoverNone: matchMedia("(hover: none)").matches,
    interactiveVisible: inter.length,
    interactiveEnabled: enabled.length,
    smallTargets: small.length,
    smallTargetsNonInline: smallNonInline.length,
    smallInlineLinks: small.length - smallNonInline.length,
    smallFailSpacing: failSpacing,
    smallExamples: ex(smallNonInline),
    smallSig: Object.entries(sig).sort((a, b) => b[1] - a[1]).slice(0, 6),
    atfInteractive: atf.length,
    atfInteractiveMain: atfMain.length,
    atfInteractiveShell: atf.length - atfMain.length,
    primaryVisible: primaryVis.length,
    primaryAtf: primaryAtf.length,
    primaryAtfLabels: primaryAtf.map(label),
    firstPrimaryY,
    defaultAtf: defaultAtf.length,
    defaultAtfLabels: defaultAtf.slice(0, 6).map(label),
    filledAtf: filledAtf.length,
    filledAtfLabels: filledAtf.slice(0, 8).map(label),
    textNodes,
    fontSizes: sizes,
    tinyText: tiny.length,
    tinyExamples: tiny.slice(0, 12),
    distinctTextColors: Object.keys(textColors).length,
    topTextColors: Object.entries(textColors).sort((a, b) => b[1] - a[1]).slice(0, 8),
    distinctBgColors: Object.keys(bgColors).length,
    topBgColors: Object.entries(bgColors).sort((a, b) => b[1] - a[1]).slice(0, 8),
    gradients,
    h1: hv("h1"), h2: hv("h2"),
    topChrome: Math.round(topChrome), bottomChrome: Math.round(bottomChrome),
    title: document.title,
  };
}

async function measure(browser, ekran, vpName) {
  const [w, h] = vpName.split("x").map(Number);
  const mobile = w < 768;
  const context = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
    locale: "sr-RS", colorScheme: "dark", reducedMotion: "reduce",
  });
  const page = await context.newPage();
  if (ekran.lokalno) {
    await page.addInitScript((stavke) => { for (const [k, v] of Object.entries(stavke)) window.localStorage.setItem(k, v); }, ekran.lokalno);
  }
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 240)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 240)));
  const sep = ekran.putanja.includes("?") ? "&" : "?";
  const url = `${BASE}${ekran.putanja}${sep}ux=1${ekran.prazno ? "&prazno=1" : ""}`;
  const rec = { ime: ekran.ime, vp: vpName, url: url.replace(BASE, ""), ljuska: !!ekran.ljuska, ocekivanaGreska: !!ekran.ocekivanaGreska };
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 240000 });
    await page.waitForSelector("main", { timeout: 60000 }).catch(() => { rec.bezMain = true; });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(1500);
    rec.klikovi = [];
    for (const s of ekran.klik ?? []) {
      const el = page.locator(s).first();
      if ((await el.count()) > 0) { await el.click({ timeout: 10000 }).catch((e) => rec.klikovi.push(`neuspeh ${s}: ${String(e.message).split("\n")[0]}`)); await page.waitForTimeout(600); rec.klikovi.push(`ok ${s}`); }
      else rec.klikovi.push(`nema ${s}`);
    }
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += Math.floor(h * 0.8)) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(110); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    Object.assign(rec, await page.evaluate(measureInPage, { vw: w, vh: h, mobile }));
    if (AXE && fs.existsSync(AXE)) {
      await page.addScriptTag({ path: AXE });
      const axeRes = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
          resultTypes: ["violations"],
        });
        return {
          violations: r.violations.map((v) => ({
            id: v.id, impact: v.impact, tags: v.tags.filter((t) => /^wcag\d/.test(t)), help: v.help, nodes: v.nodes.length,
            ex: v.nodes.slice(0, 4).map((n) => ({ t: n.target.join(" ").slice(0, 140), html: n.html.replace(/\s+/g, " ").slice(0, 180), s: (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 260) })),
          })),
          incomplete: r.incomplete.map((i) => ({ id: i.id, nodes: i.nodes.length })),
        };
      });
      rec.axe = axeRes;
    }
  } catch (e) {
    rec.greska = String(e.message || e).split("\n")[0];
  }
  rec.errors = errors;
  rec.ms = Date.now() - t0;
  await context.close();
  return rec;
}

const POLAZNO = {
  // Revizija 27. 10. 2026 (docs/ultra/revizija/B-merenja.md §3–§4, §7), isti spisak ekrana.
  "1536x695": { ekrana: 60, tekstCvorova: 10345, tekstIspod12: 548, primarnoBezAtf: 19 },
  "390x844": { ekrana: 56, meta: 1946, metaIspod44: 1095 },
};

function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function sazetak(zapisi) {
  const po = {};
  for (const vp of VPS) {
    const r = zapisi.filter((z) => z.vp === vp && !z.greska);
    const sum = (f) => r.reduce((a, z) => a + (Number(z[f]) || 0), 0);
    const najduze = [...r].sort((a, b) => b.viewportsTall - a.viewportsTall).slice(0, 5).map((z) => `${z.ime} ${z.viewportsTall}`);
    const najviseSitnog = [...r].sort((a, b) => b.tinyText - a.tinyText).slice(0, 8).filter((z) => z.tinyText > 0).map((z) => `${z.ime} ${z.tinyText}`);
    const najviseMalihMeta = [...r].sort((a, b) => b.smallTargetsNonInline - a.smallTargetsNonInline).slice(0, 8).filter((z) => z.smallTargetsNonInline > 0).map((z) => `${z.ime} ${z.smallTargetsNonInline}/${z.interactiveEnabled}`);
    po[vp] = {
      ekrana: r.length,
      greske: zapisi.filter((z) => z.vp === vp && z.greska).map((z) => `${z.ime}: ${z.greska}`),
      tekstCvorova: sum("textNodes"),
      tekstIspod12: sum("tinyText"),
      ekranaSaTekstomIspod12: r.filter((z) => z.tinyText > 0).length,
      najviseSitnogTeksta: najviseSitnog,
      meta: sum("interactiveEnabled"),
      metaIspodPraga: sum("smallTargetsNonInline"),
      udeoMetaIspodPraga: sum("interactiveEnabled") ? +(100 * sum("smallTargetsNonInline") / sum("interactiveEnabled")).toFixed(1) : null,
      najviseMalihMeta,
      defaultDugmadIznadPreloma: sum("defaultAtf"),
      primarnaIznadPreloma: sum("primaryAtf"),
      ekranaBezPrimarnogIznadPreloma: r.filter((z) => !z.ljuska && z.primaryAtf === 0).length,
      ekranaSaViseOdJednogPrimarnogIznadPreloma: r.filter((z) => z.primaryAtf > 1).map((z) => z.ime),
      najduzeStrane: najduze,
      medijanaBojaTeksta: median(r.map((z) => z.distinctTextColors)),
      medijanaBojaPozadine: median(r.map((z) => z.distinctBgColors)),
      vodoravniPreliv: r.filter((z) => z.hOverflow).map((z) => z.ime),
      najvisaGornjaTraka: Math.max(0, ...r.map((z) => z.topChrome || 0)),
      greskeKonzole: r.reduce((a, z) => a + (z.errors?.length || 0), 0),
    };
  }
  return { oznaka: OZNAKA, vreme: new Date().toISOString(), polazno: POLAZNO, posle: po };
}

function uMarkdown(s) {
  const d = s.posle["1536x695"], m = s.posle["390x844"];
  const red = (a, b, c) => `| ${a} | ${b} | ${c} |`;
  const L = [];
  L.push(`# Merenje ${s.oznaka} (${s.vreme.slice(0, 16).replace("T", " ")} UTC)`, "");
  L.push("Isti spisak ekrana i isti alat kao revizija 27. 10. 2026 (bez axe-a, pa kontrast ovde nije meren).", "");
  L.push("| Mera | Pre runa | Sada |", "|---|---|---|");
  if (d) {
    L.push(red("Tekst ispod 12 px (1536×695)", `${s.polazno["1536x695"].tekstIspod12} od ${s.polazno["1536x695"].tekstCvorova}`, `${d.tekstIspod12} od ${d.tekstCvorova} (${d.ekranaSaTekstomIspod12} ekrana)`));
    L.push(red("Ekrani bez primarnog dugmeta iznad preloma (1536)", String(s.polazno["1536x695"].primarnoBezAtf), String(d.ekranaBezPrimarnogIznadPreloma)));
    L.push(red("Dugmad bez uloge (default) iznad preloma (1536)", "—", String(d.defaultDugmadIznadPreloma)));
    L.push(red("Najduže strane (1536, u visinama ekrana)", "uvoz-pregled 8,9 · podešavanja 6,8", d.najduzeStrane.join(" · ")));
    L.push(red("Medijana boja teksta / pozadine po ekranu (1536)", "11 / 26", `${d.medijanaBojaTeksta} / ${d.medijanaBojaPozadine}`));
  }
  if (m) {
    L.push(red("Dodirne mete ispod 44 px (390×844)", `${s.polazno["390x844"].metaIspod44} od ${s.polazno["390x844"].meta} (56,3 %)`, `${m.metaIspodPraga} od ${m.meta} (${m.udeoMetaIspodPraga} %)`));
    L.push(red("Tekst ispod 12 px (390×844)", "469 od 8.260", `${m.tekstIspod12} od ${m.tekstCvorova}`));
    L.push(red("Najviša lepljiva gornja traka (390)", "192 px", `${m.najvisaGornjaTraka} px`));
    L.push(red("Vodoravni preliv (390)", "instagram-komentari", m.vodoravniPreliv.join(", ") || "nema"));
  }
  L.push("", "## Gde je još najviše", "");
  if (d) L.push(`- Sitan tekst (1536): ${d.najviseSitnogTeksta.join(", ") || "nema"}`);
  if (m) L.push(`- Male dodirne mete (390): ${m.najviseMalihMeta.join(", ") || "nema"}`);
  for (const vp of Object.keys(s.posle)) if (s.posle[vp].greske.length) L.push(`- Greške merenja ${vp}: ${s.posle[vp].greske.join("; ")}`);
  return L.join("\n") + "\n";
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, "");
  const browser = await chromium.launch({ headless: true });
  const zapisi = [];
  let n = 0;
  for (const ekran of EKRANI) {
    for (const vp of (ekran.vp ?? [D, M]).filter((v) => VPS.includes(v))) {
      const rec = await measure(browser, ekran, vp);
      fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
      zapisi.push(rec);
      n++;
      console.log(`${n} ${ekran.ime} @ ${vp}: ${rec.greska ? "GREŠKA " + rec.greska : `h=${rec.docHeight} male=${rec.smallTargetsNonInline} sitan=${rec.tinyText} err=${rec.errors.length}`} (${rec.ms} ms)`);
    }
  }
  await browser.close();
  const s = sazetak(zapisi);
  fs.writeFileSync(path.join(OUT_DIR, `${OZNAKA}-sazetak.json`), JSON.stringify(s, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${OZNAKA}-sazetak.md`), uMarkdown(s));
  console.log(`\nSažetak: docs/ultra/merenja/${OZNAKA}-sazetak.md`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
