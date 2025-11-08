import { UserRole } from "../../models";
import express from "express";
import multer from "multer";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { AuthController } from "./auth.controller";
import { authValidation } from "./auth.validation";

const router = express.Router();

// Custom multer configuration for registration files
const storage = multer.memoryStorage();
const upload = multer({ storage });
const registrationUpload = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "NIDFront", maxCount: 1 },
  { name: "NIDBack", maxCount: 1 },
  { name: "selfieWithNID", maxCount: 1 },
]);

router.post(
  "/register",
  upload.none(),
  validateRequest(authValidation.registerSchema),
  AuthController.register
);

router.post(
  "/verify-otp",
  validateRequest(authValidation.verifyOtpSchema),
  AuthController.verifyOtp
);

router.post(
  "/complete-registration",
  registrationUpload,
  validateRequest(authValidation.completeRegistrationSchema),
  AuthController.completeRegistration
);

router.post(
  "/login",
  validateRequest(authValidation.loginValidationSchema),
  AuthController.loginUser
);

router.post("/logout", AuthController.logoutUser);

router.get("/me", auth(), AuthController.getMyProfile);

router.put(
  "/change-password",
  auth(),
  validateRequest(authValidation.changePasswordValidationSchema),
  AuthController.changePassword
);

router.post("/forgot-password", AuthController.forgotPassword);
router.post(
  "/resend-otp",
  validateRequest(authValidation.resendOtpSchema),
  AuthController.resendOtp
);
router.post(
  "/verify-forgot-password-otp",
  AuthController.verifyForgotPasswordOtp
);

router.post(
  "/reset-password",
  validateRequest(authValidation.resetPasswordValidationSchema),
  AuthController.resetPassword
);

router.get("/check-token-validity", AuthController.checkTokenValidity);

export const authRoutes = router;
