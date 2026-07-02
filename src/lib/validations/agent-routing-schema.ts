import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const SetAgentShiftSchema = z.object({
  agentId:    uuidField("Invalid agent ID."),
  shiftStart: z.string().regex(TIME_REGEX, { message: "Shift start must be HH:MM (24-hour)." }).nullable(),
  shiftEnd:   z.string().regex(TIME_REGEX, { message: "Shift end must be HH:MM (24-hour)." }).nullable(),
  shiftDays:  z
    .array(z.number().int().min(0).max(6))
    .min(1, { message: "Select at least one work day." })
    .nullable()
    .optional(),
}).refine(
  (d) => {
    if (d.shiftStart && d.shiftEnd) {
      return d.shiftEnd > d.shiftStart;
    }
    return true;
  },
  { message: "Shift end must be after shift start.", path: ["shiftEnd"] },
);

export type SetAgentShiftInput = z.infer<typeof SetAgentShiftSchema>;
