import express from "express";
import { redemptionController } from "./redemption.controller";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { redemptionValidation } from "./redemption.validation";
import { UserRole } from "../../models";

const router = express.Router();

router.get(
  "/my-credits",
  auth(UserRole.OWNER, UserRole.PROVIDER),
  redemptionController.getMyCredits
);

router.get(
  "/history",
  auth(UserRole.OWNER, UserRole.PROVIDER),
  redemptionController.getRedemptionHistory
);

router.post(
  "/calculate-preview",
  auth(UserRole.OWNER, UserRole.PROVIDER),
  validateRequest(redemptionValidation.calculatePreview),
  redemptionController.calculateRedemptionPreview
);

router.post(
  "/redeem-for-cash",
  auth(UserRole.OWNER),
  validateRequest(redemptionValidation.redeemForCash),
  redemptionController.redeemForCash
);

export const redemptionRoutes = router;
