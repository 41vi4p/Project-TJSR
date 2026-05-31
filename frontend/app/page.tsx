import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { FeaturesSection } from '@/components/landing/features-section';
import { Footer } from '@/components/landing/footer';
import Spline from '@splinetool/react-spline/next';

export default function Home() {
  return (
    <main className="min-h-screen bg-transparent relative">
      <div className="fixed top-0 left-0 h-screen w-full z-0 pointer-events-none">
        <div className="w-full h-full pointer-events-auto">
          <Spline
            scene="https://prod.spline.design/tK54zJNzKkmizMQo/scene.splinecode"
          />
        </div>
      </div>
      <div className="relative z-10 w-full pointer-events-none">
        <div className="pointer-events-auto">
          <Navbar />
        </div>
        <Hero />
        <div className="pointer-events-auto">
          <FeaturesSection />
          <Footer />
        </div>
      </div>
    </main>
  );
}
