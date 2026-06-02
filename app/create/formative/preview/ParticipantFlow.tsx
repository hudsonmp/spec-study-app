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
  TaskExample,
  PrefilledMoment,
  ThinkAloudWarmupModule,
  RetrospectiveReportModule,
  Requirement,
  Scenario,
  Entity,
  Element as EntityElement,
} from '@/lib/types/study';
import { MODULE_TYPE_LABEL, uid } from '@/lib/types/study';
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
  module: m,
  save,
  onComplete,
}: {
  projectId: string;
  module: ThinkAloudWarmupModule;
  save: SaveAdapter;
  onComplete: () => void;
}) {
  // Example phases come first when authored; then the real 3-phase flow.
  type Phase =
    | 'example_intro'
    | 'example_body'
    | 'example_revealed'
    | 'intro'
    | 'body'
    | 'revealed';
  const initial: Phase = m.example ? 'example_intro' : 'intro';
  const [phase, setPhase] = useState<Phase>(initial);

  function advanceTo(next: Phase) {
    save.recordEvent('step_advance', { from: phase, to: next });
    setPhase(next);
  }

  function finish() {
    save.recordEvent('step_advance', { from: phase, to: 'done' });
    onComplete();
  }

  // ============ Example phases ============
  if (phase === 'example_intro' && m.example) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <ExampleBanner />
        <Centered>
          <h2 className="text-2xl font-medium tracking-tight mb-4">
            Think-Aloud Instructions
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
          Think-Aloud Instructions
        </h2>
        <p className="text-[var(--muted)] leading-relaxed mb-8">
          Please do not move on until directed by the researcher.
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
  const example: TaskExample | undefined =
    m.type === 'task_warmup' ? m.example : undefined;

  const [step, setStep] = useState<TaskStep>({ kind: 'intro' });
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
    setStep(nextStep);
  }

  function next(): void {
    // Example phases
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
      // If example present, jump into example initial spec first.
      if (example) {
        return transitionTo({ kind: 'example_initial_spec' });
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

  // ============ Example steps ============
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
  return (
    <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <Panel defaultSize={50} minSize={30} maxSize={70}>
        <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
          <h2 className="text-2xl font-medium tracking-tight">{t.title}</h2>
          <RequirementsBlock requirements={t.requirements} />
        </section>
      </Panel>
      <SplitHandle />
      <Panel defaultSize={50} minSize={30} maxSize={70}>
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
  onContinue,
  isExample = false,
  copyOverride,
}: {
  scenarioIdx: number;
  totalScenarios: number;
  onContinue: () => void;
  isExample?: boolean;
  copyOverride?: string;
}) {
  const trimmed = copyOverride?.trim();
  const showOverride = isExample && trimmed && trimmed.length > 0;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {isExample && <ExampleBanner />}
      <Centered>
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            Scenario {scenarioIdx + 1} of {totalScenarios} · Pause and ponder
          </p>
          <p className="text-2xl leading-relaxed whitespace-pre-wrap">
            {showOverride
              ? trimmed
              : 'Can you tell me everything you remember, or were thinking about, when you analyzed the last scenario?'}
          </p>
          {isExample && !showOverride && (
            <p className="text-xs italic text-[var(--muted)]">
              (Example — researcher narrates)
            </p>
          )}
          <p className="text-sm italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-4 py-3">
            Please do not click Continue until your researcher tells you to.
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
              Your specifications are <strong>editable</strong>. Continue
              thinking aloud as you revise them.
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
      <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <Panel defaultSize={50} minSize={30} maxSize={70}>
          <section className="h-full flex flex-col gap-4 overflow-y-auto pr-3">
            <h2 className="text-2xl font-medium tracking-tight">
              {example.title}
            </h2>
            <RequirementsBlock requirements={example.requirements} />
          </section>
        </Panel>
        <SplitHandle />
        <Panel defaultSize={50} minSize={30} maxSize={70}>
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
  module: m,
  save,
  onComplete,
}: {
  projectId: string;
  module: RetrospectiveReportModule;
  save: SaveAdapter;
  onComplete: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
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

  // Pull the most-recent spec / entities from localStorage. Retrospectives
  // can follow any task module, so we look at all task-like modules in this
  // project and surface whatever's there. Spec is the simple case; for
  // entities we display the most recently authored set.
  // To keep the spec lookup simple, we read the spec/entities saved under
  // *any* module key on this project — surfacing whatever was last edited.
  // The retrospective module itself doesn't own a spec.
  const [latestSpec, setLatestSpec] = useState<string>('');
  const [latestEntities, setLatestEntities] = useState<Entity[]>([]);
  useEffect(() => {
    // Scan localStorage for the most recent pf:<projectId>:*:spec key.
    let bestSpec = '';
    let bestEntities: Entity[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(`pf:${projectId}:`) && k.endsWith(':spec')) {
        const v = window.localStorage.getItem(k) ?? '';
        if (v.length > bestSpec.length) bestSpec = v;
      }
      if (k.startsWith(`pf:${projectId}:`) && k.endsWith(':entities')) {
        try {
          const parsed = JSON.parse(
            window.localStorage.getItem(k) ?? '[]',
          ) as Entity[];
          if (Array.isArray(parsed) && parsed.length > bestEntities.length) {
            bestEntities = parsed;
          }
        } catch {
          /* ignore */
        }
      }
    }
    setLatestSpec(bestSpec);
    setLatestEntities(bestEntities);
  }, [projectId]);

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
      onComplete();
    } else {
      save.recordEvent('step_advance', {
        from: `retro_${stepIdx}`,
        to: `retro_${stepIdx + 1}`,
      });
      setStepIdx((i) => i + 1);
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
      </Panel>
    </PanelGroup>
  );
}

// ========================= Shared sub-components ========================

// Spec column = SPEC_PLACEHOLDER caption + spec textarea + entity table +
// continue button. Used on initial-spec, scenario-read, scenario-revise,
// and the read-only retrospective view. readOnly disables every input.
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
  return (
    <section className="h-full flex flex-col gap-2 overflow-y-auto min-h-0 pl-3">
      {leadIn}
      <div className="flex justify-between items-baseline">
        <PanelLabel>
          {headerNote ?? (readOnly ? 'Specifications (read-only)' : 'Specifications')}
        </PanelLabel>
        <SavedHint at={specSavedAt} />
      </div>
      <p className="text-xs italic text-[var(--muted)] leading-relaxed">
        {SPEC_PLACEHOLDER}
      </p>
      <textarea
        value={spec}
        onChange={(e) => !readOnly && setSpec(e.target.value)}
        readOnly={readOnly}
        className={
          'border border-[var(--rule)] p-3 text-[15px] leading-relaxed resize-y focus:outline-none focus:border-[var(--accent)] font-mono min-h-[14rem] ' +
          (readOnly ? 'bg-[var(--rule-soft)] cursor-default' : 'bg-white')
        }
      />
      <EntityElementEditor
        value={entities}
        onChange={setEntities}
        readOnly={readOnly}
        savedAt={entitiesSavedAt}
      />
      {onContinue && (
        <div className="pt-2">
          <ContinueButton onClick={onContinue} label={continueLabel} />
        </div>
      )}
    </section>
  );
}

// ENTITIES & ELEMENTS — a small 1:m editor framed by literal divider rows
// so it visually attaches to the spec textarea above. Inputs are inline; +
// element / + entity buttons add fresh rows. readOnly disables every input.
function EntityElementEditor({
  value,
  onChange,
  readOnly = false,
  savedAt = null,
}: {
  value: Entity[];
  onChange: (next: Entity[]) => void;
  readOnly?: boolean;
  savedAt?: string | null;
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

  const dividerCls =
    'font-mono text-[10px] tracking-tighter text-[var(--muted)] select-none leading-none';

  return (
    <div className="mt-2 flex flex-col gap-1">
      <p className={dividerCls}>================================================</p>
      <div className="flex justify-between items-baseline">
        <PanelLabel>Entities &amp; Elements</PanelLabel>
        <SavedHint at={savedAt} />
      </div>
      <div
        className={
          'border border-dashed border-[var(--rule)] p-2 space-y-2 ' +
          (readOnly ? 'bg-[var(--rule-soft)]' : 'bg-white')
        }
      >
        {value.length === 0 && (
          <p className="text-xs italic text-[var(--muted)]">
            {readOnly
              ? '(no entities recorded)'
              : 'No entities yet — add one below.'}
          </p>
        )}
        {value.map((ent, i) => (
          <div key={ent.id} className="border border-[var(--rule)] p-2">
            <div className="flex gap-2 items-center">
              <input
                value={ent.name}
                onChange={(e) => updateEntity(i, { name: e.target.value })}
                readOnly={readOnly}
                placeholder="Entity name"
                className={
                  'flex-1 border-0 border-b border-dashed border-[var(--rule)] py-1 bg-transparent text-sm focus:outline-none focus:border-[var(--accent)] ' +
                  (readOnly ? 'cursor-default' : '')
                }
              />
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => addElement(i)}
                    className="text-[11px] italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-2 py-0.5"
                  >
                    + element
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEntity(i)}
                    className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)]"
                    aria-label="Remove entity"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
            <ul className="mt-2 pl-3 space-y-1">
              {ent.elements.length === 0 && (
                <li className="text-[11px] italic text-[var(--muted)]">
                  (no elements)
                </li>
              )}
              {ent.elements.map((el, ei) => (
                <li key={el.id} className="flex gap-2 items-center text-sm">
                  <span className="text-[var(--muted)]">•</span>
                  <input
                    value={el.name}
                    onChange={(e) =>
                      updateElement(i, ei, { name: e.target.value })
                    }
                    readOnly={readOnly}
                    placeholder="Element name"
                    className={
                      'flex-1 border-0 border-b border-dashed border-[var(--rule)] py-0.5 bg-transparent focus:outline-none focus:border-[var(--accent)] ' +
                      (readOnly ? 'cursor-default' : '')
                    }
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeElement(i, ei)}
                      className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)]"
                      aria-label="Remove element"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={addEntity}
            className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1"
          >
            + entity
          </button>
        )}
      </div>
      <p className={dividerCls}>================================================</p>
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
