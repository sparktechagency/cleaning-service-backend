import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { adminController } from "./admin.controller";
import { adminValidation } from "./admin.validation";
import { UserRole } from "../../models";
import multer from "multer";

// Create a custom multer configuration for categories
const storage = multer.memoryStorage();
const categoryUpload = multer({ storage });

// Middleware that allows any fields (for text fields like 'name') plus optional 'image' field
const categoryFileUpload = categoryUpload.fields([
  { name: "image", maxCount: 1 }, // Optional image field
]);

// Middleware for admin profile picture upload
const adminProfileUpload = categoryUpload.fields([
  { name: "profilePicture", maxCount: 1 }, // Optional profile picture field
]);

const router = express.Router();

// Statistics route
router.get("/statistics", auth(UserRole.ADMIN), adminController.getTotalCount);

router.get(
  "/recent-users",
  auth(UserRole.ADMIN),
  adminController.getRecentUsers
);

router.get("/owners", auth(UserRole.ADMIN), adminController.getAllOwners);

router.get(
  "/owners/profile-status",
  auth(UserRole.ADMIN),
  adminController.getOwnerProfileStatus
);

router.get(
  "/providers/profile-status",
  auth(UserRole.ADMIN),
  adminController.getProviderProfileStatus
);

router.get("/providers", auth(UserRole.ADMIN), adminController.getAllProviders);

router.get(
  "/bookings",
  auth(UserRole.ADMIN),
  adminController.getBookingRequestOverview
);

router.get(
  "/account-suspension",
  auth(UserRole.ADMIN),
  adminController.getBookingDetailsForSuspension
);

router.get(
  "/referral-program",
  auth(UserRole.ADMIN),
  adminController.getReferralProgram
);

router.post(
  "/knowledge-hub",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.createKnowledgeHubArticleSchema),
  adminController.createKnowledgeHubArticle
);

router.get("/knowledge-hub", adminController.getKnowledgeHubArticles);

router.put(
  "/edit-profile",
  auth(UserRole.ADMIN),
  adminProfileUpload,
  validateRequest(adminValidation.adminEditProfileSchema),
  adminController.adminEditProfile
);

// Website Content Routes
router.put(
  "/content/about-us",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.updateWebsiteContentSchema),
  adminController.updateAboutUs
);

router.put(
  "/content/privacy-policy",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.updateWebsiteContentSchema),
  adminController.updatePrivacyPolicy
);

router.put(
  "/content/terms-and-conditions",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.updateWebsiteContentSchema),
  adminController.updateTermsAndConditions
);

router.get("/content/about-us", adminController.getAboutUs);

router.get("/content/privacy-policy", adminController.getPrivacyPolicy);

router.get(
  "/content/terms-and-conditions",
  adminController.getTermsAndConditions
);

router.put(
  "/content/affiliation-program",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.updateWebsiteContentSchema),
  adminController.updateAfialiationProgram
);

router.get(
  "/content/affiliation-program",
  adminController.getAfiliationProgram
);

// Category management routes
router.post(
  "/categories",
  auth(UserRole.ADMIN),
  categoryFileUpload,
  validateRequest(adminValidation.createCategorySchema),
  adminController.createCategory
);

router.get(
  "/categories",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.getCategoriesQuerySchema),
  adminController.getCategories
);

router.get(
  "/categories/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.getCategorySchema),
  adminController.getCategoryById
);

router.put(
  "/categories/:id",
  auth(UserRole.ADMIN),
  categoryFileUpload,
  validateRequest(adminValidation.updateCategorySchema),
  adminController.updateCategory
);

router.delete(
  "/categories/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.deleteCategorySchema),
  adminController.deleteCategory
);

router.get(
  "/users/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.getUserSchema),
  adminController.getIndividualUserDetails
);

router.patch(
  "/users/status/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.changeUserStatusSchema),
  adminController.changeUserStatus
);

router.get(
  "/bookings/:bookingId",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.getBookingUserOverviewSchema),
  adminController.getBookingUserOverview
);

router.get(
  "/profile-status/search/:searchTerm",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.searchUsersSchema),
  adminController.searchForProfileStatus
);

router.get(
  "/search/:searchTerm",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.searchUsersSchema),
  adminController.searchUsers
);

router.get(
  "/bookings/search/:searchTerm",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.searchBookingRequestsSchema),
  adminController.searchBookingRequests
);

router.get(
  "/account-suspension/search/:searchTerm",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.searchBookingRequestsSchema),
  adminController.searchBookingDetailsForSuspension
);

router.put(
  "/knowledge-hub/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.updateKnowledgeHubArticleSchema),
  adminController.updateKnowledgeHubArticle
);

router.delete(
  "/knowledge-hub/:id",
  auth(UserRole.ADMIN),
  validateRequest(adminValidation.deleteKnowledgeHubArticleSchema),
  adminController.deleteKnowledgeHubArticle
);

router.get(
  "/knowledge-hub/:id",
  validateRequest(adminValidation.getKnowledgeHubArticleSchema),
  adminController.getKnowledgeHubArticleById
);

export const adminRoutes = router;
