'use client';

const features = [
  {
    number: '01',
    title: 'Agentic Research',
    description: 'AI performs live web research, market data retrieval, and cross-references multiple sources before generating probability estimates.',
    detail: '5 tool calls max',
  },
  {
    number: '02',
    title: 'Daily Pick Engine',
    description: 'One high-conviction pick every day with clear probability gap, confidence score, and actionable recommendation.',
    detail: 'Updated 9AM ET',
  },
  {
    number: '03',
    title: 'Performance Tracking',
    description: 'Transparent historical record with resolved outcomes, accuracy metrics, and detailed reasoning for every prediction.',
    detail: 'Full transparency',
  },
];

export function FeatureHighlights() {
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Background elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-20 lg:mb-24">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px w-12 bg-primary/50" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">How It Works</span>
          </div>
          <h2 className="editorial-heading text-4xl lg:text-5xl xl:text-6xl text-foreground max-w-3xl">
            Intelligence infrastructure for prediction markets
          </h2>
        </div>

        {/* Features grid - editorial asymmetric layout */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.number}
              className="group relative"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="glass-card glass-card-hover rounded-2xl p-8 lg:p-10 h-full">
                {/* Number */}
                <div className="flex items-start justify-between mb-8">
                  <span className="font-mono text-6xl lg:text-7xl font-light text-border/50 group-hover:text-primary/30 transition-colors duration-500">
                    {feature.number}
                  </span>
                  <div className="h-2 w-2 rounded-full bg-primary/50 group-hover:bg-primary transition-colors duration-300" />
                </div>

                {/* Content */}
                <h3 className="editorial-heading text-2xl lg:text-3xl text-foreground mb-4">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-8">
                  {feature.description}
                </p>

                {/* Detail tag */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {feature.detail}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom decorative element */}
        <div className="mt-20 flex justify-center">
          <div className="flex items-center gap-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-border" />
          </div>
        </div>
      </div>
    </section>
  );
}
