import type { Metadata, Viewport } from 'next';
import '@fontsource/anton/latin-400.css';
import '@fontsource/bangers/latin-400.css';
import '@fontsource/permanent-marker/latin-400.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'GRAFFITIFEST — Put your name on the wall',
  description:
    'One name. One full-screen generative graffiti performance. A live installation at Espronceda, Barcelona.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101110' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
