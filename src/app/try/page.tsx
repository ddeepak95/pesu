"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ClipboardCheck, MessagesSquare, Mic } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/Landing/LandingNavbar";

const activities = [
  {
    name: "Socratic Learning",
    icon: MessagesSquare,
    accent: "#c8376c",
    lightAccent: "#faebf0",
    description:
      "Explore a concept through guided questions that deepen your thinking. The AI nudges you toward insight rather than just giving answers.",
    sampleLink: null,
    url: "/assignment/U-qOw_dV",
  },
  {
    name: "Code Review Viva",
    icon: ClipboardCheck,
    accent: "#6A7FDB",
    lightAccent: "#eaedfa",
    description:
      "Submit your code and answer oral exam questions dynamically generated from it by an AI examiner. Get instant feedback on your depth of understanding.",
    sampleLink: "/downloads/sample-palindrome",
    url: "/assignment/aBe-z78U",
  },
  {
    name: "Speaking Practice",
    icon: Mic,
    accent: "#22d9dd",
    lightAccent: "#e9fbfc",
    description:
      "Practice speaking on a topic aloud and receive targeted feedback on clarity, fluency, and content.",
    sampleLink: null,
    url: "/assignment/JTCHs-F-",
  },
];

export default function TryPage() {
  useEffect(() => {
    // Force the full light palette regardless of OS/app theme. Dark mode is
    // applied via `@media (prefers-color-scheme: dark)` on :root (not a class),
    // so we opt this route out wholesale with a single attribute that the
    // dark-scheme rules in globals.css exclude via :not([data-force-theme=...]).
    const html = document.documentElement;
    const previousForceTheme = html.getAttribute("data-force-theme");

    html.setAttribute("data-force-theme", "light");

    return () => {
      if (previousForceTheme === null) {
        html.removeAttribute("data-force-theme");
      } else {
        html.setAttribute("data-force-theme", previousForceTheme);
      }
    };
  }, []);

  return (
    <>
      <LandingNavbar />
      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Try ConvoEd
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Pick an activity below and experience ConvoEd as a student.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activities.map(
              ({
                name,
                icon: Icon,
                accent,
                lightAccent,
                description,
                sampleLink,
                url,
              }) => (
                <Card
                  key={name}
                  className="h-full flex flex-col transition-shadow duration-200 hover:shadow-lg"
                >
                  <CardHeader className="flex-1">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
                      style={{ backgroundColor: lightAccent }}
                    >
                      <Icon size={20} style={{ color: accent }} />
                    </div>
                    <CardTitle>{name}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                    {sampleLink && (
                      <a
                        href={sampleLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline mt-2 inline-block"
                        style={{ color: accent }}
                      >
                        Download sample code for code review
                      </a>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      style={{ borderColor: accent, color: accent }}
                      asChild
                    >
                      <Link href={url}>Try it →</Link>
                    </Button>
                  </CardContent>
                </Card>
              ),
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-12">
            ConvoEd is built to support any kind of conversational learning
            activity, from oral exams and Socratic dialogue to language
            practice, role-play, and beyond.
          </p>
        </div>
      </main>
    </>
  );
}
