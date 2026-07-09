import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { DEMO_PROJECT_ID, demoContent } from '@/lib/study/demo';
import type { LoadedProject } from '@/lib/types/study';
import ParticipantFlow from '@/app/create/formative/preview/ParticipantFlow';

// Public demo of the study. No auth (not matched by proxy), no sign-up, warmups
// skipped, and — because ParticipantFlow runs with participantId=null — every
// database write path is a no-op. So this route only READS the shown study and
// renders it; it never touches the live IRB dataset.
export const dynamic = 'force-dynamic';

export default async function DemoPage() {
  const supabase = createServiceRoleClient();
  const { data: shown } = await supabase
    .from('studies')
    .select('id, slug, name, visibility, authored_data, updated_at')
    .eq('visibility', 'shown')
    .maybeSingle();

  if (!shown) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full text-center">
          <header className="border-b border-[var(--rule)] pb-4 mb-8">
            <h1 className="text-2xl font-medium tracking-tight">
              No active study to demo
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              There isn&rsquo;t a published study right now.
            </p>
          </header>
          <p className="text-xs text-[var(--muted)] italic pt-4">
            <Link href="/" className="underline hover:no-underline">
              Return home
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // Drop the warmup / worked-example modules so a visitor lands on the real
  // task, and namespace client state under DEMO_PROJECT_ID so it can never
  // collide with a genuine /study session on the same browser.
  const project: LoadedProject = {
    id: DEMO_PROJECT_ID,
    slug: shown.slug,
    name: shown.name,
    visibility: shown.visibility,
    content: demoContent(migrateContent(shown.authored_data)),
    updated_at: shown.updated_at,
  };

  return (
    <ParticipantFlow
      project={project}
      participantId={null}
      pid={null}
      demoMode
    />
  );
}
