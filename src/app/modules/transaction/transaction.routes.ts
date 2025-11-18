import express from "express";
import auth from "../../middlewares/auth";
import * as transactionController from "./transaction.controller";
import validateRequest from "../../middlewares/validateRequest";
import { transactionValidation } from "./transaction.validation";

const router = express.Router();

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
