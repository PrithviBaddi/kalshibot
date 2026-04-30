'use client';

import { pricingPlans } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-32 overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-4 mb-6">
            <div className="h-px w-8 bg-primary/50" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Pricing</span>
            <div className="h-px w-8 bg-primary/50" />
          </div>
          <h2 className="editorial-heading text-4xl lg:text-5xl xl:text-6xl text-foreground mb-6">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade when you need full access to our AI intelligence
          </p>
        </div>

        {/* Pricing cards */}
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'group relative rounded-2xl transition-all duration-500',
                plan.highlighted && 'lg:-mt-4 lg:mb-4'
              )}
            >
              {/* Glow effect for highlighted */}
              {plan.highlighted && (
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/50 via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
              )}
              
              <div className={cn(
                'relative glass-card rounded-2xl p-8 lg:p-10 h-full',
                plan.highlighted && 'border-primary/30 glow-amber'
              )}>
                {/* Popular badge */}
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-primary-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <div className="mb-8">
                  <h3 className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="editorial-heading text-5xl lg:text-6xl text-foreground">
                      {plan.price}
                    </span>
                    {plan.priceNote && (
                      <span className="font-mono text-sm text-muted-foreground">
                        {plan.priceNote}
                      </span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-10">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-4">
                      <div className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full mt-0.5',
                        plan.highlighted ? 'bg-primary/20' : 'bg-secondary'
                      )}>
                        <svg className={cn(
                          'w-3 h-3',
                          plan.highlighted ? 'text-primary' : 'text-muted-foreground'
                        )} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/daily-pick"
                  className={cn(
                    'block w-full rounded-lg py-4 text-center font-mono text-sm transition-all duration-300',
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/25'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p className="text-center mt-12 font-mono text-xs text-muted-foreground">
          All plans include SSL encryption and secure data handling. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
