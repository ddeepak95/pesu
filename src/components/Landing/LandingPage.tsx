"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Mic,
  Languages,
  Users,
  BarChart3,
  Code2,
  ClipboardCheck,
  MessagesSquare,
  Quote,
  Keyboard,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import LandingNavbar from "./LandingNavbar";
import HowItWorksStep from "./HowItWorksStep";
import { useState, useEffect, useRef } from "react";
export default function LandingPage() {
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

  // Active tab for use cases section
  const [activeTab, setActiveTab] = useState<"viva" | "oral" | "socratic">(
    "viva",
  );

  // State and refs for checking if scrolling is needed
  const [needsScrolling, setNeedsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Force light color-scheme + light --canvas/--grain-opacity on <html> for the
  // page's lifetime. This makes native UI (scrollbars, form widgets, portalled
  // popovers) follow the forced-light intent even when the OS prefers dark,
  // and lets the body's existing canvas + grain ::before render with the
  // light-mode warm beige and light-intensity grain underneath this page.
  useEffect(() => {
    const html = document.documentElement;
    const previousColorScheme = html.style.colorScheme;
    const previousCanvas = html.style.getPropertyValue("--canvas");
    const previousGrainOpacity = html.style.getPropertyValue("--grain-opacity");

    html.style.colorScheme = "light";
    html.style.setProperty("--canvas", "#faf7f1");
    html.style.setProperty("--grain-opacity", "0.225");

    return () => {
      html.style.colorScheme = previousColorScheme;
      if (previousCanvas) {
        html.style.setProperty("--canvas", previousCanvas);
      } else {
        html.style.removeProperty("--canvas");
      }
      if (previousGrainOpacity) {
        html.style.setProperty("--grain-opacity", previousGrainOpacity);
      } else {
        html.style.removeProperty("--grain-opacity");
      }
    };
  }, []);

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
      className="min-h-screen font-rubik"
      style={
        {
          // Force light mode by mirroring the light-theme tokens from globals.css :root
          colorScheme: "light",
          "--background": "#fafafa",
          "--canvas": "#faf7f1",
          "--foreground": "oklch(0.145 0 0)",
          "--card": "oklch(0.98 0 0)",
          "--card-foreground": "oklch(0.145 0 0)",
          "--card-shadow":
            "inset 0 1px 0 oklch(1 0 0 / 55%), inset 0 -1px 0 oklch(0 0 0 / 6%), 0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)",
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
      <LandingNavbar />
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
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 sm:pt-28 sm:pb-24 lg:pt-36 lg:pb-40 relative z-10">
          <div className="grid lg:grid-cols-[55%_45%] gap-6 lg:gap-3 items-center">
            {/* Hero illustration - appears first on mobile, second on desktop */}
            <div className="relative z-20 flex items-center justify-center lg:justify-start order-1 lg:order-2">
              <Image
                src="/home/hero.png"
                alt="Illustration of conversational learning with ConvoEd"
                width={512}
                height={512}
                className="h-auto w-full max-w-xs sm:max-w-sm lg:max-w-lg mx-auto lg:mx-0"
              />
            </div>

            {/* Hero text content - appears second on mobile, first on desktop */}
            <div className="text-left lg:pl-20 order-2 lg:order-1 max-w-xl lg:max-w-none">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-foreground text-balance">
                Improve Learning Through Conversations
              </h1>

              <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed text-pretty">
                Conduct conversational activities such as{" "}
                <span
                  className="font-medium text-foreground/90"
                  style={wavyUnderlineStyle}
                >
                  vivas on student work, oral assessments, and guided learning
                  conversations
                </span>{" "}
                for your whole class with AI support.
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
                  className="text-lg px-8 py-6"
                  style={{ color: "#fff" }}
                >
                  <Link href="/login">Login</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bridge strip */}
      <section className="py-12 sm:py-14 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-5">
            <p className="text-xl sm:text-2xl font-semibold text-foreground leading-snug">
              ConvoEd acts as your teaching assistant, conducting conversational
              learning activities with students based on your instructions. You
              define the activity and set the goals; ConvoEd runs each session
              and brings back the insights.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Multilingual learners can{" "}
              <span
                className="font-medium text-foreground/90"
                style={wavyUnderlineStyle}
              >
                use their native-language strengths
              </span>{" "}
              instead of being limited to English-only explanations.
            </p>
          </div>
        </div>
      </section>

      {/* How teachers use ConvoEd */}
      <section
        id="how-teachers-use-it"
        className="relative py-16 sm:py-20 lg:py-24 bg-muted/30 overflow-hidden"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-foreground">
              How teachers use ConvoEd
            </h2>
            <p className="text-lg text-center text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed text-pretty">
              ConvoEd conducts the conversation on your behalf. You set the
              activity and the goals. It runs each session and brings back the
              insights.
            </p>

            {/* Tab bar */}
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-0 border-b border-border mb-10">
              {(
                [
                  { key: "viva", label: "Viva on student work" },
                  { key: "oral", label: "Oral assessments" },
                  { key: "socratic", label: "Socratic support" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex-1 py-3 px-4 text-sm sm:text-base font-medium text-left sm:text-center transition-colors duration-150 border-b-2 -mb-px"
                  style={{
                    borderBottomColor:
                      activeTab === tab.key
                        ? colors.glaucous.base
                        : "transparent",
                    color:
                      activeTab === tab.key
                        ? colors.glaucous.base
                        : "oklch(0.556 0 0)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            {activeTab === "viva" && (
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ backgroundColor: colors["pink-mist"].light }}
                  >
                    <Code2
                      className="w-6 h-6"
                      style={{ color: colors["pink-mist"].base }}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Viva on student work
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Assign a viva to your whole class. ConvoEd reads each
                      student&apos;s submission (code, writing, or other work)
                      and conducts a focused voice dialogue, probing
                      understanding and asking follow-up questions grounded in
                      the actual artifact.
                    </p>
                  </div>
                </div>
                <div className="space-y-6 pl-0 sm:pl-16">
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      You assign the activity.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Share the submission with ConvoEd and set the scope: which
                      concepts or criteria you want probed.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      Each student completes a voice session.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      ConvoEd opens the dialogue by referencing the
                      student&apos;s specific work, then asks questions that go
                      deeper based on their responses.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      You receive a per-student summary.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      ConvoEd flags areas of shallow reasoning or confusion so
                      you know exactly where to follow up.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "oral" && (
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ backgroundColor: colors.glaucous.light }}
                  >
                    <ClipboardCheck
                      className="w-6 h-6"
                      style={{ color: colors.glaucous.base }}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Oral assessments
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Check whether students truly understand concepts, not just
                      how well they recall answers in writing. ConvoEd asks
                      probing questions, follows up on vague responses, and
                      surfaces how a student reasons aloud.
                    </p>
                  </div>
                </div>
                <div className="space-y-6 pl-0 sm:pl-16">
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      You set the topic and targets.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Define the concepts you want assessed and the level of
                      understanding you are looking for.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      ConvoEd runs the assessment.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Each student answers and explains through voice. ConvoEd
                      follows up based on what they say, probing further where
                      responses are incomplete.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      You review the outcomes.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      A summary highlights which students demonstrated secure
                      understanding and which need revisiting before moving on.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "socratic" && (
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ backgroundColor: colors["glaucous-light"].light }}
                  >
                    <MessagesSquare
                      className="w-6 h-6"
                      style={{ color: colors["glaucous-light"].base }}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      Socratic support
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Let students revisit topics through guided voice
                      conversation at their own pace. ConvoEd does not give
                      answers directly. It asks questions that help students
                      reason toward understanding themselves.
                    </p>
                  </div>
                </div>
                <div className="space-y-6 pl-0 sm:pl-16">
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      You assign it as practice or support.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      It can be optional extra help or required revision after a
                      lesson.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      The student engages when ready.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      ConvoEd opens with a question grounded in the topic and
                      builds on each response, guiding the student to work
                      through the idea themselves.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">
                      The conversation adapts as it progresses.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      If the student is stuck, ConvoEd adjusts its questions. If
                      understanding is clear, it moves on to related or more
                      complex ideas.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* What students say — moved above capabilities for social proof flow */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
              What students say about ConvoEd
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <Quote
                    className="w-8 h-8 mb-2 opacity-40"
                    style={{ color: colors.glaucous.base }}
                    aria-hidden
                  />
                  <blockquote className="text-base sm:text-lg text-muted-foreground leading-relaxed border-l-0 pl-0">
                    <p>
                      The questions the bot asked often made sure I understood
                      the material fully and was able to point out areas where I
                      was incorrect, which I thought was helpful because I
                      received immediate feedback. I also liked that I was able
                      to talk about my thought process, and I think talking
                      about it would really help the material stick in my brain.
                    </p>
                  </blockquote>
                </CardHeader>
              </Card>
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <Quote
                    className="w-8 h-8 mb-2 opacity-40"
                    style={{ color: colors["pink-mist"].base }}
                    aria-hidden
                  />
                  <blockquote className="text-base sm:text-lg text-muted-foreground leading-relaxed border-l-0 pl-0">
                    <p>
                      I really like the fact that bot had my code and was asking
                      probing questions about it, which I thought was really
                      well done. The assistant was very polite, and very
                      patient.
                    </p>
                  </blockquote>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* What makes it work */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-foreground">
              What makes it work
            </h2>
            <p className="text-lg text-center text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Conversational activities at class scale, learner profiles from
              every session, and summaries you can act on.
            </p>

            {/* Modality card — full width */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-center mb-6">
                  Voice or text, your choice
                </CardTitle>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="flex gap-4 items-start">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colors["pink-mist"].light }}
                    >
                      <Mic
                        className="w-6 h-6"
                        style={{ color: colors["pink-mist"].base }}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">
                        Voice conversation
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Students speak naturally and ConvoEd listens, responds,
                        and adapts. Best for vivas, oral assessments, and
                        practice activities where spoken explanation matters.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: colors.glaucous.light }}
                    >
                      <Keyboard
                        className="w-6 h-6"
                        style={{ color: colors.glaucous.base }}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">
                        Text conversation
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Students type their responses. Same conversational depth
                        and adaptive follow-up, in a text format. Useful where
                        voice is not practical.
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
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
                  <CardTitle>Conversation-based activities</CardTitle>
                  <CardDescription>
                    Students explain and reason through conversation for vivas,
                    oral checks, and Socratic practice you could never run
                    one-on-one for a whole class.
                  </CardDescription>
                </CardHeader>
              </Card>

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
                  <CardTitle>Native language strengths first</CardTitle>
                  <CardDescription>
                    Multilingual learners can explain and wrestle with ideas in
                    the language they know best. English scaffolding still
                    appears in context when it helps, but competency is not
                    defined solely by English-only responses.
                  </CardDescription>
                </CardHeader>
              </Card>

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
                  <CardTitle>Profiles grounded in dialogue</CardTitle>
                  <CardDescription>
                    Each learner builds a profile from conversational evidence:
                    misconceptions, strengths, and how they explain concepts
                    aloud, growing across every activity you assign.
                  </CardDescription>
                </CardHeader>
              </Card>

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
                  <CardTitle>Teacher-ready insights</CardTitle>
                  <CardDescription>
                    Actionable summaries highlight who needs follow-up, which
                    ideas are fragile after oral assessment, and how
                    conversational data complements written work, so you
                    intervene with confidence.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-foreground">
              How It Works
            </h2>
            <div className="space-y-12">
              <HowItWorksStep
                stepNumber={1}
                imageSrc="/home/how-it-works/1_teach.png"
                imageAlt="Set up conversational activities"
                title="Set up conversational activities"
                description="Choose an activity: a viva on student work, an oral conceptual check, or a Socratic practice sequence. Set your rubric and learning goals, then assign it to your class."
                badgeColor={colors["pink-mist"].base}
                borderColor={colors["pink-mist"].light}
              />
              <HowItWorksStep
                stepNumber={2}
                imageSrc="/home/how-it-works/2_interact.png"
                imageAlt="Students engage in conversation"
                title="Students engage in conversation"
                description="Each learner holds a personalized conversation with ConvoEd: explaining ideas, answering probes, and receiving immediate feedback, often in the language they find most comfortable."
                badgeColor={colors.glaucous.base}
                borderColor={colors.glaucous.light}
              />
              <HowItWorksStep
                stepNumber={3}
                imageSrc="/home/how-it-works/3_understand.png"
                imageAlt="Build understanding through dialogue"
                title="Build understanding through dialogue"
                description="Guided questions, clarifications, and feedback help students consolidate concepts and surface misconceptions before high-stakes assessments."
                badgeColor={colors["glaucous-light"].base}
                borderColor={colors["glaucous-light"].light}
              />
              <HowItWorksStep
                stepNumber={4}
                imageSrc="/home/how-it-works/4_teacher_insights.png"
                imageAlt="Review insights and follow up"
                title="Review insights and follow up"
                description="You receive summaries grounded in conversational evidence: who needs support, which ideas are shaky, and how conversational evidence complements written work."
                badgeColor={colors["electric-aqua"].base}
                borderColor={colors["electric-aqua"].light}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Supported By Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-muted/30">
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
                  <Image
                    src="/home/supported_by/cornell_logo 1.png"
                    alt="Cornell University"
                    width={563}
                    height={90}
                    className="h-8 sm:h-9 md:h-10 w-auto object-contain opacity-100 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  <Image
                    src="/home/supported_by/cartesia_logo 1.png"
                    alt="Cartesia"
                    width={403}
                    height={90}
                    className="h-6 sm:h-7 md:h-8 w-auto object-contain opacity-100 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                  />
                  {/* Duplicate set for seamless scrolling - only render if scrolling is needed */}
                  {needsScrolling && (
                    <>
                      <Image
                        src="/home/supported_by/cornell_logo 1.png"
                        alt="Cornell University"
                        width={563}
                        height={90}
                        className="h-8 sm:h-9 md:h-10 w-auto object-contain opacity-100 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
                      />
                      <Image
                        src="/home/supported_by/cartesia_logo 1.png"
                        alt="Cartesia"
                        width={403}
                        height={90}
                        className="h-6 sm:h-7 md:h-8 w-auto object-contain opacity-100 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0 flex-shrink-0"
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
      <section className="py-16 sm:py-20 lg:py-24 relative bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
              Start assigning conversational activities.
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Use ConvoEd for vivas, oral assessments, and multilingual dialogue
              without extra time on your end.
            </p>
            <Button
              asChild
              size="lg"
              className="text-lg px-8 py-6"
              style={{ color: "#fff" }}
            >
              <Link href="/login">Login</Link>
            </Button>
          </div>
        </div>

        {/* Image - Appears to come out of the footer */}
        <div className="relative flex justify-center pb-0">
          <div className="w-64 sm:w-64 md:w-80 lg:w-96 mt-6">
            <Image
              src="/home/cta-2.png"
              alt="ConvoEd"
              width={384}
              height={384}
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
                <Image
                  src="/convoed-logo.svg"
                  alt="ConvoEd Logo"
                  width={120}
                  height={32}
                  className="h-8 w-auto"
                />
              </div>
              <p
                className="text-sm leading-relaxed max-w-xs"
                style={{ color: "oklch(0.556 0 0)" }}
              >
                ConvoEd helps teachers run conversational learning activities at
                scale: vivas, oral assessments, and multilingual conversational
                support for every learner.
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
