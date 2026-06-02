'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  TaskContent,
  TaskExample,
  PrefilledMoment,
  ThinkAloudWarmupModule,
  RetrospectiveReportModule,
  Requirement,
  Scenario,
  Entity,
  Element as EntityElement,
} from '@/lib/types/study';
import {
  MODULE_TYPE_LABEL,
  uid,
  DEFAULT_WARMUP_COPY,
  DEFAULT_TASK_COPY,
} from '@/lib/types/study';
import {
  recordEventAction,
  upsertResponseAction,
  finishStudyAction,
  participantLogoutAction,
} from '@/app/study/actions';
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

const SPEC_PLACEHOLDER =
  'Specify the rules, types of information, behavior, features, and implementation of the system however feels natural to you. This may include inputs/outputs, data types, pseudocode, prompts to an LLM coding agent, or anything else that feels natural.';

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

// ============================== Top-level ==============================

export default function ParticipantFlow({
  project,
  participantId = null,
  previewMode = false,
}: {
  project: LoadedProject;
  participantId?: string | null;
  // Preview mode: full-fidelity participant rendering driven by an external
  // screen index. Wrapper exposes Prev/Next/Jump controls and the runners
  // remount on screen change instead of advancing internal state. NEVER
  // pass true on the live /study route — it disables sequential persistence.
  previewMode?: boolean;
}) {
  if (previewMode) {
    return <PreviewParticipantFlow project={project} />;
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

function screenToWarmupPhase(screen: Screen): WarmupPhase {
  switch (screen.kind) {
    case 'warmup_example_intro':
      return 'example_intro';
    case 'warmup_example_body':
      return 'example_body';
    case 'warmup_example_revealed':
      return 'example_revealed';
    case 'warmup_intro':
      return 'intro';
    case 'warmup_body':
      return 'body';
    case 'warmup_revealed':
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
    case 'task_example_intro':
      return { kind: 'example_intro' };
    case 'task_example_initial_spec':
      return { kind: 'example_initial_spec' };
    case 'task_example_scenario_read':
      return { kind: 'example_scenario_read', idx };
    case 'task_example_scenario_ponder':
      return { kind: 'example_scenario_ponder', idx };
    case 'task_example_scenario_revise':
      return { kind: 'example_scenario_revise', idx };
    default:
      return { kind: 'intro' };
  }
}

function PreviewParticipantFlow({ project }: { project: LoadedProject }) {
  // Drop globals — those are real /register and /onboard pages, not
  // ParticipantFlow screens. The preview lets you navigate module screens
  // with full participant fidelity.
  const screens = useMemo(
    () =>
      enumerateScreens(project.content).filter(
        (s) => s.moduleType !== 'global',
      ),
    [project.content],
  );

  // Map screen.key -> local index within its module (1-based) for the M.N
  // screen-ID display. ID stays stable across module reorders because it's
  // derived from the current module list, not the screen kind.
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

  if (!screen) {
    return (
      <Shell projectName={project.name}>
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

  const moduleIdx = project.content.modules.findIndex(
    (mod) => mod.id === screen.moduleId,
  );
  const m = project.content.modules[moduleIdx];
  if (!m) {
    return (
      <Shell projectName={project.name}>
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
  // No persistence in preview — pass a null participantId so makeSaveAdapter
  // returns a no-op adapter. Spec/entities still hit localStorage via
  // useLocalString/useLocalEntities, which is the desired behavior because
  // the researcher can type into the preview to feel out the participant flow.
  const save = makeSaveAdapter(null, m.id, true);
  const advance = () =>
    setScreenIdx((i) => Math.min(screens.length - 1, i + 1));

  return (
    <Shell
      projectName={project.name}
      moduleLabel={MODULE_TYPE_LABEL[m.type]}
      moduleNumber={moduleIdx + 1}
      total={project.content.modules.length}
      previewControls={
        <PreviewControls
          screens={screens}
          screenIdx={screenIdx}
          setScreenIdx={setScreenIdx}
          screenId={screenId}
          localIndex={localIndex}
        />
      }
    >
      {m.type === 'think_aloud_warmup' ? (
        <ThinkAloudWarmupRunner
          key={screen.key}
          projectId={project.id}
          module={m}
          save={save}
          onComplete={advance}
          initialPhase={screenToWarmupPhase(screen)}
          controlled
          onAdvance={advance}
        />
      ) : m.type === 'task' || m.type === 'task_warmup' ? (
        <TaskRunner
          key={screen.key}
          projectId={project.id}
          participantId={null}
          module={m}
          moduleNumber={moduleIdx + 1}
          total={project.content.modules.length}
          isWarmup={m.type === 'task_warmup'}
          save={save}
          onComplete={advance}
          initialStep={screenToTaskStep(screen)}
          controlled
          onAdvance={advance}
        />
      ) : m.type === 'retrospective_report' ? (
        <RetrospectiveRunner
          key={screen.key}
          projectId={project.id}
          project={project}
          module={m}
          save={save}
          onComplete={advance}
          initialStepIdx={screen.idx ?? 0}
          controlled
          onAdvance={advance}
        />
      ) : null}
    </Shell>
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
  children,
}: {
  projectName: string;
  moduleLabel?: string;
  moduleNumber?: number;
  total?: number;
  showSignOut?: boolean;
  previewControls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--panel)] px-6 py-3 flex justify-between items-center gap-4 flex-wrap">
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
      <main className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        {children}
      </main>
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
}: {
  project: LoadedProject;
  participantId: string | null;
  module: Module;
  moduleNumber: number;
  total: number;
  onComplete: () => void;
}) {
  const projectId = project.id;
  const skipPersist = m.type === 'task_warmup';
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
      />
    );
  return null;
}

// =========================== Think-aloud warmup =========================

// Warmup phases — declared at module level so the preview wrapper can
// translate screen.kind -> Phase without duplicating the union.
type WarmupPhase =
  | 'example_intro'
  | 'example_body'
  | 'example_revealed'
  | 'intro'
  | 'body'
  | 'revealed';

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
  // Resolve overridable copy with fallback to defaults. Every render reads
  // through `copy.*` — never read DEFAULT_WARMUP_COPY directly downstream.
  const copy = {
    introTitle: m.copy?.introTitle?.trim() || DEFAULT_WARMUP_COPY.introTitle,
    introBody: m.copy?.introBody?.trim() || DEFAULT_WARMUP_COPY.introBody,
    revealButtonLabel:
      m.copy?.revealButtonLabel?.trim() || DEFAULT_WARMUP_COPY.revealButtonLabel,
    postRevealCallout:
      m.copy?.postRevealCallout?.trim() || DEFAULT_WARMUP_COPY.postRevealCallout,
    answerInputLabel:
      m.copy?.answerInputLabel?.trim() || DEFAULT_WARMUP_COPY.answerInputLabel,
  };
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
  // Example phases come first when authored; then the real 3-phase flow.
  type Phase = WarmupPhase;
  const initial: Phase =
    initialPhase ?? (m.example ? 'example_intro' : 'intro');
  const [phase, setPhase] = useState<Phase>(initial);

  function advanceTo(next: Phase) {
    save.recordEvent('step_advance', { from: phase, to: next });
    if (controlled) {
      onAdvance?.();
    } else {
      setPhase(next);
    }
  }

  function finish() {
    save.recordEvent('step_advance', { from: phase, to: 'done' });
    if (controlled) {
      onAdvance?.();
    } else {
      onComplete();
    }
  }

  // ============ Example phases ============
  if (phase === 'example_intro' && m.example) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ExampleBanner />
        <Centered>
          <h2 className="text-2xl font-medium tracking-tight mb-4">
            {copy.introTitle}
          </h2>
          <p className="text-[var(--muted)] leading-relaxed mb-8">
            The researcher will demonstrate the think-aloud method.
          </p>
          <ContinueButton onClick={() => advanceTo('example_body')} />
        </Centered>
      </div>
    );
  }

  if ((phase === 'example_body' || phase === 'example_revealed') && m.example) {
    const ex = m.example;
    const revealed = phase === 'example_revealed';
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ExampleBanner />
        <div className="flex-1 flex justify-center overflow-hidden min-h-0">
          <div className="max-w-2xl w-full flex flex-col gap-4 overflow-hidden">
            <section className="flex flex-col gap-4 overflow-y-auto pr-1 h-full">
              <h2 className="text-2xl font-medium tracking-tight">{m.title}</h2>
              {ex.altTaskDescription && (
                <p className="italic text-[var(--muted)] leading-relaxed">
                  {ex.altTaskDescription}
                </p>
              )}
              {ex.altBody && (
                <p className="leading-relaxed whitespace-pre-wrap">
                  {ex.altBody}
                </p>
              )}
              {revealed && ex.altRevealedTask && (
                <div className="mt-2 border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
                    Task
                  </p>
                  <p className="font-mono text-3xl tracking-[0.4em]">
                    {ex.altRevealedTask}
                  </p>
                </div>
              )}
              {ex.walkthroughText && (
                <div className="border border-dashed border-[var(--rule)] bg-[var(--panel)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                    Researcher narrates
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm">
                    {ex.walkthroughText}
                  </p>
                </div>
              )}
              <div className="mt-auto pt-4 flex gap-3">
                {phase === 'example_body' && (
                  <ContinueButton
                    onClick={() => advanceTo('example_revealed')}
                    label="Reveal example task"
                  />
                )}
                {phase === 'example_revealed' && (
                  <ContinueButton
                    onClick={() => advanceTo('intro')}
                    label="Continue to real warmup"
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ============ Real phases ============
  if (phase === 'intro') {
    return (
      <Centered>
        <h2 className="text-2xl font-medium tracking-tight mb-4">
          {copy.introTitle}
        </h2>
        <p className="text-[var(--muted)] leading-relaxed mb-8 whitespace-pre-wrap">
          {copy.introBody}
        </p>
        <ContinueButton onClick={() => advanceTo('body')} />
      </Centered>
    );
  }

  return (
    <div className="flex-1 flex justify-center overflow-hidden min-h-0">
      <div className="max-w-2xl w-full flex flex-col gap-4 overflow-hidden">
        <section className="flex flex-col gap-4 overflow-y-auto pr-1 h-full">
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
            <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
              {copy.postRevealCallout}
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
                {copy.revealButtonLabel}
              </button>
            )}
            {phase === 'revealed' && <ContinueButton onClick={finish} />}
          </div>
        </section>
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
  // Example variants — only ever entered when module.example is present
  | { kind: 'example_intro' }
  | { kind: 'example_initial_spec' }
  | { kind: 'example_scenario_read'; idx: number }
  | { kind: 'example_scenario_ponder'; idx: number }
  | { kind: 'example_scenario_revise'; idx: number };

function stepLabel(s: TaskStep): string {
  if (s.kind === 'scenario_read') return `scenario_${s.idx}_read`;
  if (s.kind === 'scenario_ponder') return `scenario_${s.idx}_ponder`;
  if (s.kind === 'scenario_revise') return `scenario_${s.idx}_revise`;
  if (s.kind === 'example_scenario_read') return `example_scenario_${s.idx}_read`;
  if (s.kind === 'example_scenario_ponder')
    return `example_scenario_${s.idx}_ponder`;
  if (s.kind === 'example_scenario_revise')
    return `example_scenario_${s.idx}_revise`;
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
  const example: TaskExample | undefined =
    m.type === 'task_warmup' ? m.example : undefined;

  const [step, setStep] = useState<TaskStep>(initialStep ?? { kind: 'intro' });
  const [spec, setSpec] = useLocalString(`pf:${projectId}:${m.id}:spec`);
  const [entities, setEntities] = useLocalEntities(
    `pf:${projectId}:${m.id}:entities`,
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

  function next(): void {
    // Example phases
    if (step.kind === 'example_intro') {
      return transitionTo({ kind: 'example_initial_spec' });
    }
    if (step.kind === 'example_initial_spec') {
      return transitionTo({ kind: 'example_scenario_read', idx: 0 });
    }
    if (step.kind === 'example_scenario_read') {
      return transitionTo({ kind: 'example_scenario_ponder', idx: step.idx });
    }
    if (step.kind === 'example_scenario_ponder') {
      return transitionTo({ kind: 'example_scenario_revise', idx: step.idx });
    }
    if (step.kind === 'example_scenario_revise') {
      const nextIdx = step.idx + 1;
      if (example && nextIdx >= example.scenarios.length) {
        return transitionTo({ kind: 'context' });
      }
      return transitionTo({ kind: 'example_scenario_read', idx: nextIdx });
    }
    // Real phases
    if (step.kind === 'intro') {
      // If example present, jump into example intro first.
      if (example) {
        return transitionTo({ kind: 'example_intro' });
      }
      return transitionTo({ kind: 'context' });
    }
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
      const nextIdx = step.idx + 1;
      if (nextIdx >= t.scenarios.length) {
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
      return transitionTo({ kind: 'scenario_read', idx: nextIdx });
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

  // ============ Example steps ============
  if (step.kind === 'example_intro') {
    if (!example) {
      onComplete();
      return null;
    }
    return <ExampleIntroStep onContinue={next} />;
  }

  if (step.kind === 'example_initial_spec') {
    if (!example) {
      onComplete();
      return null;
    }
    return (
      <ExampleInitialSpecStep
        example={example}
        onContinue={next}
      />
    );
  }

  if (
    step.kind === 'example_scenario_read' ||
    step.kind === 'example_scenario_revise'
  ) {
    if (!example) {
      // Defensive — shouldn't enter without an example.
      onComplete();
      return null;
    }
    const scenario = example.scenarios[step.idx];
    if (!scenario) {
      // Index out of bounds — defer the jump until after render to keep
      // setState off the render path. queueMicrotask is fine here.
      queueMicrotask(() => transitionTo({ kind: 'context' }));
      return null;
    }
    const prefilled = example.prefilled.perScenario[step.idx];
    return step.kind === 'example_scenario_read' ? (
      <ExampleScenarioReadStep
        example={example}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={example.scenarios.length}
        moment={prefilled?.read}
        onContinue={next}
      />
    ) : (
      <ExampleScenarioReviseStep
        example={example}
        scenario={scenario}
        scenarioIdx={step.idx}
        totalScenarios={example.scenarios.length}
        moment={prefilled?.revise}
        isLast={step.idx === example.scenarios.length - 1}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'example_scenario_ponder') {
    const perScenario = example?.prefilled.perScenario[step.idx];
    return (
      <PonderStep
        scenarioIdx={step.idx}
        totalScenarios={example?.scenarios.length ?? 0}
        taskCopy={t.copy}
        onContinue={next}
        isExample
        copyOverride={perScenario?.ponderCopy}
      />
    );
  }

  // ============ Real task steps ============
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
        isLast={step.idx === t.scenarios.length - 1}
        projectId={projectId}
        moduleId={m.id}
        save={save}
        onContinue={next}
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
        <Panel defaultSize={33} minSize={20} maxSize={50}>
          <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
            <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
            <RequirementsBlock requirements={t.requirements} />
          </section>
        </Panel>
        <SplitHandle />
        <Panel defaultSize={67} minSize={50} maxSize={80}>
          <SpecColumn
            spec={spec}
            setSpec={setSpec}
            entities={entities}
            setEntities={setEntities}
            specSavedAt={specSavedAt}
            entitiesSavedAt={entitiesSavedAt}
            onContinue={onContinue}
            continueLabel="Next"
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
      <Panel defaultSize={55} minSize={30} maxSize={75}>
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
      <Panel defaultSize={45} minSize={25} maxSize={70}>
        <SpecColumn
          spec={spec}
          setSpec={setSpec}
          entities={entities}
          setEntities={setEntities}
          specSavedAt={specSavedAt}
          entitiesSavedAt={entitiesSavedAt}
          onContinue={onContinue}
          continueLabel="Continue"
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
      <Panel defaultSize={55} minSize={30} maxSize={75}>
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
      <Panel defaultSize={45} minSize={25} maxSize={70}>
        <SpecColumn
          spec={spec}
          setSpec={setSpec}
          entities={entities}
          setEntities={setEntities}
          specSavedAt={specSavedAt}
          entitiesSavedAt={entitiesSavedAt}
          onContinue={onContinue}
          continueLabel={isLast ? 'Finish task' : 'Next scenario'}
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

function ExampleIntroStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExampleBanner />
      <Centered>
        <div className="space-y-6">
          <h2 className="text-3xl font-medium tracking-tight">
            Example — the researcher will demonstrate this task.
          </h2>
          <p className="text-[var(--muted)] leading-relaxed">
            Watch as the researcher walks through this practice task. You will
            complete a similar one yourself afterward.
          </p>
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
          <Panel defaultSize={33} minSize={20} maxSize={50}>
            <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
              <h2 className="text-2xl font-medium tracking-tight">
                {example.title}
              </h2>
              <RequirementsBlock requirements={example.requirements} />
            </section>
          </Panel>
          <SplitHandle />
          <Panel defaultSize={67} minSize={50} maxSize={80}>
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
        <Panel defaultSize={55} minSize={30} maxSize={75}>
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
        <Panel defaultSize={45} minSize={25} maxSize={70}>
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
        <Panel defaultSize={55} minSize={30} maxSize={75}>
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
        <Panel defaultSize={45} minSize={25} maxSize={70}>
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
      <Panel defaultSize={50} minSize={30} maxSize={70}>
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
      <Panel defaultSize={50} minSize={30} maxSize={70}>
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
}) {
  const padBg = readOnly ? 'bg-[var(--rule-soft)]' : 'bg-white';
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
        <p className="text-xs italic text-[var(--muted)] leading-relaxed">
          {SPEC_PLACEHOLDER}
        </p>
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
