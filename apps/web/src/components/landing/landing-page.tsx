'use client';

import { NavBar } from './nav-bar';
import { HeroSection } from './hero-section';
import { FeaturesSection } from './features-section';
import { HowItWorksSection } from './how-it-works-section';
import { MetricsSection } from './metrics-section';
import { CtaSection } from './cta-section';
import { FooterSection } from './footer-section';

export function LandingPage() {
  return (
    <>
      <NavBar />
      <div className="landing-scroll-container">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <MetricsSection />
        <CtaSection />
        <FooterSection />
      </div>
    </>
  );
}
