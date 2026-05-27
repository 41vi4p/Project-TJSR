'use client';

import { Brain, Zap, BarChart3, MessageSquare, Shield, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'AI Job Matching',
    description: 'Our advanced AI analyzes your skills and preferences to find the perfect roles tailored just for you.',
  },
  {
    icon: Zap,
    title: 'Instant Alerts',
    description: 'Get notified in real-time when jobs matching your profile are posted. Never miss an opportunity.',
  },
  {
    icon: BarChart3,
    title: 'Match Score',
    description: 'Each job comes with a detailed match score showing compatibility with your skills and interests.',
  },
  {
    icon: MessageSquare,
    title: 'Telegram Bot',
    description: 'Receive daily job digests and apply directly through our Telegram bot integration.',
  },
  {
    icon: Shield,
    title: 'Resume Analysis',
    description: 'Get AI-powered insights on your resume and suggestions to improve your job prospects.',
  },
  {
    icon: Sparkles,
    title: 'Smart Tracking',
    description: 'Track all your applications in one place and get insights on your job search progress.',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-transparent">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            Powerful Features for Gen Z Job Seekers
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Everything you need to find and land your dream job with ease
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-slate-900/50 border border-purple-500/20 rounded-xl p-6 glow-purple-hover smooth-transition hover:bg-slate-800/50 group"
              >
                <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg flex items-center justify-center mb-4 glow-purple group-hover:glow-blue">
                  <Icon size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
