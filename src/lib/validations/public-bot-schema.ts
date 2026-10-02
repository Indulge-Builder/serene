import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";

// The public bot's action inputs (0252). Human messages only; never a Zod default (Q-04).

export const PackVersionSchema = z.object({
  version: z.coerce.number().int("That version could not be found.").min(1, "That version could not be found."),
});

export const SendLibraryItemSchema = z.object({
  conversationId: uuidField("That conversation could not be found."),
  assetId: uuidField("That library item could not be found."),
});

export const SetChatHandlerSchema = z.object({
  conversationId: uuidField("That conversation could not be found."),
  handler: z.enum(["bot", "team"], { message: "Choose who answers this chat." }),
});

export const BotCorrectionSchema = z.object({
  conversationId: uuidField("That conversation could not be found."),
  messageId: uuidField("That message could not be found."),
  shouldHaveSaid: z.string().trim().min(1, "Write what she should have said.").max(2000, "Keep it under 2000 characters."),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const ResolveBotCorrectionSchema = z.object({
  id: uuidField("That correction could not be found."),
  status: z.enum(["applied", "dismissed"], { message: "Choose what happened to it." }),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});
