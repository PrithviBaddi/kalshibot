'use client';

import { testimonials, socialProofLogos } from '@/lib/mockData';

export function SocialProof() {
  return (
    <section className="relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Logo strip */}
        <div className="mb-20">
          <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-10">
            Featured In
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-6">
            {socialProofLogos.map((logo) => (
              <span
                key={logo}
                className="font-mono text-lg text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-300 cursor-default"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="grid lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group relative"
            >
              <div className="glass-card rounded-2xl p-8 h-full transition-all duration-500 hover:border-primary/30">
                {/* Quote mark */}
                <div className="mb-6">
                  <svg className="w-8 h-8 text-primary/30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                </div>

                {/* Quote */}
                <p className="editorial-heading text-xl lg:text-2xl text-foreground mb-8 leading-relaxed">
                  {testimonial.quote}
                </p>

                {/* Author */}
                <div className="flex items-center gap-4 pt-6 border-t border-border/30">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <span className="font-mono text-sm font-medium text-primary">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-sm text-foreground">{testimonial.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
