"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { getBaseURL } from "@/lib/get-url";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: (
    redirectTo?: string
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async (redirectTo?: string) => {
    // Use the helper function to get the correct base URL
    // This handles environment variables for production (Vercel, etc.)
    const baseURL = getBaseURL();

    // Construct the final destination URL
    // If redirectTo is provided and is absolute, use it; otherwise construct from baseURL
    const finalDestination = redirectTo
      ? redirectTo.startsWith("http")
        ? redirectTo
        : `${baseURL}${
            redirectTo.startsWith("/") ? redirectTo.slice(1) : redirectTo
          }`
      : `${baseURL}/teacher`;

    // Ensure the callback URL is absolute and properly formatted
    // This must exactly match what's in Supabase's allowed redirect URLs
    const callbackUrl = `${baseURL}/api/auth/callback?next=${encodeURIComponent(
      finalDestination
    )}`;

    console.log("OAuth redirect URL:", callbackUrl); // Debug log
    console.log("Base URL:", baseURL); // Debug log

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Determine redirect based on current path
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith("/student")) {
        router.push("/student/login");
      } else {
        router.push("/teacher/login");
      }
    } else {
      // Fallback if window is not available
      router.push("/teacher/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
