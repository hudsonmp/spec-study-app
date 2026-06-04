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

  // Content bounding box (grid units) → tight viewBox (no road whitespace).
  const vb = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const add = (x: number, y: number) => {
      xs.push(x);
      ys.push(y);
    };
    (map.streets ?? []).forEach((s) => {
      add(s.from[0], s.from[1]);
      add(s.to[0], s.to[1]);
    });
    (map.landmarks ?? []).forEach((l) => add(l.x, l.y));
    if (map.origin) add(map.origin.x, map.origin.y);
    Object.values(riderPickup).forEach((p) => add(p.x, p.y));
    Object.values(riderDropoff).forEach((p) => add(p.x, p.y));
    vehicles.forEach((v) => {
      const p = vehiclePos(v.color);
      add(p.x, p.y);
    });
    if (xs.length === 0) {
      return { x: 0, y: 0, w: N * CELL, h: N * CELL };
    }
    const pad = 1.4; // grid units of breathing room
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    return {
      x: minX * CELL,
      y: minY * CELL,
      w: (maxX - minX) * CELL,
      h: (maxY - minY) * CELL,
    };
  }, [map, riderPickup, riderDropoff, vehicles, vehiclePos, N]);

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
        Drag the vehicles to where you&rsquo;d assign them. Riders show as a dot
        (pickup) and an X (dropoff) in their colour.
      </p>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full border border-[#999] bg-[#fcfaf3]"
      >
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

        {/* Landmarks */}
        {(map.landmarks ?? []).map((l, i) => {
          const cx = l.x * CELL;
          const cy = l.y * CELL;
          const lx = cx + (l.labelDX ?? 8);
          const ly = cy + (l.labelDY ?? -8);
          return (
            <g key={`lm-${i}`} pointerEvents="none">
              <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="#1a1a1a" />
              <text
                x={lx}
                y={ly}
                fontSize={12}
                fill="#1a1a1a"
                textAnchor={l.labelAnchor ?? 'start'}
              >
                {l.label}
              </text>
            </g>
          );
        })}

        {/* Origin */}
        {map.origin && (
          <g pointerEvents="none">
            <circle
              cx={map.origin.x * CELL}
              cy={map.origin.y * CELL}
              r={13}
              fill="#963b2a"
              stroke="#1a1a1a"
            />
            <text
              x={map.origin.x * CELL}
              y={map.origin.y * CELL + 5}
              fontSize={14}
              fill="white"
              textAnchor="middle"
              fontWeight="bold"
            >
              ★
            </text>
            <text
              x={map.origin.x * CELL + (map.origin.labelDX ?? 16)}
              y={map.origin.y * CELL + (map.origin.labelDY ?? -12)}
              fontSize={12}
              fill="#963b2a"
              fontWeight="bold"
            >
              {map.origin.label}
            </text>
          </g>
        )}

        {/* Riders: pickup dot + dropoff X (fixed) */}
        {riders.map((r) => {
          const c = r.personColor;
          const pu = riderPickup[r.letter];
          const dp = riderDropoff[r.letter];
          return (
            <g key={`rider-${r.letter}`} pointerEvents="none">
              {dp && (
                <line
                  x1={pu.x * CELL}
                  y1={pu.y * CELL}
                  x2={dp.x * CELL}
                  y2={dp.y * CELL}
                  stroke={c}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.55}
                />
              )}
              <circle cx={pu.x * CELL} cy={pu.y * CELL} r={8} fill={c} stroke="#1a1a1a" strokeWidth={2} />
              <text x={pu.x * CELL} y={pu.y * CELL + 22} fontSize={11} fill="#1a1a1a" textAnchor="middle">
                {`Rider ${r.letter}`}
              </text>
              {dp && (
                <>
                  <line x1={dp.x * CELL - 8} y1={dp.y * CELL - 8} x2={dp.x * CELL + 8} y2={dp.y * CELL + 8} stroke={c} strokeWidth={4} strokeLinecap="round" />
                  <line x1={dp.x * CELL - 8} y1={dp.y * CELL + 8} x2={dp.x * CELL + 8} y2={dp.y * CELL - 8} stroke={c} strokeWidth={4} strokeLinecap="round" />
                  <text x={dp.x * CELL} y={dp.y * CELL + 22} fontSize={11} fill="#1a1a1a" textAnchor="middle">
                    drop {r.letter}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Vehicles: draggable (the participant manipulates these) */}
        {vehicles.map((v) => {
          const p = vehiclePos(v.color);
          const cx = p.x * CELL;
          const cy = p.y * CELL;
          return (
            <g
              key={`veh-${v.color}`}
              onMouseDown={(e) => startDrag(e, v.color)}
              style={{ cursor: 'grab' }}
            >
              <rect
                x={cx - 12}
                y={cy - 8}
                width={24}
                height={16}
                rx={3}
                ry={3}
                fill={VEHICLE_HEX[v.color]}
                stroke="#1a1a1a"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={cy + 4}
                fontSize={11}
                fill="white"
                textAnchor="middle"
                fontWeight="bold"
                pointerEvents="none"
              >
                {VEHICLE_COLOR_TO_NUMBER[v.color]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
