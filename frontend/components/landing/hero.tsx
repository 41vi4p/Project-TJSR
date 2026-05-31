'use client';

import { OpeningSequence } from './opening-sequence';

export function Hero() {
  return (
    <div className="min-h-screen pt-20 px-4 sm:px-6 lg:px-8 flex items-center justify-center relative overflow-hidden">
      {/* Background Effects removed for Spline 3D background */}

      {/* Opening Sequence loops over the spline animation */}
      <OpeningSequence />
    </div>
  );
}
