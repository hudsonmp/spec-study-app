'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Database } from '@/lib/types/db';
import {
  updateFieldAction,
  deleteFieldAction,
  moveFieldAction,
  duplicateFieldAction,
} from './actions';
import {
  OTHER_VALUE,
  OTHER_LABEL_DEFAULT,
  parseOptions,
  type Option,
} from '@/lib/onboarding/options';

export { OTHER_VALUE };

type Field = Pick<
  Database['public']['Tables']['onboarding_fields']['Row'],
  'id' | 'field_key' | 'label' | 'type' | 'options' | 'position'
>;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'opt'
  );
}

function dedupeValues(opts: Option[]): Option[] {
  const seen = new Map<string, number>();
  return opts.map((o) => {
    const base = o.value || slugify(o.label);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { value: n === 1 ? base : `${base}_${n}`, label: o.label };
  });
}

type DraftField = {
  id: string;
  field_key: string;
  label: string;
  type: Field['type'];
  position: number;
  options: Option[];
};

function FieldCard({
  field,
  canMoveUp,
  canMoveDown,
}: {
  field: Field;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [draft, setDraft] = useState<DraftField>({
    id: field.id,
    field_key: field.field_key,
    label: field.label,
    type: field.type,
    position: field.position,
    options: parseOptions(field.options),
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasOptions = draft.type === 'select' || draft.type === 'multi_select';
  const hasOther =
    hasOptions && draft.options.some((o) => o.value === OTHER_VALUE);

  // Auto-clear confirm-delete countdown
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  function save(next: DraftField = draft) {
    setError(null);
    const fd = new FormData();
    fd.set('id', next.id);
    fd.set('field_key', next.field_key);
    fd.set('label', next.label);
    fd.set('type', next.type);
    if (next.type === 'select' || next.type === 'multi_select') {
      fd.set('options', JSON.stringify(dedupeValues(next.options)));
    }
    startTransition(async () => {
      try {
        await updateFieldAction(fd);
        setSavedAt(new Date().toLocaleTimeString());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function patchDraft(p: Partial<DraftField>) {
    const next = { ...draft, ...p };
    setDraft(next);
    return next;
  }

  function move(dir: -1 | 1) {
    const fd = new FormData();
    fd.set('id', field.id);
    fd.set('dir', String(dir));
    startTransition(async () => {
      await moveFieldAction(fd);
    });
  }

  function duplicate() {
    const fd = new FormData();
    fd.set('id', field.id);
    startTransition(async () => {
      await duplicateFieldAction(fd);
    });
  }

  function del() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    const fd = new FormData();
    fd.set('id', field.id);
    startTransition(async () => {
      await deleteFieldAction(fd);
    });
  }

  function addOption(label = 'New option') {
    const newOpts = [...draft.options];
    // Insert before "Other" if present, otherwise append
    const otherIdx = newOpts.findIndex((o) => o.value === OTHER_VALUE);
    const insertAt = otherIdx >= 0 ? otherIdx : newOpts.length;
    newOpts.splice(insertAt, 0, { value: slugify(label), label });
    save(patchDraft({ options: newOpts }));
  }

  function removeOption(idx: number) {
    const newOpts = draft.options.filter((_, i) => i !== idx);
    save(patchDraft({ options: newOpts }));
  }

  function updateOptionLabel(idx: number, label: string) {
    const newOpts = draft.options.map((o, i) =>
      i === idx
        ? o.value === OTHER_VALUE
          ? o
          : { ...o, value: slugify(label), label }
        : o,
    );
    patchDraft({ options: newOpts });
  }

  function toggleTerminator(idx: number) {
    const newOpts = draft.options.map((o, i) =>
      i === idx ? { ...o, terminator: !o.terminator } : o,
    );
    save(patchDraft({ options: newOpts }));
  }

  function moveOption(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= draft.options.length) return;
    const newOpts = [...draft.options];
    [newOpts[idx], newOpts[j]] = [newOpts[j], newOpts[idx]];
    save(patchDraft({ options: newOpts }));
  }

  function toggleOther() {
    let newOpts: Option[];
    if (hasOther) {
      newOpts = draft.options.filter((o) => o.value !== OTHER_VALUE);
    } else {
      newOpts = [
        ...draft.options,
        { value: OTHER_VALUE, label: OTHER_LABEL_DEFAULT },
      ];
    }
    save(patchDraft({ options: newOpts }));
  }

  return (
    <div className="border border-[var(--rule)] bg-[var(--panel)] p-5 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Question {field.position + 1}
        </span>
        <div className="flex gap-3 text-sm text-[var(--muted)] items-center">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={!canMoveUp || isPending}
            className="hover:text-[var(--foreground)] disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={!canMoveDown || isPending}
            className="hover:text-[var(--foreground)] disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={duplicate}
            disabled={isPending}
            className="hover:text-[var(--foreground)] disabled:opacity-30"
            aria-label="Duplicate"
          >
            copy
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={del}
                disabled={isPending}
                className="text-[var(--danger)] underline"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={del}
              disabled={isPending}
              className="hover:text-[var(--danger)] disabled:opacity-30"
              aria-label="Delete"
            >
              × delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <label className="col-span-2 block">
          <span className="text-xs text-[var(--muted)]">Question label</span>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => patchDraft({ label: e.target.value })}
            onBlur={() => save()}
            className="mt-1 w-full border border-[var(--rule)] px-2 py-1 bg-white focus:outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--muted)]">Type</span>
          <select
            value={draft.type}
            onChange={(e) => {
              const t = e.target.value as Field['type'];
              const next = patchDraft({ type: t });
              save(next);
            }}
            className="mt-1 w-full border border-[var(--rule)] px-2 py-1 bg-white focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="short_text">short text</option>
            <option value="long_text">long text</option>
            <option value="number">number</option>
            <option value="select">multiple choice (one answer)</option>
            <option value="multi_select">multi-select (many answers)</option>
          </select>
        </label>
      </div>

      <label className="block mb-3">
        <span className="text-xs text-[var(--muted)]">
          Field key{' '}
          <span className="text-[10px]">(internal; appears in exports)</span>
        </span>
        <input
          type="text"
          value={draft.field_key}
          onChange={(e) =>
            patchDraft({
              field_key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
            })
          }
          onBlur={() => save()}
          className="mt-1 w-full border border-[var(--rule)] px-2 py-1 bg-white font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
        />
      </label>

      {hasOptions && (
        <div className="mb-3">
          <div className="text-xs text-[var(--muted)] mb-2">
            Options{' '}
            <span className="text-[10px]">
              (participants pick {draft.type === 'select' ? 'one' : 'any'})
            </span>
          </div>
          <div className="space-y-1">
            {draft.options.map((o, i) => {
              const isOther = o.value === OTHER_VALUE;
              return (
                <div
                  key={i}
                  className={
                    'flex gap-1 items-center ' +
                    (o.terminator
                      ? 'border-l-2 border-[var(--danger)] pl-1 -ml-2'
                      : '')
                  }
                >
                  <span className="text-xs text-[var(--muted)] w-5 text-right">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={o.label}
                    readOnly={isOther}
                    onChange={(e) => updateOptionLabel(i, e.target.value)}
                    onBlur={() => save()}
                    className={
                      'flex-1 border border-[var(--rule)] px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)] ' +
                      (isOther
                        ? 'italic text-[var(--muted)] bg-[#fbfaf7]'
                        : 'bg-white')
                    }
                    placeholder={
                      isOther ? OTHER_LABEL_DEFAULT : `Option ${i + 1}`
                    }
                  />
                  <label
                    title="If selected, terminates the participant (deletes their account and shows the ineligible screen)"
                    className={
                      'text-xs px-1 cursor-pointer select-none ' +
                      (o.terminator
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)]')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!o.terminator}
                      onChange={() => toggleTerminator(i)}
                      className="mr-1 align-middle"
                    />
                    terminate
                  </label>
                  <button
                    type="button"
                    onClick={() => moveOption(i, -1)}
                    disabled={i === 0}
                    className="text-xs px-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-25"
                    aria-label="Move option up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOption(i, 1)}
                    disabled={i === draft.options.length - 1}
                    className="text-xs px-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-25"
                    aria-label="Move option down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="text-xs px-1 text-[var(--muted)] hover:text-[var(--danger)]"
                    aria-label="Remove option"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2 items-center text-sm">
            <button
              type="button"
              onClick={() => addOption()}
              className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1"
            >
              + add option
            </button>
            <label className="text-xs text-[var(--muted)] flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasOther}
                onChange={toggleOther}
              />
              <span>
                Include &ldquo;Other (please specify)&rdquo; — participant can
                enter a free-text answer
              </span>
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center text-xs">
        <span className="text-[var(--muted)] italic">
          {error ? (
            <span className="text-[var(--danger)]">{error}</span>
          ) : savedAt ? (
            `Saved ${savedAt}`
          ) : isPending ? (
            'Saving…'
          ) : (
            ' '
          )}
        </span>
      </div>
    </div>
  );
}

export default function FieldsEditor({ fields }: { fields: Field[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic border border-dashed border-[var(--rule)] p-6 text-center">
        No questions yet. Click <em>add question</em> below to begin.
      </p>
    );
  }
  return (
    <div>
      {fields.map((f, i) => (
        <FieldCard
          key={f.id}
          field={f}
          canMoveUp={i > 0}
          canMoveDown={i < fields.length - 1}
        />
      ))}
    </div>
  );
}
