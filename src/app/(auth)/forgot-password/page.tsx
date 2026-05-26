import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset Password — Eia",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
