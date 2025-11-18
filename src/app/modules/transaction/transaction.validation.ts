import { z } from "zod";

// Validation schema for searching booking payment history
export const searchBookingPaymentHistorySchema = z.object({
  query: z.object({
    searchTerm: z
      .string({ required_error: "Search term is required" })
      .min(1, "Search term must be at least 1 character")
      .max(100, "Search term must not exceed 100 characters")
      .trim(),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, "Page must be a positive number"),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .refine(
        (val) => val > 0 && val <= 100,
        "Limit must be between 1 and 100"
      ),
  }),
});

export const transactionValidation = {
  searchBookingPaymentHistorySchema,
};
