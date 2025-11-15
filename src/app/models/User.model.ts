import mongoose, { Document, Schema } from "mongoose";

export enum UserRole {
  ADMIN = "ADMIN",
  OWNER = "OWNER",
  PROVIDER = "PROVIDER",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "EXPIRED",
  BLOCKED = "BLOCKED",
}

export enum RegistrationStatus {
  PARTIAL = "PARTIAL", // Initial registration with email OTP sent
  EMAIL_VERIFIED = "EMAIL_VERIFIED", // Email verified but profile not complete
  COMPLETED = "COMPLETED", // Full registration completed
}

export interface IReferredBy {
  userId: string;
  userName: string;
  referralCode: string;
}

export interface IUser extends Document {
  _id: string;
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  referralCode?: string;
  referredBy?: IReferredBy; // Details of the person who referred this user
  credits?: number; // Credits earned from referrals
  lattitude?: number;
  longitude?: number;
  resultRange?: number;
  experience?: string;
  profilePicture?: string;
  NIDFront?: string;
  NIDBack?: string;
  selfieWithNID?: string;
  affiliationCondition: boolean;
  plan?: string;
  badge?: string | null; // Badge based on subscription plan
  stripeCustomerId?: string; // Stripe customer ID for payments (EUR)
  stripeCustomerIdUSD?: string; // Old USD customer ID (kept for reference after EUR migration)
  stripeAccountId?: string; // Stripe Connect account ID for providers (to receive payments)
  stripeAccountStatus?: "pending" | "active" | "restricted" | "none"; // Status of Stripe Connect account
  stripeOnboardingComplete?: boolean; // Whether provider completed Stripe onboarding
  address?: string;
  aboutMe?: string;
  role?: UserRole;
  status?: UserStatus;
  registrationStatus?: RegistrationStatus;
  emailVerificationOtp?: string;
  emailVerificationOtpExpiry?: Date;
  resetPasswordOtp?: string;
  resetPasswordOtpExpiry?: Date;
  isEmailVerified?: boolean;
  isOnline?: boolean;
  lastSeen?: Date;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userName: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    referralCode: {
      type: String,
      trim: true,
    },
    referredBy: {
      userId: {
        type: String,
        trim: true,
      },
      userName: {
        type: String,
        trim: true,
      },
      referralCode: {
        type: String,
        trim: true,
      },
    },
    credits: {
      type: Number,
      default: 0,
      min: 0,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
    },
    registrationStatus: {
      type: String,
      enum: Object.values(RegistrationStatus),
      default: RegistrationStatus.PARTIAL,
    },
    lattitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    resultRange: {
      type: Number,
      default: 10,
    },
    experience: {
      type: String,
      enum: ["0-1", "1-5", "+5"],
    },
    profilePicture: {
      type: String,
      trim: true,
    },
    NIDFront: {
      type: String,
      trim: true,
    },
    NIDBack: {
      type: String,
      trim: true,
    },
    selfieWithNID: {
      type: String,
      trim: true,
    },
    affiliationCondition: {
      type: Boolean,
      required: true,
    },
    plan: {
      type: String,
      enum: ["FREE", "SILVER", "GOLD", "PLATINUM"],
      default: "FREE",
    },
    badge: {
      type: String,
      trim: true,
      default: null,
    },
    stripeCustomerId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    stripeCustomerIdUSD: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      // Old USD customer ID - kept for reference after EUR migration
    },
    stripeAccountId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    stripeAccountStatus: {
      type: String,
      enum: ["pending", "active", "restricted", "none"],
      default: "none",
    },
    stripeOnboardingComplete: {
      type: Boolean,
      default: false,
    },
    address: {
      type: String,
      trim: true,
    },
    aboutMe: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },
    // Authentication related fields
    emailVerificationOtp: {
      type: String,
    },
    emailVerificationOtpExpiry: {
      type: Date,
    },
    resetPasswordOtp: {
      type: String,
    },
    resetPasswordOtpExpiry: {
      type: Date,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ isDeleted: 1 });

export enum NotificationType {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  PROMOTIONAL = "PROMOTIONAL",
  SYSTEM = "SYSTEM",
}

export const User = mongoose.model<IUser>("User", UserSchema);
