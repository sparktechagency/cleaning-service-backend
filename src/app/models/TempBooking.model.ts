import mongoose, { Document, Schema } from "mongoose";

export type PaymentMethod = "STRIPE";

export interface ITempAddress {
  city: string;
  latitude: number;
  longitude: number;
}

export interface ITempBooking extends Document {
  _id: string;
  customerId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  providerId?: mongoose.Types.ObjectId;
  scheduledAt: Date;
  phoneNumber: string;
  address: ITempAddress;
  description?: string;
  serviceDuration: number;
  bufferTime: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  stripeSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TempAddressSchema = new Schema<ITempAddress>(
  {
    city: { type: String, trim: true, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const TempBookingSchema = new Schema<ITempBooking>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: TempAddressSchema,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    serviceDuration: {
      type: Number,
      required: true,
      min: 0.5,
    },
    bufferTime: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["STRIPE"],
      default: "STRIPE",
      required: true,
    },
    stripeSessionId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically delete temp bookings after 10 minutes if payment not completed
TempBookingSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 10 * 60 } // 10 minutes
);

// Compound index for faster queries
TempBookingSchema.index({ customerId: 1, createdAt: -1 });
TempBookingSchema.index({ stripeSessionId: 1 });

export const TempBooking = mongoose.model<ITempBooking>(
  "TempBooking",
  TempBookingSchema
);
