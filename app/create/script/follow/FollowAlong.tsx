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

  const module = content.modules.find((m) => m.id === screen.moduleId);
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
            {module ? (
              <ScreenPreview screen={screen} module={module} />
            ) : (
              <p className="italic text-[var(--muted)]">(module not found)</p>
            )}
          </div>
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

function isWarmup(m: Module): m is ThinkAloudWarmupModule {
  return m.type === 'think_aloud_warmup';
}

function isTaskLike(m: Module): m is TaskModule | TaskWarmupModule {
  return m.type === 'task' || m.type === 'task_warmup';
}

function isRetrospective(m: Module): m is RetrospectiveReportModule {
  return m.type === 'retrospective_report';
}

function ScreenPreview({
  screen,
  module,
}: {
  screen: Screen;
  module: Module;
}) {
  switch (screen.kind) {
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

    case 'retrospective': {
      if (!isRetrospective(module)) return <Unsupported />;
      return (
        <div className="space-y-4">
          <h2 className="text-2xl font-medium tracking-tight">
            {module.title || 'Retrospective Report'}
          </h2>
          <div className="space-y-3 mt-4">
            {module.questions.map((q) => (
              <p key={q.id} className="leading-relaxed">
                <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mr-2">
                  Q
                </span>
                {q.text}
              </p>
            ))}
          </div>
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
