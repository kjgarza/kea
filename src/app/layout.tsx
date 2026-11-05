import type { Metadata, Viewport } from "next";
import { Anybody, Lexend } from "next/font/google";
import { InstallPromptListener } from "@/components/pwa/install-prompt-listener";
import "./globals.css";

// Lexend was drawn for reading ease, which is what reading in sunlight needs.
const lexend = Lexend({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
});

// Anybody's width axis lets big type fill a card, whatever the word's length.
const anybody = Anybody({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-kea-display",
});

const isProd = process.env.NODE_ENV === "production";
const repoName = process.env.NEXT_PUBLIC_REPO_NAME || "kea";
const basePath = isProd ? `/${repoName}` : "";

export const metadata: Metadata = {
  title: "Kea",
  description:
    "Playful party card games — Charades, Trivia, Taboo, Just One, and Monikers",
  manifest: `${basePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kea",
  },
  openGraph: {
    title: "Kea",
    description:
      "Playful party card games — Charades, Trivia, Taboo, Just One, and Monikers",
    siteName: "Kea",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kea",
    description:
      "Playful party card games — Charades, Trivia, Taboo, Just One, and Monikers",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1d3026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${lexend.variable} ${anybody.variable} font-sans antialiased`}>
        <InstallPromptListener />
        {children}
      </body>
    </html>
  );
}
