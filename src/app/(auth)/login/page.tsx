import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In — Serene",
};

export default function LoginPage() {
  return <LoginForm />;
}
