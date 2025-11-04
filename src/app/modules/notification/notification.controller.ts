import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { notificationService } from "./notification.service";

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = parseInt(req.query.skip as string) || 0;

  const result = await notificationService.getUserNotifications(
    userId,
    limit,
    skip
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications retrieved successfully",
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { notificationId } = req.params;

  const success = await notificationService.markNotificationAsRead(
    notificationId,
    userId
  );

  sendResponse(res, {
    statusCode: success ? httpStatus.OK : httpStatus.NOT_FOUND,
    success,
    message: success ? "Notification marked as read" : "Notification not found",
    data: null,
  });
});

const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const count = await notificationService.markAllNotificationsAsRead(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `${count} notifications marked as read`,
    data: { count },
  });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { notificationId } = req.params;

  const success = await notificationService.deleteNotification(
    notificationId,
    userId
  );

  sendResponse(res, {
    statusCode: success ? httpStatus.OK : httpStatus.NOT_FOUND,
    success,
    message: success ? "Notification deleted" : "Notification not found",
    data: null,
  });
});

// const clearAll = catchAsync(async (req: Request, res: Response) => {
//   const userId = (req as any).user.id;

//   const count = await notificationService.clearAllNotifications(userId);

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: `${count} notifications cleared`,
//     data: { count },
//   });
// });

export const notificationController = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  //clearAll,
};
