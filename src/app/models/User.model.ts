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

export interface IUser extends Document {
  _id: string;
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  referralCode?: string;
  referredBy?: string; // User ID of the person who referred this user
  lattitude?: number;
  longitude?: number;
  resultRange?: number;
  experience?: string;
  profilePicture?: string;
  NIDFront?: string;
  NIDBack?: string;
  selfieWithNID?: string;
  plan?: string;
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
      type: String,
      trim: true,
      default: null,
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
      enum: ["0-2", "2-5", "6-10", "11-20", "+20"],
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
    plan: {
      type: String,
      enum: ["BASIC", "PRO"],
      default: "BASIC",
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
UserSchema.index({ referralCode: 1 }, { sparse: true });
UserSchema.index({ isDeleted: 1 });
UserSchema.index({ emailVerificationOtpExpiry: 1 }, { expireAfterSeconds: 0 });
UserSchema.index({ resetPasswordOtpExpiry: 1 }, { expireAfterSeconds: 0 });

export enum NotificationType {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  PROMOTIONAL = "PROMOTIONAL",
  SYSTEM = "SYSTEM",
}

export const User = mongoose.model<IUser>("User", UserSchema);
