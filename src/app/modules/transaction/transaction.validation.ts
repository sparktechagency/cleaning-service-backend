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

export const transactionValidation = {
  getTransactionsSchema,
  getAdminTransactionsSchema,
  getStatsSchema,
};
