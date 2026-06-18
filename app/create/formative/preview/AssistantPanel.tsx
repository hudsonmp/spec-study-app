'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Entity, Requirement, Scenario } from '@/lib/types/study';

// The LLM help-seeking assistant. A fixed lower-right launcher that expands a
// draggable chat panel over the specification area. Gated by the caller (only
// rendered on assisted modules). All model calls go through the server route
// `/api/llm-assistant`, which owns the IRB-approved system prompt and the API
// key — none of that reaches the client.

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type AssistantContext = {
  moduleId: string;
  moduleType: string;
  moduleTitle: string;
  scenarioIdx: number | null;
  spec: string;
  entities: Entity[];
  requirements: Requirement[];
  scenario: Scenario | null;
  studyContext: string;
};

const PANEL_W = 380;
const PANEL_H = 460;

export default function AssistantPanel({
  ctx,
  preview = false,
  open: openProp,
  onOpenChange,
}: {
  ctx: AssistantContext;
  // Researcher preview: the route authorizes via the researcher session and
  // skips the per-participant transcript writes.
  preview?: boolean;
  // Controlled open state (optional). When `open`/`onOpenChange` are supplied
  // the panel is driven by the parent — used so a researcher `offer_help` push
  // can open the assistant from outside this component. When omitted the panel
  // falls back to its own internal state (the original uncontrolled behavior).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenInternal(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Panel position. Initialized once to the lower-right; dragging mutates it.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Place the panel near the launcher on first open (client-only — needs
  // window). Clamp so it stays on screen.
  useEffect(() => {
    if (open && pos === null && typeof window !== 'undefined') {
      const x = Math.max(12, window.innerWidth - PANEL_W - 24);
      const y = Math.max(12, window.innerHeight - PANEL_H - 88);
      setPos({ x, y });
    }
  }, [open, pos]);

  // Auto-scroll the transcript on new turns.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, busy]);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pos) return;
      // Ignore drags that start on the close button.
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const maxX = window.innerWidth - 120;
      const maxY = window.innerHeight - 60;
      const x = Math.min(Math.max(0, e.clientX - d.dx), maxX);
      const y = Math.min(Math.max(0, e.clientY - d.dy), maxY);
      setPos({ x, y });
    },
    [],
  );

  const onHeaderPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/llm-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview,
          moduleId: ctx.moduleId,
          moduleType: ctx.moduleType,
          moduleTitle: ctx.moduleTitle,
          scenarioIdx: ctx.scenarioIdx,
          messages: nextTurns,
          spec: ctx.spec,
          entities: ctx.entities,
          requirements: ctx.requirements,
          scenarioTitle: ctx.scenario?.title ?? '',
          scenarioClauses: (ctx.scenario?.clauses ?? []).map((c) => ({
            type: c.type,
            text: c.text,
          })),
          studyContext: ctx.studyContext,
        }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string };
      if (!res.ok || !data.ok || !data.reply) {
        setError('The assistant is unavailable right now. Please try again.');
      } else {
        setTurns((t) => [...t, { role: 'assistant', content: data.reply! }]);
      }
    } catch {
      setError('The assistant is unavailable right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] shadow-lg hover:opacity-90"
        aria-label="Open the help assistant"
      >
        <span aria-hidden>?</span>
        Assistant
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 flex flex-col border border-[var(--rule)] bg-[var(--background)] shadow-2xl"
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: PANEL_W,
        height: PANEL_H,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label="Help assistant"
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-[var(--rule)] bg-[var(--panel)] px-3 py-2 select-none active:cursor-grabbing"
      >
        <span className="text-sm font-medium tracking-tight">Help assistant</span>
        <button
          type="button"
          data-no-drag
          onClick={() => setOpen(false)}
          className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg leading-none px-1"
          aria-label="Close the assistant"
        >
          ×
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-sm"
      >
        {turns.length === 0 && (
          <p className="text-[var(--muted)] italic leading-relaxed">
            Ask a targeted question about the task — a term, the Given/When/Then
            format, or what your own stated rules imply in a situation you
            describe.
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === 'user'
                ? 'self-end max-w-[85%] bg-[var(--foreground)] text-[var(--background)] px-3 py-2 rounded-lg whitespace-pre-wrap'
                : 'self-start max-w-[90%] border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 rounded-lg whitespace-pre-wrap'
            }
          >
            {t.content}
          </div>
        ))}
        {busy && (
          <div className="self-start text-[var(--muted)] italic">Thinking…</div>
        )}
        {error && (
          <div className="self-start text-[var(--danger)] text-xs">{error}</div>
        )}
      </div>

      <div className="border-t border-[var(--rule)] p-2 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          rows={2}
          placeholder="Ask a question…"
          className="flex-1 resize-none border border-[var(--rule)] bg-white px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="border border-[var(--rule)] bg-[var(--foreground)] px-3 py-1.5 text-sm text-[var(--background)] disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
