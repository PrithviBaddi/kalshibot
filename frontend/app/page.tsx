import { Hero } from '@/components/marketing/Hero';
import { FeatureHighlights } from '@/components/marketing/FeatureHighlights';
import { TrackRecordSection } from '@/components/marketing/TrackRecordSection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { FAQSection } from '@/components/marketing/FAQSection';

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureHighlights />
      <TrackRecordSection />
      <PricingSection />
      <FAQSection />
    </>
  );
}
