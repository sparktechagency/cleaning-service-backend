import express from "express";
import multer from "multer";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { profileController } from "./profile.controller";
import { profileValidation } from "./profile.validation";
import { UserRole } from "../../models";

const router = express.Router();

// Multer configuration for profile image
const storage = multer.memoryStorage();
const upload = multer({ storage });
const profileImageUpload = upload.single("profilePicture");

router.get(
  "/provider",
  auth(UserRole.PROVIDER),
  profileController.getProviderProfile
);

router.put(
  "/provider",
  auth(UserRole.PROVIDER),
  profileImageUpload,
  validateRequest(profileValidation.updateProviderProfile),
  profileController.updateProviderProfile
);

router.get("/owner", auth(UserRole.OWNER), profileController.getOwnerProfile);

router.put(
  "/owner",
  auth(UserRole.OWNER),
  profileImageUpload,
  validateRequest(profileValidation.updateOwnerProfile),
  profileController.updateOwnerProfile
);

export const profileRoutes = router;
