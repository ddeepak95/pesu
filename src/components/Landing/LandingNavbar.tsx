"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Menu, X } from "lucide-react";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        setIsVisible(true);
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY) {
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
    setIsMenuOpen(false);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    };
  }, [isMenuOpen]);

  return (
    <>
      {/* Navbar */}
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

              {/* Desktop Buttons */}
              <div className="hidden lg:flex items-center gap-3">
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-foreground"
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
                  className="text-white hover:opacity-90 transition-all duration-300 shadow-lg animate-gradient"
                  style={{
                    background: `linear-gradient(135deg, #8495e1, #6A7FDB)`,
                    backgroundSize: "200% 200%",
                  }}
                >
                  <a href={mailtoLink}>{waitlistText}</a>
                </Button>
              </div>

              {/* Mobile Hamburger Button */}
              <button
                onClick={() => setIsMenuOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-muted transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Full Screen Menu - Outside nav to avoid transform issues */}
      {isMenuOpen && (
        <div
          className="fixed top-0 left-0 w-screen h-screen lg:hidden overflow-hidden touch-none"
          style={{
            zIndex: 9999,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
          }}
        >
          {/* Menu Content - Top Right Aligned */}
          <div className="flex flex-col items-end gap-4 p-6 pt-20">
            {/* Close Button */}
            <button
              onClick={closeMenu}
              className="absolute top-4 right-4 p-3 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-foreground"
              style={{
                color: "oklch(0.145 0 0)",
                borderColor: "oklch(0.145 0 0)",
              }}
            >
              <Link
                href="/assignment/U-qOw_dV"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
              >
                Try Sample Activity
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="text-white hover:opacity-90 transition-all duration-300 shadow-lg animate-gradient"
              style={{
                background: `linear-gradient(135deg, #8495e1, #6A7FDB)`,
                backgroundSize: "200% 200%",
              }}
            >
              <a href={mailtoLink} onClick={closeMenu}>
                {waitlistText}
              </a>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
