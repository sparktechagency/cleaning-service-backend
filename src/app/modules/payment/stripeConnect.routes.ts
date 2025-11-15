import express from "express";
import { stripeConnectController } from "./stripeConnect.controller";
import auth from "../../middlewares/auth";
import { UserRole } from "../../models";

const router = express.Router();

router.post(
  "/onboarding",
  auth(UserRole.PROVIDER, UserRole.OWNER),
  stripeConnectController.createOnboardingLink
);

router.get(
  "/status",
  auth(UserRole.PROVIDER, UserRole.OWNER),
  stripeConnectController.getAccountStatus
);

router.get(
  "/dashboard",
  auth(UserRole.PROVIDER, UserRole.OWNER),
  stripeConnectController.getDashboardLink
);

router.delete(
  "/disconnect",
  auth(UserRole.PROVIDER, UserRole.OWNER),
  stripeConnectController.disconnectAccount
);

/**
 * @route   POST /api/v1/stripe-connect/webhook
 * @desc    Handle Stripe Connect webhooks
 * @access  Public (Stripe only)
 * @note    This route should NOT use auth middleware
 */
router.post("/webhook", stripeConnectController.handleWebhook);

export const stripeConnectRoutes = router;
