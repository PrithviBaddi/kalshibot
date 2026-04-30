import { Hero } from '@/components/marketing/Hero';
import { FeatureHighlights } from '@/components/marketing/FeatureHighlights';
import { SocialProof } from '@/components/marketing/SocialProof';
import { PricingSection } from '@/components/marketing/PricingSection';
import { FAQSection } from '@/components/marketing/FAQSection';

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureHighlights />
      <SocialProof />
      <PricingSection />
      <FAQSection />
    </>
  );
}
