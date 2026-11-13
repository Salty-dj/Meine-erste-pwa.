import { z } from "zod";
import { roleCodes } from "./roles";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Bitte eine gültige E-Mail-Adresse eingeben.")
  .max(254);
export const passwordSchema = z
  .string()
  .min(12, "Mindestens 12 Zeichen verwenden.")
  .max(128, "Maximal 128 Zeichen verwenden.");
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen eingeben.").max(100),
  email: emailSchema,
  password: passwordSchema,
  roles: z
    .array(
      z.enum(
        roleCodes as [
          (typeof roleCodes)[number],
          ...(typeof roleCodes)[number][],
        ],
      ),
    )
    .min(1, "Mindestens eine Rolle wählen.")
    .max(6),
});
export const updateRolesSchema = z.object({
  userId: z.string().cuid(),
  roles: createUserSchema.shape.roles,
  active: z.boolean(),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Die neuen Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.currentPassword !== v.password, {
    message: "Bitte ein neues Passwort wählen.",
    path: ["password"],
  });
export type ActionState = { error?: string; success?: string };
export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Bitte die Eingaben prüfen.";
}
