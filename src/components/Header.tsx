"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  userName?: string;
  onLogoutSubmission?: () => void;
}

export default function Header({ userName, onLogoutSubmission }: HeaderProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const displayName =
    userName ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "Guest";

  const hasUserMenu = user || onLogoutSubmission;

  return (
    <header className="w-full border-b bg-secondary drop-shadow-md">
      <div className="flex items-center justify-between px-8 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/convoed-symbol.svg"
          alt={t("toolName")}
          className="h-8 w-auto"
        />
        {hasUserMenu && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-base font-medium">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {user && !onLogoutSubmission && (
                  <>
                    <DropdownMenuLabel>{t("header.myAccount")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onLogoutSubmission ? (
                  <DropdownMenuItem onClick={onLogoutSubmission} className="cursor-pointer">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    {t("header.logOutOfSubmission") || "Log Out of Submission"}
                  </DropdownMenuItem>
                ) : (
                  user && (
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      {t("header.signOut")}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
