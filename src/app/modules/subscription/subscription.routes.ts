import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { subscriptionController } from "./subscription.controller";
import { subscriptionValidation } from "./subscription.validation";
import { UserRole } from "../../models";

const router = express.Router();

// Get all available subscription plans (public or authenticated)
router.get("/plans", subscriptionController.getAllPlans);

// Provider-only routes
router.get(
  "/my-subscription",
  auth(UserRole.PROVIDER),
  subscriptionController.getMySubscription
);

router.get(
  "/check-limits",
  auth(UserRole.PROVIDER),
  subscriptionController.checkPlanLimits
);

router.post(
  "/checkout",
  auth(UserRole.PROVIDER),
  validateRequest(subscriptionValidation.createCheckoutSchema),
  subscriptionController.createCheckout
);

router.get(
  "/verify",
  auth(UserRole.PROVIDER),
  subscriptionController.verifySubscription
);

router.get(
  "/activate-from-checkout",
  subscriptionController.activateFromCheckout
);

router.post(
  "/cancel",
  auth(UserRole.PROVIDER),
  validateRequest(subscriptionValidation.cancelSubscriptionSchema),
  subscriptionController.cancelSubscription
);

export const subscriptionRoutes = router;
