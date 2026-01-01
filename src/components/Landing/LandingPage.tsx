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
import { useTranslation } from "react-i18next";
import LandingNavbar from "./LandingNavbar";
export default function LandingPage() {
  const { t } = useTranslation();
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const waitlistEmail = "dv292@cornell.edu";
  const waitlistSubject = "Join Waitlist - ConvoEd";
  const waitlistBody =
    "I'm interested in joining the ConvoEd waitlist. Please add me to receive to the waitlist.";
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

  // Color palette using pink-mist, glaucous, and electric-aqua
  const colors = {
    "pink-mist": {
      base: "#c8376c", // pink-mist-500
      light: "#faebf0", // pink-mist-50
    },
    glaucous: {
      base: "#6A7FDB", // glaucous-400 (primary)
      light: "#eaedfa", // glaucous-50
    },
    "glaucous-light": {
      base: "#8495e1", // glaucous-300
      light: "#eaedfa", // glaucous-50
    },
    "electric-aqua": {
      base: "#22d9dd", // electric-aqua-500
      light: "#e9fbfc", // electric-aqua-50
    },
  };

  // Shared wavy underline style
  const wavyUnderlineStyle: React.CSSProperties = {
    textDecoration: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: colors["pink-mist"].base,
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.3em",
    opacity: 0.7,
  };

  return (
    <div
      className="min-h-screen bg-background"
      style={
        {
          // Force light mode by overriding CSS variables
          "--background": "oklch(1 0 0)",
          "--foreground": "oklch(0.145 0 0)",
          "--card": "oklch(1 0 0)",
          "--card-foreground": "oklch(0.145 0 0)",
          "--popover": "oklch(1 0 0)",
          "--popover-foreground": "oklch(0.145 0 0)",
          "--primary": "#6A7FDB",
          "--primary-foreground": "oklch(0.985 0 0)",
          "--secondary": "oklch(0.97 0 0)",
          "--secondary-foreground": "oklch(0.205 0 0)",
          "--muted": "oklch(0.97 0 0)",
          "--muted-foreground": "oklch(0.556 0 0)",
          "--accent": "oklch(0.97 0 0)",
          "--accent-foreground": "oklch(0.205 0 0)",
          "--destructive": "oklch(0.577 0.245 27.325)",
          "--border": "oklch(0.922 0 0)",
          "--input": "oklch(0.922 0 0)",
          "--ring": "oklch(0.708 0 0)",
        } as React.CSSProperties
      }
    >
      <LandingNavbar
        mailtoLink={mailtoLink}
        waitlistText={t("landing.hero.joinWaitlist")}
      />
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
      <section className="relative overflow-hidden bg-gradient-to-br from-pink-mist-50/30 via-glaucous-50/20 to-electric-aqua-50/30">
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
              color: colors["pink-mist"].base,
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
              color: colors.glaucous.base,
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
              color: colors["glaucous-light"].base,
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
              color: colors["electric-aqua"].base,
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
              color: colors["pink-mist"].base,
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
              color: colors.glaucous.base,
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
              color: colors["glaucous-light"].base,
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
              color: colors["electric-aqua"].base,
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
              color: colors["pink-mist"].base,
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
              color: colors.glaucous.base,
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
              color: colors["glaucous-light"].base,
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
              color: colors["electric-aqua"].base,
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
              color: colors["pink-mist"].base,
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
              color: colors.glaucous.base,
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
              color: colors["glaucous-light"].base,
              opacity: 0.1,
            }}
          >
            א
          </span>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-30 sm:py-24 lg:py-40 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-foreground">
              {t("landing.hero.title")}
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto">
              Provide your students with personalized{" "}
              <span className="relative inline-block">
                <span className="relative z-10">
                  one-on-one learning support
                </span>
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={wavyUnderlineStyle}
                >
                  one-on-one learning support
                </span>
              </span>{" "}
              through{" "}
              <span className="relative inline-block">
                <span className="relative z-10">
                  voice dialogues with AI in their native language
                </span>
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={wavyUnderlineStyle}
                >
                  voice dialogues with AI in their native language
                </span>
              </span>
              .
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                className="text-lg px-8 py-6 text-white hover:opacity-90 hover:scale-105 transition-all duration-300 shadow-lg animate-gradient"
                style={{
                  background: `linear-gradient(135deg, ${colors["pink-mist"].base}, ${colors["glaucous-light"].base}, ${colors.glaucous.base})`,
                  backgroundSize: "200% 200%",
                }}
              >
                <a href={mailtoLink}>{t("landing.hero.joinWaitlist")}</a>
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
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
              {t("landing.challenge.title")}
            </h2>
            <div className="space-y-6 text-lg text-muted-foreground">
              <p>{t("landing.challenge.paragraph1")}</p>
              <p>{t("landing.challenge.paragraph2")}</p>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-foreground">
              {t("landing.solution.title")}
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-12">
              {t("landing.solution.subtitle")}
            </p>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Card 1 - Coral */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors["pink-mist"].light }}
                  >
                    <Mic
                      className="w-6 h-6"
                      style={{ color: colors["pink-mist"].base }}
                    />
                  </div>
                  <CardTitle>
                    {t("landing.solution.cards.voiceDialogue.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("landing.solution.cards.voiceDialogue.description")}
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 2 - Sky */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors.glaucous.light }}
                  >
                    <Languages
                      className="w-6 h-6"
                      style={{ color: colors.glaucous.base }}
                    />
                  </div>
                  <CardTitle>
                    {t("landing.solution.cards.englishScaffolding.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("landing.solution.cards.englishScaffolding.description")}
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 3 - Lavender */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors["glaucous-light"].light }}
                  >
                    <Users
                      className="w-6 h-6"
                      style={{ color: colors["glaucous-light"].base }}
                    />
                  </div>
                  <CardTitle>
                    {t("landing.solution.cards.oneOnOne.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("landing.solution.cards.oneOnOne.description")}
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Card 4 - Mint */}
              <Card>
                <CardHeader>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: colors["electric-aqua"].light }}
                  >
                    <BarChart3
                      className="w-6 h-6"
                      style={{ color: colors["electric-aqua"].base }}
                    />
                  </div>
                  <CardTitle>
                    {t("landing.solution.cards.teacherInsights.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("landing.solution.cards.teacherInsights.description")}
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
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
              {t("landing.howItWorks.title")}
            </h2>
            <div className="space-y-8">
              {/* Step 1 - Coral */}
              <div className="flex gap-6 opacity-0 animate-slide-in-left">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-md"
                  style={{ backgroundColor: colors["pink-mist"].base }}
                >
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">
                    {t("landing.howItWorks.steps.step1.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("landing.howItWorks.steps.step1.description")}
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
                  style={{ backgroundColor: colors.glaucous.base }}
                >
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">
                    {t("landing.howItWorks.steps.step2.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("landing.howItWorks.steps.step2.description")}
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
                  style={{ backgroundColor: colors["glaucous-light"].base }}
                >
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">
                    {t("landing.howItWorks.steps.step3.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("landing.howItWorks.steps.step3.description")}
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
                  style={{ backgroundColor: colors["electric-aqua"].base }}
                >
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">
                    {t("landing.howItWorks.steps.step4.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("landing.howItWorks.steps.step4.description")}
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
        className="py-16 sm:py-20 lg:py-24 relative overflow-hidden opacity-0 bg-gradient-to-br from-electric-aqua-50/30 via-glaucous-50/20 to-pink-mist-50/30"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
              {t("landing.cta.title")}
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              {t("landing.cta.description")}
            </p>
            <Button
              asChild
              size="lg"
              className="text-lg px-8 py-6 text-white hover:opacity-90 hover:scale-105 transition-all duration-300 shadow-lg animate-gradient"
              style={{
                background: `linear-gradient(135deg, ${colors["pink-mist"].base}, ${colors["glaucous-light"].base}, ${colors.glaucous.base})`,
                backgroundSize: "200% 200%",
              }}
            >
              <a href={mailtoLink}>{t("landing.cta.joinWaitlist")}</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
