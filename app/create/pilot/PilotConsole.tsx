'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import type { Entity, Requirement, Scenario } from '@/lib/types/study';
import { uid } from '@/lib/types/study';
import { buildContextBlock } from '@/lib/llm/context-block';
import { saveSystemPromptAction } from './actions';

// Researcher pilot console for the help-seeking assistant.
// Left: the first real-task scenario as the participant sees it, plus an
// editable workspace (spec + entities) the model reads, plus the chat.
// Right: the model's ACTUAL inputs — system prompt (saveable) and the context
// block (auto-derived via the same buildContextBlock the route uses, or
// manually overridden). Chat turns send preview:true + overrides; the only
// Supabase write in this console is the explicit system-prompt save.

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export default function PilotConsole({
  moduleId,
  moduleType,
  moduleTitle,
  studyContext,
  requirements,
  scenario,
  initialSystemPrompt,
  irbReference,
}: {
  moduleId: string;
  moduleType: string;
  moduleTitle: string;
  studyContext: string;
  requirements: Requirement[];
  scenario: Scenario | null;
  initialSystemPrompt: string;
  irbReference: string;
}) {
  // ----- workspace (local only; never persisted) -----
  const [spec, setSpec] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);

  // ----- model inputs -----
  const [prompt, setPrompt] = useState(initialSystemPrompt);
  const [savedPrompt, setSavedPrompt] = useState(initialSystemPrompt);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualContext, setManualContext] = useState<string | null>(null);

  const autoContext = useMemo(
    () =>
      buildContextBlock({
        studyContext,
        requirements,
        scenarioTitle: scenario?.title ?? '',
        scenarioClauses: (scenario?.clauses ?? []).map((c) => ({
          type: c.type,
          text: c.text,
        })),
        entities,
        spec,
      }),
    [studyContext, requirements, scenario, entities, spec],
  );
  const contextInUse = manualContext ?? autoContext;
  const promptDirty = prompt !== savedPrompt;

  // ----- chat -----
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
          preview: true,
          systemPromptOverride: prompt,
          // Manual mode pins the block verbatim; auto mode lets the server
          // rebuild it from the same state (identical builder, same output).
          ...(manualContext !== null ? { contextOverride: manualContext } : {}),
          moduleId,
          moduleType,
          moduleTitle,
          scenarioIdx: 0,
          messages: nextTurns,
          spec,
          entities,
          requirements,
          scenarioTitle: scenario?.title ?? '',
          scenarioClauses: (scenario?.clauses ?? []).map((c) => ({
            type: c.type,
            text: c.text,
          })),
          studyContext,
        }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string };
      if (!res.ok || !data.ok || !data.reply) {
        setError('The assistant is unavailable right now. Please try again.');
      } else {
        setTurns((t) => [...t, { role: 'assistant', content: data.reply! }]);
        requestAnimationFrame(() => {
          if (scrollRef.current)
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
    } catch {
      setError('The assistant is unavailable right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function savePrompt() {
    setSaving(true);
    const res = await saveSystemPromptAction({ content: prompt }).catch(() => ({
      ok: false,
    }));
    setSaving(false);
    if (res.ok) {
      setSavedPrompt(prompt);
      setSavedAt(new Date().toLocaleTimeString([], { hour12: false }));
    } else {
      setError('Saving the system prompt failed.');
    }
  }

  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      {/* ======================= Left: participant stage ======================= */}
      <Panel defaultSize="55%" minSize="35%">
        <div className="h-full flex flex-col gap-4 overflow-hidden pr-4">
          <section className="overflow-y-auto flex flex-col gap-4 min-h-0">
            <header>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Pilot stage · {moduleTitle} · Scenario 1
              </p>
            </header>

            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                Requirements
              </p>
              <ol className="list-decimal pl-5 text-sm leading-relaxed">
                {requirements.map((r) => (
                  <li key={r.id}>
                    As a <strong>{r.role}</strong>, I want {r.want}
                    {r.so ? `, so that ${r.so}` : ''}.
                  </li>
                ))}
                {requirements.length === 0 && (
                  <li className="italic text-[var(--muted)]">none authored</li>
                )}
              </ol>
            </div>

            {scenario && (
              <div className="border border-[var(--rule)] bg-[var(--panel)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                  Scenario — {scenario.title}
                </p>
                <ul className="text-sm leading-relaxed">
                  {scenario.clauses.map((c) => (
                    <li key={c.id}>
                      <strong className="font-medium">{c.type}</strong> {c.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <WorkspaceEditor
              spec={spec}
              setSpec={setSpec}
              entities={entities}
              setEntities={setEntities}
            />
          </section>

          {/* ----- chat ----- */}
          <section className="flex flex-col border-t border-[var(--rule)] pt-3 min-h-[14rem] max-h-[45%]">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
              Assistant chat (not recorded)
            </p>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto flex flex-col gap-2 text-sm pr-1"
            >
              {turns.length === 0 && (
                <p className="italic text-[var(--muted)]">
                  Ask as the participant would — the model receives the system
                  prompt and context block on the right.
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
                <div className="self-start text-[var(--muted)] italic">
                  Thinking…
                </div>
              )}
              {error && (
                <div className="self-start text-[var(--danger)] text-xs">
                  {error}
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 pt-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
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
              <button
                type="button"
                onClick={() => setTurns([])}
                disabled={busy || turns.length === 0}
                className="border border-[var(--rule)] px-2 py-1.5 text-xs text-[var(--muted)] disabled:opacity-30"
                title="Clear the transcript and start a fresh conversation"
              >
                Clear
              </button>
            </div>
          </section>
        </div>
      </Panel>

      <PanelResizeHandle className="w-px bg-[var(--rule)] hover:bg-[var(--accent)] cursor-col-resize" />

      {/* ======================= Right: model inputs ======================= */}
      <Panel defaultSize="45%" minSize="25%">
        <div className="h-full overflow-y-auto flex flex-col gap-5 pl-4">
          <section>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                System prompt
              </p>
              {promptDirty && (
                <span className="text-[10px] italic text-[var(--accent)]">
                  unsaved — chat uses this draft
                </span>
              )}
              {savedAt && !promptDirty && (
                <span className="text-[10px] italic text-[var(--muted)]">
                  saved {savedAt}
                </span>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={16}
              className="w-full border border-[var(--rule)] bg-white p-2 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => void savePrompt()}
                disabled={saving || !promptDirty}
                className="border border-[var(--danger)] text-[var(--danger)] px-3 py-1 text-xs disabled:opacity-30"
                title="Persists to Supabase. Live participants get the saved prompt on their next assistant turn."
              >
                {saving ? 'Saving…' : 'Save as live prompt'}
              </button>
              <button
                type="button"
                onClick={() => setPrompt(irbReference)}
                disabled={prompt === irbReference}
                className="border border-[var(--rule)] px-3 py-1 text-xs text-[var(--muted)] disabled:opacity-30"
                title="Restore the IRB-approved reference text into the editor (does not save)"
              >
                Reset to IRB reference
              </button>
            </div>
            <p className="text-[11px] leading-snug text-[var(--muted)] italic mt-2">
              Chatting uses the draft above without saving. Saving deploys it
              to live participants — the IRB-approved text is validated
              verbatim; an unsaved draft is the safe way to pilot.
            </p>
          </section>

          <section className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-baseline gap-3 mb-1 flex-wrap">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Context block
              </p>
              {manualContext === null ? (
                <>
                  <span className="text-[10px] italic text-[var(--muted)]">
                    auto — rebuilt from the workspace as you type
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualContext(autoContext)}
                    className="text-[10px] underline text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Edit manually
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[10px] italic text-[var(--accent)]">
                    manual override — sent verbatim
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualContext(null)}
                    className="text-[10px] underline text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Back to auto
                  </button>
                </>
              )}
            </div>
            {manualContext === null ? (
              <pre className="flex-1 min-h-[12rem] overflow-y-auto border border-dashed border-[var(--rule)] bg-[var(--panel)] p-2 text-xs leading-relaxed whitespace-pre-wrap">
                {contextInUse}
              </pre>
            ) : (
              <textarea
                value={manualContext}
                onChange={(e) => setManualContext(e.target.value)}
                rows={14}
                className="flex-1 min-h-[12rem] w-full border border-[var(--rule)] bg-white p-2 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:border-[var(--accent)]"
              />
            )}
          </section>
        </div>
      </Panel>
    </PanelGroup>
  );
}

// Spec textarea + a minimal entities/elements editor. State is local to the
// pilot — by design it never touches localStorage or the DB.
function WorkspaceEditor({
  spec,
  setSpec,
  entities,
  setEntities,
}: {
  spec: string;
  setSpec: (v: string) => void;
  entities: Entity[];
  setEntities: (v: Entity[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
          Your specification (the model sees this)
        </p>
        <textarea
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          rows={8}
          placeholder="Write specification rules here, as the participant would…"
          className="w-full border border-[var(--rule)] bg-white p-2 text-sm leading-relaxed resize-y focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div>
        <div className="flex items-baseline gap-3 mb-1">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Entities &amp; elements
          </p>
          <button
            type="button"
            onClick={() =>
              setEntities([...entities, { id: uid(), name: '', elements: [] }])
            }
            className="text-[10px] underline text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            + Add entity
          </button>
        </div>
        {entities.length === 0 && (
          <p className="text-xs italic text-[var(--muted)]">none recorded</p>
        )}
        <div className="flex flex-col gap-1">
          {entities.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <input
                value={e.name}
                onChange={(ev) =>
                  setEntities(
                    entities.map((x) =>
                      x.id === e.id ? { ...x, name: ev.target.value } : x,
                    ),
                  )
                }
                placeholder="Entity"
                className="w-40 border border-[var(--rule)] bg-white px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                value={e.elements.map((el) => el.name).join(', ')}
                onChange={(ev) =>
                  setEntities(
                    entities.map((x) =>
                      x.id === e.id
                        ? {
                            ...x,
                            elements: ev.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((name, i) => ({
                                id: x.elements[i]?.id ?? uid(),
                                name,
                              })),
                          }
                        : x,
                    ),
                  )
                }
                placeholder="elements, comma-separated"
                className="flex-1 border border-[var(--rule)] bg-white px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setEntities(entities.filter((x) => x.id !== e.id))}
                className="text-[var(--muted)] hover:text-[var(--danger)] text-sm leading-none px-1"
                aria-label="Remove entity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
