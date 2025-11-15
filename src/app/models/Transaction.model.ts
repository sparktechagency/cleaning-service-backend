import mongoose, { Document, Schema } from "mongoose";

export enum TransactionType {
  // Subscription-related
  SUBSCRIPTION_PURCHASE = "SUBSCRIPTION_PURCHASE",
  SUBSCRIPTION_RENEWAL = "SUBSCRIPTION_RENEWAL",
  SUBSCRIPTION_REFUND = "SUBSCRIPTION_REFUND",

  // Booking payment-related
  BOOKING_PAYMENT = "BOOKING_PAYMENT",
  BOOKING_REFUND = "BOOKING_REFUND",

  // Credit redemption-related
  CREDIT_REDEMPTION_SUBSCRIPTION = "CREDIT_REDEMPTION_SUBSCRIPTION",
  CREDIT_REDEMPTION_CASH = "CREDIT_REDEMPTION_CASH",

  // Credit earnings (for reference, no money involved)
  CREDIT_EARNED = "CREDIT_EARNED",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
}

export enum PaymentMethod {
  STRIPE_CARD = "STRIPE_CARD",
  STRIPE_BANK_TRANSFER = "STRIPE_BANK_TRANSFER",
  CREDITS = "CREDITS",
  MIXED = "MIXED", // Card + Credits
}

export interface ITransaction extends Document {
  _id: string;

  // Transaction identification
  transactionType: TransactionType;
  transactionId: string; // Unique transaction ID
  status: TransactionStatus;

  // Parties involved
  payerId: mongoose.Types.ObjectId; // Who is paying
  payerName: string;
  payerRole: "OWNER" | "PROVIDER" | "ADMIN";

  receiverId?: mongoose.Types.ObjectId; // Who is receiving (null for platform)
  receiverName?: string;
  receiverRole?: "OWNER" | "PROVIDER" | "ADMIN";

  // Money details
  amount: number; // Total amount in dollars
  currency: string;
  paymentMethod: PaymentMethod;

  // Credit details (if applicable)
  creditsUsed?: number;
  creditDollarValue?: number; // Dollar value of credits used

  // Net amounts after credits
  netAmount: number; // Actual money charged (amount - creditDollarValue)

  // Stripe details
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripePayoutId?: string;
  stripeCustomerId?: string;
  stripeConnectAccountId?: string; // Provider's Stripe Connect account

  // Related records
  bookingId?: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId;
  redemptionId?: mongoose.Types.ObjectId;
  referralId?: mongoose.Types.ObjectId;

  // Refund information
  refundId?: string;
  refundAmount?: number;
  refundDate?: Date;
  refundReason?: string;
  originalTransactionId?: mongoose.Types.ObjectId; // Link to original transaction if this is a refund

  // Processing details
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;

  // Error handling
  errorMessage?: string;
  errorCode?: string;

  // Metadata
  description: string;
  metadata?: Record<string, any>;

  // Audit
  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    transactionType: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      required: true,
      index: true,
    },

    // Payer information
    payerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    payerName: {
      type: String,
      required: true,
    },
    payerRole: {
      type: String,
      enum: ["OWNER", "PROVIDER", "ADMIN"],
      required: true,
    },

    // Receiver information
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    receiverName: {
      type: String,
    },
    receiverRole: {
      type: String,
      enum: ["OWNER", "PROVIDER", "ADMIN"],
    },

    // Money details
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "EUR",
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
    },

    // Credit details
    creditsUsed: {
      type: Number,
      min: 0,
      default: 0,
    },
    creditDollarValue: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Net amount
    netAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Stripe details
    stripePaymentIntentId: {
      type: String,
      sparse: true,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true,
      index: true,
    },
    stripePayoutId: {
      type: String,
      sparse: true,
      index: true,
    },
    stripeCustomerId: {
      type: String,
      index: true,
    },
    stripeConnectAccountId: {
      type: String,
      index: true,
    },

    // Related records
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      index: true,
    },
    redemptionId: {
      type: Schema.Types.ObjectId,
      ref: "Redemption",
      index: true,
    },
    referralId: {
      type: Schema.Types.ObjectId,
      ref: "Referral",
      index: true,
    },

    // Refund information
    refundId: {
      type: String,
      sparse: true,
      index: true,
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    refundDate: {
      type: Date,
    },
    refundReason: {
      type: String,
    },
    originalTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      index: true,
    },

    // Processing details
    processedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
      index: true,
    },
    failedAt: {
      type: Date,
    },

    // Error handling
    errorMessage: {
      type: String,
    },
    errorCode: {
      type: String,
    },

    // Metadata
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },

    // Audit
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
TransactionSchema.index({ payerId: 1, createdAt: -1 });
TransactionSchema.index({ receiverId: 1, createdAt: -1 });
TransactionSchema.index({ transactionType: 1, status: 1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ createdAt: -1 }); // For admin dashboard
TransactionSchema.index({ payerId: 1, transactionType: 1 });
TransactionSchema.index({ receiverId: 1, transactionType: 1 });

// Virtual for formatted amount
TransactionSchema.virtual("formattedAmount").get(function () {
  return `${this.currency} ${this.amount.toFixed(2)}`;
});

// Virtual for formatted net amount
TransactionSchema.virtual("formattedNetAmount").get(function () {
  return `${this.currency} ${this.netAmount.toFixed(2)}`;
});

// Method to mark as completed
TransactionSchema.methods.markCompleted = function () {
  this.status = TransactionStatus.COMPLETED;
  this.completedAt = new Date();
  return this.save();
};

// Method to mark as failed
TransactionSchema.methods.markFailed = function (
  errorMessage: string,
  errorCode?: string
) {
  this.status = TransactionStatus.FAILED;
  this.failedAt = new Date();
  this.errorMessage = errorMessage;
  this.errorCode = errorCode;
  return this.save();
};

// Method to mark as refunded
TransactionSchema.methods.markRefunded = function (
  refundId: string,
  refundAmount: number,
  reason?: string
) {
  this.status = TransactionStatus.REFUNDED;
  this.refundId = refundId;
  this.refundAmount = refundAmount;
  this.refundDate = new Date();
  this.refundReason = reason;
  return this.save();
};

// Static method to generate unique transaction ID
TransactionSchema.statics.generateTransactionId = function () {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `TXN-${timestamp}-${randomStr}`.toUpperCase();
};

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
