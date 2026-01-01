"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface LandingNavbarProps {
  mailtoLink: string;
  waitlistText: string;
}

export default function LandingNavbar({
  mailtoLink,
  waitlistText,
}: LandingNavbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Show navbar at the top or when scrolling up
      if (currentScrollY < 10) {
        setIsVisible(true);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY) {
        // Scrolling down
        setIsVisible(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const scrollToTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <Link
              href="#"
              onClick={scrollToTop}
              className="flex items-center hover:opacity-80 transition-opacity"
              aria-label="ConvoEd Home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/convoed-logo.svg"
                alt="ConvoEd Logo"
                className="h-7 sm:h-8 w-auto"
              />
            </Link>

            {/* Join Waitlist Button */}
            <Button
              asChild
              size="lg"
              className="text-white hover:opacity-90 transition-all duration-300 shadow-lg"
              style={{
                background: `linear-gradient(135deg, #c8376c, #8495e1, #6A7FDB)`,
                backgroundSize: "200% 200%",
              }}
            >
              <a href={mailtoLink}>{waitlistText}</a>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
