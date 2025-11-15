import { z } from "zod";

export const redemptionValidation = {
  calculatePreview: z.object({
    body: z.object({
      credits: z
        .number({
          required_error: "Credits is required",
          invalid_type_error: "Credits must be a number",
        })
        .int("Credits must be an integer")
        .positive("Credits must be positive"),
      subscriptionPrice: z
        .number({
          invalid_type_error: "Subscription price must be a number",
        })
        .positive("Subscription price must be positive")
        .optional(),
    }),
  }),

  redeemForCash: z.object({
    body: z.object({
      credits: z
        .number({
          required_error: "Credits is required",
          invalid_type_error: "Credits must be a number",
        })
        .int("Credits must be an integer")
        .min(10, "Minimum 10 credits required for redemption"),
    }),
  }),
};
