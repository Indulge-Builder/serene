import { z } from "zod";

export const loginSchema = z.object({
  email:    z.string().min(1).email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1).email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const verifyResetOtpSchema = z.object({
  email: z.string().min(1).email(),
  // Supabase email OTP length is set to 6 for this project (Auth → Email →
  // Email OTP Length). Keep this regex in lockstep with that setting.
  token: z.string().regex(/^\d{6}$/, "otp_invalid"),
});

export type VerifyResetOtpInput = z.infer<typeof verifyResetOtpSchema>;

export const updatePasswordSchema = z
  .object({
    password:        z.string().min(8).max(72),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path:    ["confirmPassword"],
  });

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
