import express from "express";
import { notificationController } from "./notification.controller";
import auth from "../../middlewares/auth";

const router = express.Router();

// All routes require authentication
router.get("/", auth(), notificationController.getMyNotifications);

router.patch(
  "/read/:notificationId",
  auth(),
  notificationController.markAsRead
);

router.patch("/mark-all-read", auth(), notificationController.markAllAsRead);

router.delete(
  "/:notificationId",
  auth(),
  notificationController.deleteNotification
);

//router.delete("/", auth(), notificationController.clearAll);

export const notificationRoutes = router;
