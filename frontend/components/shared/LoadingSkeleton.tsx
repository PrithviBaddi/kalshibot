'use client';

import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
}

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return (
    <div className={cn('animate-shimmer rounded-lg', className)} />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-6">
      <LoadingSkeleton className="h-3 w-20" />
      <LoadingSkeleton className="mt-4 h-10 w-28" />
      <LoadingSkeleton className="mt-4 h-3 w-full" />
      <LoadingSkeleton className="mt-2 h-3 w-3/4" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-6 border-b border-border/20 px-6 py-5">
      <LoadingSkeleton className="h-4 w-20" />
      <LoadingSkeleton className="h-4 w-64 flex-1" />
      <LoadingSkeleton className="h-6 w-16 rounded-md" />
      <LoadingSkeleton className="h-6 w-6 rounded-full" />
    </div>
  );
}

export function DailyPickSkeleton() {
  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/30 px-6 py-5 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <LoadingSkeleton className="h-2 w-2 rounded-full" />
            <LoadingSkeleton className="h-3 w-24" />
          </div>
          <LoadingSkeleton className="h-6 w-20 rounded-md" />
        </div>
      </div>
      
      {/* Content */}
      <div className="px-6 py-8 lg:px-10 lg:py-12">
        <LoadingSkeleton className="mx-auto h-8 w-96 max-w-full mb-12" />
        
        {/* Gauges */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 mb-12">
          <div className="flex flex-col items-center">
            <LoadingSkeleton className="h-32 w-32 lg:h-44 lg:w-44 rounded-full" />
            <LoadingSkeleton className="mt-3 h-3 w-16" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <LoadingSkeleton className="h-14 w-28 rounded-xl" />
            <LoadingSkeleton className="h-6 w-20" />
          </div>
          <div className="flex flex-col items-center">
            <LoadingSkeleton className="h-32 w-32 lg:h-44 lg:w-44 rounded-full" />
            <LoadingSkeleton className="mt-3 h-3 w-16" />
          </div>
        </div>
        
        {/* Confidence */}
        <div className="max-w-lg mx-auto mb-12">
          <div className="flex justify-between mb-3">
            <LoadingSkeleton className="h-3 w-24" />
            <LoadingSkeleton className="h-5 w-12" />
          </div>
          <LoadingSkeleton className="h-2 w-full rounded-full" />
        </div>
        
        {/* Reasoning */}
        <div className="max-w-2xl mx-auto">
          <LoadingSkeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
