import { z } from "zod";
import {
  TransactionType,
  TransactionStatus,
} from "../../models/Transaction.model";

// Validation schema for getting transactions (user)
export const getTransactionsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(Number),
    limit: z.string().optional().transform(Number),
    type: z.nativeEnum(TransactionType).optional(),
    status: z.nativeEnum(TransactionStatus).optional(),
  }),
});

// Validation schema for getting all transactions (admin)
export const getAdminTransactionsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(Number),
    limit: z.string().optional().transform(Number),
    type: z.nativeEnum(TransactionType).optional(),
    status: z.nativeEnum(TransactionStatus).optional(),
    userId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

// Validation schema for getting statistics
export const getStatsSchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

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
  getTransactionsSchema,
  getAdminTransactionsSchema,
  getStatsSchema,
  searchBookingPaymentHistorySchema,
};
