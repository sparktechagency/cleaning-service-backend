import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { paymentController } from "./payment.controller";
import { paymentValidation } from "./payment.validation";
import { UserRole } from "../../models";

const router = express.Router();

// Owner (customer) routes for booking payments
router.post(
  "/booking/create",
  auth(UserRole.OWNER),
  validateRequest(paymentValidation.createBookingPaymentSchema),
  paymentController.createBookingPayment
);

router.post(
  "/booking/refund",
  auth(UserRole.OWNER),
  validateRequest(paymentValidation.refundPaymentSchema),
  paymentController.refundPayment
);

router.get(
  "/booking/refund-eligibility/:bookingId",
  auth(UserRole.OWNER),
  paymentController.checkRefundEligibility
);

// Debug endpoint to check booking payment status
router.get(
  "/booking/status",
  auth(UserRole.OWNER, UserRole.PROVIDER, UserRole.ADMIN),
  paymentController.getBookingPaymentStatus
);

export const paymentRoutes = router;
