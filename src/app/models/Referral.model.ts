import mongoose, { Document, Schema } from "mongoose";

export enum ReferralStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface IReferral extends Document {
  _id: string;
  referrerId: mongoose.Types.ObjectId; // User who owns the referral code
  referrerName: string;
  referrerReferralCode: string;
  refereeId: mongoose.Types.ObjectId; // User who used the referral code
  refereeName: string;
  refereeEmail: string;
  creditsEarned: number;
  firstBookingCreditAwarded: boolean; // Track if 10 credits for first booking awarded
  bonusTierCreditAwarded: boolean; // Track if 5 credits bonus for 3 bookings awarded
  completedBookingsCount: number; // Count of completed bookings by referee
  status: ReferralStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referrerName: {
      type: String,
      required: true,
      trim: true,
    },
    referrerReferralCode: {
      type: String,
      required: true,
      trim: true,
    },
    refereeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    refereeName: {
      type: String,
      required: true,
      trim: true,
    },
    refereeEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    creditsEarned: {
      type: Number,
      required: true,
      default: 0,
    },
    firstBookingCreditAwarded: {
      type: Boolean,
      default: false,
    },
    bonusTierCreditAwarded: {
      type: Boolean,
      default: false,
    },
    completedBookingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(ReferralStatus),
      default: ReferralStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
ReferralSchema.index({ referrerId: 1, createdAt: -1 });
ReferralSchema.index({ refereeId: 1 });
ReferralSchema.index({ status: 1 });

export const Referral = mongoose.model<IReferral>("Referral", ReferralSchema);
