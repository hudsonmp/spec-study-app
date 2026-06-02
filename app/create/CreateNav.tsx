import Link from 'next/link';
import { researcherLogoutAction } from './actions';

const ITEMS: { href: string; label: string }[] = [
  { href: '/create', label: 'Hub' },
  { href: '/create/questionnaire', label: 'Questionnaire' },
  { href: '/create/formative', label: 'Protocol' },
  { href: '/create/script', label: 'Script' },
];

export default function CreateNav({
  current,
  trailing,
}: {
  current:
    | 'hub'
    | 'questionnaire'
    | 'protocol'
    | 'script'
    | 'follow'
    | 'preview';
  trailing?: React.ReactNode;
}) {
  return (
    <nav className="flex items-center gap-4 text-sm flex-wrap pb-3 border-b border-[var(--rule)] mb-6">
      {ITEMS.map((it) => {
        const isActive =
          (current === 'hub' && it.href === '/create') ||
          (current === 'questionnaire' && it.href === '/create/questionnaire') ||
          (current === 'protocol' && it.href === '/create/formative') ||
          (current === 'script' && it.href === '/create/script') ||
          (current === 'follow' && it.href === '/create/script') ||
          (current === 'preview' && it.href === '/create/formative');
        return (
          <Link
            key={it.href}
            href={it.href}
            className={
              'underline-offset-4 ' +
              (isActive
                ? 'font-medium text-[var(--foreground)] underline'
                : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:underline')
            }
          >
            {it.label}
          </Link>
        );
      })}
      {(current === 'protocol' || current === 'preview') && (
        <Link
          href="/create/formative/preview"
          className={
            'underline-offset-4 italic ' +
            (current === 'preview'
              ? 'font-medium text-[var(--foreground)] underline'
              : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:underline')
          }
        >
          Preview
        </Link>
      )}
      {(current === 'script' || current === 'follow') && (
        <Link
          href="/create/script/follow"
          className={
            'underline-offset-4 italic ' +
            (current === 'follow'
              ? 'font-medium text-[var(--foreground)] underline'
              : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:underline')
          }
        >
          Follow along
        </Link>
      )}
      <div className="ml-auto flex items-center gap-3">
        {trailing}
        <form action={researcherLogoutAction}>
          <button
            type="submit"
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
          >
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
