// ─────────────────────────────────────────────────────────────────────────────
// Minimal PDF and DOCX writers, so the corpus can upload REAL bytes.
//
// The Data Room's extraction path (api/lib/extract.ts) branches three ways —
// unpdf for PDF, mammoth for DOCX, utf-8 for plain text — and a fixture that
// uploads .txt for all three tests one third of it. Nothing in the dependency
// tree writes either format, and adding a document-generation library to
// devDependencies to produce twelve fixture files is a poor trade, so both
// writers are here: about 150 lines against a 4 MB dependency.
//
// These are deliberately the SIMPLEST files that the real parsers accept, not
// general-purpose writers. The PDF has one Type1 base font and no embedded
// font programme, which is why `asciiFold` exists — WinAnsi cannot represent
// the Polish and typographic characters the corpus uses, and a mojibake'd
// extraction would look like a parser bug when it is a fixture bug.
//
// Pure. Node's zlib and Buffer only.
// ─────────────────────────────────────────────────────────────────────────────
import { deflateRawSync, deflateSync } from "node:zlib";

// ─── Text folding ────────────────────────────────────────────────────────────

const FOLD_MAP: Record<string, string> = {
  "—": "-", "–": "-", "‑": "-", "−": "-",
  "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'",
  "×": "x", "÷": "/", "…": "...", "•": "*", "·": "-",
  "€": "EUR ", "£": "GBP ", "™": "(TM)", "©": "(c)", "®": "(R)",
  "ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "ß": "ss",
  "ą": "a", "ć": "c", "ę": "e", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z",
  "å": "a", "ä": "a", "á": "a", "à": "a", "â": "a", "ã": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ñ": "n", "ç": "c", "ș": "s", "ț": "t", "ă": "a",
  "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe",
  "≤": "<=", "≥": ">=", "≈": "~", "°": " deg",
};

/**
 * Fold to printable ASCII. Anything still outside 0x20–0x7E after the map is
 * dropped rather than substituted, because a stray '?' in an extracted
 * financial table reads as data corruption to whoever is debugging it later.
 */
export function asciiFold(s: string): string {
  let out = "";
  for (const ch of s) {
    const mapped = FOLD_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (ch === "\n" || ch === "\t") out += ch;
  }
  return out;
}

/** Hard-wrap to `width` columns on word boundaries. Long unbroken tokens are
 *  emitted on their own line rather than being split mid-token — a broken
 *  account number is worse than a ragged margin. */
export function wrap(text: string, width = 96): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of para.split(/\s+/)) {
      if (current === "") {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current !== "") lines.push(current);
  }
  return lines;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LEADING = 14;
const FONT_SIZE = 10;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEADING);

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * A multi-page PDF carrying `text` as extractable content.
 *
 * Object layout is fixed: 1 = catalog, 2 = page tree, 3 = font, then one page
 * object and one content stream per page. The xref offsets are computed from
 * the buffer as it is assembled rather than predicted, because a hand-counted
 * xref is wrong the first time anyone edits a string above it.
 */
export function pdfBytes(text: string): Buffer {
  const lines = wrap(asciiFold(text), 92);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  const pageObjNum = (i: number) => 4 + i * 2;
  const contentObjNum = (i: number) => 5 + i * 2;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  pages.forEach((pageLines, i) => {
    objects[pageObjNum(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>`;

    const body =
      `BT\n/F1 ${FONT_SIZE} Tf\n${LEADING} TL\n1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN} Tm\n` +
      pageLines.map((l) => `(${pdfEscape(l)}) Tj T*`).join("\n") +
      "\nET";
    objects[contentObjNum(i)] = `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`;
  });

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (s: string) => {
    const b = Buffer.from(s, "latin1");
    chunks.push(b);
    offset += b.length;
  };

  push("%PDF-1.4\n");
  const xref: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    if (objects[n] === undefined) continue;
    xref[n] = offset;
    push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
  }

  const xrefStart = offset;
  const maxObj = objects.length;
  let table = `xref\n0 ${maxObj}\n0000000000 65535 f \n`;
  for (let n = 1; n < maxObj; n++) {
    table += `${String(xref[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer\n<< /Size ${maxObj} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

// ─── ZIP (for DOCX) ──────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** A deflate-compressed ZIP. No directory entries, no zip64, no encryption —
 *  the minimum an OOXML reader needs. */
export function zipBytes(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const compressed = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date — 1980-01-01, fixed for reproducibility
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A WordprocessingML document with one paragraph per line. Three parts is the
 * minimum mammoth will open: the content-type map, the package relationships,
 * and the document body.
 */
export function docxBytes(text: string): Buffer {
  const paragraphs = text.split("\n").map((line) => {
    if (line.trim() === "") return "<w:p/>";
    // xml:space="preserve" keeps the leading spaces that align the numeric
    // columns in the financial tables; without it Word collapses them and the
    // extracted text loses its structure.
    return `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
  });

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphs.join("")}<w:sectPr/></w:body></w:document>`;

  return zipBytes([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") },
  ]);
}

export function txtBytes(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

/** length + type + data + CRC over (type + data), which is the whole of the
 *  PNG chunk format. */
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * A real, valid PNG of a solid colour — the bug-report screenshot fixture.
 *
 * Genuine bytes rather than a stub, because the upload path this feeds asserts
 * on the declared `image/png` mime and Storage stores what it is handed: a file
 * that claims to be a PNG and is not would be a fixture that quietly disagrees
 * with the thing under test. Truecolour, 8-bit, no interlacing, one IDAT — the
 * simplest form every decoder accepts.
 *
 * Note the zlib wrapper: IDAT is zlib-framed (`deflateSync`), unlike the ZIP
 * writer above which stores raw deflate streams.
 */
export function pngBytes(width = 1, height = 1, rgb: [number, number, number] = [17, 34, 51]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 — truecolour RGB
  // bytes 10-12 stay zero: deflate compression, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter byte. Filter 0 (None) keeps the
  // fixture readable; the compressor does not care.
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const px = row + 1 + x * 3;
      raw[px] = rgb[0];
      raw[px + 1] = rgb[1];
      raw[px + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
