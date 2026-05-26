import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div
      style={{
        display:         "flex",
        minHeight:       "100dvh",
        backgroundColor: "var(--theme-canvas)",
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 60% 40%, var(--theme-canvas-glow), transparent 70%),
          url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")
        `,
        backgroundRepeat: "repeat",
        backgroundSize:   "auto, 256px 256px",
        gap:              "var(--space-3)",
      }}
    >
      <Sidebar />

      {/* Paper card — the floating content surface */}
      <div
        style={{
          flex:          1,
          display:       "flex",
          flexDirection: "column",
          height:        "calc(100dvh - 24px)",
          margin:        "12px 12px 12px 0",
          background:    "var(--theme-paper)",
          borderRadius:  "var(--radius-xl)",
          boxShadow:     "var(--shadow-paper)",
          overflowY:     "auto",
          overflowX:     "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
