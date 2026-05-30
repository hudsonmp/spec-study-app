'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import type {
  LoadedProject,
  Module,
  TaskContent,
  ThinkAloudWarmupModule,
  RetrospectiveReportModule,
  Requirement,
  Scenario,
} from '@/lib/types/study';
import { MODULE_TYPE_LABEL } from '@/lib/types/study';
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
}: {
  project: LoadedProject;
  participantId?: string | null;
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
        projectId={project.id}
        participantId={participantId}
        module={m}
        moduleNumber={moduleIdx + 1}
        total={total}
        onComplete={() => setModuleIdx((i) => i + 1)}
      />
    </Shell>
  );
}

// ============================== Shell / Header =============================

function Shell({
  projectName,
  moduleLabel,
  moduleNumber,
  total,
  showSignOut = false,
  children,
}: {
  projectName: string;
  moduleLabel?: string;
  moduleNumber?: number;
  total?: number;
  showSignOut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--panel)] px-6 py-3 flex justify-between items-baseline">
        <div className="flex items-baseline gap-3">
          <UtcClock />
          <h1 className="text-lg font-medium tracking-tight">{projectName}</h1>
        </div>
        <div className="flex items-baseline gap-4">
          {moduleLabel && moduleNumber && total && (
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Module {moduleNumber} of {total} · {moduleLabel}
            </span>
          )}
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

// ============================== Module dispatch =============================

function ModuleRunner({
  projectId,
  participantId,
  module: m,
  moduleNumber,
  total,
  onComplete,
}: {
  projectId: string;
  participantId: string | null;
  module: Module;
  moduleNumber: number;
  total: number;
  onComplete: () => void;
}) {
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
        module={m}
        save={save}
        onComplete={complete}
      />
    );
  return null;
}

// =========================== Think-aloud warmup =========================

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
  const [scratch, setScratch] = useLocalString(
    `pf:${projectId}:${m.id}:scratch`,
  );
  const [scratchSavedAt, markScratchSaved] = useSavedAt();
  useDebouncedSave(scratch, (v) => {
    save.upsert('scratchpad:current', v);
    save.recordEvent('scratchpad_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markScratchSaved();
  });

  function next() {
    save.recordEvent('scratchpad_snapshot', {
      at: 'warmup_end',
      value: scratch,
    });
    save.recordEvent('step_advance', { from: 'body', to: 'done' });
    onComplete();
  }

  return (
    <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden min-h-0">
      <ScratchpadColumn
        value={scratch}
        onChange={setScratch}
        savedAt={scratchSavedAt}
      />
      <section className="col-span-2 flex flex-col gap-4 overflow-y-auto pr-1">
        <h2 className="text-2xl font-medium tracking-tight">{m.title}</h2>
        {m.taskDescription && (
          <p className="italic text-[var(--muted)] leading-relaxed">
            {m.taskDescription}
          </p>
        )}
        {m.body && (
          <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
        )}
        {m.mandatory && (
          <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
            Please complete this warmup before continuing.
          </p>
        )}
        <div className="mt-auto pt-4">
          <ContinueButton onClick={next} />
        </div>
      </section>
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
  | { kind: 'scenario_revise'; idx: number };

function stepLabel(s: TaskStep): string {
  if (s.kind === 'scenario_read') return `scenario_${s.idx}_read`;
  if (s.kind === 'scenario_ponder') return `scenario_${s.idx}_ponder`;
  if (s.kind === 'scenario_revise') return `scenario_${s.idx}_revise`;
  return s.kind;
}

function TaskRunner({
  projectId,
  module: m,
  moduleNumber,
  total,
  isWarmup,
  save,
  onComplete,
}: {
  projectId: string;
  module: Extract<Module, { type: 'task' | 'task_warmup' }>;
  moduleNumber: number;
  total: number;
  isWarmup: boolean;
  save: SaveAdapter;
  onComplete: () => void;
}) {
  const t: TaskContent = m;
  const [step, setStep] = useState<TaskStep>({ kind: 'intro' });
  const [scratch, setScratch] = useLocalString(
    `pf:${projectId}:${m.id}:scratch`,
  );
  const [spec, setSpec] = useLocalString(`pf:${projectId}:${m.id}:spec`);

  const [scratchSavedAt, markScratchSaved] = useSavedAt();
  const [specSavedAt, markSpecSaved] = useSavedAt();

  useDebouncedSave(scratch, (v) => {
    save.upsert('scratchpad:current', v);
    save.recordEvent('scratchpad_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markScratchSaved();
  });
  useDebouncedSave(spec, (v) => {
    save.upsert('spec:current', v);
    save.recordEvent('spec_edit', {
      value: v,
      client_ts: new Date().toISOString(),
    });
    markSpecSaved();
  });

  function transitionTo(nextStep: TaskStep) {
    save.recordEvent('step_advance', {
      from: stepLabel(step),
      to: stepLabel(nextStep),
    });
    setStep(nextStep);
  }

  function next(): void {
    if (step.kind === 'intro') return transitionTo({ kind: 'context' });
    if (step.kind === 'context')
      return transitionTo({ kind: 'initial_spec' });
    if (step.kind === 'initial_spec') {
      // Snapshot the initial spec before scenarios begin.
      save.recordEvent('spec_snapshot', { at: 'initial', value: spec });
      save.recordEvent('scratchpad_snapshot', {
        at: 'initial',
        value: scratch,
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
      save.recordEvent('scratchpad_snapshot', {
        at: `after_scenario_${step.idx}`,
        value: scratch,
      });
      const nextIdx = step.idx + 1;
      if (nextIdx >= t.scenarios.length) {
        // Final snapshot — last spec
        save.recordEvent('spec_snapshot', { at: 'final', value: spec });
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
        onContinue={next}
      />
    );
  }

  if (step.kind === 'context') {
    return (
      <ContextStep
        t={t}
        scratch={scratch}
        setScratch={setScratch}
        scratchSavedAt={scratchSavedAt}
        onContinue={next}
      />
    );
  }

  if (step.kind === 'initial_spec') {
    return (
      <InitialSpecStep
        t={t}
        scratch={scratch}
        setScratch={setScratch}
        spec={spec}
        setSpec={setSpec}
        scratchSavedAt={scratchSavedAt}
        specSavedAt={specSavedAt}
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
        scratch={scratch}
        setScratch={setScratch}
        spec={spec}
        scratchSavedAt={scratchSavedAt}
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
        scratch={scratch}
        setScratch={setScratch}
        spec={spec}
        setSpec={setSpec}
        scratchSavedAt={scratchSavedAt}
        specSavedAt={specSavedAt}
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
  onContinue,
}: {
  moduleNumber: number;
  total: number;
  isWarmup: boolean;
  title: string;
  onContinue: () => void;
}) {
  return (
    <Centered>
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          Module {moduleNumber} of {total}
        </p>
        <h2 className="text-3xl font-medium tracking-tight">{title}</h2>
        <p
          className={
            'text-sm italic px-4 py-3 ' +
            (isWarmup
              ? 'text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a]'
              : 'text-[var(--muted)] bg-[var(--panel)] border border-[var(--rule)]')
          }
        >
          {isWarmup
            ? 'This is a warmup task. Your responses are not saved or analyzed; they are practice only.'
            : 'Your responses for this task will be saved and included in the study analysis.'}
        </p>
        <ContinueButton onClick={onContinue} />
      </div>
    </Centered>
  );
}

// ============================ Task: Context step ===========================

function ContextStep({
  t,
  scratch,
  setScratch,
  scratchSavedAt,
  onContinue,
}: {
  t: TaskContent;
  scratch: string;
  setScratch: (v: string) => void;
  scratchSavedAt: string | null;
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden min-h-0">
      <ScratchpadColumn
        value={scratch}
        onChange={setScratch}
        savedAt={scratchSavedAt}
      />
      <section className="col-span-2 flex flex-col gap-4 overflow-y-auto pr-1">
        <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
        <ContextBlock context={t.studyContext} />
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
  scratch,
  setScratch,
  spec,
  setSpec,
  scratchSavedAt,
  specSavedAt,
  onContinue,
}: {
  t: TaskContent;
  scratch: string;
  setScratch: (v: string) => void;
  spec: string;
  setSpec: (v: string) => void;
  scratchSavedAt: string | null;
  specSavedAt: string | null;
  onContinue: () => void;
}) {
  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize={67} minSize={30} maxSize={70}>
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
          <ContextBlock context={t.studyContext} />
          <RequirementsBlock requirements={t.requirements} />
          <div className="flex flex-col min-h-[14rem] flex-1">
            <div className="flex justify-between items-baseline">
              <PanelLabel>Scratchpad</PanelLabel>
              <SavedHint at={scratchSavedAt} />
            </div>
            <textarea
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              className="flex-1 border border-[var(--rule)] p-3 bg-[var(--panel)] text-sm leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)]"
              placeholder="Take notes here as you work…"
            />
          </div>
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize={33} minSize={30} maxSize={70}>
        <section className="h-full flex flex-col gap-2 overflow-hidden min-h-0 pl-3">
          <div className="flex justify-between items-baseline">
            <PanelLabel>Initial specifications</PanelLabel>
            <SavedHint at={specSavedAt} />
          </div>
          {t.initialSpec.map((sub) => (
            <p
              key={sub.id}
              className="italic text-sm text-[var(--muted)] leading-relaxed"
            >
              {sub.prompt}
            </p>
          ))}
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            className="flex-1 border border-[var(--rule)] p-3 bg-white text-[15px] leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] font-mono"
            placeholder={SPEC_PLACEHOLDER}
          />
          <div className="pt-2">
            <ContinueButton onClick={onContinue} label="Next" />
          </div>
        </section>
      </Panel>
    </PanelGroup>
  );
}

// =================== Task: Scenario read step ==========================

function ScenarioReadStep({
  t,
  scenario,
  scenarioIdx,
  totalScenarios,
  scratch,
  setScratch,
  spec,
  scratchSavedAt,
  projectId,
  moduleId,
  save,
  onContinue,
}: {
  t: TaskContent;
  scenario: Scenario;
  scenarioIdx: number;
  totalScenarios: number;
  scratch: string;
  setScratch: (v: string) => void;
  spec: string;
  scratchSavedAt: string | null;
  projectId: string;
  moduleId: string;
  save: SaveAdapter;
  onContinue: () => void;
}) {
  const [specCollapsed, setSpecCollapsed] = useState(false);

  return (
    <div className="flex-1 grid grid-cols-[1fr_1.4fr_1fr] gap-4 overflow-hidden min-h-0">
      <aside className="flex flex-col gap-3 overflow-y-auto pr-1">
        <div>
          <PanelLabel>Task</PanelLabel>
          <p className="font-medium leading-snug">{t.title}</p>
          {t.studyContext && (
            <p className="text-sm text-[var(--muted)] leading-relaxed mt-1">
              {t.studyContext}
            </p>
          )}
        </div>
        <RequirementsBlock requirements={t.requirements} compact />
        <div className="pt-2 mt-auto">
          <ContinueButton onClick={onContinue} />
        </div>
      </aside>

      <section className="relative flex flex-col gap-3 overflow-y-auto px-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Scenario {scenarioIdx + 1} of {totalScenarios} · Reading
        </p>
        <h3 className="text-xl font-medium">{scenario.title}</h3>
        <ClauseList clauses={scenario.clauses} highlightable />
        {t.cityMap && (
          <MapCanvas
            map={t.cityMap}
            scenarioId={scenario.id}
            storageKey={`pf:${projectId}:${moduleId}`}
            onEvent={(eventType, payload) =>
              save.recordEvent(eventType, payload)
            }
          />
        )}
      </section>

      <aside className="flex flex-col gap-3 overflow-hidden min-h-0">
        <div
          className={
            'flex flex-col overflow-hidden min-h-0 ' +
            (specCollapsed ? 'h-auto' : 'h-1/2')
          }
        >
          <div className="flex justify-between items-baseline mb-1">
            <PanelLabel>🔒 Master specifications (read-only)</PanelLabel>
            <button
              type="button"
              onClick={() => setSpecCollapsed((c) => !c)}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] underline"
              aria-label={specCollapsed ? 'Expand specifications panel' : 'Collapse specifications panel'}
            >
              {specCollapsed ? 'expand' : 'collapse'}
            </button>
          </div>
          {!specCollapsed && (
            <pre className="flex-1 border border-[var(--rule)] border-dashed p-3 bg-[var(--rule-soft)] text-sm overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed text-[var(--foreground)] min-h-0">
              {spec || (
                <span className="italic text-[var(--muted)] font-sans">
                  No specifications written yet.
                </span>
              )}
            </pre>
          )}
        </div>
        <div
          className={
            'flex flex-col overflow-hidden min-h-0 ' +
            (specCollapsed ? 'flex-1' : 'h-1/2')
          }
        >
          <div className="flex justify-between items-baseline">
            <PanelLabel>Scratchpad</PanelLabel>
            <SavedHint at={scratchSavedAt} />
          </div>
          <textarea
            value={scratch}
            onChange={(e) => setScratch(e.target.value)}
            className="flex-1 border border-[var(--rule)] p-3 bg-[var(--panel)] text-sm leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] min-h-0"
            placeholder="Take notes here as you work through the scenario…"
          />
        </div>
      </aside>
    </div>
  );
}

// ====================== Task: Pause-and-ponder step ======================

function PonderStep({
  scenarioIdx,
  totalScenarios,
  onContinue,
}: {
  scenarioIdx: number;
  totalScenarios: number;
  onContinue: () => void;
}) {
  return (
    <Centered>
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          Scenario {scenarioIdx + 1} of {totalScenarios} · Pause and ponder
        </p>
        <p className="text-2xl leading-relaxed">
          Can you tell me everything you remember, or were thinking about, when
          you analyzed the last scenario?
        </p>
        <p className="text-sm italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-4 py-3">
          Please do not click Continue until your researcher tells you to.
        </p>
        <ContinueButton onClick={onContinue} />
      </div>
    </Centered>
  );
}

// ======================= Task: Scenario revise step ======================

function ScenarioReviseStep({
  t,
  scenario,
  scenarioIdx,
  totalScenarios,
  scratch,
  setScratch,
  spec,
  setSpec,
  scratchSavedAt,
  specSavedAt,
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
  scratch: string;
  setScratch: (v: string) => void;
  spec: string;
  setSpec: (v: string) => void;
  scratchSavedAt: string | null;
  specSavedAt: string | null;
  isLast: boolean;
  projectId: string;
  moduleId: string;
  save: SaveAdapter;
  onContinue: () => void;
}) {
  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize={67} minSize={30} maxSize={70}>
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Scenario {scenarioIdx + 1} of {totalScenarios} · Revising specifications
          </p>
          <div>
            <h2 className="text-xl font-medium tracking-tight">{t.title}</h2>
            {t.studyContext && (
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-1">
                {t.studyContext}
              </p>
            )}
          </div>
          <RequirementsBlock requirements={t.requirements} compact />
          <div>
            <PanelLabel>Scenario {scenarioIdx + 1}</PanelLabel>
            <h3 className="font-medium mt-1">{scenario.title}</h3>
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
            />
          )}
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize={33} minSize={30} maxSize={70}>
        <section className="h-full flex flex-col gap-3 overflow-hidden min-h-0 pl-3">
          {/* Master specifications — top (consistent with ScenarioReadStep) */}
          <div className="flex flex-col flex-1 overflow-hidden min-h-0 gap-1">
            <div className="bg-[#fffbea] border border-[#d8c98a] px-3 py-2 text-sm italic text-[#7c5a2e]">
              Your specifications are now <strong>editable</strong>. Continue
              thinking aloud as you revise them.
            </div>
            <div className="flex justify-between items-baseline">
              <PanelLabel>Master specifications</PanelLabel>
              <SavedHint at={specSavedAt} />
            </div>
            <textarea
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder={SPEC_PLACEHOLDER}
              className="flex-1 border border-[var(--rule)] p-3 bg-white text-[15px] leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] font-mono min-h-0"
            />
          </div>
          {/* Scratchpad — bottom */}
          <div className="flex flex-col h-1/3 min-h-0">
            <div className="flex justify-between items-baseline">
              <PanelLabel>Scratchpad</PanelLabel>
              <SavedHint at={scratchSavedAt} />
            </div>
            <textarea
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              className="flex-1 border border-[var(--rule)] p-3 bg-[var(--panel)] text-sm leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] min-h-0"
            />
          </div>
          <div className="pt-2">
            <ContinueButton
              onClick={onContinue}
              label={isLast ? 'Finish task' : 'Next scenario'}
            />
          </div>
        </section>
      </Panel>
    </PanelGroup>
  );
}

// =========================== Retrospective ===========================

function RetrospectiveRunner({
  projectId,
  module: m,
  save,
  onComplete,
}: {
  projectId: string;
  module: RetrospectiveReportModule;
  save: SaveAdapter;
  onComplete: () => void;
}) {
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

  // Debounced per-answer DB upsert + edit event + saved-at indicator
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

  function submit() {
    save.recordEvent('retro_submit', { answers });
    onComplete();
  }

  return (
    <div className="flex-1 flex flex-col gap-5 max-w-3xl mx-auto w-full overflow-y-auto">
      <header>
        <h2 className="text-2xl font-medium tracking-tight">{m.title}</h2>
        <p className="text-sm italic text-[var(--muted)] mt-1">
          Reflect on the tasks you just completed.
        </p>
      </header>

      {m.questions.map((q, i) => (
        <div key={q.id}>
          <div className="flex justify-between items-baseline mb-2">
            <p className="leading-relaxed">
              <strong>{i + 1}.</strong> {q.text}
            </p>
            <SavedHint at={savedAt[q.id] ?? null} />
          </div>
          <textarea
            value={answers[q.id] ?? ''}
            onChange={(e) => updateAnswer(q.id, e.target.value)}
            className="w-full border border-[var(--rule)] p-3 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)] leading-relaxed resize-y"
            style={{ minHeight: `${Math.max(q.boxHeight, 1) * 80}px` }}
          />
        </div>
      ))}

      <div className="pt-2">
        <ContinueButton onClick={submit} label="Submit" />
      </div>
    </div>
  );
}

// ========================= Shared sub-components ========================

function ScratchpadColumn({
  value,
  onChange,
  savedAt = null,
}: {
  value: string;
  onChange: (v: string) => void;
  savedAt?: string | null;
}) {
  return (
    <aside className="flex flex-col gap-1 overflow-hidden min-h-0">
      <div className="flex justify-between items-baseline">
        <PanelLabel>Scratchpad</PanelLabel>
        <SavedHint at={savedAt} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 border border-[var(--rule)] p-3 bg-[var(--panel)] text-sm leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] min-h-0"
        placeholder="Take notes here as you read…"
      />
    </aside>
  );
}

function ContextBlock({ context }: { context: string }) {
  if (!context) return null;
  return (
    <div>
      <PanelLabel>Study context</PanelLabel>
      <p className="leading-relaxed mt-1 whitespace-pre-wrap">{context}</p>
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
