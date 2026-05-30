import type { CityMap } from '@/lib/types/study';

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Returns the SVG markup for a city map. Used both inside the editor preview
// and inside the print packet preview (where it is rendered as raw markup
// in a server component via dangerouslySetInnerHTML on a wrapping <div>).
export function renderCityMapSvg(m: CityMap | undefined | null): string {
  if (!m) return '';
  const N = m.gridSize || 20;
  const cell = 22;
  const size = N * cell;

  let grid = '';
  for (let i = 0; i <= N; i++) {
    grid += `<line x1="${i * cell}" y1="0" x2="${i * cell}" y2="${size}" stroke="#e6e1d2" stroke-width="0.3"/>`;
    grid += `<line x1="0" y1="${i * cell}" x2="${size}" y2="${i * cell}" stroke="#e6e1d2" stroke-width="0.3"/>`;
  }

  let streets = '';
  for (const s of m.streets ?? []) {
    const x1 = s.from[0] * cell,
      y1 = s.from[1] * cell;
    const x2 = s.to[0] * cell,
      y2 = s.to[1] * cell;
    streets += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#bbb" stroke-width="9" stroke-linecap="round"/>`;
    streets += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="0.8" stroke-dasharray="5 4"/>`;
    const mx = (x1 + x2) / 2,
      my = (y1 + y2) / 2;
    const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    const rot = vertical ? -90 : 0;
    streets += `<text x="${mx}" y="${my - 8}" font-size="10" font-style="italic" fill="#555" text-anchor="middle" transform="rotate(${rot} ${mx} ${my})">${escapeText(s.name)}</text>`;
  }

  let landmarks = '';
  for (const l of m.landmarks ?? []) {
    const cx = l.x * cell,
      cy = l.y * cell;
    landmarks += `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="#1a1a1a"/>`;
    const lx = cx + (l.labelDX ?? 6);
    const ly = cy + (l.labelDY ?? -6);
    const anchor = l.labelAnchor ?? 'start';
    landmarks += `<text x="${lx}" y="${ly}" font-size="10" fill="#1a1a1a" text-anchor="${anchor}">${escapeText(l.label)}</text>`;
  }

  let origin = '';
  if (m.origin) {
    const cx = m.origin.x * cell,
      cy = m.origin.y * cell;
    origin += `<circle cx="${cx}" cy="${cy}" r="11" fill="#963b2a" stroke="#1a1a1a" stroke-width="1"/>`;
    origin += `<text x="${cx}" y="${cy + 4}" font-size="12" fill="white" text-anchor="middle" font-weight="bold">★</text>`;
    const lx = cx + (m.origin.labelDX ?? 14);
    const ly = cy + (m.origin.labelDY ?? -10);
    origin += `<text x="${lx}" y="${ly}" font-size="11" fill="#963b2a" font-weight="bold">${escapeText(m.origin.label)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-25 -25 ${size + 50} ${size + 50}" width="6in" height="6in" style="border:0.5pt solid #999;background:#fcfaf3;display:inline-block;">${grid}${streets}${landmarks}${origin}</svg>`;
}
