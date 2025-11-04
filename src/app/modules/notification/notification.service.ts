import { Notification, NotificationType } from "../../models";
import { getIO, getReceiverSocketId } from "../../../socket/socketHandler";

interface CreateNotificationParams {
  recipientId: string;
  senderId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
}

export const createNotification = async (
  params: CreateNotificationParams
): Promise<void> => {
  try {
    const notification = await Notification.create({
      recipientId: params.recipientId,
      senderId: params.senderId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data,
      isRead: false,
    });

    // Populate sender info
    await notification.populate("senderId", "userName profilePicture");

    // Send real-time notification via Socket.IO
    const io = getIO();
    if (io) {
      const recipientSocketId = getReceiverSocketId(params.recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("new_notification", {
          ...notification.toObject(),
          timestamp: new Date(),
        });
      }
    }
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

export const createBulkNotifications = async (
  recipientIds: string[],
  params: Omit<CreateNotificationParams, "recipientId">
): Promise<void> => {
  try {
    const notifications = recipientIds.map((recipientId) => ({
      recipientId,
      senderId: params.senderId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data,
      isRead: false,
    }));

    await Notification.insertMany(notifications);

    // Send real-time notifications via Socket.IO
    const io = getIO();
    if (io) {
      recipientIds.forEach((recipientId) => {
        const recipientSocketId = getReceiverSocketId(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("new_notification", {
            type: params.type,
            title: params.title,
            message: params.message,
            data: params.data,
            timestamp: new Date(),
          });
        }
      });
    }
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
  }
};

export const getUserNotifications = async (
  userId: string,
  limit: number = 50,
  skip: number = 0
) => {
  const notifications = await Notification.find({ recipientId: userId })
    .populate("senderId", "userName profilePicture")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  const unreadCount = await Notification.countDocuments({
    recipientId: userId,
    isRead: false,
  });

  return {
    notifications,
    unreadCount,
  };
};

export const markNotificationAsRead = async (
  notificationId: string,
  userId: string
): Promise<boolean> => {
  const result = await Notification.updateOne(
    { _id: notificationId, recipientId: userId },
    { isRead: true }
  );

  return result.modifiedCount > 0;
};

export const markAllNotificationsAsRead = async (
  userId: string
): Promise<number> => {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true }
  );

  return result.modifiedCount;
};

export const deleteNotification = async (
  notificationId: string,
  userId: string
): Promise<boolean> => {
  const result = await Notification.deleteOne({
    _id: notificationId,
    recipientId: userId,
  });

  return result.deletedCount > 0;
};

/**
 * Clear all notifications for a user
 */
// export const clearAllNotifications = async (
//   userId: string
// ): Promise<number> => {
//   const result = await Notification.deleteMany({ recipientId: userId });
//   return result.deletedCount;
// };

export const notificationService = {
  createNotification,
  createBulkNotifications,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  //clearAllNotifications,
};
