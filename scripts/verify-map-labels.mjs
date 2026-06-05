// Headless verification of the MapCanvas label-placement engine against the
// REAL active-study rideshare map. Mirrors the engine in components/MapCanvas.tsx
// and asserts no label↔label / label↔marker overlaps remain after placement.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const CELL = 22;
const MARK = { landmark: 6, carHW: 15, carHH: 12, personHW: 11, personHH: 13, dropX: 9 };
const FAN = [
  { dx: 0, dy: 0 }, { dx: 0.6, dy: -0.3 }, { dx: -0.6, dy: -0.3 },
  { dx: 0.6, dy: 0.5 }, { dx: -0.6, dy: 0.5 }, { dx: 0, dy: 0.8 },
];
const fanOffset = (n) => FAN[n % FAN.length] ?? { dx: 0, dy: 0 };
const boxOverlap = (a, b) => {
  const ox = Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw);
  const oy = Math.min(a.cy + a.hh, b.cy + b.hh) - Math.max(a.cy - a.hh, b.cy - b.hh);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};
const labelHalfDims = (t, fs) => ({ hw: (t.length * fs * 0.56) / 2, hh: (fs * 1.15) / 2 });
const LABEL_DIRS = [
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
];
const RINGS = [1, 1.8, 2.8, 4, 5.5];
function placeLabel(anchor, anchorHalf, text, fontSize, occupied) {
  const lh = labelHalfDims(text, fontSize);
  const gap = 3;
  let best = null, bestScore = Infinity;
  for (const ring of RINGS) {
    for (const d of LABEL_DIRS) {
      const cx = anchor.x + d.dx * (anchorHalf.hw + gap + lh.hw) * ring;
      const cy = anchor.y + d.dy * (anchorHalf.hh + gap + lh.hh) * ring;
      const box = { cx, cy, hw: lh.hw, hh: lh.hh };
      let overlap = 0;
      for (const o of occupied) overlap += boxOverlap(box, o);
      const score = overlap * 1000 + ring * 4 + Math.hypot(d.dx, d.dy);
      if (score < bestScore) { bestScore = score; best = box; }
      if (overlap === 0 && ring === 1 && (d.dx === 0 || d.dy === 0)) return box;
    }
  }
  return best;
}

function run(map, seeded) {
  const resolve = (lbl) => {
    let x = map.origin.x, y = map.origin.y;
    if (lbl) {
      const lm = (map.landmarks || []).find((l) => l.label === lbl);
      if (lm) { x = lm.x; y = lm.y; }
      else if (map.origin.label === lbl) { x = map.origin.x; y = map.origin.y; }
    }
    return { x, y };
  };
  const vehicles = seeded.filter((s) => s.kind === 'vehicle');
  const riders = seeded.filter((s) => s.kind === 'person');
  // decluster (same as component)
  const byCell = new Map();
  const take = (p) => {
    const k = `${Math.round(p.x)},${Math.round(p.y)}`;
    const n = byCell.get(k) ?? 0; byCell.set(k, n + 1);
    const o = fanOffset(n); return { x: p.x + o.dx, y: p.y + o.dy };
  };
  const rp = {}, rd = {}, vd = {};
  riders.forEach((r) => { rp[r.letter] = take(resolve(r.landmarkLabel)); if (r.dropoffLandmarkLabel) rd[r.letter] = take(resolve(r.dropoffLandmarkLabel)); });
  vehicles.forEach((v) => { vd[v.color] = take(resolve(v.landmarkLabel)); });

  const occupied = [], markerBoxes = [];
  const marker = (cx, cy, hw, hh, tag) => { const b = { cx, cy, hw, hh, tag }; occupied.push(b); markerBoxes.push(b); return b; };
  (map.landmarks || []).forEach((l) => marker(l.x * CELL, l.y * CELL, MARK.landmark, MARK.landmark, `LM:${l.label}`));
  if (map.origin) marker(map.origin.x * CELL, map.origin.y * CELL, MARK.landmark, MARK.landmark, `DEPOT:${map.origin.label}`);
  riders.forEach((r) => { const pu = rp[r.letter]; marker(pu.x * CELL, pu.y * CELL, MARK.personHW, MARK.personHH, `RIDER:${r.letter}`); const dp = rd[r.letter]; if (dp) marker(dp.x * CELL, dp.y * CELL, MARK.dropX, MARK.dropX, `DROP:${r.letter}`); });
  vehicles.forEach((v) => { const p = vd[v.color]; marker(p.x * CELL, p.y * CELL, MARK.carHW, MARK.carHH, `VEH:${v.color}`); });

  const labels = [];
  const place = (tag, anchor, half, text, fs) => { const box = placeLabel(anchor, half, text, fs, occupied); box.tag = tag; box.text = text; occupied.push(box); labels.push(box); };
  (map.landmarks || []).forEach((l) => place(`lm:${l.label}`, { x: l.x * CELL, y: l.y * CELL }, { hw: MARK.landmark, hh: MARK.landmark }, l.label, 12));
  if (map.origin) place('depot', { x: map.origin.x * CELL, y: map.origin.y * CELL }, { hw: MARK.landmark, hh: MARK.landmark }, map.origin.label, 12);
  riders.forEach((r) => { const pu = rp[r.letter]; place(`rider:${r.letter}`, { x: pu.x * CELL, y: pu.y * CELL }, { hw: MARK.personHW, hh: MARK.personHH }, `Rider ${r.letter}`, 11); const dp = rd[r.letter]; if (dp) place(`drop:${r.letter}`, { x: dp.x * CELL, y: dp.y * CELL }, { hw: MARK.dropX, hh: MARK.dropX }, `drop ${r.letter}`, 11); });

  // Check residual overlaps (>2 sq user-units = visible collision).
  const TH = 2;
  const collisions = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < markerBoxes.length; j++) {
      const a = boxOverlap(labels[i], markerBoxes[j]);
      if (a > TH && markerBoxes[j].tag !== labels[i].tag) collisions.push(`label "${labels[i].text}" ∩ marker ${markerBoxes[j].tag} = ${a.toFixed(0)}`);
    }
    for (let j = i + 1; j < labels.length; j++) {
      const a = boxOverlap(labels[i], labels[j]);
      if (a > TH) collisions.push(`label "${labels[i].text}" ∩ label "${labels[j].text}" = ${a.toFixed(0)}`);
    }
  }
  return { nLabels: labels.length, nMarkers: markerBoxes.length, collisions, labels };
}

const { data, error } = await sb.from('studies').select('name, authored_data').limit(1).maybeSingle();
if (error) { console.error('DB error', error); process.exit(1); }
if (!data) { console.error('No study'); process.exit(1); }
const content = data.authored_data;
const mods = content.modules || [];
let checked = 0;
for (const m of mods) {
  const map = m.cityMap;
  if (!map) continue;
  const scenarios = m.scenarios || [];
  for (const sc of scenarios) {
    const seeded = sc.seededMarkers || [];
    if (seeded.length === 0) continue;
    const r = run(map, seeded);
    checked++;
    const status = r.collisions.length === 0 ? '✅ no collisions' : `❌ ${r.collisions.length} collision(s)`;
    console.log(`\n[${data.name}] module "${m.title}" / scenario "${sc.title}" — ${r.nLabels} labels, ${r.nMarkers} markers → ${status}`);
    r.collisions.forEach((c) => console.log('   ', c));
  }
}
if (checked === 0) console.log('No task module with cityMap + seededMarkers found in the active study.');
