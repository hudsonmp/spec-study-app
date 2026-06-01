'use client';

import { useActionState, useState } from 'react';
import { submitOnboardingAction, type OnboardState } from './actions';
import type { Database } from '@/lib/types/db';
import { OTHER_VALUE, parseOptions } from '@/lib/onboarding/options';

type Field = Pick<
  Database['public']['Tables']['onboarding_fields']['Row'],
  'id' | 'field_key' | 'label' | 'type' | 'options' | 'position'
>;

const inputBase =
  'w-full border border-[var(--rule)] px-3 py-2 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)]';

function SingleSelectField({ field }: { field: Field }) {
  const opts = parseOptions(field.options);
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const isOtherSelected = selected === OTHER_VALUE;
  const finalValue = isOtherSelected ? otherText : (selected ?? '');

  return (
    <div className="space-y-1.5">
      <input type="hidden" name={`f_${field.id}`} value={finalValue} />
      {opts.map((o) => {
        const isOther = o.value === OTHER_VALUE;
        const checked = selected === o.value;
        return (
          <div key={o.value}>
            <label className="flex gap-2 items-center text-sm cursor-pointer">
              <input
                type="radio"
                name={`ui_${field.id}`}
                required
                checked={checked}
                onChange={() => setSelected(o.value)}
              />
              <span className={isOther ? 'italic text-[var(--muted)]' : ''}>
                {o.label}
              </span>
            </label>
            {isOther && checked && (
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Please specify"
                className="mt-1 ml-6 w-[calc(100%-1.5rem)] border border-[var(--rule)] px-2 py-1 text-sm bg-white focus:outline-none focus:border-[var(--accent)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MultiSelectField({ field }: { field: Field }) {
  const opts = parseOptions(field.options);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState('');
  const hasOther = checked.has(OTHER_VALUE);

  function toggle(value: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // Hidden inputs for each non-Other selection; if Other checked and text
  // non-empty, also emit the text.
  const selectedConcrete = Array.from(checked).filter((v) => v !== OTHER_VALUE);
  const otherFinal = hasOther && otherText.trim() ? otherText.trim() : null;

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        required
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        value={selectedConcrete.length > 0 || otherFinal ? 'ok' : ''}
        onChange={() => {}}
      />
      {selectedConcrete.map((v) => (
        <input
          key={`hid-${v}`}
          type="hidden"
          name={`f_${field.id}`}
          value={v}
        />
      ))}
      {otherFinal && (
        <input type="hidden" name={`f_${field.id}`} value={otherFinal} />
      )}
      {opts.map((o) => {
        const isOther = o.value === OTHER_VALUE;
        const isChecked = checked.has(o.value);
        return (
          <div key={o.value}>
            <label className="flex gap-2 items-center text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(o.value)}
              />
              <span className={isOther ? 'italic text-[var(--muted)]' : ''}>
                {o.label}
              </span>
            </label>
            {isOther && isChecked && (
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Please specify"
                className="mt-1 ml-6 w-[calc(100%-1.5rem)] border border-[var(--rule)] px-2 py-1 text-sm bg-white focus:outline-none focus:border-[var(--accent)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ field }: { field: Field }) {
  const name = `f_${field.id}`;
  switch (field.type) {
    case 'short_text':
      return <input type="text" name={name} required className={inputBase} />;
    case 'long_text':
      return (
        <textarea name={name} rows={4} required className={`${inputBase} resize-y`} />
      );
    case 'number':
      return (
        <input
          type="number"
          name={name}
          required
          className={`${inputBase} font-mono`}
          step="any"
        />
      );
    case 'select':
      return <SingleSelectField field={field} />;
    case 'multi_select':
      return <MultiSelectField field={field} />;
  }
}

const initial: OnboardState = {};

export default function OnboardForm({ fields }: { fields: Field[] }) {
  const [state, formAction, isPending] = useActionState(
    submitOnboardingAction,
    initial,
  );

  if (fields.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic">
        No onboarding questions have been configured yet. The researcher will
        publish them shortly.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {fields.map((f) => (
        <div key={f.id}>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 block">
            {f.label}
            <span className="text-[var(--danger)] ml-1" aria-label="required">*</span>
          </div>
          <FieldInput field={f} />
        </div>
      ))}

      {state.error && (
        <p className="text-sm text-[var(--danger)]">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full border border-[var(--foreground)] py-2.5 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition disabled:opacity-50"
      >
        {isPending ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}
