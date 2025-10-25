import express from "express";
import { DistanceController } from "./distance.controller";
import { DistanceValidation } from "./distance.validation";
import validateRequest from "../../middlewares/validateRequest";
import auth from "../../middlewares/auth";
import { UserRole } from "../../models";

const router = express.Router();

router.get(
  "/between/:fromId/:toId",
  validateRequest(DistanceValidation.distanceBetweenUsersSchema),
  auth(UserRole.ADMIN, UserRole.PROVIDER, UserRole.OWNER),
  DistanceController.getDistanceBetween
);

router.get(
  "/nearby",
  validateRequest(DistanceValidation.myNearbyUsersSchema),
  auth(UserRole.OWNER),
  DistanceController.getMyNearbyUsers
);

export const DistanceRoutes = router;
