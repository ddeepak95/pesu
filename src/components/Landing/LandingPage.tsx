"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mic, Languages, Users, BarChart3 } from "lucide-react";
import Link from "next/link";
import LandingNavbar from "./LandingNavbar";
import HowItWorksStep from "./HowItWorksStep";
import { useState, useEffect, useRef } from "react";
export default function LandingPage() {
  const waitlistEmail = "dv292@cornell.edu";
  const waitlistSubject = "Join Waitlist - ConvoEd";
  const waitlistBody =
    "I'm interested in joining the ConvoEd waitlist. Please add me to receive to the waitlist.";
  const mailtoLink = `mailto:${waitlistEmail}?subject=${encodeURIComponent(
    waitlistSubject
  )}&body=${encodeURIComponent(waitlistBody)}`;

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

  // Shared styles
  const wavyUnderlineStyle: React.CSSProperties = {
    textDecoration: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: colors["pink-mist"].base,
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.3em",
  };

  const waitlistButtonStyle = {
    background: `linear-gradient(135deg, ${colors["glaucous-light"].base}, ${colors.glaucous.base})`,
    backgroundSize: "200% 200%",
  };

  const waitlistButtonClassName =
    "text-lg px-8 py-6 text-white hover:opacity-90 hover:scale-105 transition-all duration-300 shadow-lg animate-gradient";

  // State and refs for checking if scrolling is needed
  const [needsScrolling, setNeedsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkScrollNeeded = () => {
      if (containerRef.current && contentRef.current) {
        // Wait for next frame to ensure layout is complete
        requestAnimationFrame(() => {
          if (containerRef.current && contentRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            const contentWidth = contentRef.current.scrollWidth;
            setNeedsScrolling(contentWidth > containerWidth);
          }
        });
      }
    };

    // Initial check after a brief delay to ensure DOM is ready
    const timeoutId = setTimeout(checkScrollNeeded, 100);
    
    // Check when window resizes
    window.addEventListener("resize", checkScrollNeeded);
    
    // Check after images load
    const images = contentRef.current?.querySelectorAll("img");
    if (images && images.length > 0) {
      const imageLoadPromises = Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      Promise.all(imageLoadPromises).then(() => {
        setTimeout(checkScrollNeeded, 50);
      });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", checkScrollNeeded);
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-background font-rubik"
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
      <LandingNavbar mailtoLink={mailtoLink} waitlistText="Join Waitlist" />
      <style jsx>{`
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
        @keyframes gradient-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
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
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 4s ease infinite;
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          display: inline-flex;
          width: max-content;
        }
        .marquee-container:hover .animate-marquee {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-in-left,
          .animate-slide-in-right,
          .animate-gradient,
          .animate-marquee {
            animation: none;
          }
        }
      `}</style>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pink-mist-50/30 via-glaucous-50/20 to-electric-aqua-50/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-30 sm:py-24 lg:py-40 relative z-10">
          <div className="grid lg:grid-cols-[55%_45%] gap-6 lg:gap-3 items-center">
            {/* Hero illustration - appears first on mobile, second on desktop */}
            <div className="relative z-20 flex items-center justify-center lg:justify-start order-1 lg:order-2">
              <img
                src="/home/hero.png"
                alt="Hero illustration"
                className="h-auto w-full max-w-xs sm:max-w-sm lg:max-w-lg mx-auto lg:mx-0"
              />
            </div>

            {/* Hero text content - appears second on mobile, first on desktop */}
            <div className="text-left lg:pl-20 order-2 lg:order-1">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-foreground">
                Improve Learning Through Conversations
              </h1>

              <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed">
                Provide your students with personalized{" "}
                <span className="font-medium" style={wavyUnderlineStyle}>
                  one-on-one learning support
                </span>{" "}
                through{" "}
                <span className="font-medium" style={wavyUnderlineStyle}>
                  voice dialogues with AI in their native language
                </span>
                .
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-start">
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="text-lg px-8 py-6 hover:scale-105 transition-all duration-300 border-foreground"
                  style={{
                    color: "oklch(0.145 0 0)",
                    borderColor: "oklch(0.145 0 0)",
                  }}
                >
                  <Link
                    href="/assignment/U-qOw_dV"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Try Sample Activity
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  className={waitlistButtonClassName}
                  style={waitlistButtonStyle}
                >
                  <a href={mailtoLink}>Join Waitlist</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="relative py-16 sm:py-20 lg:py-24 bg-muted/30 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold mb-8 lg:mb-12 text-center text-foreground">
            The Challenge
          </h2>
          <div className="grid lg:grid-cols-[60%_40%] gap-6 lg:gap-8 items-center">
            {/* Left column: Challenge text content */}
            <div className="lg:pl-20 order-2 lg:order-1">
              <div className="space-y-6 text-lg text-muted-foreground">
                <p>
                  Millions of students learn Science and Mathematics in English,
                  even when English is not their native language and they have
                  not yet fully learned it. While teachers often explain
                  concepts bilingually, assignments and assessments remain
                  English-only, pushing students toward rote memorization rather
                  than understanding.
                </p>
                <p>
                  Large class sizes and limited teacher time make individualized
                  support difficult. Over time, these gaps compound, causing
                  many learners to fall permanently behind.
                </p>
                {/* <p>{t("landing.challenge.paragraph2")}</p> */}
              </div>
            </div>

            {/* Right column: Challenge illustration */}
            <div className="flex items-center justify-center lg:pr-20 order-1 lg:order-2">
              <img
                src="/home/challenge.png"
                alt="Challenge illustration"
                className="w-full h-auto max-w-md mx-auto lg:mx-0"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-8 text-foreground">
              Our Solution
            </h2>
            <img
              src="/home/konvo.png"
              alt="Solution illustration"
              className="w-full h-auto max-w-sm mx-auto mt-8"
            />
            <div className="text-center mb-6 mt-10">
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 inline-block px-6 rounded-2xl"
                style={{ color: "var(--color-glaucous-500)" }}
              >
                Meet Konvo
              </h2>
              <p className="text-lg sm:text-xl text-center text-muted-foreground mb-12">
                Your AI-powered Teaching Assistant, helping students master
                concepts with personalized support in their native language.
              </p>
            </div>

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
                  <CardTitle>Voice-Based Dialogue</CardTitle>
                  <CardDescription>
                    Konvo enables students to explain concepts and respond to
                    questions through natural voice conversations in their
                    native or most comfortable language. This voice-first
                    approach reduces cognitive load and enables deeper thinking.
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
                  <CardTitle>Progressive English Scaffolding</CardTitle>
                  <CardDescription>
                    Konvo gradually introduces English terms and expressions
                    through meaningful, context-grounded interactions. As
                    students engage with concepts, Konvo naturally builds
                    English proficiency alongside conceptual understanding.
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
                  <CardTitle>Personalized Learner Profiles</CardTitle>
                  <CardDescription>
                    Konvo builds a comprehensive learner profile for each
                    student based on their interactions over time. This profile
                    identifies misconceptions, tracks understanding, and reveals
                    individualized learning needs, creating a sustained record
                    that grows and adapts with each conversation.
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
                  <CardTitle>Teacher Insights</CardTitle>
                  <CardDescription>
                    Konvo provides teachers with actionable summaries that help
                    identify which concepts are secure, where misconceptions
                    persist, and which students need targeted support based on
                    learner profiles and interaction data.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
              How It Works
            </h2>
            <div className="space-y-12">
              <HowItWorksStep
                stepNumber={1}
                imageSrc="/home/how-it-works/1_teach.png"
                imageAlt="Learn in Class"
                title="Learn in Class"
                description="Teachers introduce concepts in class as usual, then assign short oral homework using ConvoEd."
                badgeColor={colors["pink-mist"].base}
                borderColor={colors["pink-mist"].light}
              />
              <HowItWorksStep
                stepNumber={2}
                imageSrc="/home/how-it-works/2_interact.png"
                imageAlt="One-on-One Practice at Home"
                title="One-on-One Practice at Home"
                description="Each student engages in personalized voice dialogues with Konvo, explaining concepts, responding to questions, and receiving individualized feedback in their native language."
                badgeColor={colors.glaucous.base}
                borderColor={colors.glaucous.light}
              />
              <HowItWorksStep
                stepNumber={3}
                imageSrc="/home/how-it-works/3_understand.png"
                imageAlt="Build Understanding"
                title="Build Understanding"
                description="Through guided practice, immediate feedback, and progressive English scaffolding, students build strong conceptual foundations."
                badgeColor={colors["glaucous-light"].base}
                borderColor={colors["glaucous-light"].light}
              />
              <HowItWorksStep
                stepNumber={4}
                imageSrc="/home/how-it-works/4_teacher_insights.png"
                imageAlt="Support Teachers"
                title="Support Teachers"
                description="Teachers receive actionable insights about student understanding, enabling targeted support and better instruction."
                badgeColor={colors["electric-aqua"].base}
                borderColor={colors["electric-aqua"].light}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Supported By Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12 text-foreground">
              Supported By
            </h2>
            <div className="relative overflow-hidden" ref={containerRef}>
              <div className="marquee-container">
                <div
                  ref={contentRef}
                  className={`flex items-center gap-8 sm:gap-12 lg:gap-16 whitespace-nowrap ${
                    needsScrolling ? "animate-marquee" : "justify-center"
                  }`}
                >
                  {/* First set of logos */}
                  <img
                    src="/home/supported_by/cornell_logo 1.png"
                    alt="Cornell University"
                    className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  <img
                    src="/home/supported_by/msr.png"
                    alt="Microsoft Research"
                    className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  <img
                    src="/home/supported_by/sikshana.png"
                    alt="Sikshana"
                    className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  <img
                    src="/home/supported_by/cartesia_logo 1.png"
                    alt="Cartesia"
                    className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  {/* Duplicate set for seamless scrolling - only render if scrolling is needed */}
                  {needsScrolling && (
                    <>
                      <img
                        src="/home/supported_by/cornell_logo 1.png"
                        alt="Cornell University"
                        className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                      />
                      <img
                        src="/home/supported_by/msr.png"
                        alt="Microsoft Research"
                        className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                      />
                      <img
                        src="/home/supported_by/sikshana.png"
                        alt="Sikshana"
                        className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                      />
                      <img
                        src="/home/supported_by/cartesia_logo 1.png"
                        alt="Cartesia"
                        className="max-h-6 sm:max-h-7 md:max-h-8 h-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 sm:py-20 lg:py-24 relative bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
              Ready to Transform Learning?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join the waitlist to be among the first to experience ConvoEd and
              help shape the future of multilingual education.
            </p>
            <Button
              asChild
              size="lg"
              className={waitlistButtonClassName}
              style={waitlistButtonStyle}
            >
              <a href={mailtoLink}>Join Waitlist</a>
            </Button>
          </div>
        </div>

        {/* Image - Appears to come out of the footer */}
        <div className="relative flex justify-center pb-0">
          <div className="w-64 sm:w-64 md:w-80 lg:w-96 mt-6">
            <img
              src="/home/cta-2.png"
              alt="ConvoEd"
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="relative bg-muted -mt-20 sm:-mt-26 lg:-mt-30 pb-8 px-4 sm:px-6 lg:px-8 z-20">
        <div className="container mx-auto max-w-6xl pt-8 sm:pt-12 lg:pt-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 mb-8">
            {/* Project Details Section - Takes more space */}
            <div className="md:col-span-5 lg:col-span-4">
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/convoed-logo.svg"
                  alt="ConvoEd Logo"
                  className="h-8 w-auto"
                />
              </div>
              <p
                className="text-sm leading-relaxed max-w-xs"
                style={{ color: "oklch(0.556 0 0)" }}
              >
                Provide your students with personalized one-on-one learning
                support through voice dialogues with AI in their native
                language.
              </p>
            </div>

            {/* Spacer for better distribution */}
            <div className="hidden lg:block lg:col-span-2"></div>

            {/* Legal Section */}
            <div className="md:col-span-3 lg:col-span-3">
              <h3
                className="font-semibold mb-4 text-sm"
                style={{ color: "oklch(0.145 0 0)" }}
              >
                Legal
              </h3>
              <div className="flex flex-col gap-2">
                <Link
                  href="/terms"
                  className="hover:opacity-80 transition-opacity text-sm"
                  style={{ color: "oklch(0.556 0 0)" }}
                >
                  Terms & Conditions
                </Link>
                <Link
                  href="/privacy"
                  className="hover:opacity-80 transition-opacity text-sm"
                  style={{ color: "oklch(0.556 0 0)" }}
                >
                  Privacy Policy
                </Link>
              </div>
            </div>

            {/* Contact Section */}
            <div className="md:col-span-4 lg:col-span-3">
              <h3
                className="font-semibold mb-4 text-sm"
                style={{ color: "oklch(0.145 0 0)" }}
              >
                Contact
              </h3>
              <a
                href="mailto:dv292@cornell.edu"
                className="hover:opacity-80 transition-opacity text-sm block"
                style={{ color: "oklch(0.556 0 0)" }}
              >
                dv292@cornell.edu
              </a>
            </div>
          </div>

          {/* Separator */}
          <div
            className="border-t mb-6"
            style={{ borderColor: "oklch(0.922 0 0)" }}
          ></div>

          {/* Copyright - centered */}
          <p
            className="text-sm text-center"
            style={{ color: "oklch(0.556 0 0)" }}
          >
            © ConvoEd {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
