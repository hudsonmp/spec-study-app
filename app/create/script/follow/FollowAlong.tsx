'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Screen } from '@/lib/study/screens';
import type {
  Module,
  ProjectContent,
  ThinkAloudWarmupModule,
  TaskModule,
  TaskWarmupModule,
  RetrospectiveReportModule,
} from '@/lib/types/study';

export default function FollowAlong({
  projectId,
  projectName,
  content,
  screens,
  scripts,
  referenceScript,
}: {
  projectId: string;
  projectName: string;
  content: ProjectContent;
  screens: Screen[];
  scripts: Record<string, string>;
  referenceScript: string;
}) {
  const [idx, setIdx] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const [refOpen, setRefOpen] = useState(true);
  const screen = screens[idx];

  if (!screen) {
    return (
      <main className="flex-1 p-10">
        <p className="italic text-[var(--muted)]">
          No screens in this project.
        </p>
        <Link href={`/create/script?p=${projectId}`} className="underline">
          ← Back to script editor
        </Link>
      </main>
    );
  }

  const isGlobalScreen = screen.moduleType === 'global';
  const module = isGlobalScreen
    ? null
    : content.modules.find((m) => m.id === screen.moduleId);
  const script = scripts[screen.key] ?? '';

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-[var(--rule)] px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] truncate">
            {projectName} · Follow along
          </div>
          <div className="text-sm font-medium truncate">{screen.label}</div>
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
        <Link
          href="/create"
          className="text-xs underline hover:no-underline text-[var(--muted)]"
        >
          ← Hub
        </Link>
      </header>
      <div
        className="flex-1 grid overflow-hidden"
        style={{
          gridTemplateColumns: railOpen ? '1fr 360px' : '1fr 32px',
        }}
      >
        <section className="overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            {isGlobalScreen ? (
              <GlobalScreenPreview screen={screen} />
            ) : module ? (
              <ScreenPreview screen={screen} module={module} />
            ) : (
              <p className="italic text-[var(--muted)]">(module not found)</p>
            )}
          </div>
        </section>
        <aside className="border-l border-[var(--rule)] bg-[var(--panel)] overflow-y-auto">
          {railOpen ? (
            <div className="p-4">
              <details
                open={refOpen}
                onToggle={(e) =>
                  setRefOpen((e.target as HTMLDetailsElement).open)
                }
                className="mb-4 border border-dashed border-[var(--rule)] p-3"
              >
                <summary className="text-xs uppercase tracking-wider text-[var(--muted)] cursor-pointer">
                  Think-aloud reference (SIGCSE)
                </summary>
                <p className="whitespace-pre-wrap leading-relaxed text-sm mt-2">
                  {referenceScript}
                </p>
              </details>
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

function isWarmup(m: Module): m is ThinkAloudWarmupModule {
  return m.type === 'think_aloud_warmup';
}

function isTaskLike(m: Module): m is TaskModule | TaskWarmupModule {
  return m.type === 'task' || m.type === 'task_warmup';
}

function isRetrospective(m: Module): m is RetrospectiveReportModule {
  return m.type === 'retrospective_report';
}

function ExampleBannerInline() {
  return (
    <div className="border border-[#d8c98a] bg-[#fffbea] px-3 py-2 text-sm italic text-[#7c5a2e] mb-3">
      <strong className="not-italic font-medium tracking-[0.04em]">
        Example — the researcher will walk through this
      </strong>
    </div>
  );
}

function ScreenPreview({
  screen,
  module,
}: {
  screen: Screen;
  module: Module;
}) {
  switch (screen.kind) {
    case 'warmup_example_intro': {
      if (!isWarmup(module) || !module.example) return <Unsupported />;
      return (
        <div>
          <ExampleBannerInline />
          <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
            <h2 className="text-2xl font-medium tracking-tight mb-4">
              Think-Aloud Instructions
            </h2>
            <p className="text-[var(--muted)] leading-relaxed">
              The researcher will demonstrate the think-aloud method.
            </p>
          </div>
        </div>
      );
    }

    case 'warmup_example_body': {
      if (!isWarmup(module) || !module.example) return <Unsupported />;
      const ex = module.example;
      return (
        <div>
          <ExampleBannerInline />
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight">
              {module.title}
            </h2>
            {ex.altTaskDescription && (
              <p className="italic text-[var(--muted)] leading-relaxed">
                {ex.altTaskDescription}
              </p>
            )}
            {ex.altBody && (
              <p className="whitespace-pre-wrap leading-relaxed">
                {ex.altBody}
              </p>
            )}
            {ex.walkthroughText && (
              <div className="border border-dashed border-[var(--rule)] bg-[var(--panel)] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">
                  Researcher narrates
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-sm">
                  {ex.walkthroughText}
                </p>
              </div>
            )}
            <p className="italic text-[var(--muted)] text-sm mt-6">
              (Reveal example task button shown here.)
            </p>
          </div>
        </div>
      );
    }

    case 'warmup_example_revealed': {
      if (!isWarmup(module) || !module.example) return <Unsupported />;
      const ex = module.example;
      return (
        <div>
          <ExampleBannerInline />
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight">
              {module.title}
            </h2>
            {ex.altBody && (
              <p className="whitespace-pre-wrap leading-relaxed">
                {ex.altBody}
              </p>
            )}
            <div className="border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center mt-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-3">
                Task
              </div>
              <div className="font-mono text-3xl tracking-[0.4em]">
                {ex.altRevealedTask}
              </div>
            </div>
            {ex.walkthroughText && (
              <div className="border border-dashed border-[var(--rule)] bg-[var(--panel)] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">
                  Researcher narrates
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-sm">
                  {ex.walkthroughText}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    case 'task_example_initial_spec': {
      if (!isTaskLike(module) || module.type !== 'task_warmup' || !module.example)
        return <Unsupported />;
      const ex = module.example;
      return (
        <div>
          <ExampleBannerInline />
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight">{ex.title}</h2>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                Prefilled spec (display-only)
              </div>
              <pre className="border border-[var(--rule)] bg-[var(--rule-soft)] p-3 text-sm whitespace-pre-wrap font-mono">
                {ex.prefilled.initial || '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    case 'task_example_scenario_read':
    case 'task_example_scenario_revise': {
      if (!isTaskLike(module) || module.type !== 'task_warmup' || !module.example)
        return <Unsupported />;
      const ex = module.example;
      if (screen.idx == null || screen.idx >= ex.scenarios.length) {
        return <Unsupported />;
      }
      const scenario = ex.scenarios[screen.idx];
      const prefilled = ex.prefilled.perScenario[screen.idx];
      const isRead = screen.kind === 'task_example_scenario_read';
      const specText = isRead ? prefilled?.read : prefilled?.revise;
      return (
        <div>
          <ExampleBannerInline />
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight">
              {ex.title} · {scenario.title}
            </h2>
            <ul className="space-y-2">
              {scenario.clauses.map((clause) => (
                <ClauseLine key={clause.id} clause={clause} />
              ))}
            </ul>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                Prefilled spec — {isRead ? 'after reading' : 'after revising'}
              </div>
              <pre className="border border-[var(--rule)] bg-[var(--rule-soft)] p-3 text-sm whitespace-pre-wrap font-mono">
                {specText || '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    case 'task_example_scenario_ponder': {
      return (
        <div>
          <ExampleBannerInline />
          <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
            <h2 className="text-2xl font-medium tracking-tight mb-4">Pause</h2>
            <p className="text-[var(--muted)] leading-relaxed">
              The researcher pauses here to demonstrate ponder-then-revise.
            </p>
          </div>
        </div>
      );
    }

    case 'warmup_intro': {
      if (!isWarmup(module)) return <Unsupported />;
      return (
        <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
          <h2 className="text-2xl font-medium tracking-tight mb-4">
            Think-Aloud Instructions
          </h2>
          <p className="text-[var(--muted)] leading-relaxed">
            Please do not move on until directed by the researcher.
          </p>
        </div>
      );
    }

    case 'warmup_body': {
      if (!isWarmup(module)) return <Unsupported />;
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title}
          </h2>
          {module.taskDescription && (
            <p className="italic text-[var(--muted)] leading-relaxed">
              {module.taskDescription}
            </p>
          )}
          {module.body && (
            <p className="whitespace-pre-wrap leading-relaxed">{module.body}</p>
          )}
          <p className="italic text-[var(--muted)] text-sm mt-6">
            (Reveal Task button is shown to participants here.)
          </p>
        </div>
      );
    }

    case 'warmup_revealed': {
      if (!isWarmup(module)) return <Unsupported />;
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title}
          </h2>
          {module.taskDescription && (
            <p className="italic text-[var(--muted)] leading-relaxed">
              {module.taskDescription}
            </p>
          )}
          {module.body && (
            <p className="whitespace-pre-wrap leading-relaxed">{module.body}</p>
          )}
          <div className="border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-6 text-center mt-4">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-3">
              Task
            </div>
            <div className="font-mono text-3xl tracking-[0.4em]">
              {module.revealedTask}
            </div>
          </div>
          <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
            Remember to think aloud while you solve this.
          </p>
        </div>
      );
    }

    case 'task_intro': {
      if (!isTaskLike(module)) return <Unsupported />;
      return (
        <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
          <h2 className="text-2xl font-medium tracking-tight mb-2">
            {module.title}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Module {screen.moduleNumber}
          </p>
        </div>
      );
    }

    case 'task_context': {
      if (!isTaskLike(module)) return <Unsupported />;
      return (
        <div className="space-y-6">
          <h2 className="text-2xl font-medium tracking-tight">{module.title}</h2>
          {module.studyContext && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                Study context
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">
                {module.studyContext}
              </p>
            </div>
          )}
          {module.requirements.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                Requirements
              </div>
              <ol className="list-decimal ml-5 space-y-1 text-sm">
                {module.requirements.map((req) => (
                  <li key={req.id}>
                    As a {req.role}, I want {req.want}, so that {req.so}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      );
    }

    case 'task_initial_spec': {
      if (!isTaskLike(module)) return <Unsupported />;
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">{module.title}</h2>
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-3">
              Initial specification
            </div>
            <div className="space-y-4">
              {module.initialSpec.map((spec, i) => (
                <div key={spec.id}>
                  {i > 0 && (
                    <hr className="border-[var(--rule)] mb-4" />
                  )}
                  <p className="italic text-[var(--muted)] leading-relaxed">
                    {spec.prompt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'task_scenario_read': {
      if (!isTaskLike(module)) return <Unsupported />;
      if (screen.idx == null || screen.idx >= module.scenarios.length) {
        return <Unsupported />;
      }
      const scenario = module.scenarios[screen.idx];
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title} · {scenario.title}
          </h2>
          <ul className="space-y-2">
            {scenario.clauses.map((clause) => (
              <ClauseLine key={clause.id} clause={clause} />
            ))}
          </ul>
        </div>
      );
    }

    case 'task_scenario_ponder': {
      return (
        <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
          <h2 className="text-2xl font-medium tracking-tight mb-4">Pause</h2>
          <p className="text-[var(--muted)] leading-relaxed">
            Take a moment to think about this scenario before revising your
            specification.
          </p>
        </div>
      );
    }

    case 'task_scenario_revise': {
      if (!isTaskLike(module)) return <Unsupported />;
      if (screen.idx == null || screen.idx >= module.scenarios.length) {
        return <Unsupported />;
      }
      const scenario = module.scenarios[screen.idx];
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title} · {scenario.title}
          </h2>
          <p className="text-xs italic text-[#7c5a2e] bg-[#fffbea] border border-[#d8c98a] px-3 py-2">
            Revise your specification to account for this scenario.
          </p>
          <ul className="space-y-2">
            {scenario.clauses.map((clause) => (
              <ClauseLine key={clause.id} clause={clause} />
            ))}
          </ul>
        </div>
      );
    }

    case 'retrospective_question': {
      if (!isRetrospective(module)) return <Unsupported />;
      if (screen.idx == null || screen.idx >= module.questions.length) {
        return <Unsupported />;
      }
      const q = module.questions[screen.idx];
      return (
        <div className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Retrospective · Question {screen.idx + 1} of {module.questions.length}
          </p>
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title || 'Retrospective Report'}
          </h2>
          <p className="leading-relaxed">
            <strong>{screen.idx + 1}.</strong> {q.text}
          </p>
          <p className="italic text-[var(--muted)] text-sm">
            (Participant answers in a textarea; their spec and entity table are
            shown read-only beside.)
          </p>
        </div>
      );
    }

    default: {
      return <Unsupported />;
    }
  }
}

function ClauseLine({
  clause,
}: {
  clause: import('@/lib/types/study').Clause;
}) {
  const typeLabel = (
    <strong className="font-mono text-xs uppercase">{clause.type}</strong>
  );

  if (clause.marker === 'superseded') {
    return (
      <li className="list-none flex gap-2 items-baseline opacity-60">
        {typeLabel}{' '}
        <s>{clause.text}</s>
      </li>
    );
  }

  if (clause.marker === 'new') {
    return (
      <li className="list-none flex gap-2 items-baseline font-medium">
        <span className="text-[var(--accent)] font-medium text-xs">NEW —</span>
        {typeLabel} {clause.text}
      </li>
    );
  }

  return (
    <li className="list-none flex gap-2 items-baseline">
      {typeLabel} {clause.text}
    </li>
  );
}

function Unsupported() {
  return <p className="italic text-[var(--muted)]">(unsupported)</p>;
}

// Pre-study / global screens have no module. Render a faithful mock of what
// the participant sees (or doesn't yet see) so the researcher reading the
// script has the right mental model.
function GlobalScreenPreview({ screen }: { screen: Screen }) {
  if (screen.kind === 'pre_system') {
    return (
      <div className="flex flex-col items-center text-center max-w-xl mx-auto py-12">
        <h2 className="text-2xl font-medium tracking-tight mb-4">
          Before the participant joins
        </h2>
        <p className="text-[var(--muted)] leading-relaxed">
          The participant is not yet in the system. Use this script for the
          opening conversation: introductions, consent, screen-share setup,
          and a reminder that everything they say will be recorded.
        </p>
      </div>
    );
  }
  if (screen.kind === 'login') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-medium tracking-tight">Welcome</h2>
        <p className="italic text-[var(--muted)]">
          The participant is on the home screen at <code>/</code>.
        </p>
        <div className="border border-[var(--rule)] bg-[var(--panel)] p-6 space-y-3 max-w-md">
          <div className="flex gap-4 text-sm border-b border-[var(--rule)] pb-2">
            <span className="font-medium">Register</span>
            <span className="text-[var(--muted)]">Log in</span>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
              First name
            </div>
            <div className="border border-[var(--rule)] px-3 py-2 bg-white text-[var(--muted)] italic text-sm">
              participant&apos;s first name
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
              Email
            </div>
            <div className="border border-[var(--rule)] px-3 py-2 bg-white text-[var(--muted)] italic text-sm">
              participant@example.edu
            </div>
          </div>
          <div className="border border-[var(--foreground)] py-2 text-center text-sm">
            Register
          </div>
        </div>
      </div>
    );
  }
  if (screen.kind === 'questionnaire') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-medium tracking-tight">
          Welcome, &lt;name&gt;
        </h2>
        <p className="italic text-[var(--muted)] text-sm">
          The participant is on <code>/onboard</code>, filling out the
          questionnaire. Every field is mandatory; certain answers terminate.
        </p>
        <div className="border border-[var(--rule)] bg-[var(--panel)] p-6 space-y-5 max-w-lg">
          {[
            'Sample short-text question',
            'Sample multiple-choice question',
            'Sample number question',
          ].map((label) => (
            <div key={label}>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                {label}
                <span className="text-[var(--danger)] ml-1">*</span>
              </div>
              <div className="border border-[var(--rule)] px-3 py-2 bg-white h-9" />
            </div>
          ))}
          <div className="border border-[var(--foreground)] py-2 text-center text-sm">
            Submit
          </div>
        </div>
      </div>
    );
  }
  return <Unsupported />;
}
