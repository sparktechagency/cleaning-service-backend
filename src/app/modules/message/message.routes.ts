import express from "express";
import auth from "../../middlewares/auth";
import { messageController } from "./message.controller";
import { fileUploader } from "../../../helpers/fileUploader";

const router = express.Router();

router.get("/users", auth(), messageController.getUsersForSidebar);

router.get("/unread-count", auth(), messageController.getUnreadMessageCount);

router.get("/:id", auth(), messageController.getMessages);

// Accept form-data with optional text and multiple images
router.post(
  "/:id",
  auth(),
  fileUploader.uploadMessageFiles,
  messageController.sendMessage
);

export const messageRoutes = router;
