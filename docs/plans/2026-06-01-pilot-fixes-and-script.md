# Pilot 1 Fixes + Script Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply all post-pilot-1 fixes (mandatory form fields, terminator trigger, think-aloud restructure with reveal gate, content typo fixes) AND ship a researcher Script Console (`/create/script`) that lets the researcher attach scripts to every participant-facing screen and walk through them in a Zoom-friendly follow-along view.

**Architecture:**
- **Content fixes (knew→new, grey-script removal, anagram split, scratchpad-off):** live in `studies.authored_data` JSONB for the shown project. Apply via a one-time `apply_migration` UPDATE plus a tiny model/editor change so the next pilot can author the new shape natively (split `body` into pre-reveal instructions + `revealedTask`).
- **Mandatory + asterisk:** client-side `required` on every input + server-side completeness check before terminator/upsert. Red `*` rendered next to every label.
- **Think-aloud restructure:** add an intro centered-box step (like retrospective single-screen layout) before the warmup body; gate the actual prompt behind a "Reveal Task" button that swaps in `revealedTask` and shows the existing mandatory callout. Drop scratchpad column when `includeScratchPaper === false`.
- **`/create` hub:** turn `/create/page.tsx` into a card picker (Questionnaire / Protocol / Script). Move existing form builder to `/create/questionnaire`. `/create/formative` is the Protocol page (unchanged).
- **Script Console:** new table `study_scripts(study_id, screen_key)` keyed by a deterministic screen enumeration (`lib/study/screens.ts`). `/create/script` shows the full screen list with per-screen previews and a right-hand editor that debounce-upserts. "Follow along" mode (`/create/script/follow`) is a researcher-only walkthrough that mirrors the participant layout for each screen and shows the script in a collapsible side rail.

**Tech Stack:** Next.js 16 App Router (TS), Tailwind, Supabase (`vt-supabase` MCP, project `wuvtffnomynoafbilzxw`), `@supabase/ssr`, `iron-session`, `react-resizable-panels`, server actions.

**Branch:** `post-528-pilot` (current).

---

## File structure

**Modify:**
- `app/onboard/OnboardForm.tsx` — required attrs, red asterisks, multi-select min-1 validation
- `app/onboard/actions.ts` — server-side completeness check
- `app/create/page.tsx` — replace with 3-card hub
- `app/create/formative/FormativeEditor.tsx` — expose `revealedTask` field on ThinkAloudWarmupEditor
- `app/create/formative/preview/ParticipantFlow.tsx` — intro step, scratchpad conditional, Reveal Task gate
- `lib/types/study.ts` — `revealedTask: string` on `ThinkAloudWarmupModule`
- `lib/study/reducer.ts` — `migrateContent` backfills `revealedTask: ''`
- `lib/types/db.ts` — regenerate after migration

**Create:**
- `app/create/questionnaire/page.tsx` — relocated form builder
- `app/create/script/page.tsx` — script console root (project picker + screen list + editor)
- `app/create/script/ScriptEditor.tsx` — client component, debounced save
- `app/create/script/actions.ts` — `upsertScriptAction`, `listScriptsAction`
- `app/create/script/follow/page.tsx` — researcher follow-along walkthrough
- `app/create/script/follow/FollowAlong.tsx` — client walkthrough with collapsible side rail
- `lib/study/screens.ts` — pure screen enumeration utility

---

### Task 1: DB content migration — fix knew→new, remove grey script, split anagram, disable scratchpad

**Why:** Per pilot 1 feedback: `taskDescription` contains the typo "knew" (→ "new") and a paragraph the researcher reads aloud (must be removed from the participant view). The `body` ends with `Anagram:\nNPEPHA` — the anagram letters must be hidden until a "Reveal Task" click. Move the anagram letters to a new `revealedTask` field. Also flip `includeScratchPaper` to `false` so the participant sees no scratchpad column.

**Files:**
- Apply via `mcp__vt-supabase__apply_migration` (DDL/DML in one migration)

- [ ] **Step 1: Inspect target row** — confirm the shown study's id (already known: `e07fab09-7004-4b70-bcf7-119efe5537a6`) and the warmup module id (`2m7kdrj7`).

- [ ] **Step 2: Apply migration**

```sql
-- migration name: 2026-06-01_pilot1_warmup_content_fix
update public.studies
set authored_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        authored_data,
        '{modules,0,taskDescription}',
        to_jsonb($txt$It can be difficult to talk and think aloud, especially with new or difficult tasks, so before we start the actual study, you will complete one practice exercise. Sometimes, you should try to just narrate what you're reading, trying to remember, or looking at; no need to articulate why you're doing it. Other times, you may want to explain why you are taking certain actions, elaborate on your thought process, and explain each of the steps you take.$txt$::text)
      ),
      '{modules,0,body}',
      to_jsonb($txt$Below is an anagram, and your task is to unscramble it into a word! For example, if the scrambled letters are KORO, you may see that these letters spell the word ROOK. Please "talk aloud" while you solve the following anagram!$txt$::text)
    ),
    '{modules,0,revealedTask}',
    to_jsonb('NPEPHA'::text),
    true
  ),
  '{modules,0,includeScratchPaper}',
  to_jsonb(false)
)
where id = 'e07fab09-7004-4b70-bcf7-119efe5537a6';
```

- [ ] **Step 3: Verify**

```sql
select
  authored_data->'modules'->0->>'taskDescription' as task_desc,
  authored_data->'modules'->0->>'body'             as body,
  authored_data->'modules'->0->>'revealedTask'     as revealed,
  authored_data->'modules'->0->>'includeScratchPaper' as scratch
from public.studies
where id = 'e07fab09-7004-4b70-bcf7-119efe5537a6';
```

Expected:
- `task_desc` starts with "It can be difficult to talk and think aloud, especially with **new** or difficult tasks…" and ends after "…each of the steps you take." (no grey-script paragraph).
- `body` ends with "…the following anagram!" (no "Anagram:" tail).
- `revealed` = `NPEPHA`.
- `scratch` = `false`.

- [ ] **Step 4: Commit a marker file** — the migration is recorded by Supabase, but commit `docs/plans/2026-06-01-pilot-fixes-and-script.md` so reviewers can find the spec.

```bash
git add docs/plans/2026-06-01-pilot-fixes-and-script.md
git commit -m "docs: plan for pilot-1 fixes and Script Console"
```

---

### Task 2: Add `revealedTask` to ThinkAloudWarmupModule type + migrateContent backfill

**Why:** The new field added in Task 1 must be reflected in the TS model so the editor and runner can read/write it. Existing rows without the field get `''` via migrate.

**Files:**
- Modify: `lib/types/study.ts:77-85,148-158`
- Modify: `lib/study/reducer.ts:26-38`

- [ ] **Step 1: Extend the type** — `lib/types/study.ts`:

```ts
export type ThinkAloudWarmupModule = {
  id: string;
  type: 'think_aloud_warmup';
  title: string;
  taskDescription: string;
  body: string;
  revealedTask: string;
  includeScratchPaper: boolean;
  mandatory: boolean;
};

export function newThinkAloudWarmup(): ThinkAloudWarmupModule {
  return {
    id: uid(),
    type: 'think_aloud_warmup',
    title: 'Think-aloud warmup',
    taskDescription: '',
    body: '',
    revealedTask: '',
    includeScratchPaper: false,
    mandatory: false,
  };
}
```

- [ ] **Step 2: Backfill in `migrateContent`** — `lib/study/reducer.ts`:

Replace the existing `migrateContent` body so that when `modules` is present, each `think_aloud_warmup` gets `revealedTask: ''` if missing:

```ts
export function migrateContent(input: unknown): ProjectContent {
  if (!input || typeof input !== 'object') return emptyContent();
  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.modules)) {
    const modules = (obj.modules as Module[]).map((m) => {
      if (m.type === 'think_aloud_warmup' && typeof (m as ThinkAloudWarmupModule).revealedTask !== 'string') {
        return { ...m, revealedTask: '' } as Module;
      }
      return m;
    });
    return { modules };
  }
  return emptyContent();
}
```

Add a type-only import at the top: `import type { ThinkAloudWarmupModule } from '@/lib/types/study';`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add lib/types/study.ts lib/study/reducer.ts
git commit -m "feat(study): add revealedTask field to think-aloud warmup"
```

---

### Task 3: Expose `revealedTask` in the editor + add the unwired editor field for `taskDescription`/`body`

**Why:** The researcher must be able to author the new field. Also fold in the `revealedTask` text input.

**Files:**
- Modify: `app/create/formative/FormativeEditor.tsx:438-494` (ThinkAloudWarmupEditor)

- [ ] **Step 1: Add `revealedTask` row to `ThinkAloudWarmupEditor`** — insert between the `body` field and the checkboxes:

```tsx
<FieldLabel label="Revealed task (shown after the participant clicks Reveal Task)">
  <input
    type="text"
    className={inputCls + ' font-mono tracking-widest'}
    value={m.revealedTask}
    onChange={(e) => p((w) => (w.revealedTask = e.target.value))}
    placeholder="e.g. NPEPHA"
  />
</FieldLabel>
```

- [ ] **Step 2: Smoke test in the dev server** — open `/create/formative?p=e07fab09-7004-4b70-bcf7-119efe5537a6`, click into the Think-Aloud Warmup module, confirm the new field renders with `NPEPHA` (from Task 1 migration).

- [ ] **Step 3: Commit**

```bash
git add app/create/formative/FormativeEditor.tsx
git commit -m "feat(editor): expose revealedTask field on think-aloud warmup"
```

---

### Task 4: Mandatory onboarding fields + red asterisk labels + server-side enforcement

**Why:** The pilot showed participants skipping past the terminator-tagged option, so eligibility couldn't be enforced. Mandatory + server-side guard fixes both the UX and the terminator path.

**Files:**
- Modify: `app/onboard/OnboardForm.tsx`
- Modify: `app/onboard/actions.ts:30-95`

- [ ] **Step 1: Add asterisk to labels and required to inputs (`OnboardForm.tsx`)**

Update the label render (around line 168) to:

```tsx
<div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 block">
  {f.label}
  <span className="text-[var(--danger)] ml-1" aria-label="required">*</span>
</div>
```

Update `FieldInput` cases:

```tsx
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
```

For `SingleSelectField`, change the hidden input to `required`:

```tsx
<input type="hidden" name={`f_${field.id}`} value={finalValue} required />
```

But hidden inputs don't trigger `required` validation reliably. Instead: keep the hidden input, and add a top-level form `onInvalid` / `onSubmit` guard. Simplest: convert the radio group itself to use `required` on each radio (HTML treats any one `required` radio in a name-group as satisfying the constraint when one is chosen). Replace the `ui_*` radio:

```tsx
<input
  type="radio"
  name={`ui_${field.id}`}
  required
  checked={checked}
  onChange={() => setSelected(o.value)}
/>
```

For `MultiSelectField`, native `required` on checkboxes isn't a group rule, so add a sentinel: render a hidden text input that is empty unless at least one box is checked, and is `required`:

```tsx
<input
  type="text"
  required
  tabIndex={-1}
  aria-hidden
  className="sr-only"
  value={selectedConcrete.length > 0 || otherFinal ? 'ok' : ''}
  onChange={() => {}}
/>
```

- [ ] **Step 2: Server-side completeness guard (`actions.ts`)**

Before the terminator loop, add:

```ts
const missing: string[] = [];
for (const f of fields ?? []) {
  const vals = formData.getAll(`f_${f.id}`).map((v) => v.toString().trim()).filter(Boolean);
  if (vals.length === 0) missing.push(f.field_key);
}
if (missing.length > 0) {
  return { error: `Please answer every question. Missing: ${missing.join(', ')}.` };
}
```

- [ ] **Step 3: Manual test**

Start dev (`npm run dev`). Visit `/onboard` with a fresh session. Try to submit empty → blocked by client. Force-submit via DevTools → server returns the error message.

- [ ] **Step 4: Commit**

```bash
git add app/onboard/OnboardForm.tsx app/onboard/actions.ts
git commit -m "feat(onboard): mandatory fields with red asterisks and server-side guard"
```

---

### Task 5: Add intro centered-box screen before think-aloud warmup body

**Why:** Pilot feedback: participants jumped into the anagram before the researcher said anything. Introduce a single-screen gate.

**Files:**
- Modify: `app/create/formative/preview/ParticipantFlow.tsx:365-426` (ThinkAloudWarmupRunner)

- [ ] **Step 1: Add a `phase` state inside `ThinkAloudWarmupRunner`**

Replace the function body so it manages three phases (`intro` → `body` → `revealed`). The intro is a centered box; the body shows pre-reveal instructions + Reveal Task button; revealed shows `revealedTask` + the mandatory callout.

```tsx
function ThinkAloudWarmupRunner({
  projectId,
  module: m,
  save,
  onComplete,
}: {
  projectId: string;
  module: ThinkAloudWarmupModule;
  save: SaveAdapter;
  onComplete: () => void;
}) {
  type Phase = 'intro' | 'body' | 'revealed';
  const [phase, setPhase] = useState<Phase>('intro');

  const [scratch, setScratch] = useLocalString(
    `pf:${projectId}:${m.id}:scratch`,
  );
  const [scratchSavedAt, markScratchSaved] = useSavedAt();
  useDebouncedSave(scratch, (v) => {
    if (!m.includeScratchPaper) return;
    save.upsert('scratchpad:current', v);
    save.recordEvent('scratchpad_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markScratchSaved();
  });

  function advanceTo(next: Phase) {
    save.recordEvent('step_advance', { from: phase, to: next });
    setPhase(next);
  }

  function finish() {
    if (m.includeScratchPaper) {
      save.recordEvent('scratchpad_snapshot', {
        at: 'warmup_end',
        value: scratch,
      });
    }
    save.recordEvent('step_advance', { from: phase, to: 'done' });
    onComplete();
  }

  if (phase === 'intro') {
    return (
      <Centered>
        <h2 className="text-2xl font-medium tracking-tight mb-4">
          Think-Aloud Instructions
        </h2>
        <p className="text-[var(--muted)] leading-relaxed mb-8">
          Please do not move on until directed by the researcher.
        </p>
        <ContinueButton onClick={() => advanceTo('body')} />
      </Centered>
    );
  }

  const bodyContent = (
    <section className="flex flex-col gap-4 overflow-y-auto pr-1">
      <h2 className="text-2xl font-medium tracking-tight">{m.title}</h2>
      {m.taskDescription && (
        <p className="italic text-[var(--muted)] leading-relaxed">
          {m.taskDescription}
        </p>
      )}
      {m.body && (
        <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
      )}
      {phase === 'revealed' && m.revealedTask && (
        <div className="mt-2 border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
            Task
          </p>
          <p className="font-mono text-3xl tracking-[0.4em]">
            {m.revealedTask}
          </p>
        </div>
      )}
      {phase === 'revealed' && (
        <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
          Remember to think aloud while you solve this.
        </p>
      )}
      {m.mandatory && phase === 'body' && (
        <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
          Please complete this warmup before continuing.
        </p>
      )}
      <div className="mt-auto pt-4 flex gap-3">
        {phase === 'body' && m.revealedTask && (
          <button
            type="button"
            onClick={() => advanceTo('revealed')}
            className="border border-[var(--foreground)] px-4 py-2 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
          >
            Reveal Task
          </button>
        )}
        {phase === 'revealed' && <ContinueButton onClick={finish} />}
      </div>
    </section>
  );

  if (!m.includeScratchPaper) {
    return (
      <div className="flex-1 flex justify-center overflow-hidden min-h-0">
        <div className="max-w-2xl w-full flex flex-col gap-4 overflow-hidden">
          {bodyContent}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden min-h-0">
      <ScratchpadColumn
        value={scratch}
        onChange={setScratch}
        savedAt={scratchSavedAt}
      />
      <div className="col-span-2 flex flex-col">{bodyContent}</div>
    </div>
  );
}
```

Imports at top of file already include `useState`; add it if missing. `Centered` is already defined in the file.

- [ ] **Step 2: Smoke test** — visit `/create/formative/preview?p=e07fab09-7004-4b70-bcf7-119efe5537a6` as the researcher, advance into the think-aloud module. Verify three-phase flow.

- [ ] **Step 3: Commit**

```bash
git add app/create/formative/preview/ParticipantFlow.tsx
git commit -m "feat(participant): think-aloud intro page + Reveal Task gate"
```

---

### Task 6: Move existing /create form builder to /create/questionnaire

**Why:** `/create` is going to become a hub. The form builder needs a stable URL.

**Files:**
- Create: `app/create/questionnaire/page.tsx` (content from current `app/create/page.tsx`)
- Modify: `app/create/page.tsx` (will be replaced in Task 7; this task only relocates)
- Modify: `proxy.ts` (no change needed — `/create/*` already gated)
- Verify: `app/create/FieldsEditor.tsx`, `app/create/actions.ts` remain unchanged (imports stay; both files live one level up from the moved page)

- [ ] **Step 1: Create relocated page**

```tsx
// app/create/questionnaire/page.tsx
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import FieldsEditor from '../FieldsEditor';
import { addFieldAction, researcherLogoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function QuestionnairePage() {
  const supabase = createServiceRoleClient();
  const { data: fields } = await supabase
    .from('onboarding_fields')
    .select('id, field_key, label, type, options, position')
    .order('position', { ascending: true });

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Questionnaire</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Each field becomes a question on <code>/onboard</code>.
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/create" className="underline hover:no-underline">
            ← Hub
          </Link>
          <form action={researcherLogoutAction}>
            <button
              type="submit"
              className="text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <FieldsEditor fields={fields ?? []} />

      <form action={addFieldAction} className="mt-6">
        <button
          type="submit"
          className="border border-dashed border-[var(--rule)] text-[var(--muted)] italic px-4 py-2 hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition"
        >
          + add question
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Build typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/create/questionnaire/page.tsx
git commit -m "refactor(create): relocate form builder to /create/questionnaire"
```

---

### Task 7: Replace /create page with hub picker

**Why:** Per pilot feedback the root researcher landing should let you pick what you're authoring.

**Files:**
- Modify: `app/create/page.tsx` (full replace)

- [ ] **Step 1: Rewrite the page**

```tsx
// app/create/page.tsx
import Link from 'next/link';
import { researcherLogoutAction } from './actions';

export const dynamic = 'force-dynamic';

type Card = { href: string; title: string; blurb: string };

const CARDS: Card[] = [
  {
    href: '/create/questionnaire',
    title: 'Questionnaire',
    blurb: 'Author the screening + onboarding questions participants see at /onboard.',
  },
  {
    href: '/create/formative',
    title: 'Protocol',
    blurb: 'Author the study packet: modules, requirements, scenarios, retrospective.',
  },
  {
    href: '/create/script',
    title: 'Script',
    blurb: 'Write a researcher script for every participant screen; run a live follow-along.',
  },
];

export default function CreateHub() {
  return (
    <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-10 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Research console</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Choose what you want to author or run.
          </p>
        </div>
        <form action={researcherLogoutAction}>
          <button
            type="submit"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
          >
            Log out
          </button>
        </form>
      </header>

      <div className="grid sm:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border border-[var(--rule)] bg-[var(--panel)] p-5 hover:border-[var(--foreground)] transition flex flex-col gap-2"
          >
            <h2 className="text-lg font-medium tracking-tight">{c.title}</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed flex-1">
              {c.blurb}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Smoke test** — visit `/create` (researcher cookie set). Cards render; clicking each routes correctly. Questionnaire still works. Protocol still works. Script returns 404 (expected; built in Task 10).

- [ ] **Step 3: Commit**

```bash
git add app/create/page.tsx
git commit -m "feat(create): replace root with hub picker"
```

---

### Task 8: Supabase migration — `study_scripts` table

**Why:** Persistent per-screen script storage. Keyed on `(study_id, screen_key)` so reordering modules doesn't blow away scripts; the key is a deterministic string derived from `(moduleId, stepKind[, idx])`.

**Files:**
- Apply via `mcp__vt-supabase__apply_migration`
- Modify: `lib/types/db.ts` (regenerate)

- [ ] **Step 1: Apply migration**

```sql
-- migration name: 2026-06-01_add_study_scripts
create table public.study_scripts (
  study_id uuid not null references public.studies(id) on delete cascade,
  screen_key text not null,
  script_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (study_id, screen_key)
);
alter table public.study_scripts enable row level security;
-- No participant-facing policy. All writes via service role from server actions.
```

- [ ] **Step 2: Regenerate types**

Run `mcp__vt-supabase__generate_typescript_types` → save output to `lib/types/db.ts`.

- [ ] **Step 3: Verify**

```sql
select count(*) from public.study_scripts;
```
Expected: 0.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='study_scripts'
order by ordinal_position;
```
Expected: 4 rows (study_id uuid NOT NULL, screen_key text NOT NULL, script_text text NOT NULL, updated_at timestamptz NOT NULL).

- [ ] **Step 4: Commit regenerated types**

```bash
git add lib/types/db.ts
git commit -m "feat(db): study_scripts table for researcher per-screen scripts"
```

---

### Task 9: Pure screen-enumeration utility

**Why:** Both `/create/script` (list+editor) and `/create/script/follow` (walkthrough) need an identical ordered enumeration of participant-facing screens. Centralize.

**Files:**
- Create: `lib/study/screens.ts`
- Test: `lib/study/screens.test.ts` (Vitest if configured; otherwise plain `tsx` smoke run)

- [ ] **Step 1: Define the screen shape and enumerator**

```ts
// lib/study/screens.ts
import type { Module, ProjectContent } from '@/lib/types/study';

export type ScreenKind =
  | 'warmup_intro'
  | 'warmup_body'
  | 'warmup_revealed'
  | 'task_intro'
  | 'task_context'
  | 'task_initial_spec'
  | 'task_scenario_read'
  | 'task_scenario_ponder'
  | 'task_scenario_revise'
  | 'retrospective';

export type Screen = {
  key: string;            // stable, used as primary key in study_scripts
  moduleId: string;
  moduleType: Module['type'];
  moduleNumber: number;   // 1-based
  moduleLabel: string;
  kind: ScreenKind;
  idx?: number;           // scenario idx (0-based) for task scenario screens
  label: string;          // human label e.g. "Module 1 · Think-aloud intro"
  summary: string;        // short preview snippet for the editor list
};

const TASK_STEPS_BASE: ScreenKind[] = [
  'task_intro',
  'task_context',
  'task_initial_spec',
];

const TASK_STEPS_PER_SCENARIO: ScreenKind[] = [
  'task_scenario_read',
  'task_scenario_ponder',
  'task_scenario_revise',
];

function snippet(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function enumerateScreens(content: ProjectContent): Screen[] {
  const out: Screen[] = [];
  content.modules.forEach((m, mi) => {
    const moduleNumber = mi + 1;
    if (m.type === 'think_aloud_warmup') {
      out.push({
        key: `${m.id}:warmup_intro`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel: m.title || 'Think-aloud warmup',
        kind: 'warmup_intro',
        label: `Module ${moduleNumber} · Think-aloud intro`,
        summary: 'Centered: "Think-Aloud Instructions"',
      });
      out.push({
        key: `${m.id}:warmup_body`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel: m.title || 'Think-aloud warmup',
        kind: 'warmup_body',
        label: `Module ${moduleNumber} · Warmup body`,
        summary: snippet(m.body || m.taskDescription || ''),
      });
      out.push({
        key: `${m.id}:warmup_revealed`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel: m.title || 'Think-aloud warmup',
        kind: 'warmup_revealed',
        label: `Module ${moduleNumber} · Reveal: ${snippet(m.revealedTask || '', 24)}`,
        summary: m.revealedTask || '(no revealed task)',
      });
      return;
    }
    if (m.type === 'task' || m.type === 'task_warmup') {
      TASK_STEPS_BASE.forEach((kind) => {
        out.push({
          key: `${m.id}:${kind}`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel: m.title || (m.type === 'task_warmup' ? 'Task warmup' : 'Task'),
          kind,
          label: `Module ${moduleNumber} · ${labelFor(kind)}`,
          summary:
            kind === 'task_context'
              ? snippet(m.studyContext)
              : kind === 'task_initial_spec'
              ? snippet(m.initialSpec[0]?.prompt ?? '')
              : m.title,
        });
      });
      m.scenarios.forEach((sc, idx) => {
        TASK_STEPS_PER_SCENARIO.forEach((kind) => {
          out.push({
            key: `${m.id}:${kind}:${idx}`,
            moduleId: m.id,
            moduleType: m.type,
            moduleNumber,
            moduleLabel: m.title || 'Task',
            kind,
            idx,
            label: `Module ${moduleNumber} · ${labelFor(kind)} (${sc.title})`,
            summary: snippet(sc.clauses.map((c) => `${c.type} ${c.text}`).join('; ')),
          });
        });
      });
      return;
    }
    if (m.type === 'retrospective_report') {
      out.push({
        key: `${m.id}:retrospective`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel: m.title || 'Retrospective',
        kind: 'retrospective',
        label: `Module ${moduleNumber} · Retrospective`,
        summary: snippet(m.questions.map((q) => q.text).join(' | ')),
      });
    }
  });
  return out;
}

function labelFor(kind: ScreenKind): string {
  switch (kind) {
    case 'warmup_intro': return 'Think-aloud intro';
    case 'warmup_body': return 'Warmup body';
    case 'warmup_revealed': return 'Reveal';
    case 'task_intro': return 'Task intro';
    case 'task_context': return 'Context';
    case 'task_initial_spec': return 'Initial spec';
    case 'task_scenario_read': return 'Scenario read';
    case 'task_scenario_ponder': return 'Scenario ponder';
    case 'task_scenario_revise': return 'Scenario revise';
    case 'retrospective': return 'Retrospective';
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/study/screens.ts
git commit -m "feat(study): screens.ts enumerator for researcher script keying"
```

---

### Task 10: /create/script — list + per-screen editor with debounced upsert

**Why:** The console where the researcher writes scripts. Real-time save.

**Files:**
- Create: `app/create/script/page.tsx`
- Create: `app/create/script/ScriptEditor.tsx`
- Create: `app/create/script/actions.ts`

- [ ] **Step 1: Server action — `upsertScriptAction`** (`app/create/script/actions.ts`)

```ts
'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/types/db';

const upsertSchema = z.object({
  studyId: z.string().uuid(),
  screenKey: z.string().min(1).max(200),
  scriptText: z.string().max(20_000),
});

export async function upsertScriptAction(input: {
  studyId: string;
  screenKey: string;
  scriptText: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('study_scripts')
    .upsert(
      {
        study_id: parsed.data.studyId,
        screen_key: parsed.data.screenKey,
        script_text: parsed.data.scriptText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'study_id,screen_key' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type LoadedScript = Pick<
  Database['public']['Tables']['study_scripts']['Row'],
  'screen_key' | 'script_text' | 'updated_at'
>;

export async function listScriptsForStudy(
  studyId: string,
): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('study_scripts')
    .select('screen_key, script_text')
    .eq('study_id', studyId);
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.screen_key] = r.script_text;
  return out;
}
```

- [ ] **Step 2: Page (server component)** — `app/create/script/page.tsx`

```tsx
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { enumerateScreens } from '@/lib/study/screens';
import { researcherLogoutAction } from '../actions';
import ScriptEditor from './ScriptEditor';
import { listScriptsForStudy } from './actions';

export const dynamic = 'force-dynamic';

type Search = { p?: string };

export default async function ScriptPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { p } = await searchParams;
  const supabase = createServiceRoleClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, slug, visibility, authored_data, updated_at')
    .order('updated_at', { ascending: false });

  const active =
    (studies ?? []).find((s) => s.id === p) ?? (studies ?? [])[0] ?? null;

  if (!active) {
    return (
      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
        <p className="text-sm italic text-[var(--muted)]">
          No projects yet. Create one in <Link href="/create/formative" className="underline">Protocol</Link>.
        </p>
      </main>
    );
  }

  const content = migrateContent(active.authored_data);
  const screens = enumerateScreens(content);
  const scripts = await listScriptsForStudy(active.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-8 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Script</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Author a researcher script for every participant screen. Saves
            in real time.
          </p>
        </div>
        <nav className="flex gap-4 text-sm items-center">
          <form>
            <select
              name="p"
              defaultValue={active.id}
              onChange={(e) => {
                window.location.href = `/create/script?p=${e.target.value}`;
              }}
              className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
            >
              {(studies ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.visibility})
                </option>
              ))}
            </select>
          </form>
          <Link
            href={`/create/script/follow?p=${active.id}`}
            className="border border-[var(--foreground)] px-3 py-1 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
          >
            Follow along →
          </Link>
          <Link href="/create" className="underline hover:no-underline">
            ← Hub
          </Link>
          <form action={researcherLogoutAction}>
            <button
              type="submit"
              className="text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <ScriptEditor
        studyId={active.id}
        screens={screens}
        initialScripts={scripts}
      />
    </main>
  );
}
```

Note: the select `onChange` needs a client component. Either move that into a small client wrapper or use a `<form action>` with `GET`. Simplest: replace the inline `onChange` with a plain `<select onChange="..."` is not allowed in server components — extract to a `<ProjectPicker>` client component or use a form-GET. Implementer subagent: prefer extracting `<ProjectPicker>` to a tiny client island.

- [ ] **Step 3: Client editor** — `app/create/script/ScriptEditor.tsx`

```tsx
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
          setSavedAt((s) => ({ ...s, [key]: new Date().toLocaleTimeString() }));
        }
      });
    }, 600);
  }

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

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
                <div className="text-xs uppercase tracking-wider text-[var(--muted)] flex justify-between">
                  <span>{s.label}</span>
                  {hasScript && (
                    <span className="text-[var(--accent)]">●</span>
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
        {selected ? (
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
        ) : (
          <p className="text-sm italic text-[var(--muted)]">
            No screens — add modules in Protocol first.
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test** — visit `/create/script?p=e07fab09-7004-4b70-bcf7-119efe5537a6`. Click a screen, type, wait ~700ms, see "Saved HH:MM:SS". Refresh, content persists. Run

```sql
select screen_key, length(script_text) from public.study_scripts where study_id='e07fab09-7004-4b70-bcf7-119efe5537a6';
```

Expected: rows for whichever screens have content.

- [ ] **Step 5: Commit**

```bash
git add app/create/script/actions.ts app/create/script/page.tsx app/create/script/ScriptEditor.tsx
git commit -m "feat(script): /create/script console with debounced upsert"
```

---

### Task 11: /create/script/follow — live walkthrough with collapsible script rail

**Why:** During the Zoom session the researcher needs to see the script alongside the participant's view. Mirrors the participant layout but inserts a collapsible script panel on the right and a Next button to advance.

**Files:**
- Create: `app/create/script/follow/page.tsx`
- Create: `app/create/script/follow/FollowAlong.tsx`

- [ ] **Step 1: Server page**

```tsx
// app/create/script/follow/page.tsx
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { enumerateScreens } from '@/lib/study/screens';
import { listScriptsForStudy } from '../actions';
import FollowAlong from './FollowAlong';

export const dynamic = 'force-dynamic';

export default async function FollowPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const supabase = createServiceRoleClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, authored_data, updated_at')
    .order('updated_at', { ascending: false });
  const active = (studies ?? []).find((s) => s.id === p) ?? (studies ?? [])[0];
  if (!active) {
    return (
      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
        <p>No project. <Link href="/create" className="underline">Hub</Link></p>
      </main>
    );
  }
  const content = migrateContent(active.authored_data);
  const screens = enumerateScreens(content);
  const scripts = await listScriptsForStudy(active.id);
  return (
    <FollowAlong
      projectId={active.id}
      projectName={active.name}
      content={content}
      screens={screens}
      scripts={scripts}
    />
  );
}
```

- [ ] **Step 2: Client walkthrough** — `app/create/script/follow/FollowAlong.tsx`

Implementer guidance:
- Render a sticky header: project name, "Screen N of M", Prev/Next buttons, collapse-rail toggle.
- Body: `grid-cols-[1fr_auto]` where the right column is the script rail (width 360px when expanded, collapsed → button only).
- The left column shows a faithful preview of the current screen. For V1, accept that the preview is text-only (title + summary + key fields from the content). This matches the editor's preview snippet — we are NOT rendering the full participant runner here (that risks state coupling). Good enough for "I see what they see while I read aloud."
- Specifically render per-kind:
  - `warmup_intro`: centered "Think-Aloud Instructions" + "Please do not move on…"
  - `warmup_body`: title + taskDescription + body (no reveal yet)
  - `warmup_revealed`: title + body + revealed task in mono large
  - `task_intro`: module title + "Module N of M"
  - `task_context`: studyContext + requirements list
  - `task_initial_spec`: prompts list
  - `task_scenario_read`: scenario clauses (with NEW/superseded markers)
  - `task_scenario_ponder`: "Pause and ponder" centered
  - `task_scenario_revise`: same scenario clauses + reminder to revise spec
  - `retrospective`: list of questions
- Right rail: shows `scripts[screen.key]` as preformatted text. Toggle button at top-right collapses to a vertical pill.
- Keyboard: arrow keys for prev/next.

Minimum viable code skeleton:

```tsx
'use client';

import { useState } from 'react';
import type { Screen } from '@/lib/study/screens';
import type { ProjectContent, Module } from '@/lib/types/study';

export default function FollowAlong({
  projectId,
  projectName,
  content,
  screens,
  scripts,
}: {
  projectId: string;
  projectName: string;
  content: ProjectContent;
  screens: Screen[];
  scripts: Record<string, string>;
}) {
  const [idx, setIdx] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const screen = screens[idx];
  if (!screen) {
    return <p className="p-10 italic text-[var(--muted)]">No screens in this project.</p>;
  }
  const module = content.modules.find((m) => m.id === screen.moduleId)!;
  const script = scripts[screen.key] ?? '';

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-[var(--rule)] px-6 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            {projectName} · Follow along
          </div>
          <div className="text-sm font-medium">{screen.label}</div>
        </div>
        <span className="text-xs text-[var(--muted)] tabular-nums">
          Screen {idx + 1} / {screens.length}
        </span>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="border border-[var(--rule)] px-3 py-1 disabled:opacity-30"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(screens.length - 1, i + 1))}
          disabled={idx === screens.length - 1}
          className="border border-[var(--foreground)] px-3 py-1 disabled:opacity-30"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          className="text-xs underline hover:no-underline text-[var(--muted)]"
        >
          {railOpen ? 'Hide script ›' : '‹ Show script'}
        </button>
      </header>
      <div className="flex-1 grid" style={{ gridTemplateColumns: railOpen ? '1fr 360px' : '1fr 32px' }}>
        <section className="overflow-y-auto p-8">
          <ScreenPreview screen={screen} module={module} />
        </section>
        <aside className="border-l border-[var(--rule)] bg-[var(--panel)] overflow-y-auto">
          {railOpen ? (
            <div className="p-4">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                Researcher script
              </div>
              {script ? (
                <p className="whitespace-pre-wrap leading-relaxed">{script}</p>
              ) : (
                <p className="italic text-[var(--muted)]">
                  No script for this screen yet.
                </p>
              )}
            </div>
          ) : (
            <div className="h-full" />
          )}
        </aside>
      </div>
    </div>
  );
}

function ScreenPreview({ screen, module }: { screen: Screen; module: Module }) {
  // Implementer: render per `screen.kind` as described above.
  // Keep small — this is a preview, not the participant runner.
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-medium tracking-tight mb-2">
        {screen.moduleLabel}
      </h2>
      <pre className="text-sm whitespace-pre-wrap text-[var(--muted)]">
        {JSON.stringify({ kind: screen.kind, idx: screen.idx }, null, 2)}
      </pre>
      {/* Implementer: add per-kind rendering. */}
    </div>
  );
}
```

The skeleton above is intentionally minimal at the per-kind branches — the implementer subagent should flesh out `ScreenPreview` with faithful renders matching the participant-side text for each screen kind enumerated in `lib/study/screens.ts`. Keep it text-only; do NOT try to embed the full `TaskRunner`.

- [ ] **Step 3: Smoke test** — `/create/script/follow?p=<id>`. Prev/Next works, rail toggle works, script renders.

- [ ] **Step 4: Commit**

```bash
git add app/create/script/follow/page.tsx app/create/script/follow/FollowAlong.tsx
git commit -m "feat(script): follow-along walkthrough with collapsible rail"
```

---

### Task 12: End-to-end verification

**Why:** Confirm DB upsertions and the participant flow end-to-end before we say done.

- [ ] **Step 1: Reset a test participant**

```sql
delete from public.users where email = 'plantest@example.com';
```

- [ ] **Step 2: Register** at `/register`, fill name="PlanTest", email="plantest@example.com". Confirm PID assigned.

- [ ] **Step 3: Onboarding** at `/onboard`. Try empty submit → blocked by client `required`. Pick all options; one of them should be a terminator → form redirects to `/terminate`. Re-register with non-terminator answers → reaches `/study`.

- [ ] **Step 4: Verify writes**

```sql
select id, pid, first_name, email, has_onboarded from public.users where email='plantest@example.com';
select count(*) from public.onboarding_responses where user_id = (select id from public.users where email='plantest@example.com');
```

Expected: user has `has_onboarded=true`; one response row per non-empty field.

- [ ] **Step 5: Walk the participant flow** at `/create/formative/preview?p=e07fab09-7004-4b70-bcf7-119efe5537a6`. Confirm:
  - Think-aloud intro centered box, "Please do not move on…", Continue → body.
  - Body: pre-reveal text, "knew" is now "new", no grey paragraph, Reveal Task button visible.
  - Click Reveal Task → revealed task `NPEPHA` in mono large, "Remember to think aloud" callout.
  - No scratchpad column anywhere on this module.

- [ ] **Step 6: Walk the Script Console** at `/create/script?p=…`. Type a script for `warmup_intro`. Refresh — script persists. SQL:

```sql
select screen_key, length(script_text), updated_at
from public.study_scripts
where study_id='e07fab09-7004-4b70-bcf7-119efe5537a6'
order by updated_at desc;
```

- [ ] **Step 7: Walk the follow-along** at `/create/script/follow?p=…`. Prev/Next traverses every screen; script appears in the rail; collapse button works.

- [ ] **Step 8: Push the branch**

```bash
git push -u origin post-528-pilot
```

Then offer to open the PR for Hudson to review.

---

## Self-review checklist

- [x] **Spec coverage:** every TODO from the user message maps to a task above. The user asked for: mandatory + asterisk → Task 4; terminate fix → enforced by Task 4's server-side guard; "knew" typo → Task 1; intro centered box → Task 5; remove grey script → Task 1; spelling kept → Task 1 (the "knew" fix lives in `taskDescription` which is not removed); /create hub → Tasks 6+7; script feature → Tasks 8-11; scratchpad off + Reveal Task + callout → Tasks 1+5.
- [x] **No placeholders:** every step has the actual code or SQL.
- [x] **Type consistency:** `revealedTask: string` introduced in Task 2 and consistently referenced thereafter; `Screen.key` format `<moduleId>:<kind>[:<idx>]` is consistent across enumerator (Task 9), DB (Task 8 — `text`), and editor (Task 10).
- [x] **One risk worth flagging:** the `ScriptEditor` page uses an inline `<select onChange>` in a server component (Task 10 step 2). Implementer must extract to a tiny client island — flagged in the task notes.
