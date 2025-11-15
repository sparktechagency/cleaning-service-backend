import mongoose, { Document, Schema } from "mongoose";

export enum SubscriptionPlan {
  FREE = "FREE",
  SILVER = "SILVER",
  GOLD = "GOLD",
  PLATINUM = "PLATINUM",
}

export enum SubscriptionStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
  PENDING = "PENDING",
}

export interface IPlanLimits {
  servicesLimit: number; // -1 means unlimited
  bookingsPerMonth: number; // -1 means unlimited
  categoriesLimit: number; // -1 means unlimited
  priority: number; // 1 = highest, 4 = lowest
  badge: string | null;
}

export interface ISubscription extends Document {
  _id: string;
  userId: mongoose.Types.ObjectId;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeCustomerId?: string;
  amount: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Plan configurations
export const PLAN_LIMITS: Record<SubscriptionPlan, IPlanLimits> = {
  [SubscriptionPlan.FREE]: {
    servicesLimit: 2,
    bookingsPerMonth: 2,
    categoriesLimit: 1,
    priority: 4,
    badge: null,
  },
  [SubscriptionPlan.SILVER]: {
    servicesLimit: -1, // unlimited
    bookingsPerMonth: 10,
    categoriesLimit: 1,
    priority: 3,
    badge: null,
  },
  [SubscriptionPlan.GOLD]: {
    servicesLimit: -1,
    bookingsPerMonth: -1,
    categoriesLimit: 1,
    priority: 2,
    badge: "Gold Verified",
  },
  [SubscriptionPlan.PLATINUM]: {
    servicesLimit: -1,
    bookingsPerMonth: -1,
    categoriesLimit: -1,
    priority: 1,
    badge: "Platinum Partner",
  },
};

export const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.SILVER]: 27,
  [SubscriptionPlan.GOLD]: 57,
  [SubscriptionPlan.PLATINUM]: 97,
};

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: Object.values(SubscriptionPlan),
      required: true,
      default: SubscriptionPlan.FREE,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.ACTIVE,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    stripePriceId: {
      type: String,
      trim: true,
    },
    stripeCustomerId: {
      type: String,
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      default: "EUR",
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query performance
SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1, status: 1 });

export const Subscription = mongoose.model<ISubscription>(
  "Subscription",
  SubscriptionSchema
);
