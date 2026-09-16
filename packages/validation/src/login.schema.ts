import { z } from "zod";

export const loginSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(1, "Login ID is required")
    .max(64, "Login ID is too long"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
