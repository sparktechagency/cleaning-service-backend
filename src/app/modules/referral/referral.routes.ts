import express from "express";
import auth from "../../middlewares/auth";
import { referralController } from "./referral.controller";
import { UserRole } from "../../models";

const router = express.Router();

router.get(
  "/my-info",
  auth(UserRole.OWNER, UserRole.PROVIDER),
  referralController.getMyReferralInfo
);

export const referralRoutes = router;
