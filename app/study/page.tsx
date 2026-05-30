import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import type { LoadedProject } from '@/lib/types/study';
import ParticipantFlow from '@/app/create/formative/preview/ParticipantFlow';

export const dynamic = 'force-dynamic';

export default async function StudyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  if (!user.has_onboarded) redirect('/onboard');

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
              No active study
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              The researcher hasn&rsquo;t published a study yet.
            </p>
          </header>
          <p className="text-[15px] leading-relaxed">
            Please come back when the researcher signals that the study is live.
          </p>
          <p className="text-xs text-[var(--muted)] italic pt-8">
            <Link href="/" className="underline hover:no-underline">
              Return home
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const project: LoadedProject = {
    id: shown.id,
    slug: shown.slug,
    name: shown.name,
    visibility: shown.visibility,
    content: migrateContent(shown.authored_data),
    updated_at: shown.updated_at,
  };

  return <ParticipantFlow project={project} participantId={user.id} />;
}
