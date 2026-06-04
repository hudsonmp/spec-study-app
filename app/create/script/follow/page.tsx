import { redirect } from 'next/navigation';

// The follow-along walkthrough has merged into the interactive preview at
// /create/formative/preview (real participant fidelity + script rail +
// prev/next/jump). This route now just forwards there, preserving ?p=.
export default async function FollowPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  redirect(p ? `/create/formative/preview?p=${encodeURIComponent(p)}` : '/create/formative/preview');
}
