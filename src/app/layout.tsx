import type { Metadata } from "next";
import { Geist, Geist_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/providers/I18nProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { Toaster } from "@/components/ui/sonner";
import GlobalDataLoadingOverlay from "@/components/GlobalDataLoadingOverlay";
import en from "@/locales/en.json";
import { getURL } from "@/lib/get-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getURL()),
  title: {
    template: `%s | ${en.toolName}`,
    default: `${en.toolName} | ${en.tagline}`,
  },
  description: en.tagline,
  icons: {
    icon: "/convoed-symbol.svg",
  },
  openGraph: {
    type: "website",
    siteName: en.toolName,
    title: `${en.toolName} | ${en.tagline}`,
    description: en.tagline,
    images: ["/home/hero.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${en.toolName} | ${en.tagline}`,
    description: en.tagline,
    images: ["/home/hero.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${rubik.variable}`}
        suppressHydrationWarning
      >
        <I18nProvider>
          <SWRProvider>
            <AuthProvider>{children}</AuthProvider>
            <GlobalDataLoadingOverlay />
          </SWRProvider>
        </I18nProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
