'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { CityMap, SeededMarker } from '@/lib/types/study';
import { VEHICLE_COLOR_TO_NUMBER, VEHICLE_HEX } from '@/lib/types/study';

const CELL = 22;
// Marker half-extents (USER units) — also the obstacle boxes the label engine
// routes around. Car/person icons are drawn at 2×{hw,hh}.
const MARK = {
  landmark: 6,
  carHW: 15,
  carHH: 12,
  personHW: 11,
  personHH: 13,
  dropX: 9,
} as const;

export type MapCanvasProps = {
  map: CityMap;
  scenarioId: string;
  storageKey: string;
  onEvent: (eventType: string, payload: unknown) => void;
  seededMarkers?: SeededMarker[];
};

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

// Small fan offsets (in grid units) so co-located markers don't overlap.
const FAN: { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 0.6, dy: -0.3 },
  { dx: -0.6, dy: -0.3 },
  { dx: 0.6, dy: 0.5 },
  { dx: -0.6, dy: 0.5 },
  { dx: 0, dy: 0.8 },
];
function fanOffset(n: number): { dx: number; dy: number } {
  return FAN[n % FAN.length] ?? { dx: 0, dy: 0 };
}

type Pt = { x: number; y: number };
// Axis-aligned box in USER (CELL-scaled) units, centered.
type Box = { cx: number; cy: number; hw: number; hh: number };

function boxOverlap(a: Box, b: Box): number {
  const ox = Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw);
  const oy = Math.min(a.cy + a.hh, b.cy + b.hh) - Math.max(a.cy - a.hh, b.cy - b.hh);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

// Rough text box (no canvas measuring on the server). 0.56·fontSize avg advance.
function labelHalfDims(text: string, fontSize: number): { hw: number; hh: number } {
  return { hw: (text.length * fontSize * 0.56) / 2, hh: (fontSize * 1.15) / 2 };
}

// Stable filter id from a colour string.
function tintId(color: string): string {
  return 'tint-' + color.replace(/[^a-z0-9]/gi, '');
}

// Point-feature label placement: try candidate positions around the anchor,
// keep the one that overlaps the fewest already-placed boxes (and drifts least
// from the anchor). Greedy — earlier (more important) labels claim space first.
const LABEL_DIRS: { dx: number; dy: number }[] = [
  { dx: 0, dy: 1 }, // S (below — conventional default)
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: -1, dy: 0 }, // W
  { dx: 1, dy: 1 }, // SE
  { dx: -1, dy: 1 }, // SW
  { dx: 1, dy: -1 }, // NE
  { dx: -1, dy: -1 }, // NW
];

function placeLabel(
  anchor: Pt,
  anchorHalf: { hw: number; hh: number },
  text: string,
  fontSize: number,
  occupied: Box[],
): Box {
  const lh = labelHalfDims(text, fontSize);
  const gap = 3;
  let best: Box | null = null;
  let bestScore = Infinity;
  for (const d of LABEL_DIRS) {
    const cx = anchor.x + d.dx * (anchorHalf.hw + gap + lh.hw);
    const cy = anchor.y + d.dy * (anchorHalf.hh + gap + lh.hh);
    const box: Box = { cx, cy, hw: lh.hw, hh: lh.hh };
    let overlap = 0;
    for (const o of occupied) overlap += boxOverlap(box, o);
    const drift = Math.hypot(d.dx, d.dy); // mild preference for cardinal/near
    const score = overlap * 1000 + drift;
    if (score < bestScore) {
      bestScore = score;
      best = box;
      if (overlap === 0 && (d.dx === 0 || d.dy === 0)) break; // clean cardinal — take it
    }
  }
  return best as Box;
}

// MAP — the participant MANIPULATES the existing seeded markers (drags the
// vehicles); they cannot add or delete. Riders (pickup dot + dropoff X) are
// fixed reference points. No grid; the viewBox hugs the content; co-located
// markers fan out so they never overlap.
export default function MapCanvas({
  map,
  scenarioId,
  storageKey,
  onEvent,
  seededMarkers = [],
}: MapCanvasProps) {
  const N = map.gridSize || 20;
  const posKey = `${storageKey}:${scenarioId}:vehiclePos`;

  const resolve = useCallback(
    (lbl?: string): Pt => {
      let x = map.origin.x;
      let y = map.origin.y;
      if (lbl) {
        const lm = map.landmarks.find((l) => l.label === lbl);
        if (lm) {
          x = lm.x;
          y = lm.y;
        } else if (map.origin.label === lbl) {
          x = map.origin.x;
          y = map.origin.y;
        }
      }
      return { x, y };
    },
    [map],
  );

  const vehicles = useMemo(
    () =>
      seededMarkers.filter(
        (s): s is Extract<SeededMarker, { kind: 'vehicle' }> =>
          s.kind === 'vehicle',
      ),
    [seededMarkers],
  );
  const riders = useMemo(
    () =>
      seededMarkers.filter(
        (s): s is Extract<SeededMarker, { kind: 'person' }> =>
          s.kind === 'person',
      ),
    [seededMarkers],
  );

  // Decluster: assign a fan offset to every co-located static point (rider
  // pickups, rider dropoffs, vehicle defaults), keyed by cell.
  const { vehicleDefault, riderPickup, riderDropoff } = useMemo(() => {
    const byCell = new Map<string, number>();
    const take = (p: Pt): Pt => {
      const k = `${Math.round(p.x)},${Math.round(p.y)}`;
      const n = byCell.get(k) ?? 0;
      byCell.set(k, n + 1);
      const o = fanOffset(n);
      return { x: p.x + o.dx, y: p.y + o.dy };
    };
    const rp: Record<string, Pt> = {};
    const rd: Record<string, Pt> = {};
    riders.forEach((r) => {
      rp[r.letter] = take(resolve(r.landmarkLabel));
      if (r.dropoffLandmarkLabel)
        rd[r.letter] = take(resolve(r.dropoffLandmarkLabel));
    });
    const vd: Record<string, Pt> = {};
    vehicles.forEach((v) => {
      vd[v.color] = take(resolve(v.landmarkLabel));
    });
    return { vehicleDefault: vd, riderPickup: rp, riderDropoff: rd };
  }, [riders, vehicles, resolve]);

  // Participant-dragged vehicle positions (override defaults).
  const [pos, setPos] = useState<Record<string, Pt>>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(posKey);
      if (raw) {
        const p = JSON.parse(raw) as Record<string, Pt>;
        if (p && typeof p === 'object') setPos(p);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [posKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(posKey, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [posKey, pos, hydrated]);

  const vehiclePos = useCallback(
    (color: string): Pt =>
      pos[color] ?? vehicleDefault[color] ?? { x: N / 2, y: N / 2 },
    [pos, vehicleDefault, N],
  );

  // Layout engine: place marker obstacles, then greedily place each floating
  // label where it overlaps the fewest already-placed boxes, then size the
  // viewBox to include the LABEL boxes too (so long names never clip).
  // Computed from the STATIC reference layout (vehicle defaults, not live drag)
  // so labels don't jitter while a vehicle is being dragged.
  const { vb, labels } = useMemo(() => {
    const occupied: Box[] = []; // marker obstacles + placed labels
    const allBoxes: Box[] = []; // everything, for the viewBox extent

    // Street endpoints contribute to the extent only (thin, labels can cross).
    (map.streets ?? []).forEach((s) => {
      allBoxes.push({ cx: s.from[0] * CELL, cy: s.from[1] * CELL, hw: 6, hh: 6 });
      allBoxes.push({ cx: s.to[0] * CELL, cy: s.to[1] * CELL, hw: 6, hh: 6 });
    });

    const marker = (cx: number, cy: number, hw: number, hh: number): Box => {
      const b = { cx, cy, hw, hh };
      occupied.push(b);
      allBoxes.push(b);
      return b;
    };
    (map.landmarks ?? []).forEach((l) =>
      marker(l.x * CELL, l.y * CELL, MARK.landmark, MARK.landmark),
    );
    if (map.origin) marker(map.origin.x * CELL, map.origin.y * CELL, MARK.landmark, MARK.landmark);
    riders.forEach((r) => {
      const pu = riderPickup[r.letter];
      marker(pu.x * CELL, pu.y * CELL, MARK.personHW, MARK.personHH);
      const dp = riderDropoff[r.letter];
      if (dp) marker(dp.x * CELL, dp.y * CELL, MARK.dropX, MARK.dropX);
    });
    vehicles.forEach((v) => {
      const p = vehicleDefault[v.color] ?? vehiclePos(v.color);
      marker(p.x * CELL, p.y * CELL, MARK.carHW, MARK.carHH);
    });

    // Floating labels, placed in priority order (long landmark names first).
    const out: { key: string; text: string; box: Box; fontSize: number }[] = [];
    const place = (
      key: string,
      anchor: Pt,
      half: { hw: number; hh: number },
      text: string,
      fontSize: number,
    ) => {
      const box = placeLabel(anchor, half, text, fontSize, occupied);
      occupied.push(box);
      allBoxes.push(box);
      out.push({ key, text, box, fontSize });
    };

    (map.landmarks ?? []).forEach((l, i) =>
      place(
        `lm-${i}`,
        { x: l.x * CELL, y: l.y * CELL },
        { hw: MARK.landmark, hh: MARK.landmark },
        l.label,
        12,
      ),
    );
    if (map.origin)
      place(
        'depot',
        { x: map.origin.x * CELL, y: map.origin.y * CELL },
        { hw: MARK.landmark, hh: MARK.landmark },
        map.origin.label,
        12,
      );
    riders.forEach((r) => {
      const pu = riderPickup[r.letter];
      place(
        `rider-${r.letter}`,
        { x: pu.x * CELL, y: pu.y * CELL },
        { hw: MARK.personHW, hh: MARK.personHH },
        `Rider ${r.letter}`,
        11,
      );
      const dp = riderDropoff[r.letter];
      if (dp)
        place(
          `drop-${r.letter}`,
          { x: dp.x * CELL, y: dp.y * CELL },
          { hw: MARK.dropX, hh: MARK.dropX },
          `drop ${r.letter}`,
          11,
        );
    });

    const labelMap: Record<string, { text: string; box: Box; fontSize: number }> = {};
    out.forEach((o) => (labelMap[o.key] = { text: o.text, box: o.box, fontSize: o.fontSize }));

    if (allBoxes.length === 0) {
      return { vb: { x: 0, y: 0, w: N * CELL, h: N * CELL }, labels: labelMap };
    }
    const pad = 8; // user units
    const minX = Math.min(...allBoxes.map((b) => b.cx - b.hw)) - pad;
    const minY = Math.min(...allBoxes.map((b) => b.cy - b.hh)) - pad;
    const maxX = Math.max(...allBoxes.map((b) => b.cx + b.hw)) + pad;
    const maxY = Math.max(...allBoxes.map((b) => b.cy + b.hh)) + pad;
    return {
      vb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      labels: labelMap,
    };
  }, [map, riders, vehicles, riderPickup, riderDropoff, vehicleDefault, vehiclePos, N]);

  // Distinct colours that need a tint filter (vehicle cars + rider people).
  const tintColors = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => set.add(VEHICLE_HEX[v.color]));
    riders.forEach((r) => set.add(r.personColor));
    return Array.from(set);
  }, [vehicles, riders]);

  // ----- drag (vehicles only) -----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ color: string; startedAt: string } | null>(null);

  const pointerToGrid = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const userX = vb.x + (clientX - rect.left) * (vb.w / rect.width);
      const userY = vb.y + (clientY - rect.top) * (vb.h / rect.height);
      return { x: userX / CELL, y: userY / CELL };
    },
    [vb],
  );

  useEffect(() => {
    function onMove(e: globalThis.MouseEvent) {
      if (!dragRef.current) return;
      const p = pointerToGrid(e.clientX, e.clientY);
      if (!p) return;
      const { color } = dragRef.current;
      setPos((prev) => ({
        ...prev,
        [color]: { x: clamp(p.x, 0, N), y: clamp(p.y, 0, N) },
      }));
    }
    function onUp(e: globalThis.MouseEvent) {
      if (!dragRef.current) return;
      const { color, startedAt } = dragRef.current;
      dragRef.current = null;
      const p = pointerToGrid(e.clientX, e.clientY);
      if (!p) return;
      onEvent('map_vehicle_move', {
        scenarioId,
        vehicle: VEHICLE_COLOR_TO_NUMBER[color as 'red' | 'blue' | 'green'],
        color,
        x: clamp(p.x, 0, N),
        y: clamp(p.y, 0, N),
        drag_started_at: startedAt,
        client_ts: new Date().toISOString(),
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pointerToGrid, N, onEvent, scenarioId]);

  function startDrag(e: ReactMouseEvent<SVGGElement>, color: string) {
    e.stopPropagation();
    dragRef.current = { color, startedAt: new Date().toISOString() };
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] italic text-[var(--muted)] leading-snug">
        Drag the cars to where you&rsquo;d assign them. Each rider shows as a
        person (pickup) and an X (dropoff) in their colour.
      </p>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full border border-[#999] bg-[#fcfaf3]"
      >
        <defs>
          {/* Recolour each black-on-transparent icon to the marker's colour:
              flood the colour, keep it only where the icon is opaque. */}
          {tintColors.map((c) => (
            <filter
              key={tintId(c)}
              id={tintId(c)}
              colorInterpolationFilters="sRGB"
              x="0"
              y="0"
              width="100%"
              height="100%"
            >
              <feFlood floodColor={c} result="flood" />
              <feComposite in="flood" in2="SourceGraphic" operator="in" />
            </filter>
          ))}
        </defs>

        {/* Streets */}
        {(map.streets ?? []).map((s, i) => (
          <line
            key={`st-${i}`}
            x1={s.from[0] * CELL}
            y1={s.from[1] * CELL}
            x2={s.to[0] * CELL}
            y2={s.to[1] * CELL}
            stroke="#cfcabb"
            strokeWidth={12}
            strokeLinecap="round"
            pointerEvents="none"
          />
        ))}

        {/* Landmark + depot squares (labels drawn in the labels layer) */}
        {(map.landmarks ?? []).map((l, i) => (
          <rect
            key={`lm-${i}`}
            x={l.x * CELL - MARK.landmark}
            y={l.y * CELL - MARK.landmark}
            width={MARK.landmark * 2}
            height={MARK.landmark * 2}
            fill="#1a1a1a"
            pointerEvents="none"
          />
        ))}
        {map.origin && (
          <rect
            x={map.origin.x * CELL - MARK.landmark}
            y={map.origin.y * CELL - MARK.landmark}
            width={MARK.landmark * 2}
            height={MARK.landmark * 2}
            fill="#1a1a1a"
            pointerEvents="none"
          />
        )}

        {/* Riders: person icon (pickup) + X (dropoff) */}
        {riders.map((r) => {
          const c = r.personColor;
          const pu = riderPickup[r.letter];
          const dp = riderDropoff[r.letter];
          return (
            <g key={`rider-${r.letter}`} pointerEvents="none">
              <image
                href="/icons/person.png"
                x={pu.x * CELL - MARK.personHW}
                y={pu.y * CELL - MARK.personHH}
                width={MARK.personHW * 2}
                height={MARK.personHH * 2}
                filter={`url(#${tintId(c)})`}
              />
              {dp && (
                <>
                  <line x1={dp.x * CELL - 8} y1={dp.y * CELL - 8} x2={dp.x * CELL + 8} y2={dp.y * CELL + 8} stroke={c} strokeWidth={4} strokeLinecap="round" />
                  <line x1={dp.x * CELL - 8} y1={dp.y * CELL + 8} x2={dp.x * CELL + 8} y2={dp.y * CELL - 8} stroke={c} strokeWidth={4} strokeLinecap="round" />
                </>
              )}
            </g>
          );
        })}

        {/* Vehicles: draggable car icon + number badge */}
        {vehicles.map((v) => {
          const p = vehiclePos(v.color);
          const cx = p.x * CELL;
          const cy = p.y * CELL;
          const hex = VEHICLE_HEX[v.color];
          return (
            <g
              key={`veh-${v.color}`}
              onMouseDown={(e) => startDrag(e, v.color)}
              style={{ cursor: 'grab' }}
            >
              <image
                href="/icons/car.png"
                x={cx - MARK.carHW}
                y={cy - MARK.carHH}
                width={MARK.carHW * 2}
                height={MARK.carHH * 2}
                filter={`url(#${tintId(hex)})`}
              />
              {/* number badge (top-right of the car) */}
              <circle cx={cx + MARK.carHW - 4} cy={cy - MARK.carHH + 4} r={6.5} fill="white" stroke="#1a1a1a" strokeWidth={1} pointerEvents="none" />
              <text
                x={cx + MARK.carHW - 4}
                y={cy - MARK.carHH + 4}
                fontSize={9}
                fill="#1a1a1a"
                textAnchor="middle"
                dominantBaseline="central"
                fontWeight="bold"
                pointerEvents="none"
              >
                {VEHICLE_COLOR_TO_NUMBER[v.color]}
              </text>
            </g>
          );
        })}

        {/* Labels layer (collision-placed) — on top of everything */}
        {Object.entries(labels).map(([key, l]) => (
          <text
            key={`lbl-${key}`}
            x={l.box.cx}
            y={l.box.cy}
            fontSize={l.fontSize}
            fill="#1a1a1a"
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
