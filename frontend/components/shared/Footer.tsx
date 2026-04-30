import Link from 'next/link';

const footerLinks = {
  Product: [
    { label: 'Daily Pick', href: '/daily-pick' },
    { label: 'Performance', href: '/history' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'API', href: '#' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Legal: [
    { label: 'Terms', href: '#' },
    { label: 'Privacy', href: '#' },
    { label: 'Disclaimer', href: '#' },
  ],
};

export function Footer() {
  return (
    <footer className="relative border-t border-border/30 bg-background">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-px w-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-2 gap-12 lg:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2">
            <Link href="/" className="group inline-flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-primary/10" />
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-card">
                  <span className="font-mono text-lg font-medium text-primary">K</span>
                </div>
              </div>
              <span className="editorial-heading text-xl text-foreground">
                KalshiBot
              </span>
            </Link>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Institutional-grade AI analysis for prediction markets. 
              Find alpha before the crowd.
            </p>
            
            {/* Status indicator */}
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-4 py-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">All systems operational</span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {category}
              </h3>
              <ul className="mt-6 space-y-4">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group flex items-center gap-2 text-sm text-secondary-foreground transition-colors hover:text-primary"
                    >
                      <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-border/30 pt-8 lg:flex-row">
          <p className="font-mono text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} KalshiBot. All rights reserved.
          </p>
          <p className="font-mono text-xs text-muted-foreground/60">
            Not financial advice. Prediction markets involve risk. Trade responsibly.
          </p>
        </div>
      </div>
    </footer>
  );
}
