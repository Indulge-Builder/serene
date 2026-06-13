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
  // Supabase email OTP length is configurable (GoTrue default 6; this project
  // currently issues 8). Accept 6–8 digits so a dashboard length change can't
  // silently truncate the code and fail verification.
  token: z.string().regex(/^\d{6,8}$/, "otp_invalid"),
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
