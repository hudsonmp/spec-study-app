import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { enumerateScreens } from '@/lib/study/screens';
import { listScriptsForStudy } from '../actions';
import FollowAlong from './FollowAlong';

export const dynamic = 'force-dynamic';

export default async function FollowPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const supabase = createServiceRoleClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, authored_data, updated_at')
    .order('updated_at', { ascending: false });
  const active = (studies ?? []).find((s) => s.id === p) ?? (studies ?? [])[0];
  if (!active) {
    return (
      <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
        <p>
          No project.{' '}
          <Link href="/create" className="underline">
            Hub
          </Link>
        </p>
      </main>
    );
  }
  const content = migrateContent(active.authored_data);
  const screens = enumerateScreens(content);
  const scripts = await listScriptsForStudy(active.id);
  return (
    <FollowAlong
      projectId={active.id}
      projectName={active.name}
      content={content}
      screens={screens}
      scripts={scripts}
    />
  );
}
