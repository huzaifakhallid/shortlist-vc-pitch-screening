// Renders the demo fund's synthetic decks (@shortlist/db/demo-decks) to the
// bundled PDFs in apps/web/synthetic-decks/, and prints each file's ETag
// (the quoted MD5, as R2 gives it) to copy into demo-decks.ts.
//
//   pnpm --filter @shortlist/web decks:generate
//
// A minimal PDF writer: 16:9 pages, the standard Helvetica fonts, text,
// bars and invisible text, no page numbers (page reading would read them, and they aren't in the deck's visible text). The output is deterministic (no dates or ids), so
// regenerating unchanged content gives the same bytes and ETags.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  DEMO_DECKS,
  type DeckPage,
  type SyntheticDeck,
} from "@shortlist/db/demo-decks";

const WIDTH = 960;
const HEIGHT = 540;
const MARGIN = 64;

function pdfString(text: string): string {
  if (!/^[\x20-\x7e]*$/.test(text)) {
    throw new Error(`Deck text must be printable ASCII: ${text}`);
  }
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

function textAt(font: string, size: number, x: number, y: number, s: string) {
  return `BT /${font} ${String(size)} Tf ${String(x)} ${String(y)} Td ${pdfString(s)} Tj ET`;
}

function pageContent(page: DeckPage): string {
  const ops: string[] = [
    // Ink #1a1a1a for text, a hairline under the title.
    "0.102 0.102 0.102 rg",
    textAt("F2", 34, MARGIN, HEIGHT - 96, page.title),
    "0.906 0.894 0.871 RG 1 w",
    `${String(MARGIN)} ${String(HEIGHT - 118)} m ${String(WIDTH - MARGIN)} ${String(HEIGHT - 118)} l S`,
    "0.102 0.102 0.102 rg",
  ];
  page.lines.forEach((line, i) => {
    ops.push(textAt("F1", 20, MARGIN, HEIGHT - 168 - i * 34, line));
  });
  if (page.bars !== undefined) {
    const count = page.bars.length;
    const gap = 16;
    const left = MARGIN;
    const width = (WIDTH - 2 * MARGIN - gap * (count - 1)) / count;
    const base = 56;
    const maxHeight = 190;
    page.bars.forEach((height, i) => {
      const last = i === count - 1;
      ops.push(last ? "0.604 0.580 0.549 rg" : "0.847 0.831 0.800 rg");
      ops.push(
        `${(left + i * (width + gap)).toFixed(2)} ${String(base)} ${width.toFixed(2)} ${(height * maxHeight).toFixed(2)} re f`,
      );
    });
  }
  if (page.hidden !== undefined) {
    // White 1pt text: in the text layer, invisible on the page.
    ops.push("1 1 1 rg");
    ops.push(textAt("F1", 1, MARGIN, 8, page.hidden));
  }
  return ops.join("\n");
}

function renderDeck(deck: SyntheticDeck): Buffer {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add("");
  const pages = add("");
  const regular = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const bold = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const kids: number[] = [];
  deck.pages.forEach((page) => {
    const content = pageContent(page);
    const stream = add(
      `<< /Length ${String(Buffer.byteLength(content, "latin1"))} >>\nstream\n${content}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${String(pages)} 0 R /MediaBox [0 0 ${String(WIDTH)} ${String(HEIGHT)}] /Resources << /Font << /F1 ${String(regular)} 0 R /F2 ${String(bold)} 0 R >> >> /Contents ${String(stream)} 0 R >>`,
      ),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${String(pages)} 0 R >>`;
  objects[pages - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${String(k)} 0 R`).join(" ")}] /Count ${String(kids.length)} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root ${String(catalog)} 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const outDir = new URL("../synthetic-decks/", import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [name, deck] of Object.entries(DEMO_DECKS)) {
  const bytes = renderDeck(deck);
  writeFileSync(new URL(`${deck.id}.pdf`, outDir), bytes);
  const md5 = createHash("md5").update(bytes).digest("hex");
  console.log(`${name}: '"${md5}"'`);
}
