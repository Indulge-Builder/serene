import { z } from "zod";
import { USER_ROLES } from "@/lib/constants/roles";
import { APP_DOMAINS } from "@/lib/constants/domains";
import { THEME_ENUM } from "@/lib/constants/themes";
import { ICON_ENUM } from "@/lib/constants/app-icons";
import { APPEARANCE_ENUM } from "@/lib/constants/appearance";
import { uuidField } from "@/lib/validations/fields";
import { SIA_ROLES, SIA_ROLE_PLATFORM_ROLE, positionsForDomain, type SiaRole } from "@/lib/constants/sia-roles";

const userRoleEnum = USER_ROLES as [string, ...string[]];
const appDomainEnum = APP_DOMAINS as [string, ...string[]];

// ─── The position layer (0194 / 0201) ────────────────────────────────────────
// sia_role + queendom_id ride beside role + domain on every account-shaping schema. Both are
// optional and blank outside a domain that has positions; when a position is given the
// platform role MUST be the one it maps to (a genie is never a manager by accident) and the
// queendom is required. The 0201 CHECKs are the database mirror of the same three rules.
const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const siaRoleField = z.preprocess(emptyToNull, z.enum(SIA_ROLES.values as unknown as [string, ...string[]], { message: "sia_role_invalid" }).nullable());
const queendomField = z.preprocess(emptyToNull, uuidField("queendom_invalid").nullable());
const positionFields = { sia_role: siaRoleField.default(null), queendom_id: queendomField.default(null) };

function checkPosition(
  v: { role: string; domain: string; sia_role: string | null; queendom_id: string | null },
  ctx: z.RefinementCtx,
) {
  const positions = positionsForDomain(v.domain) as readonly string[];
  if (v.sia_role || v.queendom_id) {
    if (positions.length === 0) { ctx.addIssue({ code: "custom", message: "sia_role_domain", path: ["sia_role"] }); return; }
  }
  if (v.sia_role) {
    if (!positions.includes(v.sia_role)) { ctx.addIssue({ code: "custom", message: "sia_role_invalid", path: ["sia_role"] }); return; }
    if (!v.queendom_id) { ctx.addIssue({ code: "custom", message: "queendom_required", path: ["queendom_id"] }); return; }
    if (SIA_ROLE_PLATFORM_ROLE[v.sia_role as SiaRole] !== v.role) {
      ctx.addIssue({ code: "custom", message: "sia_role_platform_mismatch", path: ["role"] });
    }
  }
}

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
  ...positionFields,
}).superRefine(checkPosition);

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateProfileSchema = z.object({
  id: uuidField("id_invalid"),
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
  app_icon: z
    .enum(ICON_ENUM)
    .optional(),
  appearance: z
    .enum(APPEARANCE_ENUM)
    .optional(),
  timezone: z
    .string()
    .max(50)
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateAuthorizationSchema = z.object({
  id: uuidField("id_invalid"),
  role: z.enum(userRoleEnum as [string, ...string[]]),
  domain: z.enum(appDomainEnum as [string, ...string[]]),
  ...positionFields,
}).superRefine(checkPosition);

export type UpdateAuthorizationInput = z.infer<typeof updateAuthorizationSchema>;

export const toggleUserActiveSchema = z.object({
  id: uuidField("id_invalid"),
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
  ...positionFields,
}).superRefine(checkPosition);

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateProfileAvatarSchema = z.object({
  id:         uuidField("id_invalid"),
  avatar_url: z.string().url("avatar_url_invalid"),
});
