import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { safeReturnPath } from "@/lib/utils/return-path";

export const metadata: Metadata = {
  title: "Sign In — Serene",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // `next` = where to go after signing in (the OAuth consent page hands us here with it).
  // Only a path on this site is honoured; anything else falls back to the dashboard.
  const params = await searchParams;
  const next = safeReturnPath(Array.isArray(params.next) ? params.next[0] : params.next);
  return <LoginForm next={next} />;
}
