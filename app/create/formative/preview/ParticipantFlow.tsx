'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
} from 'react';
import Link from 'next/link';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import { enumerateScreens, type Screen } from '@/lib/study/screens';
import type {
  LoadedProject,
  Module,
  ProjectContent,
  TaskContent,
  TaskExample,
  TaskExampleModule,
  PrefilledMoment,
  ThinkAloudWarmupModule,
  ThinkAloudExampleModule,
  RetrospectiveReportModule,
  Requirement,
  Scenario,
  Entity,
  Element as EntityElement,
} from '@/lib/types/study';
import {
  MODULE_TYPE_LABEL,
  uid,
  isPersistedToDb,
  DEFAULT_WARMUP_COPY,
  DEFAULT_TASK_COPY,
} from '@/lib/types/study';
import {
  recordEventAction,
  upsertResponseAction,
  finishStudyAction,
  participantLogoutAction,
} from '@/app/study/actions';
import { saveProjectAction } from '@/app/create/formative/actions';
import MapCanvas from '@/components/MapCanvas';

// =============================== Save adapter ==============================

type SaveAdapter = {
  recordEvent: (eventType: string, payload: unknown) => void;
  upsert: (sectionKey: string, value: string) => void;
};

function makeSaveAdapter(
  participantId: string | null,
  moduleId: string,
  skipPersist: boolean,
): SaveAdapter {
  if (participantId === null) {
    return { recordEvent: () => {}, upsert: () => {} };
  }
  return {
    recordEvent: (eventType, payload) => {
      void recordEventAction({
        moduleId,
        eventType,
        payload,
        skipPersist,
      }).catch(() => {});
    },
    upsert: (sectionKey, value) => {
      void upsertResponseAction({
        moduleId,
        sectionKey,
        value,
        skipPersist,
      }).catch(() => {});
    },
  };
}

// Write the cross-module "last spec" pointer when a task finishes. The
// retrospective module reads from these localStorage keys on mount; the
// server-side `_meta` row backs the pointer for lab-grade audit when the
// participant has a live session AND the source module persists (warmups
// don't). The 'task_complete_spec_snapshot' event mirrors the upsert in
// the event log so we can replay completion order.
function writeLastSpecPointer({
  projectId,
  moduleId,
  participantId,
  spec,
  entitiesJson,
  skipPersist = false,
}: {
  projectId: string;
  moduleId: string;
  participantId: string | null;
  spec: string;
  entitiesJson: string;
  skipPersist?: boolean;
}) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`pf:${projectId}:last_spec`, spec);
    window.localStorage.setItem(`pf:${projectId}:last_entities`, entitiesJson);
    window.localStorage.setItem(
      `pf:${projectId}:last_task_module_id`,
      moduleId,
    );
  }
  if (participantId === null) return;
  void upsertResponseAction({
    moduleId: '_meta',
    sectionKey: 'last_spec',
    value: spec,
    skipPersist,
  }).catch(() => {});
  void upsertResponseAction({
    moduleId: '_meta',
    sectionKey: 'last_entities',
    value: entitiesJson,
    skipPersist,
  }).catch(() => {});
  void upsertResponseAction({
    moduleId: '_meta',
    sectionKey: 'last_task_module_id',
    value: moduleId,
    skipPersist,
  }).catch(() => {});
  void recordEventAction({
    moduleId: '_meta',
    eventType: 'task_complete_spec_snapshot',
    payload: { sourceModuleId: moduleId, spec, entities: entitiesJson },
    skipPersist,
  }).catch(() => {});
}

function useLocalString(key: string): [string, (v: string) => void] {
  const [value, setValue] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) setValue(stored);
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(key, value);
  }, [key, value, hydrated]);

  return [value, setValue];
}

// Entity[] persisted under its own key alongside the spec. Same hydrate-then-
// echo pattern as useLocalString; JSON-encoded.
function useLocalEntities(
  key: string,
): [Entity[], (next: Entity[]) => void] {
  const [value, setValue] = useState<Entity[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored) as Entity[];
        if (Array.isArray(parsed)) setValue(parsed);
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, hydrated]);

  return [value, setValue];
}

// Record<string,string> persisted under one key. Used for per-scenario
// retrospective answers, keyed by `<scenarioIdx>:<questionIdx>`.
function useLocalRecord(
  key: string,
): [Record<string, string>, (k: string, v: string) => void] {
  const [value, setValue] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored) as Record<string, string>;
        if (parsed && typeof parsed === 'object') setValue(parsed);
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, hydrated]);

  const set = (k: string, v: string) =>
    setValue((prev) => ({ ...prev, [k]: v }));
  return [value, set];
}

function useSavedAt(): [string | null, () => void] {
  const [at, setAt] = useState<string | null>(null);
  function mark() {
    setAt(new Date().toLocaleTimeString([], { hour12: false }));
  }
  return [at, mark];
}

function SavedHint({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <span
      className="text-[10px] text-[var(--muted)] italic"
      aria-live="polite"
    >
      Auto-saved · {at}
    </span>
  );
}

function SplitHandle() {
  return (
    <PanelResizeHandle
      className="group relative w-2 mx-0 cursor-col-resize"
      aria-label="Drag to resize panels"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[var(--rule)] group-hover:bg-[var(--accent)] group-data-[resize-handle-active]:bg-[var(--accent)] transition-colors" />
    </PanelResizeHandle>
  );
}

// Single source of truth for the default spec caption lives in the type
// module so the editor's placeholder and the runtime caption never drift.
const SPEC_PLACEHOLDER = DEFAULT_TASK_COPY.specPlaceholder;

const EXAMPLE_BANNER_TEXT = 'Example — the researcher will walk through this';

function useDebouncedSave(value: string, save: (v: string) => void, ms = 1000) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
}

// ===================== Inline copy editing (preview) =====================
// In preview mode the researcher can toggle "Edit text" and click any
// participant-facing copy string to edit it in place. Edits commit on blur
// (never on keystroke — see EditableText) and route to a module mutation that
// patches the live ProjectContent and debounce-persists via saveProjectAction.

type EditAPI = {
  enabled: boolean;
  // Apply an immutable patch to the module with the given id.
  editModule: (moduleId: string, mutate: (m: Module) => void) => void;
};

const EditContext = createContext<EditAPI>({
  enabled: false,
  editModule: () => {},
});

function useEdit() {
  return useContext(EditContext);
}

// Inline-editable text node. When editing is disabled (live /study, or toggle
// off) it renders as a plain element. When enabled it becomes contentEditable
// with a dashed outline; on blur it commits the new textContent if changed.
function EditableText({
  value,
  onCommit,
  as = 'span',
  className = '',
  placeholder = '(empty — click to add)',
}: {
  value: string;
  onCommit: (next: string) => void;
  as?: ElementType;
  className?: string;
  placeholder?: string;
}) {
  const { enabled } = useEdit();
  const Tag = as;
  if (!enabled) {
    return <Tag className={className}>{value}</Tag>;
  }
  const empty = value.length === 0;
  return (
    <Tag
      className={
        className +
        ' outline-dashed outline-1 outline-offset-2 outline-[var(--accent)]/40 hover:outline-[var(--accent)] focus:outline-[var(--accent)] cursor-text rounded-sm ' +
        (empty ? 'italic text-[var(--muted)]' : '')
      }
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = (e.currentTarget.textContent ?? '').replace(/ /g, ' ');
        const cleaned = next === placeholder ? '' : next;
        if (cleaned !== value) onCommit(cleaned);
      }}
      // Enter commits (blur) rather than inserting a newline for single-line
      // titles/labels; Shift+Enter still allows a newline in bodies.
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    >
      {empty ? placeholder : value}
    </Tag>
  );
}

// ============================== Top-level ==============================

export default function ParticipantFlow({
  project,
  participantId = null,
  previewMode = false,
  scripts,
  referenceScript = '',
}: {
  project: LoadedProject;
  participantId?: string | null;
  // Preview mode: full-fidelity participant rendering driven by an external
  // screen index. Wrapper exposes Prev/Next/Jump controls and the runners
  // remount on screen change instead of advancing internal state. NEVER
  // pass true on the live /study route — it disables sequential persistence.
  previewMode?: boolean;
  // Per-screen researcher scripts + SIGCSE reference — only used in preview
  // mode to render the script rail (the merged Follow-along view).
  scripts?: Record<string, string>;
  referenceScript?: string;
}) {
  if (previewMode) {
    return (
      <PreviewParticipantFlow
        project={project}
        scripts={scripts}
        referenceScript={referenceScript}
      />
    );
  }
  return (
    <SequentialParticipantFlow project={project} participantId={participantId} />
  );
}

function SequentialParticipantFlow({
  project,
  participantId,
}: {
  project: LoadedProject;
  participantId: string | null;
}) {
  const [moduleIdx, setModuleIdx] = useState(0);
  const total = project.content.modules.length;
  const studyDoneFired = useRef(false);

  // Fire study_complete once when we reach past the last module.
  useEffect(() => {
    if (
      participantId &&
      total > 0 &&
      moduleIdx >= total &&
      !studyDoneFired.current
    ) {
      studyDoneFired.current = true;
      void finishStudyAction().catch(() => {});
    }
  }, [participantId, total, moduleIdx]);

  if (total === 0) {
    return (
      <Shell projectName={project.name}>
        <Centered>
          <p className="italic text-[var(--muted)]">
            This project has no modules yet.{' '}
            <Link href="/create/formative" className="underline">
              Add some in the editor
            </Link>
            .
          </p>
        </Centered>
      </Shell>
    );
  }

  if (moduleIdx >= total) {
    return (
      <Shell projectName={project.name}>
        <Centered>
          <h2 className="text-2xl font-medium mb-3">Thank you</h2>
          <p>
            You&rsquo;ve completed all modules in this study. The researcher
            will tell you what to do next.
          </p>
        </Centered>
      </Shell>
    );
  }

  const m = project.content.modules[moduleIdx];

  return (
    <Shell
      projectName={project.name}
      moduleLabel={MODULE_TYPE_LABEL[m.type]}
      moduleNumber={moduleIdx + 1}
      total={total}
      showSignOut={participantId !== null}
    >
      <ModuleRunner
        key={m.id}
        project={project}
        participantId={participantId}
        module={m}
        moduleNumber={moduleIdx + 1}
        total={total}
        onComplete={() => setModuleIdx((i) => i + 1)}
      />
    </Shell>
  );
}

// ========================== Preview-mode wrapper ==========================
// Renders the SAME participant runners with full fidelity (no placeholders)
// while exposing prev/next/jump controls. Each runner advances by calling
// onAdvance() which bumps screenIdx; the key={screen.key} remount strategy
// resets internal step state to match the new screen.

// Warmup (real) and think-aloud-example screens both map to the same 3-phase
// flow — they're rendered by different runners but share the phase names.
function screenToWarmupPhase(screen: Screen): WarmupPhase {
  switch (screen.kind) {
    case 'warmup_intro':
    case 'warmup_example_intro':
      return 'intro';
    case 'warmup_body':
    case 'warmup_example_body':
      return 'body';
    case 'warmup_revealed':
    case 'warmup_example_revealed':
      return 'revealed';
    default:
      return 'intro';
  }
}

function screenToTaskStep(screen: Screen): TaskStep {
  const idx = screen.idx ?? 0;
  switch (screen.kind) {
    case 'task_intro':
      return { kind: 'intro' };
    case 'task_context':
      return { kind: 'context' };
    case 'task_initial_spec':
      return { kind: 'initial_spec' };
    case 'task_scenario_read':
      return { kind: 'scenario_read', idx };
    case 'task_scenario_ponder':
      return { kind: 'scenario_ponder', idx };
    case 'task_scenario_revise':
      return { kind: 'scenario_revise', idx };
    case 'task_scenario_retro':
      return { kind: 'scenario_retro', idx, qIdx: screen.subIdx ?? 0 };
    default:
      return { kind: 'intro' };
  }
}

// Worked-example task step machine — display-only mirror of the real task.
type ExStep =
  | { kind: 'intro' }
  | { kind: 'initial_spec' }
  | { kind: 'scenario_read'; idx: number }
  | { kind: 'scenario_ponder'; idx: number }
  | { kind: 'scenario_revise'; idx: number };

function screenToExampleStep(screen: Screen): ExStep {
  const idx = screen.idx ?? 0;
  switch (screen.kind) {
    case 'task_example_intro':
      return { kind: 'intro' };
    case 'task_example_initial_spec':
      return { kind: 'initial_spec' };
    case 'task_example_scenario_read':
      return { kind: 'scenario_read', idx };
    case 'task_example_scenario_ponder':
      return { kind: 'scenario_ponder', idx };
    case 'task_example_scenario_revise':
      return { kind: 'scenario_revise', idx };
    default:
      return { kind: 'intro' };
  }
}

function PreviewParticipantFlow({
  project,
  scripts,
  referenceScript = '',
}: {
  project: LoadedProject;
  scripts?: Record<string, string>;
  referenceScript?: string;
}) {
  // Live, editable copy of the authored content. Inline edits mutate this and
  // debounce-persist to the DB; the runner re-renders from it immediately.
  const [content, setContent] = useState<ProjectContent>(project.content);
  const [editing, setEditing] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Immutable per-module patch + debounced persist. Used by inline editing.
  const editModule = useCallback(
    (moduleId: string, mutate: (mod: Module) => void) => {
      setContent((prev) => {
        const next = structuredClone(prev) as ProjectContent;
        const target = next.modules.find((mod) => mod.id === moduleId);
        if (!target) return prev;
        mutate(target);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void saveProjectAction({
            id: project.id,
            name: project.name,
            content: next,
          })
            .then((res) => {
              if (res.ok)
                setSavedAt(new Date().toLocaleTimeString([], { hour12: false }));
            })
            .catch(() => {});
        }, 800);
        return next;
      });
    },
    [project.id, project.name],
  );

  const editApi = useMemo<EditAPI>(
    () => ({ enabled: editing, editModule }),
    [editing, editModule],
  );

  // Drop globals — those are real /register and /onboard pages, not
  // ParticipantFlow screens. Enumerate from LIVE content so edits that change
  // labels reflect in the jump dropdown.
  const screens = useMemo(
    () => enumerateScreens(content).filter((s) => s.moduleType !== 'global'),
    [content],
  );

  // Map screen.key -> local index within its module (1-based) for the M.N
  // screen-ID display.
  const localIndex = useMemo(() => {
    const out = new Map<string, number>();
    let lastModuleId = '';
    let cnt = 0;
    for (const s of screens) {
      if (s.moduleId !== lastModuleId) {
        lastModuleId = s.moduleId;
        cnt = 1;
      } else {
        cnt++;
      }
      out.set(s.key, cnt);
    }
    return out;
  }, [screens]);

  const [screenIdx, setScreenIdx] = useState(0);
  const screen = screens[screenIdx];

  // Live project object threaded to the runner so retro lookups + ids match
  // the edited content.
  const liveProject = useMemo<LoadedProject>(
    () => ({ ...project, content }),
    [project, content],
  );

  if (!screen) {
    return (
      <Shell projectName={project.name} fill>
        <Centered>
          <p className="italic text-[var(--muted)]">
            This project has no module screens yet.{' '}
            <Link href="/create/formative" className="underline">
              Add modules in the editor
            </Link>
            .
          </p>
        </Centered>
      </Shell>
    );
  }

  const moduleIdx = content.modules.findIndex(
    (mod) => mod.id === screen.moduleId,
  );
  const m = content.modules[moduleIdx];
  if (!m) {
    return (
      <Shell projectName={project.name} fill>
        <Centered>
          <p className="italic text-[var(--muted)]">
            (Screen references a module that no longer exists — try jumping
            to another screen.)
          </p>
        </Centered>
      </Shell>
    );
  }

  const screenId = `${screen.moduleNumber}.${localIndex.get(screen.key) ?? '?'}`;
  const advance = () =>
    setScreenIdx((i) => Math.min(screens.length - 1, i + 1));

  return (
    <EditContext.Provider value={editApi}>
      <Shell
        projectName={project.name}
        moduleLabel={MODULE_TYPE_LABEL[m.type]}
        moduleNumber={moduleIdx + 1}
        total={content.modules.length}
        fill
        previewControls={
          <>
            <EditToggle
              editing={editing}
              setEditing={setEditing}
              savedAt={savedAt}
            />
            <PreviewControls
              screens={screens}
              screenIdx={screenIdx}
              setScreenIdx={setScreenIdx}
              screenId={screenId}
              localIndex={localIndex}
            />
          </>
        }
        rail={
          scripts ? (
            <ScriptRail
              screenId={screenId}
              script={scripts[screen.key] ?? ''}
              referenceScript={referenceScript}
            />
          ) : undefined
        }
      >
        {/* key includes `editing` so toggling edit mode remounts the runner
            (swaps plain text <-> contentEditable cleanly). Spec/entity
            localStorage survives because its keys are (projectId, moduleId). */}
        <ModuleRunner
          key={`${screen.key}:${editing}`}
          project={liveProject}
          participantId={null}
          module={m}
          moduleNumber={moduleIdx + 1}
          total={content.modules.length}
          onComplete={advance}
          controlled
          onAdvance={advance}
          initialScreen={screen}
        />
      </Shell>
    </EditContext.Provider>
  );
}

function EditToggle({
  editing,
  setEditing,
  savedAt,
}: {
  editing: boolean;
  setEditing: (v: boolean) => void;
  savedAt: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        className={
          'text-xs px-2 py-1 border transition ' +
          (editing
            ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--rule-soft)]'
            : 'border-[var(--rule)] text-[var(--muted)] hover:text-[var(--foreground)]')
        }
        title="Toggle inline editing — click any text on the screen to edit it"
      >
        {editing ? '✎ Editing copy' : '✎ Edit text'}
      </button>
      {editing && savedAt && (
        <span className="text-[10px] italic text-[var(--muted)]">
          saved {savedAt}
        </span>
      )}
    </div>
  );
}

// Per-screen researcher script (top) + collapsible SIGCSE reference (below).
// Mirrors the old Follow-along rail but lives inside the preview so the
// researcher reads the script while watching the real participant screen.
function ScriptRail({
  screenId,
  script,
  referenceScript,
}: {
  screenId: string;
  script: string;
  referenceScript: string;
}) {
  const [refOpen, setRefOpen] = useState(false);
  return (
    <aside className="h-full overflow-y-auto bg-[var(--panel)] p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-mono tabular-nums text-[var(--accent)]">
          {screenId}
        </span>
        <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Researcher script
        </span>
      </div>
      {script ? (
        <p className="whitespace-pre-wrap leading-relaxed mb-6">{script}</p>
      ) : (
        <p className="italic text-[var(--muted)] mb-6">
          No script for this screen yet.{' '}
          <Link href="/create/script" className="underline hover:no-underline">
            Add one
          </Link>
          .
        </p>
      )}
      {referenceScript && (
        <details
          open={refOpen}
          onToggle={(e) => setRefOpen((e.target as HTMLDetailsElement).open)}
          className="border border-dashed border-[var(--rule)] p-3"
        >
          <summary className="text-xs uppercase tracking-wider text-[var(--muted)] cursor-pointer">
            Think-aloud reference (SIGCSE)
          </summary>
          <p className="whitespace-pre-wrap leading-relaxed text-sm mt-2">
            {referenceScript}
          </p>
        </details>
      )}
    </aside>
  );
}

function PreviewControls({
  screens,
  screenIdx,
  setScreenIdx,
  screenId,
  localIndex,
}: {
  screens: Screen[];
  screenIdx: number;
  setScreenIdx: (next: number) => void;
  screenId: string;
  localIndex: Map<string, number>;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-mono tabular-nums text-[var(--accent)] border border-[var(--accent)]/40 px-2 py-1">
        {screenId}
      </span>
      <select
        value={screenIdx}
        onChange={(e) => setScreenIdx(Number(e.target.value))}
        className="border border-[var(--rule)] bg-white px-2 py-1 text-xs font-mono max-w-[20rem]"
        title="Jump to any screen"
      >
        {screens.map((s, i) => (
          <option key={s.key} value={i}>
            {s.moduleNumber}.{localIndex.get(s.key)} — {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setScreenIdx(Math.max(0, screenIdx - 1))}
        disabled={screenIdx === 0}
        className="border border-[var(--rule)] px-2 py-1 text-xs disabled:opacity-30"
      >
        ‹ Prev
      </button>
      <button
        type="button"
        onClick={() =>
          setScreenIdx(Math.min(screens.length - 1, screenIdx + 1))
        }
        disabled={screenIdx === screens.length - 1}
        className="border border-[var(--foreground)] px-2 py-1 text-xs disabled:opacity-30"
      >
        Next ›
      </button>
      <span className="text-xs text-[var(--muted)] tabular-nums">
        {screenIdx + 1} / {screens.length}
      </span>
    </div>
  );
}

// ============================== Shell / Header =============================

function Shell({
  projectName,
  moduleLabel,
  moduleNumber,
  total,
  showSignOut = false,
  previewControls,
  rail,
  fill = false,
  children,
}: {
  projectName: string;
  moduleLabel?: string;
  moduleNumber?: number;
  total?: number;
  showSignOut?: boolean;
  previewControls?: React.ReactNode;
  // Optional resizable rail to the right of the main content (preview only —
  // hosts the per-screen researcher script). Live /study never passes it.
  rail?: React.ReactNode;
  // `fill` (preview) makes the shell fill its parent (which sits below the
  // PreviewBrowser top bar). Live /study leaves it false → min-h-screen.
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        (fill ? 'h-full overflow-hidden' : 'min-h-screen') +
        ' flex flex-col bg-[var(--background)] text-[var(--foreground)]'
      }
    >
      <header className="shrink-0 border-b border-[var(--rule)] bg-[var(--panel)] px-6 py-3 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <UtcClock />
          <h1 className="text-lg font-medium tracking-tight truncate">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {moduleLabel && moduleNumber && total && (
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Module {moduleNumber} of {total} · {moduleLabel}
            </span>
          )}
          {previewControls}
          {showSignOut && (
            <form action={participantLogoutAction}>
              <button
                type="submit"
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      {rail ? (
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
          <Panel defaultSize="80%" minSize="40%">
            <div className="h-full flex flex-col p-6 gap-4 overflow-hidden">
              {children}
            </div>
          </Panel>
          <SplitHandle />
          <Panel defaultSize="20%" minSize="12%" maxSize="60%">
            {rail}
          </Panel>
        </PanelGroup>
      ) : (
        <main className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
          {children}
        </main>
      )}
    </div>
  );
}

function UtcClock() {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    function tick() {
      setNow(new Date().toISOString().slice(11, 19) + ' UTC');
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="font-mono text-xs text-[var(--muted)] tabular-nums"
      aria-label="UTC clock"
    >
      {now}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center">
      <div className="max-w-xl">{children}</div>
    </div>
  );
}

function ExampleBanner() {
  return (
    <div className="border border-[#d8c98a] bg-[#fffbea] px-4 py-2 text-sm italic text-[#7c5a2e] mb-3">
      <strong className="not-italic font-medium tracking-[0.04em]">
        {EXAMPLE_BANNER_TEXT}
      </strong>
    </div>
  );
}

// ============================== Module dispatch =============================

function ModuleRunner({
  project,
  participantId,
  module: m,
  moduleNumber,
  total,
  onComplete,
  controlled = false,
  onAdvance,
  initialScreen,
}: {
  project: LoadedProject;
  participantId: string | null;
  module: Module;
  moduleNumber: number;
  total: number;
  onComplete: () => void;
  // Controlled (preview) mode: each Continue calls onAdvance instead of
  // mutating internal step state; the parent re-mounts with the next screen.
  controlled?: boolean;
  onAdvance?: () => void;
  initialScreen?: Screen;
}) {
  const projectId = project.id;
  const skipPersist = !isPersistedToDb(m.type);
  const save = useMemo(
    () => makeSaveAdapter(participantId, m.id, skipPersist),
    [participantId, m.id, skipPersist],
  );

  // module_start once on mount; module_complete just before calling onComplete.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      save.recordEvent('module_start', {
        moduleType: m.type,
        moduleNumber,
        total,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function complete() {
    save.recordEvent('module_complete', { moduleType: m.type });
    onComplete();
  }

  if (m.type === 'think_aloud_warmup')
    return (
      <ThinkAloudWarmupRunner
        projectId={projectId}
        module={m}
        save={save}
        onComplete={complete}
        initialPhase={initialScreen ? screenToWarmupPhase(initialScreen) : undefined}
        controlled={controlled}
        onAdvance={onAdvance}
      />
    );
  if (m.type === 'think_aloud_example')
    return (
      <ThinkAloudExampleRunner
        module={m}
        save={save}
        onComplete={complete}
        initialPhase={initialScreen ? screenToWarmupPhase(initialScreen) : undefined}
        controlled={controlled}
        onAdvance={onAdvance}
      />
    );
  if (m.type === 'task' || m.type === 'task_warmup')
    return (
      <TaskRunner
        projectId={projectId}
        participantId={participantId}
        module={m}
        moduleNumber={moduleNumber}
        total={total}
        isWarmup={m.type === 'task_warmup'}
        save={save}
        onComplete={complete}
        initialStep={initialScreen ? screenToTaskStep(initialScreen) : undefined}
        controlled={controlled}
        onAdvance={onAdvance}
      />
    );
  if (m.type === 'task_example')
    return (
      <TaskExampleRunner
        module={m}
        save={save}
        onComplete={complete}
        initialStep={initialScreen ? screenToExampleStep(initialScreen) : undefined}
        controlled={controlled}
        onAdvance={onAdvance}
      />
    );
  if (m.type === 'retrospective_report')
    return (
      <RetrospectiveRunner
        projectId={projectId}
        project={project}
        module={m}
        save={save}
        onComplete={complete}
        initialStepIdx={initialScreen?.idx ?? 0}
        controlled={controlled}
        onAdvance={onAdvance}
      />
    );
  return null;
}

// =========================== Think-aloud warmup =========================

// Warmup phases — declared at module level so the preview wrapper can
// translate screen.kind -> Phase without duplicating the union. Both the
// real warmup and the worked-example module use the same three phases.
type WarmupPhase = 'intro' | 'body' | 'revealed';

function resolveWarmupCopy(copy: ThinkAloudWarmupModule['copy']) {
  return {
    introTitle: copy?.introTitle?.trim() || DEFAULT_WARMUP_COPY.introTitle,
    introBody: copy?.introBody?.trim() || DEFAULT_WARMUP_COPY.introBody,
    revealButtonLabel:
      copy?.revealButtonLabel?.trim() || DEFAULT_WARMUP_COPY.revealButtonLabel,
    postRevealCallout:
      copy?.postRevealCallout?.trim() || DEFAULT_WARMUP_COPY.postRevealCallout,
    answerInputLabel:
      copy?.answerInputLabel?.trim() || DEFAULT_WARMUP_COPY.answerInputLabel,
  };
}

function ThinkAloudWarmupRunner({
  projectId,
  module: m,
  save,
  onComplete,
  initialPhase,
  controlled = false,
  onAdvance,
}: {
  projectId: string;
  module: ThinkAloudWarmupModule;
  save: SaveAdapter;
  onComplete: () => void;
  // Preview-mode hooks: when `controlled` is true the runner emits
  // onAdvance() instead of mutating internal phase state; the wrapper
  // re-mounts on screen change via React key to set the new initialPhase.
  initialPhase?: WarmupPhase;
  controlled?: boolean;
  onAdvance?: () => void;
}) {
  const copy = resolveWarmupCopy(m.copy);
  const edit = useEdit();
  const setCopy = (key: keyof NonNullable<ThinkAloudWarmupModule['copy']>, v: string) =>
    edit.editModule(m.id, (mod) => {
      if (mod.type !== 'think_aloud_warmup') return;
      mod.copy = { ...(mod.copy ?? {}), [key]: v };
    });
  const setField = (key: 'title' | 'taskDescription' | 'body', v: string) =>
    edit.editModule(m.id, (mod) => {
      if (mod.type !== 'think_aloud_warmup') return;
      mod[key] = v;
    });
  // Participant's typed anagram answer, persisted locally so reload doesn't
  // erase. Compared to m.revealedAnswer for analysis logging; not gating.
  const [answer, setAnswer] = useLocalString(
    `pf:${projectId}:${m.id}:warmup_answer`,
  );
  useDebouncedSave(answer, (v) => {
    save.upsert('warmup:answer', v);
    save.recordEvent('warmup_answer_edit', {
      value: v,
      target: m.revealedAnswer,
      client_ts: new Date().toISOString(),
    });
  });
  const [phase, setPhase] = useState<WarmupPhase>(initialPhase ?? 'intro');

  function advanceTo(next: WarmupPhase) {
    save.recordEvent('step_advance', { from: phase, to: next });
    if (controlled) onAdvance?.();
    else setPhase(next);
  }

  function finish() {
    save.recordEvent('step_advance', { from: phase, to: 'done' });
    if (controlled) onAdvance?.();
    else onComplete();
  }

  if (phase === 'intro') {
    return (
      <Centered>
        <EditableText
          as="h2"
          className="text-2xl font-medium tracking-tight mb-4"
          value={copy.introTitle}
          onCommit={(v) => setCopy('introTitle', v)}
        />
        <EditableText
          as="p"
          className="text-[var(--muted)] leading-relaxed mb-8 whitespace-pre-wrap"
          value={copy.introBody}
          onCommit={(v) => setCopy('introBody', v)}
        />
        <ContinueButton onClick={() => advanceTo('body')} />
      </Centered>
    );
  }

  return (
    <div className="flex-1 flex justify-center overflow-hidden min-h-0">
      <div className="max-w-2xl w-full flex flex-col gap-4 overflow-hidden">
        <section className="flex flex-col gap-4 overflow-y-auto pr-1 h-full">
          <EditableText
            as="h2"
            className="text-2xl font-medium tracking-tight"
            value={m.title}
            onCommit={(v) => setField('title', v)}
          />
          {(edit.enabled || m.taskDescription) && (
            <EditableText
              as="p"
              className="italic text-[var(--muted)] leading-relaxed"
              value={m.taskDescription}
              onCommit={(v) => setField('taskDescription', v)}
            />
          )}
          {(edit.enabled || m.body) && (
            <EditableText
              as="p"
              className="leading-relaxed whitespace-pre-wrap"
              value={m.body}
              onCommit={(v) => setField('body', v)}
            />
          )}
          {phase === 'revealed' && m.revealedTask && (
            <div className="mt-2 border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-3">
                Task
              </p>
              <p className="font-mono text-3xl tracking-[0.4em] mb-5">
                {m.revealedTask}
              </p>
              <label className="block text-left max-w-xs mx-auto">
                <span className="block text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                  {copy.answerInputLabel}
                </span>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full border border-[var(--rule)] bg-white px-3 py-2 font-mono tracking-[0.25em] text-center text-lg focus:outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
          )}
          {phase === 'revealed' && (
            <EditableText
              as="p"
              className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2"
              value={copy.postRevealCallout}
              onCommit={(v) => setCopy('postRevealCallout', v)}
            />
          )}
          {m.mandatory && phase === 'body' && (
            <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
              Please complete this warmup before continuing.
            </p>
          )}
          <div className="mt-auto pt-4 flex gap-3">
            {phase === 'body' &&
              (m.revealedTask ? (
                <button
                  type="button"
                  onClick={() => advanceTo('revealed')}
                  className="border border-[var(--foreground)] px-4 py-2 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                >
                  {copy.revealButtonLabel}
                </button>
              ) : (
                // No anagram authored — still give the participant a way
                // forward instead of stranding them on the body screen.
                <ContinueButton onClick={() => advanceTo('revealed')} />
              ))}
            {phase === 'revealed' && <ContinueButton onClick={finish} />}
          </div>
        </section>
      </div>
    </div>
  );
}

// ===================== Think-aloud worked example =====================
// A first-class display-only module. Same three phases as the warmup but
// the researcher narrates (walkthroughText) and the answer is shown
// pre-filled rather than typed.

function ThinkAloudExampleRunner({
  module: m,
  save,
  onComplete,
  initialPhase,
  controlled = false,
  onAdvance,
}: {
  module: ThinkAloudExampleModule;
  save: SaveAdapter;
  onComplete: () => void;
  initialPhase?: WarmupPhase;
  controlled?: boolean;
  onAdvance?: () => void;
}) {
  const copy = resolveWarmupCopy(m.copy);
  const edit = useEdit();
  const setField = (
    key: 'title' | 'taskDescription' | 'body' | 'walkthroughText',
    v: string,
  ) =>
    edit.editModule(m.id, (mod) => {
      if (mod.type !== 'think_aloud_example') return;
      mod[key] = v;
    });
  const setCopy = (key: keyof NonNullable<ThinkAloudExampleModule['copy']>, v: string) =>
    edit.editModule(m.id, (mod) => {
      if (mod.type !== 'think_aloud_example') return;
      mod.copy = { ...(mod.copy ?? {}), [key]: v };
    });
  const [phase, setPhase] = useState<WarmupPhase>(initialPhase ?? 'intro');

  function advanceTo(next: WarmupPhase) {
    save.recordEvent('step_advance', { from: phase, to: next });
    if (controlled) onAdvance?.();
    else setPhase(next);
  }
  function finish() {
    save.recordEvent('step_advance', { from: phase, to: 'done' });
    if (controlled) onAdvance?.();
    else onComplete();
  }

  if (phase === 'intro') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ExampleBanner />
        <Centered>
          <EditableText
            as="h2"
            className="text-2xl font-medium tracking-tight mb-4"
            value={copy.introTitle}
            onCommit={(v) => setCopy('introTitle', v)}
          />
          <EditableText
            as="p"
            className="text-[var(--muted)] leading-relaxed mb-8 whitespace-pre-wrap"
            value={
              m.taskDescription ||
              'The researcher will demonstrate the think-aloud method.'
            }
            onCommit={(v) => setField('taskDescription', v)}
          />
          <ContinueButton onClick={() => advanceTo('body')} />
        </Centered>
      </div>
    );
  }

  const revealed = phase === 'revealed';
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <div className="flex-1 flex justify-center overflow-hidden min-h-0">
        <div className="max-w-2xl w-full flex flex-col gap-4 overflow-hidden">
          <section className="flex flex-col gap-4 overflow-y-auto pr-1 h-full">
            <EditableText
              as="h2"
              className="text-2xl font-medium tracking-tight"
              value={m.title}
              onCommit={(v) => setField('title', v)}
            />
            {(edit.enabled || m.body) && (
              <EditableText
                as="p"
                className="leading-relaxed whitespace-pre-wrap"
                value={m.body}
                onCommit={(v) => setField('body', v)}
              />
            )}
            {revealed && m.revealedTask && (
              <div className="mt-2 border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-3">
                  Task
                </p>
                <p className="font-mono text-3xl tracking-[0.4em] mb-4">
                  {m.revealedTask}
                </p>
                {m.revealedAnswer && (
                  <div className="max-w-xs mx-auto text-left">
                    <span className="block text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                      {copy.answerInputLabel}
                    </span>
                    <div className="w-full border border-[var(--rule)] bg-[var(--rule-soft)] px-3 py-2 font-mono tracking-[0.25em] text-center text-lg">
                      {m.revealedAnswer}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(edit.enabled || m.walkthroughText) && (
              <div className="border border-dashed border-[var(--rule)] bg-[var(--panel)] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                  Researcher narrates
                </p>
                <EditableText
                  as="p"
                  className="whitespace-pre-wrap leading-relaxed text-sm"
                  value={m.walkthroughText ?? ''}
                  onCommit={(v) => setField('walkthroughText', v)}
                />
              </div>
            )}
            <div className="mt-auto pt-4 flex gap-3">
              {phase === 'body' && (
                <ContinueButton
                  onClick={() => advanceTo('revealed')}
                  label={copy.revealButtonLabel}
                />
              )}
              {phase === 'revealed' && <ContinueButton onClick={finish} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// =============================== Task runner ==============================

type TaskStep =
  | { kind: 'intro' }
  | { kind: 'context' }
  | { kind: 'initial_spec' }
  | { kind: 'scenario_read'; idx: number }
  | { kind: 'scenario_ponder'; idx: number }
  | { kind: 'scenario_revise'; idx: number }
  | { kind: 'scenario_retro'; idx: number; qIdx: number };

function stepLabel(s: TaskStep): string {
  if (s.kind === 'scenario_read') return `scenario_${s.idx}_read`;
  if (s.kind === 'scenario_ponder') return `scenario_${s.idx}_ponder`;
  if (s.kind === 'scenario_revise') return `scenario_${s.idx}_revise`;
  if (s.kind === 'scenario_retro')
    return `scenario_${s.idx}_retro_${s.qIdx}`;
  return s.kind;
}

function TaskRunner({
  projectId,
  participantId,
  module: m,
  moduleNumber,
  total,
  isWarmup,
  save,
  onComplete,
  initialStep,
  controlled = false,
  onAdvance,
}: {
  projectId: string;
  participantId: string | null;
  module: Extract<Module, { type: 'task' | 'task_warmup' }>;
  moduleNumber: number;
  total: number;
  isWarmup: boolean;
  save: SaveAdapter;
  onComplete: () => void;
  // Preview-mode hooks: see ThinkAloudWarmupRunner for semantics.
  initialStep?: TaskStep;
  controlled?: boolean;
  onAdvance?: () => void;
}) {
  const t: TaskContent = m;
  const retro = t.perScenarioRetrospective ?? [];

  const [step, setStep] = useState<TaskStep>(initialStep ?? { kind: 'intro' });
  const [spec, setSpec] = useLocalString(`pf:${projectId}:${m.id}:spec`);
  const [entities, setEntities] = useLocalEntities(
    `pf:${projectId}:${m.id}:entities`,
  );
  const [retroAnswers, setRetroAnswer] = useLocalRecord(
    `pf:${projectId}:${m.id}:scenario_retro`,
  );

  const [specSavedAt, markSpecSaved] = useSavedAt();
  const [entitiesSavedAt, markEntitiesSaved] = useSavedAt();

  useDebouncedSave(spec, (v) => {
    save.upsert('spec:current', v);
    save.recordEvent('spec_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markSpecSaved();
  });

  // Encode entities once; we save the JSON blob so analyses can re-parse.
  const entitiesJson = useMemo(() => JSON.stringify(entities), [entities]);
  useDebouncedSave(entitiesJson, (v) => {
    save.upsert('entities:current', v);
    save.recordEvent('entities_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markEntitiesSaved();
  });

  function transitionTo(nextStep: TaskStep) {
    save.recordEvent('step_advance', {
      from: stepLabel(step),
      to: stepLabel(nextStep),
    });
    if (controlled) {
      onAdvance?.();
    } else {
      setStep(nextStep);
    }
  }

  // End the whole module: snapshot the final spec, write the cross-module
  // pointer for the retrospective, then advance.
  function finishModule(): void {
    save.recordEvent('spec_snapshot', { at: 'final', value: spec });
    writeLastSpecPointer({
      projectId,
      moduleId: m.id,
      participantId,
      spec,
      entitiesJson,
      skipPersist: isWarmup,
    });
    if (controlled) return onAdvance?.();
    return onComplete();
  }

  // After a scenario's revise + (optional) retrospective questions, move to
  // the next scenario or finish the module.
  function afterScenario(idx: number): void {
    const nextIdx = idx + 1;
    if (nextIdx >= t.scenarios.length) return finishModule();
    transitionTo({ kind: 'scenario_read', idx: nextIdx });
  }

  function next(): void {
    if (step.kind === 'intro') return transitionTo({ kind: 'context' });
    if (step.kind === 'context')
      return transitionTo({ kind: 'initial_spec' });
    if (step.kind === 'initial_spec') {
      // Snapshot the initial spec before scenarios begin.
      save.recordEvent('spec_snapshot', { at: 'initial', value: spec });
      save.recordEvent('entities_snapshot', {
        at: 'initial',
        value: entitiesJson,
      });
      return transitionTo({ kind: 'scenario_read', idx: 0 });
    }
    if (step.kind === 'scenario_read')
      return transitionTo({ kind: 'scenario_ponder', idx: step.idx });
    if (step.kind === 'scenario_ponder')
      return transitionTo({ kind: 'scenario_revise', idx: step.idx });
    if (step.kind === 'scenario_revise') {
      save.recordEvent('spec_snapshot', {
        at: `after_scenario_${step.idx}`,
        value: spec,
      });
      save.recordEvent('entities_snapshot', {
        at: `after_scenario_${step.idx}`,
        value: entitiesJson,
      });
      // Per-scenario retrospective questions (if any) come before the next
      // scenario. Same question set repeats after every scenario.
      if (retro.length > 0) {
        return transitionTo({ kind: 'scenario_retro', idx: step.idx, qIdx: 0 });
      }
      return afterScenario(step.idx);
    }
    if (step.kind === 'scenario_retro') {
      const nextQ = step.qIdx + 1;
      if (nextQ < retro.length) {
        return transitionTo({
          kind: 'scenario_retro',
          idx: step.idx,
          qIdx: nextQ,
        });
      }
      return afterScenario(step.idx);
    }
  }

  if (step.kind === 'intro') {
    return (
      <TaskIntro
        moduleNumber={moduleNumber}
        total={total}
        isWarmup={isWarmup}
        title={t.title}
        copy={t.copy}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'context') {
    return <ContextStep t={t} onContinue={next} />;
  }

  if (step.kind === 'initial_spec') {
    return (
      <InitialSpecStep
        t={t}
        spec={spec}
        setSpec={setSpec}
        entities={entities}
        setEntities={setEntities}
        specSavedAt={specSavedAt}
        entitiesSavedAt={entitiesSavedAt}
        onContinue={next}
      />
    );
  }

  const scenario = t.scenarios[step.idx];
  if (!scenario) {
    onComplete();
    return null;
  }

  if (step.kind === 'scenario_read') {
    return (
      <ScenarioReadStep
        t={t}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={t.scenarios.length}
        spec={spec}
        setSpec={setSpec}
        entities={entities}
        setEntities={setEntities}
        specSavedAt={specSavedAt}
        entitiesSavedAt={entitiesSavedAt}
        projectId={projectId}
        moduleId={m.id}
        save={save}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'scenario_ponder') {
    return (
      <PonderStep
        scenarioIdx={step.idx}
        totalScenarios={t.scenarios.length}
        taskCopy={t.copy}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'scenario_revise') {
    return (
      <ScenarioReviseStep
        t={t}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={t.scenarios.length}
        spec={spec}
        setSpec={setSpec}
        entities={entities}
        setEntities={setEntities}
        specSavedAt={specSavedAt}
        entitiesSavedAt={entitiesSavedAt}
        isLast={
          step.idx === t.scenarios.length - 1 && retro.length === 0
        }
        projectId={projectId}
        moduleId={m.id}
        save={save}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'scenario_retro') {
    const q = retro[step.qIdx];
    if (!q) {
      onComplete();
      return null;
    }
    const answerKey = `${step.idx}:${step.qIdx}`;
    const isLastQuestion = step.qIdx === retro.length - 1;
    const isLastScenario = step.idx === t.scenarios.length - 1;
    return (
      <ScenarioRetroStep
        question={q.text}
        boxHeight={q.boxHeight}
        scenarioTitle={scenario.title}
        scenarioIdx={step.idx}
        totalScenarios={t.scenarios.length}
        questionIdx={step.qIdx}
        totalQuestions={retro.length}
        value={retroAnswers[answerKey] ?? ''}
        onChange={(v) => {
          setRetroAnswer(answerKey, v);
          save.upsert(`scenario_retro:${answerKey}`, v);
        }}
        onContinue={next}
        continueLabel={
          isLastQuestion && isLastScenario
            ? 'Finish task'
            : isLastQuestion
            ? 'Next scenario'
            : 'Next question'
        }
      />
    );
  }

  return null;
}

// =============================== Task: Intro ==============================

function TaskIntro({
  moduleNumber,
  total,
  isWarmup,
  title,
  copy,
  onContinue,
}: {
  moduleNumber: number;
  total: number;
  isWarmup: boolean;
  title: string;
  copy: TaskContent['copy'];
  onContinue: () => void;
}) {
  const annotation = isWarmup
    ? copy?.warmupAnnotation?.trim() || DEFAULT_TASK_COPY.warmupAnnotation
    : copy?.realAnnotation?.trim() || DEFAULT_TASK_COPY.realAnnotation;
  return (
    <Centered>
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          Module {moduleNumber} of {total}
        </p>
        <h2 className="text-3xl font-medium tracking-tight">{title}</h2>
        <p
          className={
            'text-sm italic px-4 py-3 whitespace-pre-wrap ' +
            (isWarmup
              ? 'text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a]'
              : 'text-[var(--muted)] bg-[var(--panel)] border border-[var(--rule)]')
          }
        >
          {annotation}
        </p>
        <ContinueButton onClick={onContinue} />
      </div>
    </Centered>
  );
}

// ============================ Task: Context step ===========================

function ContextStep({
  t,
  onContinue,
}: {
  t: TaskContent;
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 flex justify-center overflow-hidden min-h-0">
      <section className="max-w-2xl w-full flex flex-col gap-4 overflow-y-auto pr-1">
        <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
        <RequirementsBlock requirements={t.requirements} />
        <div className="mt-auto pt-4">
          <ContinueButton onClick={onContinue} />
        </div>
      </section>
    </div>
  );
}

// ====================== Task: Initial-spec step =========================

function InitialSpecStep({
  t,
  spec,
  setSpec,
  entities,
  setEntities,
  specSavedAt,
  entitiesSavedAt,
  onContinue,
}: {
  t: TaskContent;
  spec: string;
  setSpec: (v: string) => void;
  entities: Entity[];
  setEntities: (next: Entity[]) => void;
  specSavedAt: string | null;
  entitiesSavedAt: string | null;
  onContinue: () => void;
}) {
  // No-scenario screen → side padding for breathing room, requirements 1/3
  // on the left, spec 2/3 on the right (Hudson's pilot-2 ratio).
  return (
    <div className="flex-1 min-h-0 px-6 md:px-10">
      <PanelGroup orientation="horizontal" className="h-full">
        <Panel defaultSize="33%" minSize="20%" maxSize="50%">
          <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
            <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
            <RequirementsBlock requirements={t.requirements} />
          </section>
        </Panel>
        <SplitHandle />
        <Panel defaultSize="67%" minSize="50%" maxSize="80%">
          <SpecColumn
            spec={spec}
            setSpec={setSpec}
            entities={entities}
            setEntities={setEntities}
            specSavedAt={specSavedAt}
            entitiesSavedAt={entitiesSavedAt}
            onContinue={onContinue}
            continueLabel="Next"
            placeholder={t.copy?.specPlaceholder}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

// =================== Task: Scenario read step ==========================

function ScenarioReadStep({
  t,
  scenario,
  scenarioIdx,
  totalScenarios,
  spec,
  setSpec,
  entities,
  setEntities,
  specSavedAt,
  entitiesSavedAt,
  projectId,
  moduleId,
  save,
  onContinue,
}: {
  t: TaskContent;
  scenario: Scenario;
  scenarioIdx: number;
  totalScenarios: number;
  spec: string;
  setSpec: (v: string) => void;
  entities: Entity[];
  setEntities: (next: Entity[]) => void;
  specSavedAt: string | null;
  entitiesSavedAt: string | null;
  projectId: string;
  moduleId: string;
  save: SaveAdapter;
  onContinue: () => void;
}) {
  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize="55%" minSize="30%" maxSize="75%">
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <div className="opacity-60">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Prior
            </span>
            <h2 className="text-xl font-medium tracking-tight mt-1">
              {t.title}
            </h2>
            <RequirementsBlock requirements={t.requirements} compact />
          </div>
          <div className="border border-[var(--accent)]/40 bg-[var(--rule-soft)] p-3">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                New this screen
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Scenario {scenarioIdx + 1} of {totalScenarios}
              </span>
            </div>
            <h3 className="text-xl font-medium">{scenario.title}</h3>
            <ClauseList clauses={scenario.clauses} highlightable />
          </div>
          {t.cityMap && (
            <MapCanvas
              map={t.cityMap}
              scenarioId={scenario.id}
              storageKey={`pf:${projectId}:${moduleId}`}
              onEvent={(eventType, payload) =>
                save.recordEvent(eventType, payload)
              }
              seededMarkers={scenario.seededMarkers ?? []}
            />
          )}
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize="45%" minSize="25%" maxSize="70%">
        <SpecColumn
          spec={spec}
          setSpec={setSpec}
          entities={entities}
          setEntities={setEntities}
          specSavedAt={specSavedAt}
          entitiesSavedAt={entitiesSavedAt}
          onContinue={onContinue}
          continueLabel="Continue"
          placeholder={t.copy?.specPlaceholder}
        />
      </Panel>
    </PanelGroup>
  );
}

// ====================== Task: Pause-and-ponder step ======================

function PonderStep({
  scenarioIdx,
  totalScenarios,
  taskCopy,
  onContinue,
  isExample = false,
  copyOverride,
}: {
  scenarioIdx: number;
  totalScenarios: number;
  taskCopy: TaskContent['copy'];
  onContinue: () => void;
  isExample?: boolean;
  copyOverride?: string;
}) {
  const trimmed = copyOverride?.trim();
  const showOverride = isExample && trimmed && trimmed.length > 0;
  const ponderText =
    taskCopy?.ponderDefault?.trim() || DEFAULT_TASK_COPY.ponderDefault;
  const holdNote =
    taskCopy?.ponderHoldNote?.trim() || DEFAULT_TASK_COPY.ponderHoldNote;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {isExample && <ExampleBanner />}
      <Centered>
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            Scenario {scenarioIdx + 1} of {totalScenarios} · Pause and ponder
          </p>
          <p className="text-2xl leading-relaxed whitespace-pre-wrap">
            {showOverride ? trimmed : ponderText}
          </p>
          {isExample && !showOverride && (
            <p className="text-xs italic text-[var(--muted)]">
              (Example — researcher narrates)
            </p>
          )}
          <p className="text-sm italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-4 py-3">
            {holdNote}
          </p>
          <ContinueButton onClick={onContinue} />
        </div>
      </Centered>
    </div>
  );
}

// ======================= Task: Scenario revise step ======================

function ScenarioReviseStep({
  t,
  scenario,
  scenarioIdx,
  totalScenarios,
  spec,
  setSpec,
  entities,
  setEntities,
  specSavedAt,
  entitiesSavedAt,
  isLast,
  projectId,
  moduleId,
  save,
  onContinue,
}: {
  t: TaskContent;
  scenario: Scenario;
  scenarioIdx: number;
  totalScenarios: number;
  spec: string;
  setSpec: (v: string) => void;
  entities: Entity[];
  setEntities: (next: Entity[]) => void;
  specSavedAt: string | null;
  entitiesSavedAt: string | null;
  isLast: boolean;
  projectId: string;
  moduleId: string;
  save: SaveAdapter;
  onContinue: () => void;
}) {
  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize="55%" minSize="30%" maxSize="75%">
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Scenario {scenarioIdx + 1} of {totalScenarios} · Revising specifications
          </p>
          <div className="opacity-60">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Prior
            </span>
            <h2 className="text-xl font-medium tracking-tight mt-1">
              {t.title}
            </h2>
            <RequirementsBlock requirements={t.requirements} compact />
          </div>
          <div className="border border-[var(--accent)]/40 bg-[var(--rule-soft)] p-3">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                New this screen
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Scenario {scenarioIdx + 1}
              </span>
            </div>
            <h3 className="font-medium">{scenario.title}</h3>
            <ClauseList clauses={scenario.clauses} highlightable />
          </div>
          {t.cityMap && (
            <MapCanvas
              map={t.cityMap}
              scenarioId={scenario.id}
              storageKey={`pf:${projectId}:${moduleId}`}
              onEvent={(eventType, payload) =>
                save.recordEvent(eventType, payload)
              }
              seededMarkers={scenario.seededMarkers ?? []}
            />
          )}
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize="45%" minSize="25%" maxSize="70%">
        <SpecColumn
          spec={spec}
          setSpec={setSpec}
          entities={entities}
          setEntities={setEntities}
          specSavedAt={specSavedAt}
          entitiesSavedAt={entitiesSavedAt}
          onContinue={onContinue}
          continueLabel={isLast ? 'Finish task' : 'Next scenario'}
          placeholder={t.copy?.specPlaceholder}
          leadIn={
            <div className="bg-[#fffbea] border border-[#d8c98a] px-3 py-2 text-sm italic text-[#7c5a2e]">
              {t.copy?.reviseCallout?.trim() || DEFAULT_TASK_COPY.reviseCallout}
            </div>
          }
        />
      </Panel>
    </PanelGroup>
  );
}

// ========================== Example steps ==========================
// All example steps are display-only. Spec and entity table render as
// read-only, prefilled with the researcher-authored snapshot for that
// moment. No persistence — example data is never sent to the server.

function ExampleIntroStep({
  title,
  walkthroughText,
  onContinue,
}: {
  title: string;
  walkthroughText?: string;
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <Centered>
        <div className="space-y-6">
          <h2 className="text-3xl font-medium tracking-tight">{title}</h2>
          <p className="text-[var(--muted)] leading-relaxed">
            Watch as the researcher walks through this worked example. You will
            complete a similar one yourself afterward.
          </p>
          {walkthroughText && (
            <div className="border border-dashed border-[var(--rule)] bg-[var(--panel)] p-3 text-left">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                Researcher narrates
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-sm">
                {walkthroughText}
              </p>
            </div>
          )}
          <ContinueButton onClick={onContinue} />
        </div>
      </Centered>
    </div>
  );
}

function ExampleInitialSpecStep({
  example,
  onContinue,
}: {
  example: TaskExample;
  onContinue: () => void;
}) {
  const moment = example.prefilled.initial;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <div className="flex-1 min-h-0 px-6 md:px-10">
        <PanelGroup orientation="horizontal" className="h-full">
          <Panel defaultSize="33%" minSize="20%" maxSize="50%">
            <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
              <h2 className="text-2xl font-medium tracking-tight">
                {example.title}
              </h2>
              <RequirementsBlock requirements={example.requirements} />
            </section>
          </Panel>
          <SplitHandle />
          <Panel defaultSize="67%" minSize="50%" maxSize="80%">
            <SpecColumn
              spec={moment.spec}
              setSpec={() => {}}
              entities={moment.entities}
              setEntities={() => {}}
              specSavedAt={null}
              entitiesSavedAt={null}
              onContinue={onContinue}
              continueLabel="Next"
              readOnly
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function ExampleScenarioReadStep({
  example,
  scenario,
  scenarioIdx,
  totalScenarios,
  moment,
  onContinue,
}: {
  example: TaskExample;
  scenario: Scenario;
  scenarioIdx: number;
  totalScenarios: number;
  moment: PrefilledMoment | undefined;
  onContinue: () => void;
}) {
  const m: PrefilledMoment = moment ?? { spec: '', entities: [] };
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <Panel defaultSize="55%" minSize="30%" maxSize="75%">
          <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
            <div className="opacity-60">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Prior
              </span>
              <h2 className="text-xl font-medium tracking-tight mt-1">
                {example.title}
              </h2>
              <RequirementsBlock requirements={example.requirements} compact />
            </div>
            <div className="border border-[var(--accent)]/40 bg-[var(--rule-soft)] p-3">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                  New this screen
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  Scenario {scenarioIdx + 1} of {totalScenarios}
                </span>
              </div>
              <h3 className="text-xl font-medium">{scenario.title}</h3>
              <ClauseList clauses={scenario.clauses} highlightable />
            </div>
          </section>
        </Panel>
        <SplitHandle />
        <Panel defaultSize="45%" minSize="25%" maxSize="70%">
          <SpecColumn
            spec={m.spec}
            setSpec={() => {}}
            entities={m.entities}
            setEntities={() => {}}
            specSavedAt={null}
            entitiesSavedAt={null}
            onContinue={onContinue}
            continueLabel="Continue"
            readOnly
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

function ExampleScenarioReviseStep({
  example,
  scenario,
  scenarioIdx,
  totalScenarios,
  moment,
  isLast,
  onContinue,
}: {
  example: TaskExample;
  scenario: Scenario;
  scenarioIdx: number;
  totalScenarios: number;
  moment: PrefilledMoment | undefined;
  isLast: boolean;
  onContinue: () => void;
}) {
  const m: PrefilledMoment = moment ?? { spec: '', entities: [] };
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <Panel defaultSize="55%" minSize="30%" maxSize="75%">
          <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Scenario {scenarioIdx + 1} of {totalScenarios} · Revising
            </p>
            <div className="opacity-60">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Prior
              </span>
              <h2 className="text-xl font-medium tracking-tight mt-1">
                {example.title}
              </h2>
              <RequirementsBlock requirements={example.requirements} compact />
            </div>
            <div className="border border-[var(--accent)]/40 bg-[var(--rule-soft)] p-3">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                  New this screen
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  Scenario {scenarioIdx + 1}
                </span>
              </div>
              <h3 className="font-medium">{scenario.title}</h3>
              <ClauseList clauses={scenario.clauses} highlightable />
            </div>
          </section>
        </Panel>
        <SplitHandle />
        <Panel defaultSize="45%" minSize="25%" maxSize="70%">
          <SpecColumn
            spec={m.spec}
            setSpec={() => {}}
            entities={m.entities}
            setEntities={() => {}}
            specSavedAt={null}
            entitiesSavedAt={null}
            onContinue={onContinue}
            continueLabel={isLast ? 'Finish example' : 'Next scenario'}
            readOnly
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

// ====================== Worked-example task runner ======================
// Display-only mirror of TaskRunner driven by the standalone task_example
// module. Reuses the Example*Step components; all screens are read-only and
// show the researcher-authored prefilled spec/entities.

function exStepLabel(s: ExStep): string {
  if (s.kind === 'scenario_read') return `ex_scenario_${s.idx}_read`;
  if (s.kind === 'scenario_ponder') return `ex_scenario_${s.idx}_ponder`;
  if (s.kind === 'scenario_revise') return `ex_scenario_${s.idx}_revise`;
  return `ex_${s.kind}`;
}

function TaskExampleRunner({
  module: m,
  save,
  onComplete,
  initialStep,
  controlled = false,
  onAdvance,
}: {
  module: TaskExampleModule;
  save: SaveAdapter;
  onComplete: () => void;
  initialStep?: ExStep;
  controlled?: boolean;
  onAdvance?: () => void;
}) {
  const [step, setStep] = useState<ExStep>(initialStep ?? { kind: 'intro' });

  function transitionTo(next: ExStep) {
    save.recordEvent('step_advance', {
      from: exStepLabel(step),
      to: exStepLabel(next),
    });
    if (controlled) onAdvance?.();
    else setStep(next);
  }
  function finish() {
    if (controlled) onAdvance?.();
    else onComplete();
  }

  function next(): void {
    if (step.kind === 'intro') return transitionTo({ kind: 'initial_spec' });
    if (step.kind === 'initial_spec')
      return transitionTo({ kind: 'scenario_read', idx: 0 });
    if (step.kind === 'scenario_read')
      return transitionTo({ kind: 'scenario_ponder', idx: step.idx });
    if (step.kind === 'scenario_ponder')
      return transitionTo({ kind: 'scenario_revise', idx: step.idx });
    if (step.kind === 'scenario_revise') {
      const nextIdx = step.idx + 1;
      if (nextIdx >= m.scenarios.length) return finish();
      return transitionTo({ kind: 'scenario_read', idx: nextIdx });
    }
  }

  if (step.kind === 'intro')
    return (
      <ExampleIntroStep
        title={m.title}
        walkthroughText={m.walkthroughText}
        onContinue={next}
      />
    );
  if (step.kind === 'initial_spec')
    return <ExampleInitialSpecStep example={m} onContinue={next} />;

  const scenario = m.scenarios[step.idx];
  if (!scenario) {
    onComplete();
    return null;
  }
  const prefilled = m.prefilled.perScenario[step.idx];

  if (step.kind === 'scenario_read')
    return (
      <ExampleScenarioReadStep
        example={m}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={m.scenarios.length}
        moment={prefilled?.read}
        onContinue={next}
      />
    );
  if (step.kind === 'scenario_ponder')
    return (
      <PonderStep
        scenarioIdx={step.idx}
        totalScenarios={m.scenarios.length}
        taskCopy={m.copy}
        onContinue={next}
        isExample
        copyOverride={prefilled?.ponderCopy}
      />
    );
  if (step.kind === 'scenario_revise')
    return (
      <ExampleScenarioReviseStep
        example={m}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={m.scenarios.length}
        moment={prefilled?.revise}
        isLast={step.idx === m.scenarios.length - 1}
        onContinue={next}
      />
    );
  return null;
}

// =================== Task: per-scenario retrospective ===================
// Shown after each scenario's revise when the task defines
// perScenarioRetrospective questions. The same question set repeats for
// every scenario; answers persist locally keyed by scenario+question.

function ScenarioRetroStep({
  question,
  boxHeight,
  scenarioTitle,
  scenarioIdx,
  totalScenarios,
  questionIdx,
  totalQuestions,
  value,
  onChange,
  onContinue,
  continueLabel,
}: {
  question: string;
  boxHeight: number;
  scenarioTitle: string;
  scenarioIdx: number;
  totalScenarios: number;
  questionIdx: number;
  totalQuestions: number;
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  return (
    <div className="flex-1 flex justify-center overflow-hidden min-h-0">
      <section className="max-w-2xl w-full flex flex-col gap-4 overflow-y-auto pr-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          {scenarioTitle} · Scenario {scenarioIdx + 1} of {totalScenarios} ·
          Retrospective Q{questionIdx + 1} of {totalQuestions}
        </p>
        <p className="text-lg leading-relaxed whitespace-pre-wrap">{question}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-[var(--rule)] p-3 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)] leading-relaxed resize-y"
          style={{ minHeight: `${Math.max(boxHeight, 1) * 80}px` }}
          placeholder="Reflect on your reasoning…"
        />
        <div className="pt-2">
          <ContinueButton onClick={onContinue} label={continueLabel} />
        </div>
      </section>
    </div>
  );
}

// =========================== Retrospective ===========================
// One question per screen. Spec textarea + entity/element table render as
// read-only so the participant can see what they wrote while answering.

function RetrospectiveRunner({
  projectId,
  project,
  module: m,
  save,
  onComplete,
  initialStepIdx,
  controlled = false,
  onAdvance,
}: {
  projectId: string;
  project: LoadedProject;
  module: RetrospectiveReportModule;
  save: SaveAdapter;
  onComplete: () => void;
  // Preview-mode hooks: see ThinkAloudWarmupRunner for semantics.
  initialStepIdx?: number;
  controlled?: boolean;
  onAdvance?: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(initialStepIdx ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const key = `pf:${projectId}:${m.id}:answers`;

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      try {
        setAnswers(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(key, JSON.stringify(answers));
  }, [key, answers, hydrated]);

  // Source spec/entities come from the dedicated `last_*` pointer keys
  // written by writeLastSpecPointer when the previous task module finished.
  // If the participant skipped the task or is running the retrospective
  // standalone, the keys will be missing and we render a "no specification
  // recorded" placeholder.
  const [latestSpec, setLatestSpec] = useState<string>('');
  const [latestEntities, setLatestEntities] = useState<Entity[]>([]);
  const [sourceModuleId, setSourceModuleId] = useState<string | null>(null);
  useEffect(() => {
    const spec = window.localStorage.getItem(`pf:${projectId}:last_spec`);
    const entitiesRaw = window.localStorage.getItem(
      `pf:${projectId}:last_entities`,
    );
    const srcId = window.localStorage.getItem(
      `pf:${projectId}:last_task_module_id`,
    );
    if (spec !== null) setLatestSpec(spec);
    if (entitiesRaw !== null) {
      try {
        const parsed = JSON.parse(entitiesRaw) as Entity[];
        if (Array.isArray(parsed)) setLatestEntities(parsed);
      } catch {
        /* ignore */
      }
    }
    if (srcId) setSourceModuleId(srcId);
  }, [projectId]);

  // Resolve the source module's label so the locked spec block can be
  // titled "Specification from Module N — <title>".
  const sourceModuleCaption = useMemo(() => {
    if (!sourceModuleId) return null;
    const idx = project.content.modules.findIndex(
      (mod) => mod.id === sourceModuleId,
    );
    if (idx < 0) return null;
    const mod = project.content.modules[idx];
    const title =
      'title' in mod && typeof mod.title === 'string' && mod.title.length > 0
        ? mod.title
        : MODULE_TYPE_LABEL[mod.type];
    return `Specification from Module ${idx + 1} — ${title}`;
  }, [sourceModuleId, project.content.modules]);

  const specHasContent = latestSpec.length > 0 || latestEntities.length > 0;

  // Per-question debounced save
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  function updateAnswer(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }));
    if (debounceTimers.current[qid])
      clearTimeout(debounceTimers.current[qid]);
    debounceTimers.current[qid] = setTimeout(() => {
      save.upsert(`retro:${qid}`, value);
      save.recordEvent('retro_edit', {
        questionId: qid,
        value,
        client_ts: new Date().toISOString(),
      });
      setSavedAt((prev) => ({
        ...prev,
        [qid]: new Date().toLocaleTimeString([], { hour12: false }),
      }));
    }, 1000);
  }

  const total = m.questions.length;
  // Edge case: empty retrospective module — auto-advance. Hoisted above the
  // early return so the hook always runs in the same order.
  useEffect(() => {
    if (total === 0) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (total === 0) return null;

  const q = m.questions[stepIdx];

  function advance() {
    if (stepIdx === total - 1) {
      save.recordEvent('retro_submit', { answers });
      if (controlled) onAdvance?.();
      else onComplete();
    } else {
      save.recordEvent('step_advance', {
        from: `retro_${stepIdx}`,
        to: `retro_${stepIdx + 1}`,
      });
      if (controlled) onAdvance?.();
      else setStepIdx((i) => i + 1);
    }
  }

  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize="50%" minSize="30%" maxSize="70%">
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <header>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Retrospective · Question {stepIdx + 1} of {total}
            </p>
            <h2 className="text-2xl font-medium tracking-tight mt-1">
              {m.title}
            </h2>
          </header>
          <div>
            <p className="leading-relaxed mb-2">
              <strong>{stepIdx + 1}.</strong> {q.text}
            </p>
            <div className="flex justify-end mb-1">
              <SavedHint at={savedAt[q.id] ?? null} />
            </div>
            <textarea
              value={answers[q.id] ?? ''}
              onChange={(e) => updateAnswer(q.id, e.target.value)}
              className="w-full border border-[var(--rule)] p-3 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)] leading-relaxed resize-y"
              style={{ minHeight: `${Math.max(q.boxHeight, 1) * 80}px` }}
              placeholder="Reflect on your reasoning…"
            />
            <div className="pt-3">
              <ContinueButton
                onClick={advance}
                label={stepIdx === total - 1 ? 'Submit' : 'Next question'}
              />
            </div>
          </div>
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize="50%" minSize="30%" maxSize="70%">
        <div className="h-full flex flex-col gap-2 overflow-y-auto min-h-0 pl-3">
          {sourceModuleCaption && (
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {sourceModuleCaption}
            </p>
          )}
          {specHasContent ? (
            <SpecColumn
              spec={latestSpec}
              setSpec={() => {}}
              entities={latestEntities}
              setEntities={() => {}}
              specSavedAt={null}
              entitiesSavedAt={null}
              readOnly
              headerNote="Your specification (read-only during retrospective)"
            />
          ) : (
            <div className="border border-dashed border-[var(--rule)] bg-[var(--rule-soft)] p-6 text-sm italic text-[var(--muted)]">
              (no specification recorded)
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}

// ========================= Shared sub-components ========================

// Spec column = a single white pad containing the entity/element table on
// top, an ASCII divider, then the free-form spec textarea. The pad has a
// single bg-white container so the visual reads as one continuous
// "specification surface". readOnly turns every input non-interactive.
function SpecColumn({
  spec,
  setSpec,
  entities,
  setEntities,
  specSavedAt,
  entitiesSavedAt,
  onContinue,
  continueLabel = 'Continue',
  readOnly = false,
  leadIn,
  headerNote,
  placeholder,
}: {
  spec: string;
  setSpec: (v: string) => void;
  entities: Entity[];
  setEntities: (next: Entity[]) => void;
  specSavedAt: string | null;
  entitiesSavedAt: string | null;
  onContinue?: () => void;
  continueLabel?: string;
  readOnly?: boolean;
  leadIn?: React.ReactNode;
  headerNote?: string;
  // Grey italic caption above the spec textarea. `undefined` → default
  // SPEC_PLACEHOLDER; empty string → caption hidden (researcher cleared it).
  placeholder?: string;
}) {
  const padBg = readOnly ? 'bg-[var(--rule-soft)]' : 'bg-white';
  const caption = placeholder === undefined ? SPEC_PLACEHOLDER : placeholder;
  return (
    <section className="h-full flex flex-col gap-2 overflow-y-auto min-h-0 pl-3">
      {leadIn}
      <div className="flex justify-between items-baseline">
        <PanelLabel>
          {headerNote ?? (readOnly ? 'Specifications (read-only)' : 'Specifications')}
        </PanelLabel>
        <SavedHint at={specSavedAt} />
      </div>
      <div className={'border border-[var(--rule)] ' + padBg + ' p-3 flex flex-col gap-2'}>
        <div className="flex justify-between items-baseline">
          <PanelLabel>Entities &amp; Elements</PanelLabel>
          <SavedHint at={entitiesSavedAt} />
        </div>
        <EntityElementGrid
          value={entities}
          onChange={setEntities}
          readOnly={readOnly}
        />
        <p
          className="font-mono text-[10px] tracking-tighter text-[var(--muted)] select-none leading-none my-2"
          aria-hidden
        >
          ================================================
        </p>
        {caption && (
          <p className="text-xs italic text-[var(--muted)] leading-relaxed">
            {caption}
          </p>
        )}
        <textarea
          value={spec}
          onChange={(e) => !readOnly && setSpec(e.target.value)}
          readOnly={readOnly}
          className={
            'border-0 p-0 text-[15px] leading-relaxed resize-y focus:outline-none font-mono min-h-[14rem] w-full bg-transparent ' +
            (readOnly ? 'cursor-default' : '')
          }
        />
      </div>
      {onContinue && (
        <div className="pt-2">
          <ContinueButton onClick={onContinue} label={continueLabel} />
        </div>
      )}
    </section>
  );
}

// ENTITIES & ELEMENTS — 1:m editor rendered as a 3-column grid of cards.
// On overflow rows wrap; the "+ entity" tile sits as the final card so it
// rides the grid rhythm. readOnly disables every input + the add tile.
function EntityElementGrid({
  value,
  onChange,
  readOnly = false,
}: {
  value: Entity[];
  onChange: (next: Entity[]) => void;
  readOnly?: boolean;
}) {
  function addEntity() {
    onChange([...value, { id: uid(), name: '', elements: [] }]);
  }
  function updateEntity(i: number, patch: Partial<Entity>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function removeEntity(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function addElement(i: number) {
    const next = value.slice();
    next[i] = {
      ...next[i],
      elements: [...next[i].elements, { id: uid(), name: '' }],
    };
    onChange(next);
  }
  function updateElement(i: number, ei: number, patch: Partial<EntityElement>) {
    const next = value.slice();
    const elems = next[i].elements.slice();
    elems[ei] = { ...elems[ei], ...patch };
    next[i] = { ...next[i], elements: elems };
    onChange(next);
  }
  function removeElement(i: number, ei: number) {
    const next = value.slice();
    next[i] = {
      ...next[i],
      elements: next[i].elements.filter((_, idx) => idx !== ei),
    };
    onChange(next);
  }

  if (readOnly && value.length === 0) {
    return (
      <p className="text-xs italic text-[var(--muted)]">
        (no entities recorded)
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {value.map((ent, i) => (
        <div
          key={ent.id}
          className="border border-[var(--rule)] p-2 flex flex-col gap-1 bg-[var(--background)]"
        >
          <div className="flex gap-1 items-center">
            <input
              value={ent.name}
              onChange={(e) => updateEntity(i, { name: e.target.value })}
              readOnly={readOnly}
              placeholder="Entity"
              className={
                'flex-1 min-w-0 border-0 border-b border-dashed border-[var(--rule)] py-1 bg-transparent text-sm focus:outline-none focus:border-[var(--accent)] ' +
                (readOnly ? 'cursor-default' : '')
              }
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeEntity(i)}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)] shrink-0"
                aria-label="Remove entity"
              >
                ×
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            {ent.elements.map((el, ei) => (
              <li key={el.id} className="flex gap-1 items-center text-sm">
                <span className="text-[var(--muted)] shrink-0">·</span>
                <input
                  value={el.name}
                  onChange={(e) =>
                    updateElement(i, ei, { name: e.target.value })
                  }
                  readOnly={readOnly}
                  placeholder="element"
                  className={
                    'flex-1 min-w-0 border-0 border-b border-dashed border-[var(--rule)] py-0.5 bg-transparent text-sm focus:outline-none focus:border-[var(--accent)] ' +
                    (readOnly ? 'cursor-default' : '')
                  }
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeElement(i, ei)}
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--danger)] shrink-0"
                    aria-label="Remove element"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <button
              type="button"
              onClick={() => addElement(i)}
              className="text-[11px] italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-2 py-0.5 self-start mt-1"
            >
              + element
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={addEntity}
          className="border border-dashed border-[var(--rule)] p-2 text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] flex items-center justify-center min-h-[3rem]"
        >
          + entity
        </button>
      )}
    </div>
  );
}

function RequirementsBlock({
  requirements,
  compact = false,
}: {
  requirements: Requirement[];
  compact?: boolean;
}) {
  if (requirements.length === 0) return null;
  return (
    <div>
      <PanelLabel>Requirements</PanelLabel>
      <ol
        className={
          'list-decimal pl-5 space-y-1 leading-relaxed mt-1 ' +
          (compact ? 'text-sm' : '')
        }
      >
        {requirements.map((r) => (
          <li key={r.id}>
            As a {r.role || <em>role</em>}, I want{' '}
            {r.want || <em>capability</em>}, so that{' '}
            {r.so || <em>purpose</em>}.
          </li>
        ))}
      </ol>
    </div>
  );
}

function ClauseList({
  clauses,
  highlightable = false,
}: {
  clauses: Scenario['clauses'];
  highlightable?: boolean;
}) {
  return (
    <div
      className={
        'space-y-1 leading-relaxed ' +
        (highlightable ? 'selection:bg-[#fffbea]' : '')
      }
    >
      {clauses.map((c, ci) => (
        <p key={c.id}>
          <strong>{c.type}</strong> {c.text}
          {ci === clauses.length - 1 ? '.' : ','}
        </p>
      ))}
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </h3>
  );
}

function ContinueButton({
  onClick,
  label = 'Continue',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[var(--foreground)] px-6 py-2 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
    >
      {label}
    </button>
  );
}
