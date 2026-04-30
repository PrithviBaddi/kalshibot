'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/daily-pick', label: 'Daily Pick' },
  { href: '/history', label: 'Performance' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl border-b border-border/50" />
      
      <nav className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link 
            href="/" 
            className="group flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <div className="relative flex h-10 w-10 items-center justify-center">
              <div className="absolute inset-0 rounded-lg bg-primary/20 animate-pulse-glow" />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-primary/50 bg-background">
                <span className="font-mono text-lg font-medium text-primary">K</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="editorial-heading text-xl text-foreground">
                KalshiBot
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Intelligence
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative px-5 py-2.5 font-mono text-sm transition-all duration-300',
                    isActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-6 bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </button>
            <Link
              href="/daily-pick"
              className="group relative overflow-hidden rounded-md bg-primary px-5 py-2.5 font-mono text-sm text-primary-foreground transition-all duration-300 hover:shadow-lg hover:shadow-primary/20"
            >
              <span className="relative z-10">Get Started</span>
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden relative z-10 flex h-10 w-10 items-center justify-center"
            aria-label="Toggle menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className={cn(
                'block h-px w-6 bg-foreground transition-all duration-300',
                mobileOpen && 'translate-y-[7px] rotate-45'
              )} />
              <span className={cn(
                'block h-px w-6 bg-foreground transition-all duration-300',
                mobileOpen && 'opacity-0'
              )} />
              <span className={cn(
                'block h-px w-6 bg-foreground transition-all duration-300',
                mobileOpen && '-translate-y-[7px] -rotate-45'
              )} />
            </div>
          </button>
        </div>

        <div className={cn(
          'md:hidden absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-border transition-all duration-300 overflow-hidden',
          mobileOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        )}>
          <div className="px-6 py-6 space-y-4">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block font-mono text-lg transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="pt-4 border-t border-border space-y-3">
              <button className="block w-full text-left font-mono text-muted-foreground">
                Sign In
              </button>
              <Link
                href="/daily-pick"
                onClick={() => setMobileOpen(false)}
                className="block w-full rounded-md bg-primary py-3 text-center font-mono text-primary-foreground"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
