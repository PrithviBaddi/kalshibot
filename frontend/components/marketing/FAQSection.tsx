'use client';

import { useState } from 'react';
import { faqs } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="relative py-32">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-4 mb-6">
            <div className="h-px w-8 bg-primary/50" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">FAQ</span>
            <div className="h-px w-8 bg-primary/50" />
          </div>
          <h2 className="editorial-heading text-4xl lg:text-5xl text-foreground mb-6">
            Questions & Answers
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about KalshiBot
          </p>
        </div>

        {/* FAQ items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={cn(
                  'glass-card rounded-xl transition-all duration-300',
                  isOpen && 'border-primary/30'
                )}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between gap-4 p-6 text-left"
                >
                  <span className="font-mono text-sm lg:text-base text-foreground">
                    {faq.question}
                  </span>
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border border-border/50 transition-all duration-300',
                    isOpen && 'border-primary/50 bg-primary/10 rotate-45'
                  )}>
                    <svg 
                      className={cn(
                        'w-4 h-4 transition-colors',
                        isOpen ? 'text-primary' : 'text-muted-foreground'
                      )} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
                
                <div className={cn(
                  'overflow-hidden transition-all duration-300',
                  isOpen ? 'max-h-96' : 'max-h-0'
                )}>
                  <div className="px-6 pb-6">
                    <div className="h-px w-full bg-border/30 mb-4" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Contact CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">Still have questions?</p>
          <a 
            href="mailto:support@kalshipbot.com"
            className="inline-flex items-center gap-2 font-mono text-sm text-primary hover:underline"
          >
            Contact Support
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
