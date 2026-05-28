import { Suspense } from 'react';
import { AnalyzeClient } from './AnalyzeClient';

export const metadata = {
  title: 'Analyze — KalshiBot',
  description: 'On-demand Pro market analysis with full agentic Claude pipeline.',
};

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-32 text-center font-mono text-muted-foreground">Loading...</div>
      }
    >
      <AnalyzeClient />
    </Suspense>
  );
}
