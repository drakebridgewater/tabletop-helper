#!/usr/bin/env node
// Builds public/js/games/iaww/card-data.js from the community "IAWW Card
// Overview" spreadsheet (V5.3, tab "Heritage Box+Exp. Complete List"):
//   node scripts/import-cards.js path/to/IAWW_Card_Overview.xlsx
// Reads the .xlsx with node:zlib only. Prints every card it skipped or could
// only import in part, so the list can be checked against the printed cards.

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SHEET = "Heritage Box+Exp. Complete List";
const OUT = fileURLToPath(new URL("../public/js/games/iaww/card-data.js", import.meta.url));

/* ---------- minimal .xlsx reader ---------- */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file.");
  const files = {};
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const local = buf.readUInt32LE(p + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = () => (method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
    p += 46 + skip;
  }
  return files;
}
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readSheet(path, title) {
  const z = unzip(readFileSync(path));
  const shared = z["xl/sharedStrings.xml"]
    ? [...z["xl/sharedStrings.xml"]().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const sheet = [...z["xl/workbook.xml"]().matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].find((m) => unxml(m[1]) === title);
  if (!sheet) throw new Error(`No tab named "${title}".`);
  const rel = [...z["xl/_rels/workbook.xml.rels"]().matchAll(/<Relationship [^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${sheet[2]}"`));
  const target = "xl/" + rel.match(/Target="([^"]*)"/)[1].replace(/^\/?xl\//, "");
  const rows = {};
  for (const row of z[target]().matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3] || "";
      const t = (c[2].match(/t="(\w+)"/) || [])[1];
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (t === "inlineStr") cells[colIndex(c[1])] = unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (v != null) cells[colIndex(c[1])] = t === "s" ? shared[+v] : unxml(v);
    }
    rows[+row[1]] = cells;
  }
  return rows;
}

/* ---------- column layout of the complete list ---------- */
const RES = ["material", "energy", "science", "gold", "exploration"];
const at = (start) => Object.fromEntries(RES.map((k, i) => [k, start + i]));
const C = {
  name: 1, set: 3, colour: 4, qty: 5,
  cost: { ...at(6), kry: 11, fin: 13, gen: 14 }, costAny: 12, costCeleb: 15,
  prod: at(16), prodKry: 21, prodCulture: 22, prodFin: 23, prodGen: 24, prodCeleb: 25,
  corr: at(26), corrKry: 31, corrCulture: 32,
  scale: at(33), scaleKry: 38,
  recycle: at(39), recycleKry: 44,
  bonusCubes: at(45), bonus: { kry: 50, fin: 51, gen: 52 }, bonusCeleb: 53, bonusWorker: 54,
  vp: 55, vpPer: { structure: 56, vehicle: 57, research: 58, project: 59, discovery: 60, kry: 61, fin: 62, gen: 63 }, vpCeleb: 64, vpRevolution: 65,
  penalty: 66,
};
// Header row labels the import relies on; a new spreadsheet layout fails loudly.
const HEADER = { 1: "Card Name", 3: "Game\nComponent", 4: "Colour", 5: "Qty", 6: "Materials - grey", 12: "any Resource", 16: "Materials - grey", 22: "Culture - violet", 26: "Materials - grey", 33: "Materials - grey", 39: "Materials - grey", 45: "Materials - grey", 54: "Worker Meeple", 55: "direct", 56: "Materials - grey", 65: "Revolution" };
const TYPE = { "1 grey": "structure", "2 black": "vehicle", "3 green": "research", "4 yellow": "project", "5 blue": "discovery" };
// Spreadsheet set codes to this app's expansion ids. KS is the Kickstarter
// promo set; HB marks the Heritage Box printing; IHB and PHB are the two
// Leisure & Decadence booster packs (play one or the other).
const SETS = { Base: ["base"], KS: ["ks"], CAA: ["ca"], "CAA-KS": ["ca", "ks"], "CAA-LAD": ["ca", "ld"], WOP: ["wop"], "WOP HB": ["wop"], LAD: ["ld"], "LAD-IHB": ["ld"], "LAD-PHB": ["ld"] };

/* ---------- convert ---------- */
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/import-cards.js path/to/IAWW_Card_Overview.xlsx");
  process.exit(1);
}
const rows = readSheet(file, SHEET);
const head = rows[3] || {};
for (const [i, label] of Object.entries(HEADER))
  if (String(head[i] || "").replace(/\s+/g, " ").trim() !== label.replace(/\s+/g, " ")) throw new Error(`Column ${+i + 1} should be "${label}" but is "${head[i]}". The spreadsheet layout changed.`);

const num = (r, i) => {
  const n = Number(r[i]);
  return Number.isFinite(n) ? n : 0;
};
const pick = (r, cols, f = (n) => n) => {
  const o = {};
  for (const [k, i] of Object.entries(cols)) if (num(r, i)) o[k] = f(num(r, i));
  return o;
};

const cards = [];
const skipped = [];
const partial = [];
for (const [rn, r] of Object.entries(rows)) {
  if (+rn <= 3 || !r[C.name] || !r[C.set]) continue;
  const name = String(r[C.name]).trim();
  const set = String(r[C.set]).trim();
  const type = TYPE[r[C.colour]];
  if (!type || !SETS[set]) {
    skipped.push(`${name} (${set}, ${r[C.colour]}): ${type ? "unknown set" : "card type the tracker does not have"}`);
    continue;
  }
  const notes = [];
  const card = { name, exp: SETS[set], n: num(r, C.qty) || 1, type };
  if (set === "LAD-IHB" || set === "LAD-PHB") card.pack = set.slice(4);
  card.cost = pick(r, C.cost);
  card.prod = pick(r, C.prod);
  card.corr = pick(r, C.corr, Math.abs);

  // Production that scales with built cards. The spreadsheet gives the
  // resource; the card counted is assumed to be the same colour.
  const sc = Object.entries(pick(r, C.scale));
  const PER = { material: "structure", energy: "vehicle", science: "research", gold: "project", exploration: "discovery" };
  if (sc.length) card.scale = { res: sc[0][0], per: PER[sc[0][0]], n: sc[0][1] };
  if (sc.length > 1) notes.push("more than one scaling production");

  const rec = Object.keys(pick(r, C.recycle));
  card.recycle = rec[0] || "";
  if (rec.length !== 1) notes.push(rec.length ? "more than one recycling bonus" : "no recycling bonus");
  card.bonus = pick(r, C.bonus);
  card.vp = num(r, C.vp);
  // Corruption & Ascension duo cards list the same VP under both card types
  // of the pair; read that as VP per pair.
  const per = Object.entries(pick(r, C.vpPer));
  if (per.length === 2 && card.exp.includes("ca") && per[0][1] === per[1][1]) card.duo = { a: per[0][0], b: per[1][0], x: per[0][1] };
  else if (per.length) card.combo = { t: per[0][0] === "kry" ? "" : per[0][0], x: per[0][1] };
  if (per.length > 2 || (per.length === 2 && !card.duo)) notes.push("more than one VP multiplier");

  const extra = [
    [C.costAny, "costs any resource"], [C.costCeleb, "costs a Celebrity"],
    [C.prodKry, "produces Krystallium"], [C.prodCulture, "produces culture"], [C.prodFin, "produces a Financier each round"],
    [C.prodGen, "produces a General each round"], [C.prodCeleb, "produces a Celebrity"],
    [C.corrKry, "corrupts Krystallium"], [C.corrCulture, "corrupts culture"], [C.scaleKry, "scales Krystallium"],
    [C.recycleKry, "recycles for Krystallium"], [C.bonusCeleb, "Celebrity bonus"], [C.bonusWorker, "Worker bonus"],
    [C.vpPer.kry, "VP per Krystallium"], [C.vpCeleb, "VP per Celebrity"], [C.vpRevolution, "VP per Revolution"], [C.penalty, "penalty if not built"],
  ];
  extra.forEach(([i, text]) => num(r, i) && notes.push(`${text} ${num(r, i)}`));
  if (Object.keys(pick(r, C.bonusCubes)).length) notes.push("cube construction bonus");
  if (notes.length) {
    card.note = `Not counted: ${notes.join(", ")}.`;
    partial.push(`${name} (${set}): ${notes.join(", ")}`);
  }
  for (const k of ["cost", "prod", "corr", "bonus"]) if (!Object.keys(card[k]).length) delete card[k];
  if (!card.vp) delete card.vp;
  cards.push(card);
}

// The two booster packs share some cards; keep one entry for an identical pair.
const key = (c) => JSON.stringify({ ...c, pack: undefined });
const merged = [];
for (const c of cards) {
  const twin = merged.find((m) => m.pack && c.pack && m.pack !== c.pack && key(m) === key(c));
  if (twin) delete twin.pack;
  else merged.push(c);
}
merged.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  OUT,
  `// Generated by scripts/import-cards.js from the IAWW Card Overview spreadsheet
// (tab "${SHEET}"). Do not edit by hand: fix the spreadsheet or the script,
// then run it again. Check entries against the printed cards.

export default [
${merged.map((c) => "  " + JSON.stringify(c) + ",").join("\n")}
];
`,
);
console.log(`Wrote ${merged.length} cards to ${OUT}.`);
if (skipped.length) console.log(`\nSkipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
if (partial.length) console.log(`\nImported in part ${partial.length}:\n  ${partial.join("\n  ")}`);
