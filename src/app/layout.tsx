import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import { Inter, Playfair_Display } from "next/font/google";
import { MotionProvider } from "@/components/layout/MotionProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Indulge OS",
  description: "Internal operating system for Indulge team members.",
  icons: {
    icon: "/logo.webp",
    // apple-touch-icon comes from the src/app/apple-icon.png file convention.
  },
  // Installed-app chrome on iOS (no manifest `display` support there).
  // black-translucent lets the dark canvas run under the status bar.
  appleWebApp: {
    capable: true,
    title: "Eia",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // Hardcoded hex sanctioned only here + manifest.ts: meta theme-color cannot
  // read CSS vars. Mirrors the Earth --theme-canvas token (#0d0c0a).
  themeColor: "#0d0c0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="earth"
      suppressHydrationWarning
      className={`${inter.variable} ${playfairDisplay.variable}`}
    >
      <body suppressHydrationWarning>
        <ServiceWorkerRegistration />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
