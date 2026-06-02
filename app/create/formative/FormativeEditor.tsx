'use client';

import { useEffect, useReducer, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProjectAction,
  setVisibilityAction,
  createProjectAction,
  deleteProjectAction,
} from './actions';
import type {
  LoadedProject,
  ProjectContent,
  Module,
  TaskContent,
  TaskCopy,
  ThinkAloudWarmupModule,
  ThinkAloudWarmupCopy,
  ThinkAloudExampleModule,
  TaskExample,
  TaskExampleModule,
  TaskExamplePrefilled,
  RetrospectiveReportModule,
  RetrospectiveItem,
  ModuleType,
  Clause,
  ClauseMarker,
  CityMap,
  SeededMarker,
  SeededVehicleColor,
  SeededPersonLetter,
  Requirement,
  Scenario,
  SpecSubsection,
  Entity,
  Element as EntityElement,
} from '@/lib/types/study';
import {
  MODULE_TYPE_LABEL,
  newModuleOfType,
  newPrefilledPerScenario,
  uid,
  VEHICLE_COLOR_TO_NUMBER,
  VEHICLE_HEX,
  PERSON_PALETTE,
  DEFAULT_WARMUP_COPY,
  DEFAULT_TASK_COPY,
} from '@/lib/types/study';
import {
  contentReducer,
  migrateContent,
  moveInArray,
} from '@/lib/study/reducer';
import { renderCityMapSvg } from '@/lib/study/city-map';
import { shellProjectContent } from '@/lib/study/shell';

// ============================== Top-level ==============================

export default function FormativeEditor({
  projects,
  initialActiveId,
}: {
  projects: LoadedProject[];
  initialActiveId: string | null;
}) {
  const router = useRouter();
  const active =
    projects.find((p) => p.id === initialActiveId) ??
    projects[0] ??
    null;

  if (!active) return <EmptyState />;

  return (
    <ProjectEditor
      key={active.id}
      project={active}
      allProjects={projects}
      onSwitchProject={(id) =>
        router.push(`/create/formative?p=${encodeURIComponent(id)}`)
      }
    />
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-[var(--rule)] p-10 text-center text-sm text-[var(--muted)] italic">
      <p className="mb-4">No projects yet.</p>
      <form action={createProjectAction} className="inline-flex gap-2">
        <input
          type="text"
          name="name"
          placeholder="New project name"
          required
          className="border border-[var(--rule)] px-2 py-1 bg-white text-[var(--foreground)] not-italic"
        />
        <button
          type="submit"
          className="border border-[var(--foreground)] text-[var(--foreground)] px-3 py-1 not-italic hover:bg-[var(--foreground)] hover:text-[var(--background)]"
        >
          Create project
        </button>
      </form>
    </div>
  );
}

// ============================ ProjectEditor ============================

function ProjectEditor({
  project,
  allProjects,
  onSwitchProject,
}: {
  project: LoadedProject;
  allProjects: LoadedProject[];
  onSwitchProject: (id: string) => void;
}) {
  const [content, dispatch] = useReducer(contentReducer, project.content);
  const [studyName, setStudyName] = useState(project.name);
  const [visibility, setVisibility] = useState(project.visibility);
  const [savedAt, setSavedAt] = useState<string>('loaded');
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(true);
  const [, startTransition] = useTransition();

  // Auto-save (debounced)
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProjectAction({
        id: project.id,
        name: studyName,
        content,
      }).then((res) => {
        if (res.ok) {
          setSavedAt(new Date().toLocaleTimeString());
          setError(null);
        } else setError(res.error);
      });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [content, studyName, project.id]);

  function changeVisibility(v: typeof visibility) {
    const fd = new FormData();
    fd.set('id', project.id);
    fd.set('visibility', v);
    setVisibility(v);
    startTransition(async () => {
      await setVisibilityAction(fd);
    });
  }

  function importJsonText() {
    const raw = prompt('Paste JSON content (will replace the current project):');
    if (!raw) return;
    try {
      const parsed = migrateContent(JSON.parse(raw));
      dispatch({ type: 'set', content: parsed });
    } catch (e: unknown) {
      alert('Invalid JSON: ' + (e instanceof Error ? e.message : 'parse error'));
    }
  }

  function exportJson() {
    download(
      `${project.slug}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(content, null, 2),
    );
  }

  function exportShell() {
    const shell = shellProjectContent();
    download(`spec-study-shell.json`, JSON.stringify(shell, null, 2));
  }

  function addModule(type: ModuleType) {
    dispatch({
      type: 'patch',
      fn: (c) => c.modules.push(newModuleOfType(type)),
    });
  }

  return (
    <div>
      <ProjectHeader
        project={project}
        allProjects={allProjects}
        studyName={studyName}
        visibility={visibility}
        savedAt={savedAt}
        error={error}
        onSwitchProject={onSwitchProject}
        onName={setStudyName}
        onVisibility={changeVisibility}
        onImport={importJsonText}
        onExport={exportJson}
        onExportShell={exportShell}
      />

      <div className="mt-8 space-y-4">
        {content.modules.length === 0 && (
          <p className="text-sm italic text-[var(--muted)] border border-dashed border-[var(--rule)] p-6 text-center">
            No modules yet. Add one using the dropdown below.
          </p>
        )}
        {content.modules.map((m, i) => (
          <ModuleCard
            key={m.id}
            module={m}
            index={i}
            total={content.modules.length}
            patch={(fn) =>
              dispatch({
                type: 'patch',
                fn: (c) => {
                  fn(c.modules[i]);
                },
              })
            }
            onMove={(dir) =>
              dispatch({
                type: 'patch',
                fn: (c) => {
                  moveInArray(c.modules, i, dir);
                },
              })
            }
            onDelete={() =>
              dispatch({
                type: 'patch',
                fn: (c) => c.modules.splice(i, 1),
              })
            }
          />
        ))}
      </div>

      <AddModuleControl onAdd={addModule} />
    </div>
  );
}

// =========================== Project header ============================

function ProjectHeader({
  project,
  allProjects,
  studyName,
  visibility,
  savedAt,
  error,
  onSwitchProject,
  onName,
  onVisibility,
  onImport,
  onExport,
  onExportShell,
}: {
  project: LoadedProject;
  allProjects: LoadedProject[];
  studyName: string;
  visibility: LoadedProject['visibility'];
  savedAt: string;
  error: string | null;
  onSwitchProject: (id: string) => void;
  onName: (v: string) => void;
  onVisibility: (v: LoadedProject['visibility']) => void;
  onImport: () => void;
  onExport: () => void;
  onExportShell: () => void;
}) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--panel)] p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-xs uppercase tracking-wider text-[var(--muted)] mr-1">
          Project
        </label>
        <select
          value={project.id}
          onChange={(e) => onSwitchProject(e.target.value)}
          className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
        >
          {allProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.visibility})
            </option>
          ))}
        </select>
        <form action={createProjectAction} className="inline-flex gap-1">
          <input
            type="text"
            name="name"
            placeholder="New project name"
            required
            className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
          />
          <button
            type="submit"
            className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-2"
          >
            + new
          </button>
        </form>
      </div>

      <div className="grid grid-cols-[1fr_180px_auto] gap-3 items-end">
        <label>
          <span className="text-xs uppercase tracking-wider text-[var(--muted)] block">
            Project name
          </span>
          <input
            type="text"
            value={studyName}
            onChange={(e) => onName(e.target.value)}
            className="mt-1 w-full border border-[var(--rule)] px-2 py-1 bg-white focus:outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label>
          <span className="text-xs uppercase tracking-wider text-[var(--muted)] block">
            Visibility
          </span>
          <select
            value={visibility}
            onChange={(e) =>
              onVisibility(e.target.value as LoadedProject['visibility'])
            }
            className="mt-1 w-full border border-[var(--rule)] px-2 py-1 bg-white focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="shown">Shown (live to participants)</option>
            <option value="hidden">Hidden</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <form action={deleteProjectAction}>
          <input type="hidden" name="id" value={project.id} />
          <button
            type="submit"
            className="text-xs text-[var(--danger)] hover:underline"
            onClick={(e) => {
              if (
                !confirm(
                  // Native confirm here is OK — this is a top-level destructive op
                  // that should require an unambiguous click.
                  'Delete the entire project? This cannot be undone.',
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            Delete project
          </button>
        </form>
      </div>

      <div className="flex gap-4 items-center text-sm flex-wrap">
        <button onClick={onImport} className="text-[var(--muted)] underline hover:no-underline">
          Import JSON
        </button>
        <button onClick={onExport} className="text-[var(--muted)] underline hover:no-underline">
          Export JSON
        </button>
        <button
          onClick={onExportShell}
          className="text-[var(--muted)] underline hover:no-underline"
          title="Download a blank template with all module types pre-stubbed. Fill it in (in a Google Doc, an editor, etc.) and re-import."
        >
          Export shell (template)
        </button>
        <span className="text-xs italic text-[var(--muted)] ml-auto">
          {error ? (
            <span className="text-[var(--danger)]">{error}</span>
          ) : savedAt === 'loaded' ? (
            'Loaded'
          ) : (
            `Saved ${savedAt}`
          )}
        </span>
      </div>
    </div>
  );
}

// ============================== Modules ===============================

function ModuleCard({
  module: m,
  index,
  total,
  patch,
  onMove,
  onDelete,
}: {
  module: Module;
  index: number;
  total: number;
  patch: (fn: (m: Module) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const label = MODULE_TYPE_LABEL[m.type];
  return (
    <div className="border border-[var(--rule)] bg-[var(--panel)] p-5">
      <div className="flex justify-between items-baseline mb-3 pb-2 border-b border-[var(--rule-soft)]">
        <div>
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Module {index + 1} ·{' '}
            <span className="text-[var(--foreground)]">{label}</span>
          </span>
        </div>
        <div className="flex gap-2 text-xs text-[var(--muted)]">
          <button
            className="hover:text-[var(--foreground)] disabled:opacity-25"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            className="hover:text-[var(--foreground)] disabled:opacity-25"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <ConfirmButton
            label="× delete"
            confirmLabel="Delete module"
            onConfirm={onDelete}
          />
        </div>
      </div>

      {m.type === 'think_aloud_warmup' && (
        <ThinkAloudWarmupEditor module={m} patch={patch} />
      )}
      {m.type === 'think_aloud_example' && (
        <ThinkAloudExampleEditor module={m} patch={patch} />
      )}
      {(m.type === 'task' || m.type === 'task_warmup') && (
        <TaskEditor module={m} patch={patch} />
      )}
      {m.type === 'task_example' && (
        <TaskExampleEditor module={m} patch={patch} />
      )}
      {m.type === 'retrospective_report' && (
        <RetrospectiveReportEditor module={m} patch={patch} />
      )}
    </div>
  );
}

// ===================== Think-aloud warmup editor ======================

function ThinkAloudWarmupEditor({
  module: m,
  patch,
}: {
  module: ThinkAloudWarmupModule;
  patch: (fn: (m: Module) => void) => void;
}) {
  function p(fn: (w: ThinkAloudWarmupModule) => void) {
    patch((mod) => {
      if (mod.type === 'think_aloud_warmup') fn(mod);
    });
  }
  return (
    <div className="space-y-3">
      <FieldLabel label="Title">
        <input
          type="text"
          className={inputCls}
          value={m.title}
          onChange={(e) => p((w) => (w.title = e.target.value))}
        />
      </FieldLabel>
      <FieldLabel
        label="Task description (what the participant is asked to do)"
        onClear={() => p((w) => (w.taskDescription = ''))}
        clearDisabled={!m.taskDescription}
      >
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={m.taskDescription}
          onChange={(e) => p((w) => (w.taskDescription = e.target.value))}
          placeholder="Empty — participant sees nothing here"
        />
      </FieldLabel>
      <FieldLabel
        label="Warmup body (the actual prompt or scenario)"
        onClear={() => p((w) => (w.body = ''))}
        clearDisabled={!m.body}
      >
        <textarea
          className={inputCls + ' min-h-[120px]'}
          value={m.body}
          onChange={(e) => p((w) => (w.body = e.target.value))}
          placeholder="Empty — participant sees nothing here. Leave empty when delivered verbally."
        />
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Scrambled word (what the participant sees)">
          <input
            type="text"
            className={inputCls + ' font-mono tracking-widest'}
            value={m.revealedTask}
            onChange={(e) => p((w) => (w.revealedTask = e.target.value))}
            placeholder="e.g. DUYTS"
          />
        </FieldLabel>
        <FieldLabel label="Answer (researcher key, not shown)">
          <input
            type="text"
            className={inputCls + ' font-mono tracking-widest'}
            value={m.revealedAnswer}
            onChange={(e) => p((w) => (w.revealedAnswer = e.target.value))}
            placeholder="e.g. STUDY"
          />
        </FieldLabel>
      </div>
      <div className="flex gap-6 text-sm">
        <label className="flex gap-2 items-center text-[var(--muted)]">
          <input
            type="checkbox"
            checked={m.mandatory}
            onChange={(e) => p((w) => (w.mandatory = e.target.checked))}
          />
          <span>Mandatory (participant must complete)</span>
        </label>
      </div>
      <WarmupCopyEditor copy={m.copy} setCopy={(c) => p((w) => (w.copy = c))} />
      <p className="text-[11px] italic text-[var(--muted)]">
        Want a worked example before this warmup? Add a{' '}
        <strong className="not-italic">Think-aloud worked example</strong>{' '}
        module from the picker below and drag it above this one.
      </p>
    </div>
  );
}

// ===================== Copy customization editors =====================
// Lets the researcher override participant-facing strings per-module. All
// fields are optional; empty strings fall back to DEFAULT_*_COPY at render
// time. Reusable across studies because copy lives on the module, not in
// the participant runner.

function CopyOverrideField({
  label,
  value,
  defaultValue,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string | undefined;
  defaultValue: string;
  onChange: (next: string | undefined) => void;
  multiline?: boolean;
}) {
  // Treat empty string as "not overridden" — emit undefined so the JSON stays
  // small and the renderer's `?? DEFAULT` works without a length check.
  function emit(next: string) {
    onChange(next.length === 0 ? undefined : next);
  }
  return (
    <FieldLabel label={label}>
      {multiline ? (
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={value ?? ''}
          onChange={(e) => emit(e.target.value)}
          placeholder={defaultValue}
        />
      ) : (
        <input
          type="text"
          className={inputCls}
          value={value ?? ''}
          onChange={(e) => emit(e.target.value)}
          placeholder={defaultValue}
        />
      )}
    </FieldLabel>
  );
}

function WarmupCopyEditor({
  copy,
  setCopy,
}: {
  copy: ThinkAloudWarmupCopy | undefined;
  setCopy: (c: ThinkAloudWarmupCopy | undefined) => void;
}) {
  function set<K extends keyof ThinkAloudWarmupCopy>(
    key: K,
    value: ThinkAloudWarmupCopy[K],
  ) {
    const next: ThinkAloudWarmupCopy = { ...(copy ?? {}), [key]: value };
    // Strip all-empty wrapper → store undefined so saved JSON stays clean.
    const hasAny = Object.values(next).some(
      (v) => v !== undefined && v !== '',
    );
    setCopy(hasAny ? next : undefined);
  }
  return (
    <details className="border border-dashed border-[var(--rule)] p-3">
      <summary className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] cursor-pointer">
        Customize on-screen copy {copy ? '(overridden)' : '(defaults)'}
      </summary>
      <p className="text-xs italic text-[var(--muted)] mt-2 mb-3">
        Leave any field blank to fall back to the default shown as placeholder.
      </p>
      <div className="space-y-3">
        <CopyOverrideField
          label="Intro screen — title"
          value={copy?.introTitle}
          defaultValue={DEFAULT_WARMUP_COPY.introTitle}
          onChange={(v) => set('introTitle', v)}
        />
        <CopyOverrideField
          label="Intro screen — body"
          value={copy?.introBody}
          defaultValue={DEFAULT_WARMUP_COPY.introBody}
          onChange={(v) => set('introBody', v)}
          multiline
        />
        <CopyOverrideField
          label="Reveal button label"
          value={copy?.revealButtonLabel}
          defaultValue={DEFAULT_WARMUP_COPY.revealButtonLabel}
          onChange={(v) => set('revealButtonLabel', v)}
        />
        <CopyOverrideField
          label="Post-reveal callout"
          value={copy?.postRevealCallout}
          defaultValue={DEFAULT_WARMUP_COPY.postRevealCallout}
          onChange={(v) => set('postRevealCallout', v)}
        />
        <CopyOverrideField
          label="Answer-box label"
          value={copy?.answerInputLabel}
          defaultValue={DEFAULT_WARMUP_COPY.answerInputLabel}
          onChange={(v) => set('answerInputLabel', v)}
        />
      </div>
    </details>
  );
}

function TaskCopyEditor({
  copy,
  setCopy,
}: {
  copy: TaskCopy | undefined;
  setCopy: (c: TaskCopy | undefined) => void;
}) {
  function set<K extends keyof TaskCopy>(key: K, value: TaskCopy[K]) {
    const next: TaskCopy = { ...(copy ?? {}), [key]: value };
    // Keep the wrapper alive when ANY key is present (incl. an explicit ''
    // for specPlaceholder, which means "hide the caption" and must persist).
    const hasAny = Object.values(next).some((v) => v !== undefined);
    setCopy(hasAny ? next : undefined);
  }
  return (
    <details className="border border-dashed border-[var(--rule)] p-3">
      <summary className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] cursor-pointer">
        Customize on-screen copy {copy ? '(overridden)' : '(defaults)'}
      </summary>
      <p className="text-xs italic text-[var(--muted)] mt-2 mb-3">
        Leave any field blank to fall back to the default shown as placeholder.
      </p>
      <div className="space-y-3">
        <CopyOverrideField
          label="Pause-and-ponder default prompt"
          value={copy?.ponderDefault}
          defaultValue={DEFAULT_TASK_COPY.ponderDefault}
          onChange={(v) => set('ponderDefault', v)}
          multiline
        />
        <CopyOverrideField
          label="Pause-and-ponder hold note"
          value={copy?.ponderHoldNote}
          defaultValue={DEFAULT_TASK_COPY.ponderHoldNote}
          onChange={(v) => set('ponderHoldNote', v)}
        />
        <CopyOverrideField
          label="Revise scenario callout"
          value={copy?.reviseCallout}
          defaultValue={DEFAULT_TASK_COPY.reviseCallout}
          onChange={(v) => set('reviseCallout', v)}
        />
        <CopyOverrideField
          label="Warmup intro annotation"
          value={copy?.warmupAnnotation}
          defaultValue={DEFAULT_TASK_COPY.warmupAnnotation}
          onChange={(v) => set('warmupAnnotation', v)}
          multiline
        />
        <CopyOverrideField
          label="Real-task intro annotation"
          value={copy?.realAnnotation}
          defaultValue={DEFAULT_TASK_COPY.realAnnotation}
          onChange={(v) => set('realAnnotation', v)}
          multiline
        />
        <SpecPlaceholderField
          value={copy?.specPlaceholder}
          onChange={(v) => set('specPlaceholder', v)}
        />
      </div>
    </details>
  );
}

// The grey italic caption above the spec textarea has three states:
//   undefined → show the default caption
//   '' (Hidden) → no caption at all
//   custom string → show that text
// Distinct control (not CopyOverrideField) because '' is meaningful here.
function SpecPlaceholderField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const mode = value === undefined ? 'default' : value === '' ? 'hidden' : 'custom';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          Spec instructions caption
        </div>
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value;
            if (next === 'default') onChange(undefined);
            else if (next === 'hidden') onChange('');
            else onChange(DEFAULT_TASK_COPY.specPlaceholder);
          }}
          className="text-[11px] border border-[var(--rule)] bg-white px-1 py-0.5"
        >
          <option value="default">Show default</option>
          <option value="custom">Custom text</option>
          <option value="hidden">Hide entirely</option>
        </select>
      </div>
      {mode === 'custom' && (
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {mode === 'default' && (
        <p className="text-xs italic text-[var(--muted)] leading-relaxed">
          {DEFAULT_TASK_COPY.specPlaceholder}
        </p>
      )}
      {mode === 'hidden' && (
        <p className="text-xs italic text-[var(--muted)]">
          No caption shown above the spec box.
        </p>
      )}
    </div>
  );
}

// Editor for the standalone think-aloud worked-example module. Same fields
// as the warmup, plus researcher narration; rendered read-only to the
// participant with the "Example" banner.
function ThinkAloudExampleEditor({
  module: m,
  patch,
}: {
  module: ThinkAloudExampleModule;
  patch: (fn: (m: Module) => void) => void;
}) {
  function p(fn: (w: ThinkAloudExampleModule) => void) {
    patch((mod) => {
      if (mod.type === 'think_aloud_example') fn(mod);
    });
  }
  return (
    <div className="space-y-3">
      <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
        Display-only worked example. Shown with the &ldquo;Example — the
        researcher will walk through this&rdquo; banner; the answer is shown
        pre-filled rather than typed.
      </p>
      <FieldLabel label="Title">
        <input
          type="text"
          className={inputCls}
          value={m.title}
          onChange={(e) => p((w) => (w.title = e.target.value))}
        />
      </FieldLabel>
      <FieldLabel
        label="Intro / task description"
        onClear={() => p((w) => (w.taskDescription = ''))}
        clearDisabled={!m.taskDescription}
      >
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={m.taskDescription}
          onChange={(e) => p((w) => (w.taskDescription = e.target.value))}
          placeholder="Empty — participant sees nothing here"
        />
      </FieldLabel>
      <FieldLabel
        label="Body"
        onClear={() => p((w) => (w.body = ''))}
        clearDisabled={!m.body}
      >
        <textarea
          className={inputCls + ' min-h-[100px]'}
          value={m.body}
          onChange={(e) => p((w) => (w.body = e.target.value))}
          placeholder="Empty — participant sees nothing here"
        />
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Scrambled word (shown)">
          <input
            className={inputCls + ' font-mono tracking-widest'}
            value={m.revealedTask}
            onChange={(e) => p((w) => (w.revealedTask = e.target.value))}
            placeholder="e.g. DUYTS"
          />
        </FieldLabel>
        <FieldLabel label="Answer (shown pre-filled)">
          <input
            className={inputCls + ' font-mono tracking-widest'}
            value={m.revealedAnswer}
            onChange={(e) => p((w) => (w.revealedAnswer = e.target.value))}
            placeholder="e.g. STUDY"
          />
        </FieldLabel>
      </div>
      <FieldLabel
        label="Walkthrough narration (what the researcher says)"
        onClear={() => p((w) => (w.walkthroughText = ''))}
        clearDisabled={!m.walkthroughText}
      >
        <textarea
          className={inputCls + ' min-h-[100px]'}
          value={m.walkthroughText}
          onChange={(e) => p((w) => (w.walkthroughText = e.target.value))}
          placeholder="Empty — no narration box shown"
        />
      </FieldLabel>
      <WarmupCopyEditor copy={m.copy} setCopy={(c) => p((w) => (w.copy = c))} />
    </div>
  );
}

// =========================== Task editor =============================
// Used for both 'task' and 'task_warmup'. The discriminator lives on the
// module wrapper; the editor body is identical.

function TaskEditor({
  module: m,
  patch,
}: {
  module: Extract<Module, { type: 'task' | 'task_warmup' }>;
  patch: (fn: (m: Module) => void) => void;
}) {
  function p(fn: (t: TaskContent) => void) {
    patch((mod) => {
      if (mod.type === 'task' || mod.type === 'task_warmup') fn(mod);
    });
  }
  const landmarks = cityMapLandmarkOptions(m.cityMap);
  return (
    <div className="space-y-4">
      {m.type === 'task_warmup' && (
        <div className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
          Task warmup — participant responses are <strong>not</strong> saved
          to Supabase (only cached locally for reload protection). Excluded
          from researcher analysis.
        </div>
      )}

      <FieldLabel label="Title">
        <input
          type="text"
          className={inputCls}
          value={m.title}
          onChange={(e) => p((t) => (t.title = e.target.value))}
        />
      </FieldLabel>

      <FieldLabel
        label="Study context"
        onClear={() => p((t) => (t.studyContext = ''))}
        clearDisabled={!m.studyContext}
      >
        <textarea
          className={inputCls + ' min-h-[80px]'}
          value={m.studyContext}
          onChange={(e) => p((t) => (t.studyContext = e.target.value))}
          placeholder="Empty — participant sees no context section"
        />
      </FieldLabel>

      <RequirementsListEditor
        requirements={m.requirements}
        setRequirements={(next) => p((t) => (t.requirements = next))}
      />

      <CityMapSection
        cityMap={m.cityMap}
        setCityMap={(next) =>
          p((t) => {
            if (next === undefined) delete t.cityMap;
            else t.cityMap = next;
          })
        }
      />

      <InitialSpecPromptsEditor
        initialSpec={m.initialSpec}
        setInitialSpec={(next) => p((t) => (t.initialSpec = next))}
      />

      <TaskCopyEditor copy={m.copy} setCopy={(c) => p((t) => (t.copy = c))} />

      <PerScenarioRetrospectiveEditor
        questions={m.perScenarioRetrospective ?? []}
        setQuestions={(next) =>
          p((t) => {
            if (next.length === 0) delete t.perScenarioRetrospective;
            else t.perScenarioRetrospective = next;
          })
        }
      />

      <Section
        title={`Scenarios (${m.scenarios.length}/3)`}
        onAdd={
          m.scenarios.length < 3
            ? () =>
                p((t) => {
                  const prev = t.scenarios[t.scenarios.length - 1];
                  // Subsequent scenarios clone the prior one so the
                  // researcher can layer NEW/superseded markers; first
                  // scenario starts blank with default Given/When/Then.
                  const clonedClauses: Clause[] = prev
                    ? prev.clauses.map((c) => ({
                        id: uid(),
                        type: c.type,
                        text: c.text,
                        // Carried-over clauses lose the previous "new"
                        // marker (they are no longer new in this scenario)
                        // but keep "superseded" so prior crossouts persist.
                        marker: c.marker === 'superseded' ? 'superseded' : undefined,
                      }))
                    : [
                        { id: uid(), type: 'Given', text: '' },
                        { id: uid(), type: 'When', text: '' },
                        { id: uid(), type: 'Then', text: '' },
                      ];
                  t.scenarios.push({
                    id: uid(),
                    title: `Scenario ${t.scenarios.length + 1}`,
                    facilitatorNote: '',
                    clauses: clonedClauses,
                  });
                })
            : undefined
        }
      >
        {m.scenarios.map((sc, i) => (
          <ScenarioBlock
            key={sc.id}
            scenario={sc}
            index={i}
            total={m.scenarios.length}
            patch={(fn) => p((t) => fn(t.scenarios[i]))}
            onMove={(dir) => p((t) => void moveInArray(t.scenarios, i, dir))}
            onDelete={() => p((t) => t.scenarios.splice(i, 1))}
            landmarkOptions={landmarks}
          />
        ))}
      </Section>

    </div>
  );
}

// ===================== Primitive: requirements list =====================

function RequirementsListEditor({
  requirements,
  setRequirements,
  title = 'Requirements (user stories)',
}: {
  requirements: Requirement[];
  setRequirements: (next: Requirement[]) => void;
  title?: string;
}) {
  function update(i: number, patch: Partial<Requirement>) {
    const next = requirements.slice();
    next[i] = { ...next[i], ...patch };
    setRequirements(next);
  }
  function move(i: number, dir: -1 | 1) {
    const next = requirements.slice();
    if (moveInArray(next, i, dir)) setRequirements(next);
  }
  function remove(i: number) {
    setRequirements(requirements.filter((_, idx) => idx !== i));
  }
  return (
    <Section
      title={title}
      onAdd={() =>
        setRequirements([
          ...requirements,
          { id: uid(), role: '', want: '', so: '' },
        ])
      }
    >
      {requirements.map((r, i) => (
        <div
          key={r.id}
          className="grid grid-cols-[28px_1fr_auto] gap-2 mb-2 items-start"
        >
          <div className="text-xs text-[var(--muted)] pt-2">{i + 1}.</div>
          <div className="grid gap-1">
            <ReqField
              prefix="As a"
              value={r.role}
              onChange={(v) => update(i, { role: v })}
            />
            <ReqField
              prefix="I want"
              value={r.want}
              onChange={(v) => update(i, { want: v })}
            />
            <ReqField
              prefix="so that"
              value={r.so}
              onChange={(v) => update(i, { so: v })}
            />
          </div>
          <div className="flex">
            <button
              className={iconBtn}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              className={iconBtn}
              disabled={i === requirements.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button className={iconBtn} onClick={() => remove(i)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </Section>
  );
}

// ===================== Primitive: initial-spec prompts ====================

function InitialSpecPromptsEditor({
  initialSpec,
  setInitialSpec,
  title = 'Initial specification (prompts shown before scenarios)',
}: {
  initialSpec: SpecSubsection[];
  setInitialSpec: (next: SpecSubsection[]) => void;
  title?: string;
}) {
  function update(i: number, patch: Partial<SpecSubsection>) {
    const next = initialSpec.slice();
    next[i] = { ...next[i], ...patch };
    setInitialSpec(next);
  }
  function move(i: number, dir: -1 | 1) {
    const next = initialSpec.slice();
    if (moveInArray(next, i, dir)) setInitialSpec(next);
  }
  function remove(i: number) {
    setInitialSpec(initialSpec.filter((_, idx) => idx !== i));
  }
  return (
    <Section
      title={title}
      onAdd={() =>
        setInitialSpec([
          ...initialSpec,
          { id: uid(), prompt: 'New prompt', boxHeight: 2 },
        ])
      }
    >
      {initialSpec.map((sub, i) => (
        <PromptRow
          key={sub.id}
          prompt={sub.prompt}
          boxHeight={sub.boxHeight}
          onPrompt={(v) => update(i, { prompt: v })}
          onBoxHeight={(v) => update(i, { boxHeight: v })}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onDelete={() => remove(i)}
          canUp={i > 0}
          canDown={i < initialSpec.length - 1}
        />
      ))}
    </Section>
  );
}

// ============== Per-scenario retrospective questions editor ==============
// These questions repeat after EACH scenario's revise step within a task.
// Same question set for every scenario; empty list = no retrospective screens.

function PerScenarioRetrospectiveEditor({
  questions,
  setQuestions,
}: {
  questions: RetrospectiveItem[];
  setQuestions: (next: RetrospectiveItem[]) => void;
}) {
  return (
    <details className="border border-dashed border-[var(--rule)] p-3">
      <summary className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] cursor-pointer">
        Per-scenario retrospective ({questions.length}{' '}
        {questions.length === 1 ? 'question' : 'questions'})
      </summary>
      <p className="text-xs italic text-[var(--muted)] mt-2 mb-3">
        Shown after every scenario&rsquo;s revise step. The same questions
        repeat for each scenario. Leave empty for none.
      </p>
      <Section
        title="Questions"
        onAdd={() =>
          setQuestions([
            ...questions,
            { id: uid(), text: 'New question', boxHeight: 1.1 },
          ])
        }
      >
        {questions.map((q, i) => (
          <div
            key={q.id}
            className="grid grid-cols-[1fr_auto] gap-2 mb-2 items-start"
          >
            <textarea
              className={inputCls + ' min-h-[44px]'}
              value={q.text}
              onChange={(e) => {
                const next = questions.slice();
                next[i] = { ...next[i], text: e.target.value };
                setQuestions(next);
              }}
            />
            <div className="flex">
              <button
                className={iconBtn}
                disabled={i === 0}
                onClick={() => {
                  const next = questions.slice();
                  if (moveInArray(next, i, -1)) setQuestions(next);
                }}
              >
                ↑
              </button>
              <button
                className={iconBtn}
                disabled={i === questions.length - 1}
                onClick={() => {
                  const next = questions.slice();
                  if (moveInArray(next, i, 1)) setQuestions(next);
                }}
              >
                ↓
              </button>
              <button
                className={iconBtn}
                onClick={() =>
                  setQuestions(questions.filter((_, idx) => idx !== i))
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </Section>
    </details>
  );
}

// ===================== Retrospective report editor =====================

function RetrospectiveReportEditor({
  module: m,
  patch,
}: {
  module: RetrospectiveReportModule;
  patch: (fn: (m: Module) => void) => void;
}) {
  function p(fn: (r: RetrospectiveReportModule) => void) {
    patch((mod) => {
      if (mod.type === 'retrospective_report') fn(mod);
    });
  }
  return (
    <div className="space-y-4">
      <FieldLabel label="Title">
        <input
          type="text"
          className={inputCls}
          value={m.title}
          onChange={(e) => p((r) => (r.title = e.target.value))}
        />
      </FieldLabel>

      <Section
        title="Retrospective questions"
        onAdd={() =>
          p((r) =>
            r.questions.push({
              id: uid(),
              text: 'New question',
              boxHeight: 1.1,
            }),
          )
        }
      >
        {m.questions.map((q, i) => (
          <div
            key={q.id}
            className="border border-[var(--rule)] bg-white p-2 mb-2"
          >
            <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-start">
              <input
                className={inputCls}
                value={q.text}
                onChange={(e) =>
                  p((r) => (r.questions[i].text = e.target.value))
                }
              />
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={q.boxHeight}
                onChange={(e) =>
                  p(
                    (r) =>
                      (r.questions[i].boxHeight =
                        parseFloat(e.target.value) || 0),
                  )
                }
              />
              <div className="flex">
                <button
                  className={iconBtn}
                  disabled={i === 0}
                  onClick={() => p((r) => void moveInArray(r.questions, i, -1))}
                >
                  ↑
                </button>
                <button
                  className={iconBtn}
                  disabled={i === m.questions.length - 1}
                  onClick={() => p((r) => void moveInArray(r.questions, i, 1))}
                >
                  ↓
                </button>
                <button
                  className={iconBtn}
                  onClick={() => p((r) => r.questions.splice(i, 1))}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

// =========================== Task example editor ============================
// Full nested editor: title / studyContext / requirements / city map / initial-
// spec prompts / per-moment prefill snapshots / scenarios with nested per-
// scenario prefill. Mirrors the structure of TaskEditor but the body is
// display-only when rendered to participants; researchers walk through it.
//
// scenarios and prefilled.perScenario stay 1:1 — add/delete operations
// against scenarios mirror onto the prefilled array.

function TaskExampleEditor({
  module: m,
  patch,
}: {
  module: TaskExampleModule;
  patch: (fn: (mod: Module) => void) => void;
}) {
  // The module is a superset of TaskExample; treat it as one for the shared
  // field editors, and write changes back via Object.assign (preserving
  // id/type/walkthroughText, which `next` carries through unchanged).
  const example: TaskExample = m;
  function onChange(next: TaskExample) {
    patch((mod) => {
      if (mod.type !== 'task_example') return;
      Object.assign(mod, next);
    });
  }
  function set<K extends keyof TaskExample>(key: K, value: TaskExample[K]) {
    onChange({ ...example, [key]: value });
  }

  function setPrefilled(next: TaskExamplePrefilled) {
    onChange({ ...example, prefilled: next });
  }

  function setPerScenarioAt(
    i: number,
    patch: Partial<TaskExamplePrefilled['perScenario'][number]>,
  ) {
    const ps = example.prefilled.perScenario.slice();
    ps[i] = { ...ps[i], ...patch };
    setPrefilled({ ...example.prefilled, perScenario: ps });
  }

  function setScenarios(nextScenarios: Scenario[]) {
    // Resize prefilled.perScenario to match the new scenarios length.
    const oldPs = example.prefilled.perScenario;
    const ps: TaskExamplePrefilled['perScenario'] = [];
    for (let i = 0; i < nextScenarios.length; i++) {
      ps.push(oldPs[i] ?? newPrefilledPerScenario());
    }
    onChange({
      ...example,
      scenarios: nextScenarios,
      prefilled: { ...example.prefilled, perScenario: ps },
    });
  }

  const landmarks = cityMapLandmarkOptions(example.cityMap);

  return (
    <div className="space-y-4">
      <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
        Worked-example task — display-only. Participants watch the researcher
        walk through it; authored entities and spec text appear read-only on
        each screen. Place it before the matching warmup task.
      </p>

      <FieldLabel label="Title">
        <input
          type="text"
          className={inputCls}
          value={example.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </FieldLabel>

      <FieldLabel
        label="Researcher narration (shown on the intro screen)"
        onClear={() =>
          patch((mod) => {
            if (mod.type === 'task_example') mod.walkthroughText = '';
          })
        }
        clearDisabled={!m.walkthroughText}
      >
        <textarea
          className={inputCls + ' min-h-[80px]'}
          value={m.walkthroughText ?? ''}
          onChange={(e) =>
            patch((mod) => {
              if (mod.type === 'task_example')
                mod.walkthroughText = e.target.value;
            })
          }
          placeholder="Empty — no narration box on the intro screen"
        />
      </FieldLabel>

      <FieldLabel
        label="Study context (researcher-only — hidden from participant)"
        onClear={() => set('studyContext', '')}
        clearDisabled={!example.studyContext}
      >
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={example.studyContext}
          onChange={(e) => set('studyContext', e.target.value)}
        />
      </FieldLabel>

      <RequirementsListEditor
        requirements={example.requirements}
        setRequirements={(next) => set('requirements', next)}
        title="Example requirements (user stories)"
      />

      <CityMapSection
        cityMap={example.cityMap}
        setCityMap={(next) => set('cityMap', next)}
        title="Example city map (optional override)"
        addLabel="+ add example map"
      />

      <InitialSpecPromptsEditor
        initialSpec={example.initialSpec}
        setInitialSpec={(next) => set('initialSpec', next)}
        title="Example initial-spec prompts"
      />

      <Section title="Initial pre-fill (shown on Example · Initial spec)">
        <div className="border border-[var(--rule)] bg-white p-3 space-y-3">
          <FieldLabel label="Spec text shown initially">
            <textarea
              className={inputCls + ' min-h-[100px] font-mono text-sm'}
              value={example.prefilled.initial.spec}
              onChange={(e) =>
                setPrefilled({
                  ...example.prefilled,
                  initial: { ...example.prefilled.initial, spec: e.target.value },
                })
              }
            />
          </FieldLabel>
          <FieldLabel label="Entities shown initially">
            <PrefilledEntityEditor
              entities={example.prefilled.initial.entities}
              setEntities={(next) =>
                setPrefilled({
                  ...example.prefilled,
                  initial: { ...example.prefilled.initial, entities: next },
                })
              }
            />
          </FieldLabel>
        </div>
      </Section>

      <Section
        title={`Example scenarios (${example.scenarios.length}/3)`}
        onAdd={
          example.scenarios.length < 3
            ? () => {
                const prev = example.scenarios[example.scenarios.length - 1];
                const clonedClauses: Clause[] = prev
                  ? prev.clauses.map((c) => ({
                      id: uid(),
                      type: c.type,
                      text: c.text,
                      marker:
                        c.marker === 'superseded' ? 'superseded' : undefined,
                    }))
                  : [
                      { id: uid(), type: 'Given', text: '' },
                      { id: uid(), type: 'When', text: '' },
                      { id: uid(), type: 'Then', text: '' },
                    ];
                setScenarios([
                  ...example.scenarios,
                  {
                    id: uid(),
                    title: `Scenario ${example.scenarios.length + 1}`,
                    facilitatorNote: '',
                    clauses: clonedClauses,
                  },
                ]);
              }
            : undefined
        }
      >
        {example.scenarios.map((sc, i) => (
          <ScenarioBlock
            key={sc.id}
            scenario={sc}
            index={i}
            total={example.scenarios.length}
            patch={(fn) => {
              const next = example.scenarios.slice();
              const cloned = structuredClone(next[i]);
              fn(cloned);
              next[i] = cloned;
              setScenarios(next);
            }}
            onMove={(dir) => {
              const nextScenarios = example.scenarios.slice();
              if (!moveInArray(nextScenarios, i, dir)) return;
              // Mirror the move in prefilled.perScenario so per-scenario
              // prefills stay attached to their scenario.
              const nextPs = example.prefilled.perScenario.slice();
              moveInArray(nextPs, i, dir);
              onChange({
                ...example,
                scenarios: nextScenarios,
                prefilled: { ...example.prefilled, perScenario: nextPs },
              });
            }}
            onDelete={() => {
              const nextScenarios = example.scenarios.filter(
                (_, idx) => idx !== i,
              );
              const nextPs = example.prefilled.perScenario.filter(
                (_, idx) => idx !== i,
              );
              onChange({
                ...example,
                scenarios: nextScenarios,
                prefilled: { ...example.prefilled, perScenario: nextPs },
              });
            }}
            landmarkOptions={landmarks}
            childAfterFacilitator={
              <details className="mt-2 border border-dashed border-[var(--rule)] p-2">
                <summary className="text-xs italic text-[var(--muted)] cursor-pointer">
                  Pre-fill for this scenario
                </summary>
                <PerScenarioPrefillEditor
                  perScenario={
                    example.prefilled.perScenario[i] ?? newPrefilledPerScenario()
                  }
                  setPerScenario={(patch) => setPerScenarioAt(i, patch)}
                />
              </details>
            }
          />
        ))}
      </Section>
    </div>
  );
}

function PerScenarioPrefillEditor({
  perScenario,
  setPerScenario,
}: {
  perScenario: TaskExamplePrefilled['perScenario'][number];
  setPerScenario: (
    patch: Partial<TaskExamplePrefilled['perScenario'][number]>,
  ) => void;
}) {
  return (
    <div className="mt-2 space-y-3">
      <FieldLabel label="After-read spec text">
        <textarea
          className={inputCls + ' min-h-[80px] font-mono text-sm'}
          value={perScenario.read.spec}
          onChange={(e) =>
            setPerScenario({
              read: { ...perScenario.read, spec: e.target.value },
            })
          }
        />
      </FieldLabel>
      <FieldLabel label="After-read entities">
        <PrefilledEntityEditor
          entities={perScenario.read.entities}
          setEntities={(next) =>
            setPerScenario({
              read: { ...perScenario.read, entities: next },
            })
          }
        />
      </FieldLabel>
      <FieldLabel label="After-revise spec text">
        <textarea
          className={inputCls + ' min-h-[80px] font-mono text-sm'}
          value={perScenario.revise.spec}
          onChange={(e) =>
            setPerScenario({
              revise: { ...perScenario.revise, spec: e.target.value },
            })
          }
        />
      </FieldLabel>
      <FieldLabel label="After-revise entities">
        <PrefilledEntityEditor
          entities={perScenario.revise.entities}
          setEntities={(next) =>
            setPerScenario({
              revise: { ...perScenario.revise, entities: next },
            })
          }
        />
      </FieldLabel>
      <FieldLabel label="Ponder copy (overrides default)">
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={perScenario.ponderCopy ?? ''}
          onChange={(e) =>
            setPerScenario({
              ponderCopy: e.target.value.length === 0 ? undefined : e.target.value,
            })
          }
          placeholder="Leave blank to use the default pause prompt."
        />
      </FieldLabel>
    </div>
  );
}

// =========================== Prefilled entity editor =========================
// Authoring-side mini editor for Entity[]. Same data model as the participant-
// side editor inside ParticipantFlow.tsx but with different layout/bindings —
// the participant editor lives in a client file and is not exported. Keeping
// a small dedicated authoring editor avoids cross-file coupling.

function PrefilledEntityEditor({
  entities,
  setEntities,
}: {
  entities: Entity[];
  setEntities: (next: Entity[]) => void;
}) {
  function addEntity() {
    setEntities([...entities, { id: uid(), name: '', elements: [] }]);
  }
  function updateEntity(i: number, patch: Partial<Entity>) {
    const next = entities.slice();
    next[i] = { ...next[i], ...patch };
    setEntities(next);
  }
  function removeEntity(i: number) {
    setEntities(entities.filter((_, idx) => idx !== i));
  }
  function addElement(i: number) {
    const next = entities.slice();
    next[i] = {
      ...next[i],
      elements: [...next[i].elements, { id: uid(), name: '' }],
    };
    setEntities(next);
  }
  function updateElement(
    i: number,
    ei: number,
    patch: Partial<EntityElement>,
  ) {
    const next = entities.slice();
    const elems = next[i].elements.slice();
    elems[ei] = { ...elems[ei], ...patch };
    next[i] = { ...next[i], elements: elems };
    setEntities(next);
  }
  function removeElement(i: number, ei: number) {
    const next = entities.slice();
    next[i] = {
      ...next[i],
      elements: next[i].elements.filter((_, idx) => idx !== ei),
    };
    setEntities(next);
  }
  return (
    <div className="border border-dashed border-[var(--rule)] bg-white p-2 space-y-2">
      {entities.length === 0 && (
        <p className="text-xs italic text-[var(--muted)]">
          No entities yet — add one below.
        </p>
      )}
      {entities.map((ent, i) => (
        <div key={ent.id} className="border border-[var(--rule)] p-2">
          <div className="flex gap-2 items-center">
            <input
              value={ent.name}
              onChange={(e) => updateEntity(i, { name: e.target.value })}
              placeholder="Entity name"
              className="flex-1 border-0 border-b border-dashed border-[var(--rule)] py-1 bg-transparent text-sm focus:outline-none focus:border-[var(--accent)]"
            />
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
                  placeholder="Element name"
                  className="flex-1 border-0 border-b border-dashed border-[var(--rule)] py-0.5 bg-transparent focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => removeElement(i, ei)}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)]"
                  aria-label="Remove element"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button
        type="button"
        onClick={addEntity}
        className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1"
      >
        + entity
      </button>
    </div>
  );
}

// =========================== Scenario block helpers ============================

function cityMapLandmarkOptions(map: CityMap | undefined): string[] {
  if (!map) return [];
  const out: string[] = [];
  out.push(map.origin.label);
  for (const l of map.landmarks) out.push(l.label);
  return Array.from(new Set(out));
}

function SeededMarkerEditor({
  markers,
  landmarks,
  onChange,
}: {
  markers: SeededMarker[];
  landmarks: string[];
  onChange: (next: SeededMarker[]) => void;
}) {
  if (landmarks.length === 0) {
    return (
      <p className="text-xs italic text-[var(--muted)] mt-2">
        Add landmarks to the city map above first, then seed markers here.
      </p>
    );
  }
  const usedVehicleColors = new Set(
    markers
      .filter((m): m is Extract<SeededMarker, { kind: 'vehicle' }> => m.kind === 'vehicle')
      .map((m) => m.color),
  );
  const usedPersonLetters = new Set(
    markers
      .filter((m): m is Extract<SeededMarker, { kind: 'person' }> => m.kind === 'person')
      .map((m) => m.letter),
  );
  const availableVehicles: SeededVehicleColor[] = (
    ['red', 'blue', 'green'] as const
  ).filter((c) => !usedVehicleColors.has(c));
  const availablePeople: SeededPersonLetter[] = (
    ['A', 'B', 'C'] as const
  ).filter((l) => !usedPersonLetters.has(l));

  function addVehicle() {
    const color = availableVehicles[0];
    if (!color) return;
    onChange([
      ...markers,
      { kind: 'vehicle', color, landmarkLabel: landmarks[0] },
    ]);
  }
  function addPerson() {
    const letter = availablePeople[0];
    if (!letter) return;
    const personColor =
      PERSON_PALETTE[usedPersonLetters.size] ?? PERSON_PALETTE[0];
    onChange([
      ...markers,
      { kind: 'person', letter, personColor, landmarkLabel: landmarks[0] },
    ]);
  }
  function update(i: number, patch: Partial<SeededMarker>) {
    const next = markers.slice();
    next[i] = { ...next[i], ...patch } as SeededMarker;
    onChange(next);
  }
  function remove(i: number) {
    onChange(markers.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2 mt-2">
      {markers.map((m, i) => (
        <div
          key={i}
          className="grid grid-cols-[60px_70px_1fr_auto] gap-2 items-center text-sm"
        >
          <span className="text-xs text-[var(--muted)]">
            {m.kind === 'vehicle'
              ? `Veh ${VEHICLE_COLOR_TO_NUMBER[m.color]}`
              : `Person ${m.letter}`}
          </span>
          <span
            className="h-4 w-4 inline-block border border-[var(--rule)]"
            style={{
              background:
                m.kind === 'vehicle' ? VEHICLE_HEX[m.color] : m.personColor,
            }}
          />
          <select
            value={m.landmarkLabel}
            onChange={(e) =>
              update(i, { landmarkLabel: e.target.value } as Partial<SeededMarker>)
            }
            className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
          >
            {landmarks.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addVehicle}
          disabled={availableVehicles.length === 0}
          className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-2 py-1 disabled:opacity-30"
        >
          + vehicle ({availableVehicles.length} left)
        </button>
        <button
          type="button"
          onClick={addPerson}
          disabled={availablePeople.length === 0}
          className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-2 py-1 disabled:opacity-30"
        >
          + person ({availablePeople.length} left)
        </button>
      </div>
    </div>
  );
}

// =========================== Scenario block ============================

function ScenarioBlock({
  scenario,
  index,
  total,
  patch,
  onMove,
  onDelete,
  landmarkOptions,
  childAfterFacilitator,
}: {
  scenario: TaskContent['scenarios'][number];
  index: number;
  total: number;
  patch: (
    fn: (sc: TaskContent['scenarios'][number]) => void,
  ) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  landmarkOptions: string[];
  childAfterFacilitator?: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--rule)] bg-white p-3 mb-2">
      <div className="flex gap-2 items-baseline mb-2">
        <span className="text-sm text-[var(--muted)] w-6">{index + 1}.</span>
        <input
          className="text-[15px] font-medium flex-1 border-0 border-b border-dashed border-[var(--rule)] py-1 bg-transparent focus:outline-none focus:border-[var(--accent)]"
          value={scenario.title}
          onChange={(e) => patch((sc) => (sc.title = e.target.value))}
        />
        <button
          className={iconBtn}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          className={iconBtn}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <ConfirmButton label="×" confirmLabel="Delete scenario" onConfirm={onDelete} />
      </div>

      {scenario.clauses.map((c, ci) => (
        <div
          key={c.id}
          className="grid grid-cols-[78px_auto_1fr_auto] gap-1 mb-1 items-start"
        >
          <select
            className="text-sm border border-[var(--rule)] px-1 py-1 bg-white"
            value={c.type}
            onChange={(e) =>
              patch(
                (sc) => (sc.clauses[ci].type = e.target.value as Clause['type']),
              )
            }
          >
            <option>Given</option>
            <option>And</option>
            <option>When</option>
            <option>Then</option>
          </select>
          <ClauseMarkerChip
            marker={c.marker}
            onCycle={() =>
              patch((sc) => {
                sc.clauses[ci].marker = cycleClauseMarker(sc.clauses[ci].marker);
              })
            }
          />
          <input
            className={
              inputCls +
              ' text-sm ' +
              (c.marker === 'superseded' ? 'line-through opacity-60' : '')
            }
            value={c.text}
            onChange={(e) => patch((sc) => (sc.clauses[ci].text = e.target.value))}
            placeholder="clause text"
          />
          <div className="flex">
            <button
              className={iconBtn}
              disabled={ci === 0}
              onClick={() => patch((sc) => void moveInArray(sc.clauses, ci, -1))}
              title="Move up"
            >
              ↑
            </button>
            <button
              className={iconBtn}
              disabled={ci === scenario.clauses.length - 1}
              onClick={() => patch((sc) => void moveInArray(sc.clauses, ci, 1))}
              title="Move down"
            >
              ↓
            </button>
            <button
              className={iconBtn}
              onClick={() =>
                patch((sc) =>
                  sc.clauses.splice(ci + 1, 0, {
                    id: uid(),
                    type: 'And',
                    text: '',
                  }),
                )
              }
              title="Insert clause below"
            >
              +
            </button>
            <button
              className={iconBtn}
              onClick={() => patch((sc) => sc.clauses.splice(ci, 1))}
              title="Delete clause"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      <button
        className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1 mt-1"
        onClick={() =>
          patch((sc) =>
            sc.clauses.push({ id: uid(), type: 'And', text: '' }),
          )
        }
      >
        + append clause at end
      </button>

      <details className="mt-2 border border-dashed border-[var(--rule)] p-2">
        <summary className="text-xs italic text-[var(--muted)] cursor-pointer">
          Pre-seeded map markers ({(scenario.seededMarkers ?? []).length})
        </summary>
        <SeededMarkerEditor
          markers={scenario.seededMarkers ?? []}
          landmarks={landmarkOptions}
          onChange={(next) =>
            patch((sc) => {
              sc.seededMarkers = next;
            })
          }
        />
      </details>

      <details className="mt-2">
        <summary className="text-xs italic text-[var(--muted)] cursor-pointer">
          Facilitator note (researcher-only — not printed)
        </summary>
        <textarea
          className="mt-2 w-full border border-[#d8c98a] bg-[#fffbea] px-2 py-1 text-sm min-h-[50px] focus:outline-none focus:border-[var(--accent)]"
          value={scenario.facilitatorNote}
          onChange={(e) =>
            patch((sc) => (sc.facilitatorNote = e.target.value))
          }
        />
      </details>

      {childAfterFacilitator}
    </div>
  );
}

// ============================== City Map ==============================

function defaultCityMap(): CityMap {
  return {
    gridSize: 20,
    streets: [],
    landmarks: [],
    origin: { label: 'Origin / Charging', x: 10, y: 10 },
  };
}

function CityMapSection({
  cityMap,
  setCityMap,
  title = 'City reference map (optional)',
  addLabel = '+ add map',
  removeLabel = 'remove map',
}: {
  cityMap: CityMap | undefined;
  setCityMap: (next: CityMap | undefined) => void;
  title?: string;
  addLabel?: string;
  removeLabel?: string;
}) {
  return (
    <Section
      title={title}
      trailing={
        cityMap ? (
          <ConfirmButton
            label={removeLabel}
            confirmLabel="Remove map"
            onConfirm={() => setCityMap(undefined)}
          />
        ) : (
          <button
            className={iconBtn}
            onClick={() => setCityMap(defaultCityMap())}
          >
            {addLabel}
          </button>
        )
      }
    >
      {cityMap && (
        <CityMapEditor
          map={cityMap}
          onChange={(fn) => {
            // Apply the mutating fn over a structural clone so callers see
            // an immutable update.
            const next = structuredClone(cityMap);
            fn(next);
            setCityMap(next);
          }}
        />
      )}
    </Section>
  );
}

function CityMapEditor({
  map,
  onChange,
}: {
  map: CityMap;
  onChange: (fn: (m: CityMap) => void) => void;
}) {
  return (
    <div className="border border-[var(--rule)] bg-white p-3 space-y-3 text-sm">
      <div className="flex gap-3 items-center">
        <label className="text-xs text-[var(--muted)]">Grid size</label>
        <input
          type="number"
          min={5}
          max={40}
          value={map.gridSize}
          onChange={(e) =>
            onChange((m) => (m.gridSize = parseInt(e.target.value, 10) || 20))
          }
          className="w-20 border border-[var(--rule)] px-2 py-1 bg-white"
        />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-1">
          <h4 className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Streets
          </h4>
          <button
            className={iconBtn}
            onClick={() =>
              onChange((m) =>
                m.streets.push({
                  name: 'New street',
                  from: [0, 10],
                  to: [20, 10],
                }),
              )
            }
          >
            + add
          </button>
        </div>
        {map.streets.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-1 mb-1 items-center"
          >
            <input
              className={inputCls}
              value={s.name}
              onChange={(e) =>
                onChange((m) => (m.streets[i].name = e.target.value))
              }
            />
            <NumInput
              label="x1"
              value={s.from[0]}
              onChange={(v) => onChange((m) => (m.streets[i].from[0] = v))}
            />
            <NumInput
              label="y1"
              value={s.from[1]}
              onChange={(v) => onChange((m) => (m.streets[i].from[1] = v))}
            />
            <NumInput
              label="x2"
              value={s.to[0]}
              onChange={(v) => onChange((m) => (m.streets[i].to[0] = v))}
            />
            <NumInput
              label="y2"
              value={s.to[1]}
              onChange={(v) => onChange((m) => (m.streets[i].to[1] = v))}
            />
            <button
              className={iconBtn}
              onClick={() => onChange((m) => m.streets.splice(i, 1))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-1">
          <h4 className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Landmarks
          </h4>
          <button
            className={iconBtn}
            onClick={() =>
              onChange((m) =>
                m.landmarks.push({ label: 'New landmark', x: 5, y: 5 }),
              )
            }
          >
            + add
          </button>
        </div>
        {map.landmarks.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-1 mb-1 items-center"
          >
            <input
              className={inputCls}
              value={l.label}
              onChange={(e) =>
                onChange((m) => (m.landmarks[i].label = e.target.value))
              }
            />
            <NumInput
              label="x"
              value={l.x}
              onChange={(v) => onChange((m) => (m.landmarks[i].x = v))}
            />
            <NumInput
              label="y"
              value={l.y}
              onChange={(v) => onChange((m) => (m.landmarks[i].y = v))}
            />
            <button
              className={iconBtn}
              onClick={() => onChange((m) => m.landmarks.splice(i, 1))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
          Origin / Charging marker
        </h4>
        <div className="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
          <input
            className={inputCls}
            value={map.origin.label}
            onChange={(e) => onChange((m) => (m.origin.label = e.target.value))}
          />
          <NumInput
            label="x"
            value={map.origin.x}
            onChange={(v) => onChange((m) => (m.origin.x = v))}
          />
          <NumInput
            label="y"
            value={map.origin.y}
            onChange={(v) => onChange((m) => (m.origin.y = v))}
          />
        </div>
      </div>

      <details>
        <summary className="text-xs italic text-[var(--muted)] cursor-pointer">
          Preview
        </summary>
        <div
          className="mt-2"
          dangerouslySetInnerHTML={{ __html: renderCityMapSvg(map) }}
        />
      </details>
    </div>
  );
}

// ============================ Add module ==============================

function AddModuleControl({
  onAdd,
}: {
  onAdd: (type: ModuleType) => void;
}) {
  const [type, setType] = useState<ModuleType>('task');
  return (
    <div className="mt-6 flex gap-2 items-center">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ModuleType)}
        className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
      >
        {(Object.keys(MODULE_TYPE_LABEL) as ModuleType[]).map((t) => (
          <option key={t} value={t}>
            {MODULE_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        onClick={() => onAdd(type)}
        className="text-sm italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1"
      >
        + add module
      </button>
    </div>
  );
}

// =============================== Reusables ===============================

// Cycle blank → 'new' → 'superseded' → blank.
function cycleClauseMarker(
  current: ClauseMarker | undefined,
): ClauseMarker | undefined {
  if (current === undefined) return 'new';
  if (current === 'new') return 'superseded';
  return undefined;
}

function ClauseMarkerChip({
  marker,
  onCycle,
}: {
  marker: ClauseMarker | undefined;
  onCycle: () => void;
}) {
  const base =
    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border self-center min-w-[44px] text-center cursor-pointer transition-colors';
  if (marker === 'new') {
    return (
      <button
        type="button"
        onClick={onCycle}
        title="Marked NEW — click to mark superseded"
        className={
          base +
          ' border-[var(--accent)] text-[var(--accent)] font-medium bg-[var(--rule-soft)]'
        }
      >
        NEW
      </button>
    );
  }
  if (marker === 'superseded') {
    return (
      <button
        type="button"
        onClick={onCycle}
        title="Marked superseded — click to clear"
        className={base + ' border-[var(--rule)] text-[var(--muted)] line-through'}
      >
        strike
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onCycle}
      title="Click to mark NEW"
      className={base + ' border-dashed border-[var(--rule)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]'}
    >
      ·
    </button>
  );
}

const inputCls =
  'w-full border border-[var(--rule)] px-2 py-1 bg-white text-[15px] focus:outline-none focus:border-[var(--accent)]';
const iconBtn =
  'text-xs px-2 py-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-25';

function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = 'Confirm',
  disabled,
}: {
  onConfirm: () => void;
  label: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);
  if (confirming) {
    return (
      <span className="inline-flex gap-2 items-center">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="text-xs text-[var(--danger)] underline hover:no-underline"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className={iconBtn}
    >
      {label}
    </button>
  );
}

function FieldLabel({
  label,
  onClear,
  clearDisabled = false,
  children,
}: {
  label: string;
  // Show a "× clear" link beside the label. Use for non-required content
  // fields (taskDescription, body) so the researcher can empty them in one
  // click — empty values aren't rendered to the participant.
  onClear?: () => void;
  clearDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearDisabled}
            className="text-[10px] italic text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Empty this field — participant won't see anything here."
          >
            × clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  onAdd,
  trailing,
  children,
}: {
  title: string;
  onAdd?: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex justify-between items-baseline mb-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          {title}
        </h3>
        {trailing ?? (onAdd && (
          <button className={iconBtn} onClick={onAdd}>
            + add
          </button>
        ))}
      </div>
      {children}
    </section>
  );
}

function PromptRow({
  prompt,
  boxHeight,
  onPrompt,
  onBoxHeight,
  onUp,
  onDown,
  onDelete,
  canUp,
  canDown,
}: {
  prompt: string;
  boxHeight: number;
  onPrompt: (v: string) => void;
  onBoxHeight: (v: number) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  return (
    <div className="border border-[var(--rule)] bg-white p-2 mb-2">
      <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-start">
        <textarea
          className={inputCls + ' min-h-[40px]'}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
        />
        <input
          type="number"
          step="0.1"
          className={inputCls}
          value={boxHeight}
          onChange={(e) => onBoxHeight(parseFloat(e.target.value) || 0)}
        />
        <div className="flex">
          <button className={iconBtn} disabled={!canUp} onClick={onUp}>
            ↑
          </button>
          <button className={iconBtn} disabled={!canDown} onClick={onDown}>
            ↓
          </button>
          <button className={iconBtn} onClick={onDelete}>
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function ReqField({
  prefix,
  value,
  onChange,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[70px_1fr] gap-2 items-baseline">
      <span className="text-xs italic text-[var(--muted)]">{prefix}</span>
      <input
        className={inputCls + ' text-sm'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-xs text-[var(--muted)] flex gap-1 items-baseline">
      {label}
      <input
        type="number"
        className="w-14 border border-[var(--rule)] px-1 py-0.5 bg-white text-sm"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
