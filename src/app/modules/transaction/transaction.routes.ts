import express from "express";
import auth from "../../middlewares/auth";
import * as transactionController from "./transaction.controller";
import validateRequest from "../../middlewares/validateRequest";
import { transactionValidation } from "./transaction.validation";

const router = express.Router();

/**
 * User routes - accessible to all authenticated users
 */

// Get my transaction history
router.get(
  "/my-transactions",
  auth("OWNER", "PROVIDER"),
  transactionController.getMyTransactions
);

/**
 * Admin routes - accessible only to admins
 */

// Get all transactions with filters
router.get(
  "/admin/all",
  auth("ADMIN", "SUPER_ADMIN"),
  transactionController.getAllTransactions
);

// Get transaction statistics
router.get(
  "/admin/stats",
  auth("ADMIN", "SUPER_ADMIN"),
  transactionController.getTransactionStats
);

// Get revenue statistics
router.get(
  "/admin/revenue",
  auth("ADMIN"),
  transactionController.getRevenueStats
);
// Get specific transaction by ID (must be last to avoid conflicts)
// router.get(
//   "/:id",
//   auth("OWNER", "PROVIDER", "ADMIN", "SUPER_ADMIN"),
//   transactionController.getTransactionById
// );

// Get booking payment transaction history (ALL booking payment transactions)
router.get(
  "/booking-payments",
  auth("ADMIN"),
  transactionController.getBookingPaymentHistory
);

// Search booking payment transaction history
router.get(
  "/booking-payments/search",
  auth("ADMIN"),
  validateRequest(transactionValidation.searchBookingPaymentHistorySchema),
  transactionController.searchBookingPaymentHistory
);

// Get subscription payment tracking
router.get(
  "/payment-tracking",
  auth("ADMIN"),
  transactionController.getPaymentTracking
);

export const transactionRoutes = router;
