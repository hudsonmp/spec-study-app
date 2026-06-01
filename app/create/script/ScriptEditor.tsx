'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Screen } from '@/lib/study/screens';
import { upsertScriptAction } from './actions';

export default function ScriptEditor({
  studyId,
  screens,
  initialScripts,
}: {
  studyId: string;
  screens: Screen[];
  initialScripts: Record<string, string>;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(
    screens[0]?.key ?? '',
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(initialScripts);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selected = screens.find((s) => s.key === selectedKey) ?? screens[0];

  function updateDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      startTransition(async () => {
        const res = await upsertScriptAction({
          studyId,
          screenKey: key,
          scriptText: value,
        });
        if (res.ok) {
          setSavedAt((s) => ({
            ...s,
            [key]: new Date().toLocaleTimeString(),
          }));
        }
      });
    }, 600);
  }

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  if (screens.length === 0) {
    return (
      <p className="text-sm italic text-[var(--muted)] border border-dashed border-[var(--rule)] p-6 text-center">
        No screens — add modules in <em>Protocol</em> first.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_1.4fr] gap-6 min-h-[60vh]">
      <aside className="border border-[var(--rule)] overflow-y-auto max-h-[70vh]">
        <ul className="divide-y divide-[var(--rule)]">
          {screens.map((s) => {
            const isActive = s.key === selected?.key;
            const hasScript = (drafts[s.key] ?? '').trim().length > 0;
            return (
              <li
                key={s.key}
                onClick={() => setSelectedKey(s.key)}
                className={
                  'p-3 cursor-pointer ' +
                  (isActive
                    ? 'bg-[var(--rule-soft)]'
                    : 'hover:bg-[var(--rule-soft)]')
                }
              >
                <div className="text-xs uppercase tracking-wider text-[var(--muted)] flex justify-between gap-2">
                  <span>{s.label}</span>
                  {hasScript && (
                    <span className="text-[var(--accent)]" aria-label="has script">
                      ●
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--muted)] mt-1 line-clamp-2">
                  {s.summary || <em>(empty)</em>}
                </p>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="flex flex-col gap-3">
        {selected && (
          <>
            <div className="flex justify-between items-baseline">
              <h2 className="text-lg font-medium tracking-tight">
                {selected.label}
              </h2>
              <span className="text-xs italic text-[var(--muted)]">
                {savedAt[selected.key]
                  ? `Saved ${savedAt[selected.key]}`
                  : ' '}
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] italic">
              {selected.summary || '(no participant content yet)'}
            </p>
            <textarea
              value={drafts[selected.key] ?? ''}
              onChange={(e) => updateDraft(selected.key, e.target.value)}
              placeholder="Type the script you'll read aloud while the participant is on this screen…"
              className="flex-1 min-h-[400px] border border-[var(--rule)] px-3 py-2 bg-white focus:outline-none focus:border-[var(--accent)]"
            />
          </>
        )}
      </section>
    </div>
  );
}
