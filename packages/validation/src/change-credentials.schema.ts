import { z } from "zod";

export const changeCredentialsSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
    newLoginId: z
      .string()
      .trim()
      .min(1, "Login ID cannot be empty")
      .max(64, "Login ID is too long")
      .optional(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangeCredentialsFormValues = z.infer<typeof changeCredentialsSchema>;
