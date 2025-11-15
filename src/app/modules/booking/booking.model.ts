import mongoose, { Document, Schema } from "mongoose";

export type PaymentMethod = "STRIPE";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type BookingStatus = "PENDING" | "ONGOING" | "COMPLETED" | "CANCELLED";

export interface IAddress {
  city: string;
  latitude: number;
  longitude: number;
}

export interface IBooking extends Document {
  _id: string;
  customerId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  providerId?: mongoose.Types.ObjectId;
  scheduledAt: Date;
  phoneNumber: string;
  address: IAddress;
  description?: string;
  serviceDuration: number;
  totalAmount: number;
  status: BookingStatus;
  completionCode?: string;
  qrCodeUrl?: string;
  rating?: number;
  review?: string;
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionId?: string;
    stripePaymentIntentId?: string;
    stripeTransferId?: string;
    refundId?: string;
    refundedAt?: Date;
    paidAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    city: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { _id: false }
);

const BookingSchema = new Schema<IBooking>(
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
      type: AddressSchema,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    serviceDuration: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ONGOING", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    completionCode: { type: String, trim: true },
    qrCodeUrl: { type: String, trim: true },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
    },
    payment: {
      method: { type: String, enum: ["STRIPE"], required: true },
      status: {
        type: String,
        enum: ["UNPAID", "PAID", "REFUNDED"],
        default: "UNPAID",
      },
      transactionId: {
        type: String,
        trim: true,
      },
      stripePaymentIntentId: {
        type: String,
        trim: true,
      },
      stripeTransferId: {
        type: String,
        trim: true,
      },
      refundId: {
        type: String,
        trim: true,
      },
      refundedAt: {
        type: Date,
      },
      paidAt: {
        type: Date,
      },
    },
  },
  { timestamps: true }
);

// useful compound indexes
BookingSchema.index({ customerId: 1, scheduledAt: -1 });
BookingSchema.index({ providerId: 1, scheduledAt: -1 });
BookingSchema.index({ serviceId: 1, status: 1 });

export const Booking = mongoose.model<IBooking>("Booking", BookingSchema);
