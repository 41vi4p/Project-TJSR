'use client';

import { ArrowRight, FileText, Zap, Target, Send } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    title: 'Upload Your Resume',
    description: 'Add your resume and let our AI analyze your skills and experience in seconds.',
    step: '01',
  },
  {
    icon: Target,
    title: 'Set Your Preferences',
    description: 'Tell us about your ideal job location, salary range, and job type preferences.',
    step: '02',
  },
  {
    icon: Zap,
    title: 'Get Matched',
    description: 'Our AI instantly matches you with relevant jobs from top companies worldwide.',
    step: '03',
  },
  {
    icon: Send,
    title: 'Apply & Track',
    description: 'Apply to jobs directly and track your applications in one centralized dashboard.',
    step: '04',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            How GenZRadar Works
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Get matched with your ideal job in four simple steps
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const showArrow = index % 2 === 0 && index !== steps.length - 1;

            return (
              <div key={index} className="relative">
                <div className="bg-slate-900/50 border border-purple-500/20 rounded-xl p-8 glow-purple-hover smooth-transition">
                  {/* Step Number */}
                  <div className="absolute -top-6 left-8 w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{item.step}</span>
                  </div>

                  {/* Content */}
                  <div className="pt-6">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                      <Icon size={24} className="text-purple-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-white">{item.title}</h3>
                    <p className="text-gray-400">{item.description}</p>
                  </div>
                </div>

                {/* Arrow - Desktop Only */}
                {showArrow && (
                  <div className="hidden md:flex absolute -right-6 top-1/3 text-blue-500 z-10">
                    <ArrowRight size={32} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 mb-6 text-lg">Ready to find your next opportunity?</p>
          <button className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white font-semibold hover:shadow-lg glow-purple-hover smooth-transition text-lg">
            Start for Free
          </button>
        </div>
      </div>
    </section>
  );
}
