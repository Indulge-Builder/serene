import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import { Inter, Playfair_Display } from "next/font/google";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { DEFAULT_THEME, THEME_COOKIE, isThemeKey } from "@/lib/constants/themes";
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
    title: "Serene",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // Hardcoded hex sanctioned only here + manifest.ts: meta theme-color cannot
  // read CSS vars. Mirrors the Earth --theme-canvas token (#0d0c0a).
  themeColor: "#0d0c0a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SSR mirror of profiles.theme (see lib/constants/themes.ts) — stamping the
  // user's theme here means the first paint is already correct; without it the
  // Earth default flashes until ThemeInitializer runs post-hydration.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemeKey(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang="en"
      data-theme={theme}
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
