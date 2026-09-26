import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import { Inter, Playfair_Display } from "next/font/google";
import { MotionProvider } from "@/components/layout/MotionProvider";
import { DEFAULT_THEME, THEME_COOKIE, isThemeKey } from "@/lib/constants/themes";
import {
  APPEARANCE_COOKIE,
  DEFAULT_APPEARANCE,
  NEU_CANVAS_DARK,
  NEU_CANVAS_LIGHT,
  isAppearanceKey,
} from "@/lib/constants/appearance";
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
  const cookieStore = await cookies();
  const cookieIcon = cookieStore.get(APP_ICON_COOKIE)?.value;
  const icon = isIconKey(cookieIcon) ? cookieIcon : DEFAULT_ICON;
  const iconHref = iconSrc(icon);
  const cookieAppearance = cookieStore.get(APPEARANCE_COOKIE)?.value;
  const appearance = isAppearanceKey(cookieAppearance)
    ? cookieAppearance
    : DEFAULT_APPEARANCE;

  return {
    title: { default: "Serene", template: "%s · Serene" },
    description: "Internal operating system for Indulge team members.",
    // Per-icon dynamic manifest — overrides the static /manifest.webmanifest so
    // the installed app carries the user's chosen icon (failure-mode #3: iOS
    // needs the apple entry below regardless, since it ignores manifest icons).
    manifest: `/api/manifest?icon=${icon}`,
    icons: {
      // The tab icon is the transparent mark (app/favicon.ico, built by
      // scripts/pad-app-icons.mjs with a heavier stroke than the logo image, so
      // it still reads on a dark tab strip). The phone shortcut (`apple`, the
      // manifest) is the same mark on a white plate.
      icon: "/favicon.ico",
      apple: iconHref,
    },
    // Installed-app chrome on iOS (no manifest `display` support there).
    // dark appearance → black-translucent: the app draws edge-to-edge under
    // the status bar (white status text on the charcoal canvas) and the
    // safe-area padding in globals.css takes over. light/system → default:
    // black-translucent's white status text would vanish on the cream
    // #ECE8E1 canvas, so the opaque bar stays (legibility beats full-bleed).
    appleWebApp: {
      capable: true,
      title: "Serene",
      statusBarStyle: appearance === "dark" ? "black-translucent" : "default",
    },
  };
}

// Dynamic (not a static export) so the browser/PWA chrome follows the saved
// appearance from the first byte: light #ECE8E1 · dark #28241C · system emits
// both media-scoped entries so the chrome tracks the OS without JS. Hardcoded
// hex sanctioned only in appearance.ts (NEU_CANVAS_*): meta theme-color cannot
// read CSS vars. AppearanceSelector rewrites the meta in the DOM on switch.
export async function generateViewport(): Promise<Viewport> {
  const cookieAppearance = (await cookies()).get(APPEARANCE_COOKIE)?.value;
  const appearance = isAppearanceKey(cookieAppearance)
    ? cookieAppearance
    : DEFAULT_APPEARANCE;

  return {
    // Edge-to-edge on notched/edge-to-edge devices: without viewport-fit=cover
    // the browser letterboxes the app below the status bar and every
    // env(safe-area-inset-*) in the codebase evaluates to 0. The shell's
    // safe-area padding (globals.css) depends on this.
    viewportFit: "cover",
    // Android Chrome: the keyboard shrinks the layout instead of covering the
    // fixed shell, so a chat composer rises above it (mobile audit 2026-09-26).
    interactiveWidget: "resizes-content",
    themeColor:
      appearance === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: NEU_CANVAS_LIGHT },
            { media: "(prefers-color-scheme: dark)",  color: NEU_CANVAS_DARK  },
          ]
        : appearance === "dark"
          ? NEU_CANVAS_DARK
          : NEU_CANVAS_LIGHT,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SSR mirror of profiles.theme (see lib/constants/themes.ts) — stamping the
  // user's theme here means the first paint is already correct; without it the
  // Earth default flashes until ThemeInitializer runs post-hydration.
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;
  const theme = isThemeKey(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  // SSR mirror of profiles.appearance (lib/constants/appearance.ts) — 'dark'
  // stamps data-neu server-side (zero flash of light). 'system' cannot be
  // resolved on the server, so it renders a tiny inline script FIRST in <body>:
  // it runs before anything below it paints, matching the zero-flash guarantee.
  const cookieAppearance = cookieStore.get(APPEARANCE_COOKIE)?.value;
  const appearance = isAppearanceKey(cookieAppearance)
    ? cookieAppearance
    : DEFAULT_APPEARANCE;

  return (
    <html
      lang="en"
      data-theme={theme}
      {...(appearance === "dark" ? { "data-neu": "dark" } : {})}
      suppressHydrationWarning
      className={`${inter.variable} ${playfairDisplay.variable}`}
    >
      <body suppressHydrationWarning>
        {appearance === "system" && (
          <script
            // Pre-hydration OS-preference resolve for the 'system' appearance —
            // the data-neu flip must land before first paint. ThemeInitializer
            // owns the live prefers-color-scheme listener after hydration.
            dangerouslySetInnerHTML={{
              __html:
                'try{if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.setAttribute("data-neu","dark")}catch(e){}',
            }}
          />
        )}
        <ServiceWorkerRegistration />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
