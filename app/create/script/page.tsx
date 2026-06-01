import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { enumerateScreens } from '@/lib/study/screens';
import { researcherLogoutAction } from '../actions';
import ScriptEditor from './ScriptEditor';
import ProjectPicker from './ProjectPicker';
import { listScriptsForStudy } from './actions';

export const dynamic = 'force-dynamic';

export default async function ScriptPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const supabase = createServiceRoleClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, visibility, authored_data, updated_at')
    .order('updated_at', { ascending: false });

  const active =
    (studies ?? []).find((s) => s.id === p) ?? (studies ?? [])[0] ?? null;

  if (!active) {
    return (
      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
        <p className="text-sm italic text-[var(--muted)]">
          No projects yet. Create one in{' '}
          <Link href="/create/formative" className="underline">
            Protocol
          </Link>
          .
        </p>
      </main>
    );
  }

  const content = migrateContent(active.authored_data);
  const screens = enumerateScreens(content);
  const scripts = await listScriptsForStudy(active.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-8 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Script</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Author a researcher script for every participant screen. Saves
            in real time.
          </p>
        </div>
        <nav className="flex gap-4 text-sm items-center flex-wrap">
          <ProjectPicker
            studies={(studies ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              visibility: s.visibility,
            }))}
            activeId={active.id}
          />
          <Link
            href={`/create/script/follow?p=${active.id}`}
            className="border border-[var(--foreground)] px-3 py-1 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
          >
            Follow along →
          </Link>
          <Link href="/create" className="underline hover:no-underline">
            ← Hub
          </Link>
          <form action={researcherLogoutAction}>
            <button
              type="submit"
              className="text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <ScriptEditor
        studyId={active.id}
        screens={screens}
        initialScripts={scripts}
      />
    </main>
  );
}
