import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'KalshiBot — Prediction Market Intelligence',
  description:
    'Institutional-grade AI analysis for prediction markets. Find alpha before the crowd with daily picks and transparent performance tracking.',
  keywords: ['prediction markets', 'AI trading', 'Kalshi', 'market analysis', 'probability', 'alpha'],
  authors: [{ name: 'KalshiBot' }],
  openGraph: {
    title: 'KalshiBot — Prediction Market Intelligence',
    description: 'Institutional-grade AI analysis. Find alpha before the crowd.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KalshiBot — Prediction Market Intelligence',
    description: 'Institutional-grade AI analysis. Find alpha before the crowd.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0f14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen font-sans antialiased selection:bg-primary/30 selection:text-foreground"
        suppressHydrationWarning
      >
        {/* Grain overlay for texture */}
        <div className="grain-overlay" aria-hidden="true" />
        
        <Navbar />
        <main className="relative">{children}</main>
        <Footer />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
