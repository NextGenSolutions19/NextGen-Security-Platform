import { z } from "zod";

export const societyCodeSchema = z.object({
  societyCode: z
    .string()
    .trim()
    .min(1, "Society code is required")
    .max(32, "Society code is too long")
    .transform((value) => value.toUpperCase()),
});

export type SocietyCodeFormValues = z.infer<typeof societyCodeSchema>;
