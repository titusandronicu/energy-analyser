import { z } from "zod";

const email = z.email("Enter a valid email address");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = signInSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid form data";
}
