import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MaintainAI',
  description: 'AI-powered maintenance platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
