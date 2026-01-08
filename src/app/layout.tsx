import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
    statusBarStyle: "default",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
