import express from "express";
import auth from "../../middlewares/auth";
import { messageController } from "./message.controller";

const router = express.Router();

router.get("/users", auth(), messageController.getUsersForSidebar);

router.get("/unread-count", auth(), messageController.getUnreadMessageCount);

router.get("/:id", auth(), messageController.getMessages);

router.post("/:id", auth(), messageController.sendMessage);

export const messageRoutes = router;
