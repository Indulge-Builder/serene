import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import { Inter, Playfair_Display } from "next/font/google";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { DEFAULT_THEME, THEME_COOKIE, isThemeKey } from "@/lib/constants/themes";
import {
  APP_ICON_COOKIE,
  DEFAULT_ICON,
  iconSrc,
  isIconKey,
} from "@/lib/constants/app-icons";
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

// generateMetadata (not a static export) so the manifest link + apple-touch-icon
// reflect the user's saved PWA icon (profiles.app_icon, mirrored in the
// serene-app-icon cookie). A signed-in device installs with the chosen icon
// baked into the shortcut from the first byte — no hydration wait. iOS reads
// apple-touch-icon, not the manifest icon, on Add-to-Home-Screen, so BOTH must
// point at the same file. IconSelector re-syncs the cookie on change; the
// install prompt swaps the link in the DOM for an in-the-moment pick.
export async function generateMetadata(): Promise<Metadata> {
  const cookieIcon = (await cookies()).get(APP_ICON_COOKIE)?.value;
  const icon = isIconKey(cookieIcon) ? cookieIcon : DEFAULT_ICON;
  const iconHref = iconSrc(icon);

  return {
    title: "Serene",
    description: "Internal operating system for Indulge team members.",
    // Per-icon dynamic manifest — overrides the static /manifest.webmanifest so
    // the installed app carries the user's chosen icon (failure-mode #3: iOS
    // needs the apple entry below regardless, since it ignores manifest icons).
    manifest: `/api/manifest?icon=${icon}`,
    icons: {
      icon: "/logo.webp",
      apple: iconHref,
    },
    // Installed-app chrome on iOS (no manifest `display` support there).
    // black-translucent lets the dark canvas run under the status bar.
    appleWebApp: {
      capable: true,
      title: "Serene",
      statusBarStyle: "black-translucent",
    },
  };
}

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
