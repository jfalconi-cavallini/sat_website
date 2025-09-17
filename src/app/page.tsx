"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Brain, Zap, BookOpen, Calculator, Timer, TrendingUp, Sparkles, ChevronRight } from "lucide-react";

type Particle = { left: string; top: string; delay: string; duration: string };

export default function HomePage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Generate particle positions once on the client to avoid SSR hydration mismatches
  useEffect(() => {
    setParticles(
      Array.from({ length: 20 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 3}s`,
        duration: `${2 + Math.random() * 2}s`,
      }))
    );
  }, []);

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-x-clip selection:bg-blue-500/20 selection:text-white">
      {/* Solid base under EVERYTHING */}
      <div className="fixed inset-0 -z-20 bg-slate-950" />

      {/* Animated Background (non-interactive) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-cyan-900/20" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59,130,246,.15), transparent 40%)`,
          }}
        />
        {/* Floating particles (client-only, stable values) */}
        <div className="absolute inset-0">
          {particles.map((p, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-blue-400/30 rounded-full animate-pulse"
              style={{
                left: p.left,
                top: p.top,
                animationDelay: p.delay,
                animationDuration: p.duration,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative px-8 py-20 text-center">
        <div className="max-w-6xl mx-auto">
          <div className="relative inline-block mb-8">
            <h1 className="text-6xl md:text-7xl font-black mb-4 leading-tight">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Your Ultimate</span>
              <br />
              <span className="relative">
                <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">AI-Powered</span>
                <Sparkles className="absolute -top-4 -right-8 w-8 h-8 text-yellow-400 animate-bounce" />
              </span>
              <br />
              <span className="text-white">SAT Prep Platform</span>
            </h1>

            <div className="absolute -top-10 -left-16 w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 animate-pulse" />
            <div className="absolute -bottom-8 -right-12 w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 animate-pulse" />
          </div>

          <p className="text-xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Experience the future of test preparation with AI-driven personalization,
            instant feedback, and adaptive learning that evolves with you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <HighlightBubble
              icon={<Zap className="w-6 h-6 text-yellow-400" />}
              title="Lightning Fast"
              subtitle="AI Feedback"
              description="Instant explanations powered by advanced language models"
              gradient="from-yellow-500/20 to-orange-500/20"
              border="border-yellow-500/30"
            />
            <HighlightBubble
              icon={<Brain className="w-6 h-6 text-purple-400" />}
              title="Adaptive Learning"
              subtitle="Personalized Path"
              description="AI adjusts difficulty based on your performance patterns"
              gradient="from-purple-500/20 to-pink-500/20"
              border="border-purple-500/30"
            />
            <HighlightBubble
              icon={<TrendingUp className="w-6 h-6 text-green-400" />}
              title="Score Boost"
              subtitle="+200 Points"
              description="Average improvement with consistent practice"
              gradient="from-green-500/20 to-cyan-500/20"
              border="border-green-500/30"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <Link
              href="/questions"
              className="group px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/25 inline-flex items-center"
            >
              <span className="flex items-center gap-2 font-semibold">
                Start Learning Now
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          </div>

          <p className="text-sm text-slate-400">
            Join over <span className="text-blue-400 font-semibold">50,000+</span> students already improving their scores
          </p>
        </div>
      </section>

      {/* Features Grid (solid bg to match top) */}
      <section className="px-8 py-20 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Cutting-Edge Features</span>
            </h2>
            <p className="text-slate-400 text-lg">Everything you need to master the SAT, powered by AI</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Brain className="w-8 h-8 text-purple-400" />}
              title="AI-Powered Explanations"
              description="Get detailed, step-by-step explanations tailored to your learning style and mistakes."
              gradient="from-purple-500/10 to-pink-500/10"
            />
            <FeatureCard
              icon={<Calculator className="w-8 h-8 text-blue-400" />}
              title="Built-in Desmos Calculator"
              description="Integrated graphing calculator with no tab switching required during practice."
              gradient="from-blue-500/10 to-cyan-500/10"
            />
            <FeatureCard
              icon={<Timer className="w-8 h-8 text-green-400" />}
              title="Smart Timer System"
              description="Per-question timing with AI analysis of your pacing patterns and improvements."
              gradient="from-green-500/10 to-emerald-500/10"
            />
            <FeatureCard
              icon={<BookOpen className="w-8 h-8 text-orange-400" />}
              title="Comprehensive Question Bank"
              description="13,000+ expertly tagged questions covering every SAT topic and difficulty level."
              gradient="from-orange-500/10 to-red-500/10"
            />
            <FeatureCard
              icon={<TrendingUp className="w-8 h-8 text-cyan-400" />}
              title="Progress Analytics"
              description="Detailed insights into your performance with predictive scoring algorithms."
              gradient="from-cyan-500/10 to-blue-500/10"
            />
            <FeatureCard
              icon={<Sparkles className="w-8 h-8 text-yellow-400" />}
              title="Adaptive Learning Path"
              description="AI creates a personalized study plan that adapts to your strengths and weaknesses."
              gradient="from-yellow-500/10 to-orange-500/10"
            />
          </div>
        </div>
      </section>

      {/* Footer (home page owns footer) */}
      <footer className="px-8 py-12 border-t border-slate-800 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">AIPrep</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-400">
              <Link href="/tests" className="hover:text-blue-400 transition-colors">Practice Tests</Link>
              <Link href="/questions" className="hover:text-blue-400 transition-colors">Question Banks</Link>
              <Link href="/tutor" className="hover:text-blue-400 transition-colors">AI Tutor</Link>
              <Link href="/analytics" className="hover:text-blue-400 transition-colors">Analytics</Link>
            </div>
            <p className="text-sm text-slate-500">© 2025 AIPrep. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

interface HighlightBubbleProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  border: string;
}

function HighlightBubble({ icon, title, subtitle, description, gradient, border }: HighlightBubbleProps) {
  return (
    <div className={`group relative p-6 rounded-2xl bg-gradient-to-br ${gradient} backdrop-blur-sm border ${border} hover:scale-105 transition-all duration-300 cursor-pointer`}>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/50 mb-4 mx-auto">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        <p className="text-sm font-medium text-slate-300 mb-2">{subtitle}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}

function FeatureCard({ icon, title, description, gradient }: FeatureCardProps) {
  return (
    <div className={`group relative p-6 rounded-2xl bg-gradient-to-br ${gradient} backdrop-blur-sm border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1`}>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10">
        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-slate-800/50 mb-4">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
