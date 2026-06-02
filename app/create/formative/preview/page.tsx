import Link from 'next/link';
import { listProjects } from '../actions';
import { listScriptsForStudy } from '../../script/actions';
import { SIGCSE_THINK_ALOUD_PROTOCOL } from '@/lib/scripts/sigcse-doc';
import PreviewBrowser from './PreviewBrowser';

export const dynamic = 'force-dynamic';

export default async function PreviewPage(props: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await props.searchParams;
  const projects = await listProjects();

  const active =
    projects.find((x) => x.id === p) ??
    projects.find((x) => x.visibility === 'shown') ??
    projects[0] ??
    null;

  if (!active) {
    return (
      <main className="px-6 py-16 text-center">
        <p className="text-sm text-[var(--muted)] italic">
          No projects to preview yet. Create one in the editor first.
        </p>
        <p className="text-xs text-[var(--muted)] mt-4">
          <Link href="/create/formative" className="underline">
            Back to editor
          </Link>
        </p>
      </main>
    );
  }

  // Per-screen researcher scripts back the merged script rail.
  const scripts = await listScriptsForStudy(active.id);

  return (
    <PreviewBrowser
      project={active}
      allProjects={projects}
      scripts={scripts}
      referenceScript={SIGCSE_THINK_ALOUD_PROTOCOL}
    />
  );
}
