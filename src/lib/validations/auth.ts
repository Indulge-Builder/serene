import { z } from "zod";

export const loginSchema = z.object({
  email:    z.string().min(1).email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;
