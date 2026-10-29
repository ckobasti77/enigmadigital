// Preneto iz Devotion packages/shared/src/mentions.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Pominjanja u komentarima (PROSTOR P5, plan K01 §7.3 i §11.4). Čiste funkcije
 * bez React-a i platformskih API-ja — isti kod za web i telefon.
 *
 * Format sadržaja komentara (server ga čuva kakav je i ne renderuje ga):
 *   - jedan `<p>` po redu teksta, prazan red je `<p></p>`;
 *   - pominjanje je `<span data-mention-id="<profileId>">@Ime</span>`;
 *   - sve ostalo je escape-ovan običan tekst.
 *
 * Prikaz ISKLJUČIVO kroz `parseCommentSegments` (nikad `innerHTML`): stari
 * komentari su običan tekst ili HTML i svode se na tekst i prelome redova.
 */

/** Najviše pominjanja po komentaru — ogledalo `MAX_COMMENT_MENTIONS` na serveru. */
export const MAX_COMMENT_MENTIONS = 20;

/** Najduži upit posle `@` koji još otvara listu članova. */
const MENTION_QUERY_MAX = 32;

export type MentionCandidate = { profileId: string; displayName: string };

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Upit za pominjanje na poziciji kursora: „@an" neposredno pre `caret`. `@` mora
 * da stoji na početku teksta ili posle razmaka (e-adresa „ana@posta" nije
 * pominjanje), a između `@` i kursora ne sme biti razmaka.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  const end = Math.max(0, Math.min(caret, text.length));
  for (let index = end - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === "@") {
      const before = index === 0 ? "" : text[index - 1];
      if (before !== "" && !/\s/.test(before)) return null;
      const query = text.slice(index + 1, end);
      return query.length > MENTION_QUERY_MAX ? null : { query, start: index };
    }
    if (/\s/.test(char)) return null;
  }
  return null;
}

/**
 * Ubacuje izabranog člana: zamenjuje otvoreni upit („@an") sa „@Ana " i vraća
 * novi tekst i položaj kursora iza razmaka. Bez otvorenog upita ubacuje „@Ana "
 * na kursor.
 */
export function insertMention(
  text: string,
  caret: number,
  member: MentionCandidate,
): { text: string; caret: number } {
  const position = Math.max(0, Math.min(caret, text.length));
  const open = mentionQueryAt(text, position);
  const start = open === null ? position : open.start;
  const inserted = `@${member.displayName} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(position),
    caret: start + inserted.length,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tekst iz polja za unos → sadržaj komentara i spisak pomenutih. Pominjanje je
 * „@Ime" koje još stoji u tekstu (obrisano „@Ime" izbacuje i svoj id); počinje na
 * početku reda ili posle razmaka i ne sme da bude početak dužeg imena. Isti član
 * se šalje jednom, a posle `MAX_COMMENT_MENTIONS` ostaje običan tekst.
 */
export function serializeComment(
  text: string,
  mentions: ReadonlyArray<MentionCandidate>,
): { content: string; mentionProfileIds: string[] } {
  const candidates = [...mentions].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  );
  const used: string[] = [];

  const renderLine = (line: string): string => {
    let html = "";
    let index = 0;
    while (index < line.length) {
      if (line[index] === "@" && (index === 0 || /\s/.test(line[index - 1]))) {
        const match = candidates.find((candidate) => {
          const name = candidate.displayName;
          if (name === "" || !line.startsWith(name, index + 1)) return false;
          const next = line[index + 1 + name.length];
          return next === undefined || !WORD_CHAR.test(next);
        });
        if (
          match !== undefined &&
          (used.includes(match.profileId) || used.length < MAX_COMMENT_MENTIONS)
        ) {
          if (!used.includes(match.profileId)) used.push(match.profileId);
          html += `<span data-mention-id="${escapeHtml(match.profileId)}">@${escapeHtml(match.displayName)}</span>`;
          index += 1 + match.displayName.length;
          continue;
        }
      }
      html += escapeHtml(line[index]);
      index += 1;
    }
    return html;
  };

  const trimmed = text.replace(/\s+$/, "");
  if (trimmed === "") return { content: "", mentionProfileIds: [] };
  const content = trimmed
    .split(/\r\n|\r|\n/)
    .map((line) => `<p>${renderLine(line)}</p>`)
    .join("");
  return { content, mentionProfileIds: used };
}

export type CommentSegment =
  | { kind: "text"; text: string }
  /** `label` je tekst iz komentara, sa početnim „@" (npr. „@Ana"). */
  | { kind: "mention"; profileId: string; label: string }
  | { kind: "break" };

const MENTION_SPAN =
  /<span\b[^>]*\bdata-mention-id=(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/span>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

/** HTML bez tagova: kraj bloka i `<br>` postaju prelom reda, ostali tagovi nestaju. */
function htmlToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  ).split(/\r\n|\r|\n/);
}

/**
 * Sadržaj komentara → delovi za prikaz (tekst, pominjanje, prelom reda). Radi i
 * za stare komentare: običan tekst sa novim redovima i HTML (`<p><strong>…`)
 * svode se na tekst. Nikad ne vraća HTML.
 */
export function parseCommentSegments(content: string): CommentSegment[] {
  const segments: CommentSegment[] = [];

  const pushPlain = (html: string) => {
    const lines = htmlToLines(html);
    lines.forEach((line, index) => {
      if (index > 0) segments.push({ kind: "break" });
      if (line !== "") segments.push({ kind: "text", text: line });
    });
  };

  let cursor = 0;
  for (const match of content.matchAll(MENTION_SPAN)) {
    pushPlain(content.slice(cursor, match.index));
    const label = decodeEntities(match[3].replace(/<[^>]*>/g, "")).trim();
    segments.push({
      kind: "mention",
      profileId: decodeEntities(match[2]),
      label: label === "" ? "@" : label,
    });
    cursor = match.index + match[0].length;
  }
  pushPlain(content.slice(cursor));

  while (segments.length > 0 && segments[0].kind === "break") segments.shift();
  while (segments.length > 0 && segments[segments.length - 1].kind === "break") {
    segments.pop();
  }
  return segments;
}
