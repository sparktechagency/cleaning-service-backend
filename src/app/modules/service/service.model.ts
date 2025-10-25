import mongoose, { Document, Schema } from "mongoose";

export interface IDaySchedule {
  day: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
}

export interface IWorkSchedule {
  monday: IDaySchedule;
  tuesday: IDaySchedule;
  wednesday: IDaySchedule;
  thursday: IDaySchedule;
  friday: IDaySchedule;
  saturday: IDaySchedule;
  sunday: IDaySchedule;
}

export interface IService extends Document {
  _id: string;
  providerId: mongoose.Types.ObjectId | string;
  categoryId: mongoose.Types.ObjectId | string;
  name: string;
  description?: string;
  rateByHour: string;
  needApproval?: boolean;
  gender: string;
  languages?: string[];
  coverImages?: string[];
  workSchedule?: IWorkSchedule;
  ratingsAverage?: number;
  ratingsCount?: number;
  reviews?: string[];
  totalOrders?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IService>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    rateByHour: {
      type: String,
      trim: true,
    },
    needApproval: {
      type: Boolean,
      default: false,
    },
    gender: {
      type: String,
      enum: ["Male", "Female"],
    },
    languages: [
      {
        type: String,
        enum: ["English"],
      },
    ],
    coverImages: [
      {
        type: String,
      },
    ],
    workSchedule: {
      monday: {
        day: { type: String, default: "Monday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      tuesday: {
        day: { type: String, default: "Tuesday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      wednesday: {
        day: { type: String, default: "Wednesday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      thursday: {
        day: { type: String, default: "Thursday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      friday: {
        day: { type: String, default: "Friday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      saturday: {
        day: { type: String, default: "Saturday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
      sunday: {
        day: { type: String, default: "Sunday" },
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "" },
        endTime: { type: String, default: "" },
      },
    },
    ratingsAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviews: [
      {
        type: Schema.Types.ObjectId,
        ref: "Review",
      },
    ],
    totalOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
ServiceSchema.index({ name: 1 });

export const Service = mongoose.model<IService>("Service", ServiceSchema);
