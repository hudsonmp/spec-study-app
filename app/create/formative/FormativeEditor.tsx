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
  ThinkAloudWarmupModule,
  ThinkAloudExample,
  TaskExample,
  RetrospectiveReportModule,
  ModuleType,
  Clause,
  ClauseMarker,
  CityMap,
  SeededMarker,
  SeededVehicleColor,
  SeededPersonLetter,
} from '@/lib/types/study';
import {
  MODULE_TYPE_LABEL,
  newModuleOfType,
  newThinkAloudExample,
  newTaskExample,
  uid,
  VEHICLE_COLOR_TO_NUMBER,
  VEHICLE_HEX,
  PERSON_PALETTE,
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
      {(m.type === 'task' || m.type === 'task_warmup') && (
        <TaskEditor module={m} patch={patch} />
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
      <FieldLabel label="Task description (what the participant is asked to do)">
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={m.taskDescription}
          onChange={(e) => p((w) => (w.taskDescription = e.target.value))}
        />
      </FieldLabel>
      <FieldLabel label="Warmup body (the actual prompt or scenario)">
        <textarea
          className={inputCls + ' min-h-[120px]'}
          value={m.body}
          onChange={(e) => p((w) => (w.body = e.target.value))}
        />
      </FieldLabel>
      <FieldLabel label="Revealed task (shown after the participant clicks Reveal Task)">
        <input
          type="text"
          className={inputCls + ' font-mono tracking-widest'}
          value={m.revealedTask}
          onChange={(e) => p((w) => (w.revealedTask = e.target.value))}
          placeholder="e.g. NPEPHA"
        />
      </FieldLabel>
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
      <details className="mt-4 border border-dashed border-[var(--rule)] p-3">
        <summary className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] cursor-pointer">
          Example demo {m.example ? '(authored)' : '(none)'}
        </summary>
        {m.example ? (
          <ThinkAloudExampleEditor
            example={m.example}
            onChange={(next) => p((w) => (w.example = next))}
            onClear={() => p((w) => (w.example = undefined))}
          />
        ) : (
          <button
            type="button"
            onClick={() => p((w) => (w.example = newThinkAloudExample()))}
            className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1 mt-2"
          >
            + Add example demo
          </button>
        )}
      </details>
    </div>
  );
}

function ThinkAloudExampleEditor({
  example,
  onChange,
  onClear,
}: {
  example: ThinkAloudExample;
  onChange: (next: ThinkAloudExample) => void;
  onClear: () => void;
}) {
  function set<K extends keyof ThinkAloudExample>(
    key: K,
    value: ThinkAloudExample[K],
  ) {
    onChange({ ...example, [key]: value });
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
        Shown to the participant BEFORE the real warmup, with the banner
        &ldquo;Example — the researcher will walk through this.&rdquo; Screens
        are read-only for the participant.
      </p>
      <FieldLabel label="Alt task description">
        <textarea
          className={inputCls + ' min-h-[60px]'}
          value={example.altTaskDescription}
          onChange={(e) => set('altTaskDescription', e.target.value)}
        />
      </FieldLabel>
      <FieldLabel label="Alt warmup body">
        <textarea
          className={inputCls + ' min-h-[100px]'}
          value={example.altBody}
          onChange={(e) => set('altBody', e.target.value)}
        />
      </FieldLabel>
      <FieldLabel label="Alt revealed task">
        <input
          className={inputCls + ' font-mono tracking-widest'}
          value={example.altRevealedTask}
          onChange={(e) => set('altRevealedTask', e.target.value)}
        />
      </FieldLabel>
      <FieldLabel label="Walkthrough narration (what the researcher says)">
        <textarea
          className={inputCls + ' min-h-[100px]'}
          value={example.walkthroughText}
          onChange={(e) => set('walkthroughText', e.target.value)}
        />
      </FieldLabel>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-[var(--danger)] hover:underline"
      >
        Remove example demo
      </button>
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

      <FieldLabel label="Study context">
        <textarea
          className={inputCls + ' min-h-[80px]'}
          value={m.studyContext}
          onChange={(e) => p((t) => (t.studyContext = e.target.value))}
        />
      </FieldLabel>

      <Section
        title="Requirements (user stories)"
        onAdd={() =>
          p((t) => t.requirements.push({ id: uid(), role: '', want: '', so: '' }))
        }
      >
        {m.requirements.map((r, i) => (
          <div
            key={r.id}
            className="grid grid-cols-[28px_1fr_auto] gap-2 mb-2 items-start"
          >
            <div className="text-xs text-[var(--muted)] pt-2">{i + 1}.</div>
            <div className="grid gap-1">
              <ReqField
                prefix="As a"
                value={r.role}
                onChange={(v) => p((t) => (t.requirements[i].role = v))}
              />
              <ReqField
                prefix="I want"
                value={r.want}
                onChange={(v) => p((t) => (t.requirements[i].want = v))}
              />
              <ReqField
                prefix="so that"
                value={r.so}
                onChange={(v) => p((t) => (t.requirements[i].so = v))}
              />
            </div>
            <div className="flex">
              <button
                className={iconBtn}
                disabled={i === 0}
                onClick={() => p((t) => void moveInArray(t.requirements, i, -1))}
              >
                ↑
              </button>
              <button
                className={iconBtn}
                disabled={i === m.requirements.length - 1}
                onClick={() => p((t) => void moveInArray(t.requirements, i, 1))}
              >
                ↓
              </button>
              <button
                className={iconBtn}
                onClick={() => p((t) => t.requirements.splice(i, 1))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </Section>

      <CityMapSection module={m} patch={p} />

      <Section
        title="Initial specification (prompts shown before scenarios)"
        onAdd={() =>
          p((t) =>
            t.initialSpec.push({ id: uid(), prompt: 'New prompt', boxHeight: 2 }),
          )
        }
      >
        {m.initialSpec.map((sub, i) => (
          <PromptRow
            key={sub.id}
            prompt={sub.prompt}
            boxHeight={sub.boxHeight}
            onPrompt={(v) => p((t) => (t.initialSpec[i].prompt = v))}
            onBoxHeight={(v) => p((t) => (t.initialSpec[i].boxHeight = v))}
            onUp={() => p((t) => void moveInArray(t.initialSpec, i, -1))}
            onDown={() => p((t) => void moveInArray(t.initialSpec, i, 1))}
            onDelete={() => p((t) => t.initialSpec.splice(i, 1))}
            canUp={i > 0}
            canDown={i < m.initialSpec.length - 1}
          />
        ))}
      </Section>

      {m.type === 'task_warmup' && (
        <details className="border border-dashed border-[var(--rule)] p-3">
          <summary className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] cursor-pointer">
            Example demo {m.example ? '(authored)' : '(none)'}
          </summary>
          {m.example ? (
            <TaskExampleEditor
              example={m.example}
              onChange={(next) =>
                patch((mod) => {
                  if (mod.type === 'task_warmup') mod.example = next;
                })
              }
              onClear={() =>
                patch((mod) => {
                  if (mod.type === 'task_warmup') mod.example = undefined;
                })
              }
            />
          ) : (
            <button
              type="button"
              onClick={() =>
                patch((mod) => {
                  if (mod.type === 'task_warmup')
                    mod.example = newTaskExample(m.scenarios.length || 1);
                })
              }
              className="text-xs italic text-[var(--muted)] hover:text-[var(--foreground)] border border-dashed border-[var(--rule)] px-3 py-1 mt-2"
            >
              + Add example demo (stub: paste JSON)
            </button>
          )}
        </details>
      )}

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
            module={m}
          />
        ))}
      </Section>

    </div>
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
// V1 ships as a JSON paste-box stub. The runner consumes the same TaskExample
// shape either way; promoting to a full nested editor is mechanical follow-up
// work. Keeping the surface here small avoids two parallel editors for what
// is morally the same data.

function TaskExampleEditor({
  example,
  onChange,
  onClear,
}: {
  example: TaskExample;
  onChange: (next: TaskExample) => void;
  onClear: () => void;
}) {
  const [raw, setRaw] = useState<string>(() => JSON.stringify(example, null, 2));
  const [err, setErr] = useState<string | null>(null);

  function tryApply() {
    try {
      const parsed = JSON.parse(raw) as TaskExample;
      // Minimal shape check; the runner is defensive on missing fields.
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.scenarios) ||
        !parsed.prefilled ||
        !parsed.prefilled.initial ||
        typeof parsed.prefilled.initial !== 'object' ||
        !Array.isArray(parsed.prefilled.perScenario)
      ) {
        setErr(
          'Missing required fields (scenarios, prefilled.initial, prefilled.perScenario).',
        );
        return;
      }
      setErr(null);
      onChange(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
        Shown BEFORE the real task with a read-only example banner. Spec
        textareas display the prefilled snapshots and cannot be edited by the
        participant.
        <br />
        <strong>V1 stub:</strong> author the example as a JSON blob matching
        the <code>TaskExample</code> shape. <code>prefilled.perScenario</code>{' '}
        length must equal <code>scenarios</code> length.
      </p>
      <textarea
        className={inputCls + ' min-h-[280px] font-mono text-xs'}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
      />
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={tryApply}
          className="text-xs border border-[var(--foreground)] px-3 py-1 hover:bg-[var(--foreground)] hover:text-[var(--background)]"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-[var(--danger)] hover:underline"
        >
          Remove example demo
        </button>
        {err && (
          <span className="text-xs text-[var(--danger)] italic">{err}</span>
        )}
      </div>
    </div>
  );
}

// =========================== Scenario block helpers ============================

function landmarkOptions(
  m: Extract<Module, { type: 'task' | 'task_warmup' }>,
): string[] {
  const map = m.cityMap;
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
  module: parentModule,
}: {
  scenario: TaskContent['scenarios'][number];
  index: number;
  total: number;
  patch: (
    fn: (sc: TaskContent['scenarios'][number]) => void,
  ) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  module: Extract<Module, { type: 'task' | 'task_warmup' }>;
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
          landmarks={landmarkOptions(parentModule)}
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
    </div>
  );
}

// ============================== City Map ==============================

function CityMapSection({
  module: m,
  patch,
}: {
  module: Extract<Module, { type: 'task' | 'task_warmup' }>;
  patch: (fn: (t: TaskContent) => void) => void;
}) {
  return (
    <Section
      title="City reference map (optional)"
      trailing={
        m.cityMap ? (
          <ConfirmButton
            label="remove map"
            confirmLabel="Remove map"
            onConfirm={() =>
              patch((t) => {
                delete t.cityMap;
              })
            }
          />
        ) : (
          <button
            className={iconBtn}
            onClick={() =>
              patch((t) => {
                t.cityMap = {
                  gridSize: 20,
                  streets: [],
                  landmarks: [],
                  origin: { label: 'Origin / Charging', x: 10, y: 10 },
                };
              })
            }
          >
            + add map
          </button>
        )
      }
    >
      {m.cityMap && (
        <CityMapEditor
          map={m.cityMap}
          onChange={(fn) =>
            patch((t) => {
              if (t.cityMap) fn(t.cityMap);
            })
          }
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
        {label}
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
