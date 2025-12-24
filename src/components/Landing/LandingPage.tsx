"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mic, Languages, Users, BarChart3 } from "lucide-react";
import { useEffect, useRef } from "react";

export default function LandingPage() {
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const waitlistEmail = "dv292@cornell.edu";
  const waitlistSubject = "Join Waitlist - Speak2Learn";
  const waitlistBody =
    "I'm interested in joining the Speak2Learn waitlist. Please add me to receive updates about the launch.";
  const mailtoLink = `mailto:${waitlistEmail}?subject=${encodeURIComponent(
    waitlistSubject
  )}&body=${encodeURIComponent(waitlistBody)}`;

  useEffect(() => {
    const observers = sectionRefs.current.map((ref) => {
      if (!ref) return null;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("animate-fade-in");
            }
          });
        },
        { threshold: 0.1 }
      );
      observer.observe(ref);
      return observer;
    });

    return () => {
      observers.forEach((observer) => observer?.disconnect());
    };
  }, []);

  // Harmonious pastel color palette
  const colors = {
    coral: {
      base: "oklch(0.72 0.12 25)",
      light: "oklch(0.94 0.04 25)",
    },
    sky: {
      base: "oklch(0.68 0.10 220)",
      light: "oklch(0.94 0.03 220)",
    },
    lavender: {
      base: "oklch(0.70 0.10 280)",
      light: "oklch(0.94 0.04 280)",
    },
    mint: {
      base: "oklch(0.72 0.10 160)",
      light: "oklch(0.94 0.03 160)",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <style jsx>{`
        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
        @keyframes sound-wave {
          0%,
          100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0) rotate(-2deg);
          }
          50% {
            transform: translateY(-12px) rotate(2deg);
          }
        }
        @keyframes float-up {
          0% {
            transform: translate(0, 20px) scale(0.3) rotate(0deg);
            opacity: 0;
          }
          20% {
            opacity: 0.4;
          }
          80% {
            opacity: 0.4;
          }
          100% {
            transform: translate(var(--drift-x, 15px), -300px) scale(1.2)
              rotate(var(--rotate, 10deg));
            opacity: 0;
          }
        }
        @keyframes wave-flow {
          0% {
            transform: translateX(0) scaleY(1);
            opacity: 0.1;
          }
          50% {
            transform: translateX(-10px) scaleY(1.15);
            opacity: 0.2;
          }
          100% {
            transform: translateX(0) scaleY(1);
            opacity: 0.1;
          }
        }
        .animate-wave-flow {
          animation: wave-flow 12s ease-in-out infinite;
        }
        @keyframes gradient-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        .animate-pulse-ring {
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-sound-wave {
          animation: sound-wave 1.2s ease-in-out infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.6s ease-out forwards;
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.6s ease-out forwards;
        }
        .animate-float-slow {
          animation: float-slow 10s ease-in-out infinite;
        }
        .animate-float-up {
          animation: float-up 8s ease-out infinite;
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 4s ease infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-pulse-ring,
          .animate-sound-wave,
          .animate-fade-in,
          .animate-slide-in-left,
          .animate-slide-in-right,
          .animate-float-slow,
          .animate-float-up,
          .animate-wave-pulse,
          .animate-gradient {
            animation: none;
          }
        }
      `}</style>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[oklch(0.72_0.12_25/0.15)] via-[oklch(0.68_0.10_220/0.12)] to-[oklch(0.70_0.10_280/0.15)]">
        {/* Subtle language scripts scattered on the right */}
        <div
          className="pointer-events-none absolute top-0 right-0 w-1/2 h-full hidden lg:block"
          aria-hidden="true"
        >
          {/* Hindi */}
          <span
            className="absolute text-5xl font-normal"
            style={{
              top: "12%",
              right: "22%",
              color: colors.coral.base,
              opacity: 0.15,
            }}
          >
            अ
          </span>
          {/* Tamil */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "38%",
              right: "6%",
              color: colors.sky.base,
              opacity: 0.13,
            }}
          >
            அ
          </span>
          {/* Telugu */}
          <span
            className="absolute text-6xl font-light"
            style={{
              top: "58%",
              right: "28%",
              color: colors.lavender.base,
              opacity: 0.12,
            }}
          >
            అ
          </span>
          {/* Kannada */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "20%",
              right: "42%",
              color: colors.mint.base,
              opacity: 0.14,
            }}
          >
            ಅ
          </span>
          {/* Malayalam */}
          <span
            className="absolute text-5xl font-normal"
            style={{
              top: "72%",
              right: "12%",
              color: colors.coral.base,
              opacity: 0.12,
            }}
          >
            അ
          </span>
          {/* Bengali */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "48%",
              right: "45%",
              color: colors.sky.base,
              opacity: 0.14,
            }}
          >
            অ
          </span>
          {/* Arabic */}
          <span
            className="absolute text-5xl font-normal"
            style={{
              top: "82%",
              right: "38%",
              color: colors.lavender.base,
              opacity: 0.12,
            }}
          >
            ع
          </span>
          {/* Chinese */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "62%",
              right: "4%",
              color: colors.mint.base,
              opacity: 0.13,
            }}
          >
            中
          </span>
          {/* Japanese */}
          <span
            className="absolute text-5xl font-light"
            style={{
              top: "28%",
              right: "10%",
              color: colors.coral.base,
              opacity: 0.11,
            }}
          >
            あ
          </span>
          {/* Korean */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "88%",
              right: "20%",
              color: colors.sky.base,
              opacity: 0.13,
            }}
          >
            한
          </span>
          {/* Spanish */}
          <span
            className="absolute text-5xl font-normal"
            style={{
              top: "5%",
              right: "8%",
              color: colors.lavender.base,
              opacity: 0.1,
            }}
          >
            ñ
          </span>
          {/* Greek */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "42%",
              right: "18%",
              color: colors.mint.base,
              opacity: 0.12,
            }}
          >
            Ω
          </span>
          {/* Russian */}
          <span
            className="absolute text-5xl font-light"
            style={{
              top: "75%",
              right: "48%",
              color: colors.coral.base,
              opacity: 0.11,
            }}
          >
            Я
          </span>
          {/* Thai */}
          <span
            className="absolute text-4xl font-normal"
            style={{
              top: "32%",
              right: "32%",
              color: colors.sky.base,
              opacity: 0.13,
            }}
          >
            ก
          </span>
          {/* Hebrew */}
          <span
            className="absolute text-5xl font-normal"
            style={{
              top: "52%",
              right: "52%",
              color: colors.lavender.base,
              opacity: 0.1,
            }}
          >
            א
          </span>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-32 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge with mic */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8 relative border bg-background/60 backdrop-blur-sm"
              style={{
                color: colors.coral.base,
                borderColor: `${colors.coral.base}30`,
              }}
            >
              <div
                className="absolute inset-0 rounded-full border animate-pulse-ring"
                style={{ borderColor: `${colors.coral.base}40` }}
              ></div>
              <Mic className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Speak2Learn</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Improve Learning Through Conversations
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto">
              Provide your students with personalized one-on-one learning
              support through voice dialogues with AI in their native language.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="text-lg px-8 py-6 text-white hover:opacity-90 hover:scale-105 transition-all duration-300 shadow-lg animate-gradient"
                style={{
                  background: `linear-gradient(135deg, ${colors.coral.base}, ${colors.lavender.base}, ${colors.sky.base})`,
                  backgroundSize: "200% 200%",
                }}
              >
                <a href={mailtoLink}>Join Waitlist</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section
        ref={(el) => {
          sectionRefs.current[0] = el;
        }}
        className="relative py-16 sm:py-20 lg:py-24 opacity-0 bg-muted/30 overflow-hidden"
      >
        {/* Conversation waves as background */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {/* Ambient glow behind waves */}
          <div
            className="absolute w-[600px] h-[400px] blur-[120px] rounded-full opacity-15"
            style={{
              background: `radial-gradient(circle, ${colors.sky.base}, ${colors.lavender.base})`,
            }}
          ></div>

          {/* Voice/Conversation Waveform - spanning the full width */}
          <svg
            className="absolute w-full h-full overflow-visible"
            viewBox="0 0 1200 400"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            {/* Several overlapping waves for a fluid, calming effect */}
            <path
              className="animate-wave-flow"
              d="M0,200 C200,100 300,300 400,200 C500,100 600,300 700,200 C800,100 900,300 1000,200 C1100,100 1200,300 1200,200"
              stroke={colors.sky.base}
              strokeWidth="1.5"
              fill="none"
              style={{ animationDelay: "0s", animationDuration: "25s" }}
            />
            <path
              className="animate-wave-flow"
              d="M0,200 C150,280 350,120 500,200 C650,280 850,120 1000,200 C1150,280 1200,120 1200,200"
              stroke={colors.lavender.base}
              strokeWidth="1"
              fill="none"
              style={{ animationDelay: "-6s", animationDuration: "30s" }}
            />
            <path
              className="animate-wave-flow"
              d="M0,200 C250,150 350,250 500,200 C650,150 750,250 900,200 C1050,150 1150,250 1200,200"
              stroke={colors.mint.base}
              strokeWidth="1.2"
              fill="none"
              style={{ animationDelay: "-12s", animationDuration: "35s" }}
            />
          </svg>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
              The Challenge
            </h2>
            <div className="space-y-6 text-lg text-muted-foreground">
              <p>
                Millions of learners worldwide study core subjects like Science
                and Mathematics in English, even when English isn&apos;t their
                native language. This creates a dual challenge: students must
                simultaneously develop English proficiency and master complex
                academic concepts.
              </p>
              <p>
                Traditional assessments often fail to distinguish between
                language limitations and conceptual gaps, leading to learning
                loss and forcing students to rely on rote memorization rather
                than true understanding.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section
        ref={(el) => {
          sectionRefs.current[1] = el;
        }}
        className="py-16 sm:py-20 lg:py-24 opacity-0 bg-background"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
              Our Solution
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-12">
              Voice-first AI learning support that bridges language barriers
            </p>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Card 1 - Coral */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors.coral.light }}
                  >
                    <Mic
                      className="w-6 h-6"
                      style={{ color: colors.coral.base }}
                    />
                  </div>
                  <CardTitle>Voice-Based Dialogue</CardTitle>
                  <CardDescription>
                    Students explain concepts and respond to questions in their
                    native or most comfortable language, reducing cognitive load
                    and enabling deeper thinking.
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 2 - Sky */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors.sky.light }}
                  >
                    <Languages
                      className="w-6 h-6"
                      style={{ color: colors.sky.base }}
                    />
                  </div>
                  <CardTitle>Progressive English Scaffolding</CardTitle>
                  <CardDescription>
                    English terms and expressions are gradually introduced
                    through meaningful, context-grounded interactions, building
                    proficiency naturally alongside conceptual understanding.
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 3 - Lavender */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors.lavender.light }}
                  >
                    <Users
                      className="w-6 h-6"
                      style={{ color: colors.lavender.base }}
                    />
                  </div>
                  <CardTitle>One-on-One Learning Support</CardTitle>
                  <CardDescription>
                    Each student receives personalized, individualized attention
                    through voice dialogues. The AI adapts to each
                    learner&apos;s pace, understanding level, and needs,
                    providing the kind of one-on-one support that&apos;s
                    difficult to scale in large classrooms.
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 4 - Mint */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors.mint.light }}
                  >
                    <BarChart3
                      className="w-6 h-6"
                      style={{ color: colors.mint.base }}
                    />
                  </div>
                  <CardTitle>Teacher Insights</CardTitle>
                  <CardDescription>
                    Actionable summaries help teachers identify which concepts
                    are secure, where misconceptions persist, and which students
                    need targeted support.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        ref={(el) => {
          sectionRefs.current[2] = el;
        }}
        className="py-16 sm:py-20 lg:py-24 opacity-0 bg-muted/30"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
              How It Works
            </h2>
            <div className="space-y-8">
              {/* Step 1 - Coral */}
              <div className="flex gap-6 opacity-0 animate-slide-in-left">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md"
                  style={{ backgroundColor: colors.coral.base }}
                >
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Learn in Class</h3>
                  <p className="text-muted-foreground">
                    Teachers introduce concepts in class as usual, then assign
                    short oral homework using Speak2Learn.
                  </p>
                </div>
              </div>

              {/* Step 2 - Sky */}
              <div
                className="flex gap-6 opacity-0 animate-slide-in-right"
                style={{ animationDelay: "0.1s" }}
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md"
                  style={{ backgroundColor: colors.sky.base }}
                >
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    One-on-One Practice at Home
                  </h3>
                  <p className="text-muted-foreground">
                    Each student engages in personalized voice dialogues with
                    AI, explaining concepts, responding to questions, and
                    receiving individualized feedback in their native language.
                  </p>
                </div>
              </div>

              {/* Step 3 - Lavender */}
              <div
                className="flex gap-6 opacity-0 animate-slide-in-left"
                style={{ animationDelay: "0.2s" }}
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md"
                  style={{ backgroundColor: colors.lavender.base }}
                >
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    Build Understanding
                  </h3>
                  <p className="text-muted-foreground">
                    Through guided practice, immediate feedback, and progressive
                    English scaffolding, students build strong conceptual
                    foundations.
                  </p>
                </div>
              </div>

              {/* Step 4 - Mint */}
              <div
                className="flex gap-6 opacity-0 animate-slide-in-right"
                style={{ animationDelay: "0.3s" }}
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md"
                  style={{ backgroundColor: colors.mint.base }}
                >
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    Support Teachers
                  </h3>
                  <p className="text-muted-foreground">
                    Teachers receive actionable insights about student
                    understanding, enabling targeted support and better
                    instruction.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section
        ref={(el) => {
          sectionRefs.current[3] = el;
        }}
        className="py-16 sm:py-20 lg:py-24 relative overflow-hidden opacity-0 bg-gradient-to-br from-[oklch(0.72_0.10_160/0.15)] via-[oklch(0.68_0.10_220/0.12)] to-[oklch(0.70_0.10_280/0.15)]"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Transform Learning?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join the waitlist to be among the first to experience Speak2Learn
              and help shape the future of multilingual education.
            </p>
            <Button
              asChild
              size="lg"
              className="text-lg px-8 py-6 text-white hover:opacity-90 hover:scale-105 transition-all duration-300 shadow-lg animate-gradient"
              style={{
                background: `linear-gradient(135deg, ${colors.coral.base}, ${colors.lavender.base}, ${colors.sky.base})`,
                backgroundSize: "200% 200%",
              }}
            >
              <a href={mailtoLink}>Join Waitlist</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
