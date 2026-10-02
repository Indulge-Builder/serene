// desks-schema.ts — THE Zod schemas of the desks actions (Rule 02; docs/architecture/desks-plan.md).
// Issue messages are internal codes mapped to formErrors.desks* in actions/desks.ts, never shown raw.
import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";
import { DESK_ANNOUNCEMENT_MAX_CHARS, DESK_DEVICE_KINDS } from "@/lib/constants/desks";
import { sanitizeText } from "@/lib/utils/sanitize";

/** Everyone, one queendom, or one device. Exactly one of the three. */
export const DeskAudienceSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ queendom_id: uuidField("desksAudienceInvalid") }),
  z.object({ device_id: uuidField("desksAudienceInvalid") }),
]);

export const SendDeskAnnouncementSchema = z.object({
  text: z.string().trim().min(1, "desksTextRequired").max(DESK_ANNOUNCEMENT_MAX_CHARS, "desksTextTooLong").transform(sanitizeText),
  audience: DeskAudienceSchema,
  /** False = the TVs show it and no speaker says it. */
  speak: z.boolean().default(true),
});

export const UpsertDeskDeviceSchema = z.object({
  id: uuidField("desksDeviceInvalid").optional(),
  kind: z.enum(DESK_DEVICE_KINDS),
  label: z.string().trim().min(1, "desksLabelRequired").max(60, "desksLabelRequired").transform(sanitizeText),
  queendomId: uuidField("desksQueendomInvalid").nullable(),
  profileId: uuidField("desksProfileInvalid").nullable(),
  alexaDeviceId: z.string().trim().max(200).transform((s) => s || null).nullable(),
  voicemonkeyDevice: z.string().trim().max(80).transform((s) => (s ? sanitizeText(s) : null)).nullable(),
  isActive: z.boolean().default(true),
});

export const DeskDeviceIdSchema = z.object({ deviceId: uuidField("desksDeviceInvalid") });

export const UpdateDeskSettingsSchema = z.object({
  enabled: z.boolean(),
  quietFrom: z.number().int().min(0).max(23),
  quietTo: z.number().int().min(0).max(23),
});
