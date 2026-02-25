import express from "express";
import multer from "multer";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { serviceController } from "./service.controller";
import { serviceValidation } from "./service.validation";
import { UserRole } from "../../models";
import {
  checkServiceCreationLimit,
  checkCategoryLimit,
  checkCategoryLimitForUpdate,
  checkStripeAccountActive,
} from "../../middlewares/subscriptionCheck";

const router = express.Router();

// Multer configuration for service cover images
const storage = multer.memoryStorage();
const upload = multer({ storage });
const serviceUpload = upload.fields([{ name: "coverImages", maxCount: 5 }]);

// Public routes
router.get("/categories", serviceController.getCategories);
router.get(
  "/search-filter",
  auth(UserRole.OWNER),
  serviceController.searchAndFilterServices,
);
router.get(
  "/",
  validateRequest(serviceValidation.getServicesSchema),
  serviceController.getAllServices,
);
router.get(
  "/:id",
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.getServiceById,
);

router.post(
  "/create",
  auth(UserRole.PROVIDER),
  checkStripeAccountActive,
  checkServiceCreationLimit,
  serviceUpload,
  checkCategoryLimit,
  validateRequest(serviceValidation.createServiceSchema),
  serviceController.createService,
);

router.get(
  "/my/services",
  auth(UserRole.PROVIDER),
  validateRequest(serviceValidation.getServicesSchema),
  serviceController.getMyServices,
);

router.put(
  "/update/:id",
  auth(UserRole.PROVIDER),
  serviceUpload,
  checkCategoryLimitForUpdate,
  validateRequest(serviceValidation.updateServiceSchema),
  serviceController.updateService,
);

router.delete(
  "/:id",
  auth(UserRole.PROVIDER),
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.deleteService,
);

router.delete(
  "/:serviceId/photos/:photoId",
  auth(UserRole.PROVIDER),
  validateRequest(serviceValidation.deletePhotoSchema),
  serviceController.deleteSinglePhoto,
);

router.get(
  "/category/services/:categoryId",
  auth(UserRole.OWNER),
  serviceController.getServicesUnderCategory,
);

router.get(
  "/details/:id",
  auth(UserRole.OWNER),
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.getServiceOverview,
);

router.get(
  "/provider/details/:id",
  auth(UserRole.OWNER),
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.getServiceProviderDetails,
);

router.get(
  "/provider/schedule/:id",
  auth(UserRole.OWNER),
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.getServiceProviderSchedule,
);

router.get(
  "/provider/available-slots/:id",
  auth(UserRole.OWNER),
  validateRequest(serviceValidation.getAvailableSlotsSchema),
  serviceController.getServiceProviderAvailableSlots,
);

router.get(
  "/ratings-reviews/:id",
  auth(UserRole.OWNER, UserRole.PROVIDER),
  validateRequest(serviceValidation.getServiceSchema),
  serviceController.getServiceRatingAndReview,
);

router.get(
  "/provider/homepage-data",
  auth(UserRole.PROVIDER),
  serviceController.getProviderHomepageContentData,
);

export const serviceRoutes = router;
