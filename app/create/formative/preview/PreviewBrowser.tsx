'use client';

import Link from 'next/link';
import type { LoadedProject } from '@/lib/types/study';
import ParticipantFlow from './ParticipantFlow';

// Researcher-facing preview wraps the LIVE participant runner (no mocks) in
// preview mode — Prev/Next/Jump controls live inside the runner's Shell.
// Globals (pre_system, login, questionnaire) are excluded because they're
// real /register and /onboard pages, not screens ParticipantFlow renders.
export default function PreviewBrowser({
  project,
  allProjects,
}: {
  project: LoadedProject;
  allProjects: LoadedProject[];
}) {
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-[var(--rule)] bg-[var(--rule-soft)] px-6 py-2 flex items-center gap-4 flex-wrap text-xs">
        <Link
          href="/create/formative"
          className="text-[var(--muted)] underline hover:no-underline"
        >
          ← Editor
        </Link>
        <span className="text-[var(--muted)]">·</span>
        <span className="font-medium">Preview</span>
        {allProjects.length > 1 && (
          <label className="text-[var(--muted)] flex items-center gap-2">
            Project:
            <ProjectPicker current={project.id} options={allProjects} />
          </label>
        )}
        <Link
          href="/study"
          target="_blank"
          rel="noopener"
          className="ml-auto italic text-[var(--muted)] underline hover:no-underline"
          title="Open the live participant flow in a new tab."
        >
          Interactive (live) ↗
        </Link>
      </header>
      <div className="flex-1 min-h-0">
        <ParticipantFlow project={project} previewMode />
      </div>
    </div>
  );
}

function ProjectPicker({
  current,
  options,
}: {
  current: string;
  options: LoadedProject[];
}) {
  return (
    <select
      defaultValue={current}
      onChange={(e) => {
        const next = e.target.value;
        if (next !== current) {
          window.location.href = `/create/formative/preview?p=${encodeURIComponent(
            next,
          )}`;
        }
      }}
      className="border border-[var(--rule)] bg-white px-2 py-1 text-xs"
    >
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
