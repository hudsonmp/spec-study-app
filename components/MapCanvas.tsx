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
import { VEHICLE_COLOR_TO_NUMBER, VEHICLE_HEX, PERSON_PALETTE } from '@/lib/types/study';

const CELL = 22;
const PALETTE: string[] = [
  '#c0392b', // red
  '#2c6cdf', // blue
  '#2f8c4f', // green
  '#d4b033', // yellow
  '#7a3fb8', // purple
  '#1a1a1a', // black
];
const MARKER_TYPES = ['vehicle', 'person'] as const;
type MarkerType = (typeof MARKER_TYPES)[number];

type Marker = {
  id: string;
  type: MarkerType;
  color: string;
  label: string;
  x: number;
  y: number;
};

export type MapCanvasProps = {
  map: CityMap;
  scenarioId: string;
  storageKey: string;
  onEvent: (eventType: string, payload: unknown) => void;
  seededMarkers?: SeededMarker[];
};

function newMarkerId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function escapeText(s: string): string {
  // SVG text doesn't strictly need this since React handles entities, but
  // keep parity with the static renderer for future direct use.
  return s;
}

export default function MapCanvas({
  map,
  scenarioId,
  storageKey,
  onEvent,
  seededMarkers = [],
}: MapCanvasProps) {
  const N = map.gridSize || 20;
  const size = N * CELL;

  const fullStorageKey = `${storageKey}:${scenarioId}:markers`;

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [pendingType, setPendingType] = useState<MarkerType>('vehicle');
  const [pendingColor, setPendingColor] = useState<string>(PALETTE[0]);
  const [placeMode, setPlaceMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    markerId: string;
    startedAt: string;
  } | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(fullStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Marker[];
        if (Array.isArray(parsed)) setMarkers(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [fullStorageKey]);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(fullStorageKey, JSON.stringify(markers));
    } catch {
      /* ignore */
    }
  }, [fullStorageKey, markers, hydrated]);

  // Convert a pointer event into grid (SVG user) coordinates.
  const pointerToGrid = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      // viewBox spans (size + 50) user-units across `rect.width` pixels,
      // with origin at user-coord (-25, -25).
      const userWidth = size + 50;
      const userHeight = size + 50;
      const userX = (clientX - rect.left) * (userWidth / rect.width) - 25;
      const userY = (clientY - rect.top) * (userHeight / rect.height) - 25;
      return { x: userX / CELL, y: userY / CELL };
    },
    [size],
  );

  // Global mousemove + mouseup handlers while dragging.
  useEffect(() => {
    function onMove(e: globalThis.MouseEvent) {
      if (!dragRef.current) return;
      const pos = pointerToGrid(e.clientX, e.clientY);
      if (!pos) return;
      const { markerId } = dragRef.current;
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === markerId
            ? {
                ...m,
                x: clamp(pos.x, 0, N),
                y: clamp(pos.y, 0, N),
              }
            : m,
        ),
      );
    }

    function onUp(e: globalThis.MouseEvent) {
      if (!dragRef.current) return;
      const pos = pointerToGrid(e.clientX, e.clientY);
      const { markerId, startedAt } = dragRef.current;
      dragRef.current = null;
      if (!pos) return;
      const x = clamp(pos.x, 0, N);
      const y = clamp(pos.y, 0, N);
      // Only emit if location actually changed (avoid spam on simple clicks).
      let moved = false;
      setMarkers((prev) =>
        prev.map((m) => {
          if (m.id !== markerId) return m;
          if (m.x !== x || m.y !== y) moved = true;
          return { ...m, x, y };
        }),
      );
      if (moved) {
        onEvent('map_marker_move', {
          scenarioId,
          markerId,
          x,
          y,
          drag_started_at: startedAt,
          client_ts: new Date().toISOString(),
        });
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pointerToGrid, N, onEvent, scenarioId]);

  function handleSvgClick(e: ReactMouseEvent<SVGSVGElement>) {
    if (!placeMode) {
      // Click on empty area dismisses the inline editor.
      if (e.target === svgRef.current) setSelectedId(null);
      return;
    }
    const pos = pointerToGrid(e.clientX, e.clientY);
    if (!pos) return;

    // Cap total vehicles (participant + seeded) at 3.
    if (pendingType === 'vehicle') {
      const seededVehicleCount = seededMarkers.filter(
        (sm) => sm.kind === 'vehicle',
      ).length;
      const participantVehicleCount = markers.filter(
        (m) => m.type === 'vehicle',
      ).length;
      if (participantVehicleCount + seededVehicleCount >= 3) {
        setPlaceMode(false);
        return;
      }
    }

    const id = newMarkerId();
    const ts = new Date().toISOString();
    const marker: Marker = {
      id,
      type: pendingType,
      color: pendingColor,
      label: pendingType === 'vehicle' ? 'Vehicle' : 'Person',
      x: clamp(pos.x, 0, N),
      y: clamp(pos.y, 0, N),
    };
    setMarkers((prev) => [...prev, marker]);
    setPlaceMode(false);
    setSelectedId(id);
    onEvent('map_marker_add', {
      scenarioId,
      markerId: id,
      type: marker.type,
      color: marker.color,
      label: marker.label,
      x: marker.x,
      y: marker.y,
      client_ts: ts,
    });
  }

  function startDrag(e: ReactMouseEvent<SVGGElement>, markerId: string) {
    e.stopPropagation();
    if (placeMode) return;
    setSelectedId(markerId);
    dragRef.current = {
      markerId,
      startedAt: new Date().toISOString(),
    };
  }

  function relabel(markerId: string, label: string) {
    setMarkers((prev) =>
      prev.map((m) => (m.id === markerId ? { ...m, label } : m)),
    );
  }

  function commitRelabel(markerId: string, label: string) {
    onEvent('map_marker_relabel', {
      scenarioId,
      markerId,
      label,
      client_ts: new Date().toISOString(),
    });
  }

  function deleteMarker(markerId: string) {
    setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    setSelectedId((s) => (s === markerId ? null : s));
    onEvent('map_marker_delete', {
      scenarioId,
      markerId,
      client_ts: new Date().toISOString(),
    });
  }

  const selected = useMemo(
    () => markers.find((m) => m.id === selectedId) ?? null,
    [markers, selectedId],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-[var(--muted)] uppercase tracking-wider text-[10px]">
            Type
          </span>
          <select
            value={pendingType}
            onChange={(e) => setPendingType(e.target.value as MarkerType)}
            className="border border-[var(--rule)] bg-[var(--panel)] px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="vehicle">vehicle</option>
            <option value="person">person</option>
          </select>
        </label>
        <div className="flex items-center gap-1">
          <span className="text-[var(--muted)] uppercase tracking-wider text-[10px]">
            Color
          </span>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPendingColor(c)}
              aria-label={`color ${c}`}
              className={
                'h-5 w-5 border ' +
                (pendingColor === c
                  ? 'border-[var(--foreground)] ring-1 ring-[var(--foreground)]'
                  : 'border-[var(--rule)]')
              }
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPlaceMode((p) => !p)}
          className={
            'border px-3 py-1 transition ' +
            (placeMode
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]'
              : 'border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)]')
          }
        >
          {placeMode ? 'Click map to place…' : '+ Add'}
        </button>
        {selected && (
          <InlineEditor
            key={selected.id}
            marker={selected}
            onRelabel={(label) => relabel(selected.id, label)}
            onCommit={(label) => commitRelabel(selected.id, label)}
            onDelete={() => deleteMarker(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* Brief usage hint — keeps the toolbar self-explanatory for first-time users */}
      <p className="text-[11px] italic text-[var(--muted)] leading-snug">
        Pick a type and color, click <strong>+ Add</strong>, then click the map
        to place a marker. Drag any marker to move it. Click a marker to
        rename or delete it.
      </p>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`-25 -25 ${size + 50} ${size + 50}`}
        className="w-full max-w-[480px] border border-[#999] bg-[#fcfaf3]"
        style={{ cursor: placeMode ? 'crosshair' : 'default' }}
        onClick={handleSvgClick}
      >
        {/* Grid */}
        {Array.from({ length: N + 1 }, (_, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={i * CELL}
              y1={0}
              x2={i * CELL}
              y2={size}
              stroke="#e6e1d2"
              strokeWidth={0.3}
            />
            <line
              x1={0}
              y1={i * CELL}
              x2={size}
              y2={i * CELL}
              stroke="#e6e1d2"
              strokeWidth={0.3}
            />
          </g>
        ))}

        {/* Streets */}
        {(map.streets ?? []).map((s, i) => {
          const x1 = s.from[0] * CELL;
          const y1 = s.from[1] * CELL;
          const x2 = s.to[0] * CELL;
          const y2 = s.to[1] * CELL;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
          const rot = vertical ? -90 : 0;
          return (
            <g key={`st-${i}`} pointerEvents="none">
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#bbb"
                strokeWidth={9}
                strokeLinecap="round"
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#fff"
                strokeWidth={0.8}
                strokeDasharray="5 4"
              />
              <text
                x={mx}
                y={my - 8}
                fontSize={10}
                fontStyle="italic"
                fill="#555"
                textAnchor="middle"
                transform={`rotate(${rot} ${mx} ${my})`}
              >
                {escapeText(s.name)}
              </text>
            </g>
          );
        })}

        {/* Landmarks */}
        {(map.landmarks ?? []).map((l, i) => {
          const cx = l.x * CELL;
          const cy = l.y * CELL;
          const lx = cx + (l.labelDX ?? 6);
          const ly = cy + (l.labelDY ?? -6);
          const anchor = l.labelAnchor ?? 'start';
          return (
            <g key={`lm-${i}`} pointerEvents="none">
              <rect
                x={cx - 4}
                y={cy - 4}
                width={8}
                height={8}
                fill="#1a1a1a"
              />
              <text
                x={lx}
                y={ly}
                fontSize={10}
                fill="#1a1a1a"
                textAnchor={anchor}
              >
                {escapeText(l.label)}
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
              r={11}
              fill="#963b2a"
              stroke="#1a1a1a"
              strokeWidth={1}
            />
            <text
              x={map.origin.x * CELL}
              y={map.origin.y * CELL + 4}
              fontSize={12}
              fill="white"
              textAnchor="middle"
              fontWeight="bold"
            >
              ★
            </text>
            <text
              x={map.origin.x * CELL + (map.origin.labelDX ?? 14)}
              y={map.origin.y * CELL + (map.origin.labelDY ?? -10)}
              fontSize={11}
              fill="#963b2a"
              fontWeight="bold"
            >
              {escapeText(map.origin.label)}
            </text>
          </g>
        )}

        {/* Participant markers */}
        {markers.map((m) => {
          const cx = m.x * CELL;
          const cy = m.y * CELL;
          const isSelected = m.id === selectedId;
          return (
            <g
              key={m.id}
              onMouseDown={(e) => startDrag(e, m.id)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(m.id);
              }}
              style={{ cursor: placeMode ? 'crosshair' : 'grab' }}
            >
              {m.type === 'vehicle' ? (
                <rect
                  x={cx - 7}
                  y={cy - 4}
                  width={14}
                  height={8}
                  rx={2}
                  ry={2}
                  fill={m.color}
                  stroke={isSelected ? '#1a1a1a' : 'rgba(0,0,0,0.4)'}
                  strokeWidth={isSelected ? 1.5 : 0.6}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={m.color}
                  stroke={isSelected ? '#1a1a1a' : 'rgba(0,0,0,0.4)'}
                  strokeWidth={isSelected ? 1.5 : 0.6}
                />
              )}
              <text
                x={cx}
                y={cy + 16}
                fontSize={9}
                fill="#1a1a1a"
                textAnchor="middle"
                pointerEvents="none"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Seeded markers (researcher-placed, not draggable/deletable) */}
        {seededMarkers.map((sm, i) => {
          // Resolve landmark label → coordinates
          let lx = map.origin.x;
          let ly = map.origin.y;
          const lm = map.landmarks.find((l) => l.label === sm.landmarkLabel);
          if (lm) {
            lx = lm.x;
            ly = lm.y;
          } else if (map.origin.label === sm.landmarkLabel) {
            lx = map.origin.x;
            ly = map.origin.y;
          }
          const cx = lx * CELL;
          const cy = ly * CELL;

          const fillColor =
            sm.kind === 'vehicle'
              ? VEHICLE_HEX[sm.color]
              : sm.personColor;
          const label =
            sm.kind === 'vehicle'
              ? `Veh ${VEHICLE_COLOR_TO_NUMBER[sm.color]}`
              : `Person ${sm.letter}`;

          return (
            <g key={`seeded-${i}`} pointerEvents="none">
              {/* Seeded indicator dot above the shape */}
              <circle
                cx={cx}
                cy={cy - 12}
                r={3}
                fill={fillColor}
                stroke="#1a1a1a"
                strokeWidth={1}
              />
              {sm.kind === 'vehicle' ? (
                <rect
                  x={cx - 7}
                  y={cy - 4}
                  width={14}
                  height={8}
                  rx={2}
                  ry={2}
                  fill={fillColor}
                  stroke="#1a1a1a"
                  strokeWidth={2}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={fillColor}
                  stroke="#1a1a1a"
                  strokeWidth={2}
                />
              )}
              <text
                x={cx}
                y={cy + 16}
                fontSize={9}
                fill="#1a1a1a"
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function InlineEditor({
  marker,
  onRelabel,
  onCommit,
  onDelete,
  onClose,
}: {
  marker: Marker;
  onRelabel: (label: string) => void;
  onCommit: (label: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(marker.label);
  // Sync if the marker selection changes externally.
  useEffect(() => {
    setDraft(marker.label);
  }, [marker.id, marker.label]);

  return (
    <div className="flex items-center gap-1 border border-[var(--rule)] bg-[var(--panel)] px-2 py-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        Label
      </span>
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onRelabel(e.target.value);
        }}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit(draft);
            onClose();
          }
        }}
        className="border border-[var(--rule)] bg-white px-2 py-0.5 text-xs focus:outline-none focus:border-[var(--accent)]"
        autoFocus
      />
      <button
        type="button"
        onClick={onDelete}
        className="border border-[var(--rule)] px-2 py-0.5 text-xs hover:bg-[#c0392b] hover:text-white hover:border-[#c0392b] transition"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-[var(--muted)] hover:text-[var(--foreground)] text-xs px-1"
        aria-label="close editor"
      >
        ×
      </button>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
