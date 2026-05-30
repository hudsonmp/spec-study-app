import Link from 'next/link';
import { listProjects } from './actions';
import FormativeEditor from './FormativeEditor';
import { researcherLogoutAction } from '@/app/create/actions';

export const dynamic = 'force-dynamic';

export default async function FormativePage(props: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await props.searchParams;
  const projects = await listProjects();

  return (
    <div className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            Formative study editor
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Projects are studies you can author and serve to participants.
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/create" className="underline hover:no-underline">
            Onboarding
          </Link>
          <Link
            href="/create/formative/preview"
            className="underline hover:no-underline"
            target="_blank"
          >
            Preview ↗
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

      <FormativeEditor projects={projects} initialActiveId={p ?? null} />
    </div>
  );
}
