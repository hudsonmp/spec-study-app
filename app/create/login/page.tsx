import ResearcherLoginForm from './ResearcherLoginForm';

export default async function ResearcherLoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;
  return <ResearcherLoginForm next={next && next.startsWith('/create') ? next : '/create'} />;
}
