import { listProjects } from './actions';
import FormativeEditor from './FormativeEditor';
import CreateNav from '../CreateNav';

export const dynamic = 'force-dynamic';

export default async function FormativePage(props: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await props.searchParams;
  const projects = await listProjects();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-4 shrink-0">
        <CreateNav current="protocol" />
      </div>
      <FormativeEditor projects={projects} initialActiveId={p ?? null} />
    </div>
  );
}
