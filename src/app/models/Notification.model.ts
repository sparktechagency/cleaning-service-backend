import mongoose, { Document, Schema } from "mongoose";

export enum NotificationType {
  // Booking related
  BOOKING_CREATED = "BOOKING_CREATED",
  BOOKING_ACCEPTED = "BOOKING_ACCEPTED",
  BOOKING_COMPLETED = "BOOKING_COMPLETED",
  BOOKING_CANCELLED = "BOOKING_CANCELLED",
  BOOKING_RATED = "BOOKING_RATED",

  // Website content related
  WEBSITE_CONTENT_UPDATED = "WEBSITE_CONTENT_UPDATED",

  // General
  SYSTEM_ANNOUNCEMENT = "SYSTEM_ANNOUNCEMENT",
}

export interface INotification extends Document {
  _id: string;
  recipientId: mongoose.Types.ObjectId;
  senderId?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: {
    bookingId?: string;
    serviceId?: string;
    rating?: number;
    contentType?: string;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for efficient querying
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);
