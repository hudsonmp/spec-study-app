import Link from 'next/link';
import CreateNav from './CreateNav';

export const dynamic = 'force-dynamic';

type Card = { href: string; title: string; blurb: string };

const CARDS: Card[] = [
  {
    href: '/create/questionnaire',
    title: 'Questionnaire',
    blurb:
      'Author the screening + onboarding questions participants see at /onboard.',
  },
  {
    href: '/create/formative',
    title: 'Protocol',
    blurb:
      'Author the study packet: modules, requirements, scenarios, retrospective.',
  },
  {
    href: '/create/script',
    title: 'Script',
    blurb:
      'Write a researcher script for every participant screen; run a live follow-along.',
  },
  {
    href: '/create/pilot',
    title: 'LLM pilot',
    blurb:
      'Pilot the help-seeking assistant on the real task scenario: edit the system prompt and context, chat, record nothing.',
  },
];

export default function CreateHub() {
  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <CreateNav current="hub" />
      <header className="pb-4 mb-10">
        <h1 className="text-2xl font-medium tracking-tight">
          Research console
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Choose what you want to author or run.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border border-[var(--rule)] bg-[var(--panel)] p-5 hover:border-[var(--foreground)] transition flex flex-col gap-2"
          >
            <h2 className="text-lg font-medium tracking-tight">{c.title}</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed flex-1">
              {c.blurb}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
