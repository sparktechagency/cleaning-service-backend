import httpStatus from "http-status";
import { messageService } from "./message.service";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";

const getUsersForSidebar = catchAsync(async (req, res) => {
  const result = await messageService.getUsersForSidebar(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users retrieved successfully",
    data: result,
  });
});

const getMessages = catchAsync(async (req, res) => {
  const result = await messageService.getMessages(req.user.id, req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages retrieved successfully",
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const { id: receiverId } = req.params;
  const senderId = req.user.id;

  const result = await messageService.sendMessage(
    senderId,
    receiverId,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Message sent successfully",
    data: result,
  });
});

export const messageController = {
  getUsersForSidebar,
  getMessages,
  sendMessage,
};
