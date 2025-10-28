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

const router = express.Router();

// Statistics route
router.get("/statistics", auth(UserRole.ADMIN), adminController.getTotalCount);

router.get("/recent-users", auth(UserRole.ADMIN), adminController.getRecentUsers);

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

export const adminRoutes = router;
