import { z } from "zod";

const updateProviderProfile = z.object({
  body: z
    .object({
      userName: z
        .string()
        .min(2, "User name must be at least 2 characters")
        .optional(),
      phoneNumber: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Please provide a valid phone number")
        .optional(),
      address: z
        .string()
        .min(5, "Address must be at least 5 characters")
        .optional(),
      aboutMe: z
        .string()
        .min(10, "About me must be at least 10 characters")
        .optional(),
      experience: z
        .string()
        .min(3, "Experience must be at least 3 characters")
        .optional(),
    })
    .optional(), // Make the entire body optional to handle file-only uploads
});

const updateOwnerProfile = z.object({
  body: z
    .object({
      userName: z
        .string()
        .min(2, "User name must be at least 2 characters")
        .optional(),
      phoneNumber: z
        .string()
        .regex(/^\+?[1-9]\d{1,14}$/, "Please provide a valid phone number")
        .optional(),
      address: z
        .string()
        .min(5, "Address must be at least 5 characters")
        .optional(),
    })
    .optional(),
});

export const profileValidation = {
  updateProviderProfile,
  updateOwnerProfile,
};
