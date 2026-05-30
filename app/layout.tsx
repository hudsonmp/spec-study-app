import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Specification Design Study',
  description: 'Formative think-aloud protocol — participant platform',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
