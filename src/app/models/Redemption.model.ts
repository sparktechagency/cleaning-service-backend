import mongoose, { Document, Schema } from "mongoose";

export enum RedemptionType {
  SUBSCRIPTION_DISCOUNT = "SUBSCRIPTION_DISCOUNT", // Provider redeems for subscription discount
  BANK_TRANSFER = "BANK_TRANSFER", // Owner redeems for direct money transfer
}

export enum RedemptionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface IRedemption extends Document {
  _id: string;
  userId: mongoose.Types.ObjectId;
  userRole: "PROVIDER" | "OWNER";
  redemptionType: RedemptionType;
  creditsRedeemed: number;
  dollarValue: number;
  status: RedemptionStatus;

  // For subscription discount
  subscriptionId?: mongoose.Types.ObjectId;
  originalPrice?: number;
  discountApplied?: number;
  finalPrice?: number;

  // For bank transfer
  stripePayoutId?: string;
  bankAccountLast4?: string;
  bankName?: string;
  transferDate?: Date;

  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const RedemptionSchema = new Schema<IRedemption>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ["PROVIDER", "OWNER"],
      required: true,
    },
    redemptionType: {
      type: String,
      enum: Object.values(RedemptionType),
      required: true,
    },
    creditsRedeemed: {
      type: Number,
      required: true,
      min: 0,
    },
    dollarValue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(RedemptionStatus),
      default: RedemptionStatus.PENDING,
      index: true,
    },

    // Subscription discount fields
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },
    originalPrice: {
      type: Number,
    },
    discountApplied: {
      type: Number,
    },
    finalPrice: {
      type: Number,
    },

    // Bank transfer fields
    stripePayoutId: {
      type: String,
      sparse: true,
      index: true,
    },
    bankAccountLast4: {
      type: String,
    },
    bankName: {
      type: String,
    },
    transferDate: {
      type: Date,
    },

    errorMessage: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
RedemptionSchema.index({ userId: 1, createdAt: -1 });
RedemptionSchema.index({ userId: 1, status: 1 });
RedemptionSchema.index({ redemptionType: 1, status: 1 });

export const Redemption = mongoose.model<IRedemption>(
  "Redemption",
  RedemptionSchema
);
