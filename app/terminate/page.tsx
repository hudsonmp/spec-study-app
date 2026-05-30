import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function TerminatePage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8">
          <h1 className="text-2xl font-medium tracking-tight">
            Thank you for your interest
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            We&rsquo;re sorry — based on your responses, you are not eligible
            for this study.
          </p>
        </header>

        <section className="space-y-4 text-[15px] leading-relaxed">
          <p>
            Your account and any responses you submitted have been removed.
            No record of your registration is retained.
          </p>
          <p>
            We appreciate your time, and we&rsquo;re sorry the criteria for
            this study didn&rsquo;t match. If you have questions, please
            contact the research team.
          </p>
        </section>

        <p className="text-xs text-[var(--muted)] italic pt-10">
          <Link href="/" className="underline hover:no-underline">
            Return to home
          </Link>
        </p>
      </div>
    </main>
  );
}
