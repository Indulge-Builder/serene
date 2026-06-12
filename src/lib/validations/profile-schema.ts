import { z } from "zod";
import { USER_ROLES } from "@/lib/constants/roles";
import { APP_DOMAINS } from "@/lib/constants/domains";
import { THEME_ENUM } from "@/lib/constants/themes";

const userRoleEnum = USER_ROLES as [string, ...string[]];
const appDomainEnum = APP_DOMAINS as [string, ...string[]];

export const createUserSchema = z.object({
  full_name: z
    .string()
    .min(1, "full_name_required")
    .max(100, "full_name_too_long")
    .trim(),
  email: z
    .string()
    .min(1, "email_required")
    .email("email_invalid"),
  password: z
    .string()
    .min(8, "password_too_short")
    .max(72, "password_too_long"),
  role: z
    .enum(userRoleEnum as [string, ...string[]])
    .refine((v) => userRoleEnum.includes(v), "role_invalid"),
  domain: z
    .enum(appDomainEnum as [string, ...string[]])
    .refine((v) => appDomainEnum.includes(v), "domain_invalid"),
  job_title: z
    .string()
    .max(100, "job_title_too_long")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateProfileSchema = z.object({
  id: z.string().uuid("id_invalid"),
  full_name: z
    .string()
    .min(1, "full_name_required")
    .max(100, "full_name_too_long")
    .trim()
    .optional(),
  username: z
    .string()
    .min(3, "username_too_short")
    .max(30, "username_too_long")
    .regex(/^[a-z0-9_]+$/, "username_invalid_chars")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  job_title: z
    .string()
    .max(100, "job_title_too_long")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  theme: z
    .enum(THEME_ENUM)
    .optional(),
  timezone: z
    .string()
    .max(50)
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateAuthorizationSchema = z.object({
  id: z.string().uuid("id_invalid"),
  role: z.enum(userRoleEnum as [string, ...string[]]),
  domain: z.enum(appDomainEnum as [string, ...string[]]),
});

export type UpdateAuthorizationInput = z.infer<typeof updateAuthorizationSchema>;

export const toggleUserActiveSchema = z.object({
  id: z.string().uuid("id_invalid"),
  is_active: z.boolean(),
});

export type ToggleUserActiveInput = z.infer<typeof toggleUserActiveSchema>;

export const inviteUserSchema = z.object({
  full_name: z
    .string()
    .min(1, "full_name_required")
    .max(100, "full_name_too_long")
    .trim(),
  email: z
    .string()
    .min(1, "email_required")
    .email("email_invalid"),
  role: z
    .enum(userRoleEnum as [string, ...string[]])
    .refine((v) => userRoleEnum.includes(v), "role_invalid"),
  domain: z
    .enum(appDomainEnum as [string, ...string[]])
    .refine((v) => appDomainEnum.includes(v), "domain_invalid"),
  job_title: z
    .string()
    .max(100, "job_title_too_long")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateProfileAvatarSchema = z.object({
  id:         z.string().uuid("id_invalid"),
  avatar_url: z.string().url("avatar_url_invalid"),
});
