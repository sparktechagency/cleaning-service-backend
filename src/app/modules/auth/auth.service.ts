import * as bcrypt from "bcrypt";
import crypto from "crypto";
import httpStatus from "http-status";
import mongoose from "mongoose";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import emailSender from "../../../shared/emailSender";
import { User, UserStatus, RegistrationStatus, TempUser } from "../../models";
import { Referral } from "../../models/Referral.model";
import { fileUploader } from "../../../helpers/fileUploader";
import { generateOTPString } from "../../../utils/GenerateOTP";
import {
  generateUniqueReferralCode,
  validateReferralCode,
} from "../../../utils/ReferralCodeGenerator";
import {
  EMAIL_VERIFICATION_TEMPLATE,
  PASSWORD_RESET_TEMPLATE,
  WELCOME_COMPLETE_TEMPLATE,
} from "../../../utils/Template";

const registerUser = async (userData: any) => {
  try {
    // Check if user already exists in main User collection
    const existingUser = await User.findOne({
      $or: [{ email: userData.email }, { phoneNumber: userData.phoneNumber }],
    });

    if (existingUser) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User already exists with this email or phone number"
      );
    }

    // Check if there's already a pending registration (temp user) with same email or phone
    const existingTempUser = await TempUser.findOne({
      $or: [{ email: userData.email }, { phoneNumber: userData.phoneNumber }],
    });

    if (existingTempUser) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "A registration is already in progress with this email or phone number. Please wait 15 minutes or verify your OTP."
      );
    }

    const emailOtp = generateOTPString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const hashedPassword = await bcrypt.hash(
      userData.password,
      Number(config.bcrypt_salt_rounds)
    );

    // Create temporary user
    const tempUserPayload = {
      userName: userData.userName,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      password: hashedPassword,
      referralCode: userData.referralCode,
      emailVerificationOtp: emailOtp,
      emailVerificationOtpExpiry: otpExpiry,
    };

    const newTempUser = await TempUser.create(tempUserPayload);

    // Send verification email
    try {
      const emailTemplate = EMAIL_VERIFICATION_TEMPLATE(
        emailOtp,
        userData.userName
      );
      await emailSender(
        userData.email,
        emailTemplate,
        "Verify Your Email - Cleaning Service 🧹"
      );
    } catch (emailError) {
      console.error("Email sending error:", emailError);
    }

    return {
      email: newTempUser.email,
      userName: newTempUser.userName,
      otp: process.env.NODE_ENV === "development" ? emailOtp : undefined, // Only return OTP in development
      message:
        "Registration initiated successfully. Please verify your email with the OTP sent to your email address.",
    };
  } catch (error) {
    throw error;
  }
};

const verifyOtp = async (payload: {
  email: string;
  otp: string;
  otpType: string;
}) => {
  // Handle email verification for registration (from TempUser)
  if (payload.otpType === "VERIFY_EMAIL") {
    const tempUser = await TempUser.findOne({
      email: payload.email,
    });

    if (!tempUser) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No pending registration found for this email. Please register first."
      );
    }

    // Verify OTP
    const isValidOtp =
      tempUser.emailVerificationOtp?.trim() === payload.otp?.trim();
    const otpExpiry = tempUser.emailVerificationOtpExpiry;

    if (!isValidOtp || !otpExpiry || otpExpiry < new Date()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
    }

    return {
      email: tempUser.email,
      userName: tempUser.userName,
      message: "OTP verified successfully. Please complete your registration.",
    };
  }

  // Handle password reset OTP verification (from User)
  if (payload.otpType === "RESET_PASSWORD") {
    const user = await User.findOne({
      email: payload.email,
      isDeleted: { $ne: true },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const isValidOtp = user.resetPasswordOtp?.trim() === payload.otp?.trim();
    const otpExpiry = user.resetPasswordOtpExpiry;

    if (!isValidOtp || !otpExpiry || otpExpiry < new Date()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
    }

    return {
      email: user.email,
      message: "OTP verified successfully",
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP type");
};

const completeRegistration = async (registrationData: any, files: any) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Find temp user
    const tempUser = await TempUser.findOne({
      email: registrationData.email,
    }).session(session);

    if (!tempUser) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No pending registration found. Please register and verify your email first."
      );
    }

    // If OTP is provided, verify it for extra security
    // If not provided, we trust that the user already verified via /verify-otp
    if (registrationData.otp) {
      const isValidOtp =
        tempUser.emailVerificationOtp?.trim() === registrationData.otp?.trim();
      const otpExpiry = tempUser.emailVerificationOtpExpiry;

      if (!isValidOtp || !otpExpiry || otpExpiry < new Date()) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid or expired OTP. Please request a new OTP."
        );
      }
    }

    // Check if user already exists (double-check before final registration)
    const existingUser = await User.findOne({
      $or: [{ email: tempUser.email }, { phoneNumber: tempUser.phoneNumber }],
    }).session(session);

    if (existingUser) {
      // Delete temp user and inform user to login
      await TempUser.findByIdAndDelete(tempUser._id).session(session);
      await session.commitTransaction();
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "User already exists with this email or phone number. Please login instead."
      );
    }

    // Upload files to Cloudinary if provided
    let profilePictureUrl = "";
    let nidFrontUrl = "";
    let nidBackUrl = "";
    let selfieWithNIDUrl = "";

    if (files) {
      if (files.profilePicture && files.profilePicture[0]) {
        const profileResult = await fileUploader.uploadToCloudinary(
          files.profilePicture[0]
        );
        profilePictureUrl = profileResult?.Location || "";
      }

      if (files.NIDFront && files.NIDFront[0]) {
        const nidFrontResult = await fileUploader.uploadToCloudinary(
          files.NIDFront[0]
        );
        nidFrontUrl = nidFrontResult?.Location || "";
      }

      if (files.NIDBack && files.NIDBack[0]) {
        const nidBackResult = await fileUploader.uploadToCloudinary(
          files.NIDBack[0]
        );
        nidBackUrl = nidBackResult?.Location || "";
      }

      if (files.selfieWithNID && files.selfieWithNID[0]) {
        const selfieWithNIDResult = await fileUploader.uploadToCloudinary(
          files.selfieWithNID[0]
        );
        selfieWithNIDUrl = selfieWithNIDResult?.Location || "";
      }
    }

    // Generate unique referral code for the new user
    const newUserReferralCode = await generateUniqueReferralCode();

    // Process referral if user was referred by someone
    let referrerUser = null;
    let referredByData = null;

    if (tempUser.referralCode && tempUser.referralCode.trim() !== "") {
      // Validate the referral code
      referrerUser = await validateReferralCode(tempUser.referralCode);

      if (referrerUser) {
        // Store referrer information
        referredByData = {
          userId: referrerUser._id.toString(),
          userName: referrerUser.userName,
          referralCode: referrerUser.referralCode,
        };
      } else {
        console.warn(
          `Invalid referral code provided: ${tempUser.referralCode}`
        );
        // Continue registration even if referral code is invalid
        // Don't throw error, just log warning
      }
    }

    // Create final user with all data
    const userPayload: any = {
      userName: tempUser.userName,
      email: tempUser.email,
      phoneNumber: tempUser.phoneNumber,
      password: tempUser.password,
      referralCode: newUserReferralCode,
      referredBy: referredByData,
      credits: 0,
      role: registrationData.role,
      lattitude: registrationData.lattitude,
      longitude: registrationData.longitude,
      resultRange: registrationData.resultRange || 10,
      profilePicture: profilePictureUrl,
      NIDFront: nidFrontUrl,
      NIDBack: nidBackUrl,
      selfieWithNID: selfieWithNIDUrl,
      affiliationCondition: registrationData.affiliationCondition === true,
      status: UserStatus.ACTIVE,
      registrationStatus: RegistrationStatus.COMPLETED,
      isEmailVerified: true,
    };

    // Only add plan for PROVIDER role (OWNER gets service for free)
    if (registrationData.role === "PROVIDER") {
      userPayload.plan = registrationData.plan || "FREE";
      userPayload.experience = registrationData.experience;
    }

    const [newUser] = await User.create([userPayload], { session });

    // If there was a valid referrer, create referral record (credits awarded on first booking/service)
    if (referrerUser && referredByData) {
      // Create referral record with PENDING status
      await Referral.create(
        [
          {
            referrerId: referrerUser._id,
            referrerName: referrerUser.userName,
            referrerReferralCode: referrerUser.referralCode,
            refereeId: newUser._id,
            refereeName: newUser.userName,
            refereeEmail: newUser.email,
            refereeRole: registrationData.role, // Track if referee is OWNER or PROVIDER
            creditsEarned: 0,
            firstBookingCreditAwarded: false,
            bonusTierCreditAwarded: false,
            completedBookingsCount: 0,
            firstServiceCreditAwarded: false,
            bonusTierServiceCreditAwarded: false,
            completedServicesCount: 0,
            status: "PENDING",
          },
        ],
        { session }
      );
    }

    // Delete temp user after successful registration
    await TempUser.findByIdAndDelete(tempUser._id).session(session);

    await session.commitTransaction();

    // Send welcome email
    try {
      const welcomeTemplate = WELCOME_COMPLETE_TEMPLATE(
        newUser.userName,
        registrationData.role
      );
      await emailSender(
        newUser.email,
        welcomeTemplate,
        "Welcome to Cleaning Service! 🎉 Registration Complete"
      );
    } catch (emailError) {
      console.error("Welcome email sending error:", emailError);
    }

    // Remove sensitive fields from response
    const { password, ...userWithoutPassword } = newUser.toObject();

    return {
      user: userWithoutPassword,
      message: "Registration completed successfully. You can now login.",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const loginUser = async (payload: {
  email: string;
  password: string;
  fcmToken?: string;
}) => {
  const userData = await User.findOne({
    email: payload.email,
  }).select({
    _id: 1,
    userName: 1,
    email: 1,
    role: 1,
    password: 1,
    createdAt: 1,
    updatedAt: 1,
    status: 1,
    profilePicture: 1,
  });

  if (!userData?.email) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "User not found! with this email " + payload.email
    );
  }
  if (userData.status !== "ACTIVE") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "User account already delete or Block."
    );
  }

  const isCorrectPassword: boolean = await bcrypt.compare(
    payload.password,
    userData.password
  );

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Password incorrect!");
  }

  // update fcm token
  if (payload.fcmToken) {
    await User.findOneAndUpdate(
      { email: payload.email },
      { fcmToken: payload.fcmToken }
    );
  }

  const accessToken = jwtHelpers.generateToken(
    {
      id: userData._id,
      email: userData.email,
      role: userData.role,
    },
    config.jwt.jwt_secret as string,
    config.jwt.expires_in as string
  );

  const { password, ...withoutPassword } = userData.toObject();

  return { token: accessToken, userData: withoutPassword };
};

const getMyProfile = async (userId: string) => {
  const userProfile = await User.findById(userId).select({
    _id: 1,
    userName: 1,
    role: 1,
    phoneNumber: 1,
    status: 1,
    email: 1,
    profilePicture: 1,
    aboutMe: 1,
    experience: 1,
    address: 1,
    lattitude: 1,
    longitude: 1,
    createdAt: 1,
    updatedAt: 1,
  });

  if (!userProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  return userProfile;
};

const changePassword = async (
  userId: string,
  oldPassword: string,
  newPassword: string,
  confirmPassword: string
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  const isCorrectPassword: boolean = await bcrypt.compare(
    oldPassword,
    user.password
  );

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Old password is incorrect!");
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match!"
    );
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  const result = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true }
  );

  return result;
};

const forgotPassword = async (payload: { email: string }) => {
  const userData = await User.findOne({ email: payload.email });

  if (!userData) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User does not exist!");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await User.findByIdAndUpdate(userData._id, {
    resetPasswordOtp: otp,
    resetPasswordOtpExpiry: otpExpiry,
  });

  try {
    const resetTemplate = PASSWORD_RESET_TEMPLATE(
      otp,
      userData.userName || "User"
    );
    await emailSender(
      payload.email,
      resetTemplate,
      "🔐 Password Reset Request - Cleaning Service"
    );
  } catch (emailError) {
    console.error("Password reset email error:", emailError);
  }

  return { message: "OTP sent to your email", otp };
};

const resendOtp = async (email: string, otpType: string = "RESET_PASSWORD") => {
  // Handle email verification OTP resend (for registration - TempUser)
  if (otpType === "VERIFY_EMAIL") {
    const tempUser = await TempUser.findOne({ email });

    if (!tempUser) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No pending registration found for this email. Please register first."
      );
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update OTP in temp user
    tempUser.emailVerificationOtp = otp;
    tempUser.emailVerificationOtpExpiry = otpExpiry;
    await tempUser.save();

    try {
      const emailTemplate = EMAIL_VERIFICATION_TEMPLATE(
        otp,
        tempUser.userName || "User"
      );
      await emailSender(
        email,
        emailTemplate,
        "Verify Your Email - Cleaning Service 🧹"
      );
    } catch (emailError) {
      console.error("Resend email verification OTP error:", emailError);
    }

    return {
      message: "OTP resent to your email",
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    };
  }

  // Handle password reset OTP resend (for existing users - User)
  const userData = await User.findOne({ email });

  if (!userData) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User does not exist!");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Update password reset OTP
  await User.findByIdAndUpdate(userData._id, {
    resetPasswordOtp: otp,
    resetPasswordOtpExpiry: otpExpiry,
  });

  try {
    const resetTemplate = PASSWORD_RESET_TEMPLATE(
      otp,
      userData.userName || "User"
    );
    await emailSender(
      email,
      resetTemplate,
      "🔐 Password Reset OTP - Cleaning Service"
    );
  } catch (emailError) {
    console.error("Resend password reset OTP error:", emailError);
  }

  return {
    message: "OTP resent to your email",
    otp: process.env.NODE_ENV === "development" ? otp : undefined,
  };
};

const verifyForgotPasswordOtp = async (payload: {
  email: string;
  otp: string;
}) => {
  const user = await User.findOne({ email: payload.email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  if (
    user.resetPasswordOtp !== payload.otp ||
    !user.resetPasswordOtpExpiry ||
    user.resetPasswordOtpExpiry < new Date()
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or expired OTP!");
  }

  return { message: "OTP verified successfully", isValid: true };
};

const resetPassword = async (
  email: string,
  newPassword: string,
  confirmPassword: string
) => {
  if (newPassword !== confirmPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match!"
    );
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  // Verify OTP internally - check if user has a valid, non-expired OTP
  if (
    !user.resetPasswordOtp ||
    !user.resetPasswordOtpExpiry ||
    user.resetPasswordOtpExpiry < new Date()
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "OTP verification required or OTP has expired. Please request a new OTP."
    );
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  await User.findByIdAndUpdate(user._id, {
    password: hashedPassword,
    resetPasswordOtp: undefined,
    resetPasswordOtpExpiry: undefined,
  });

  return { message: "Password reset successfully" };
};

const checkTokenValidity = async (token: string) => {
  try {
    const decoded = jwtHelpers.verifyToken(
      token,
      config.jwt.jwt_secret as string
    );
    return { isValid: true, decoded };
  } catch (error) {
    return { isValid: false, error };
  }
};

export const authService = {
  registerUser,
  verifyOtp,
  completeRegistration,
  loginUser,
  getMyProfile,
  changePassword,
  forgotPassword,
  resendOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  checkTokenValidity,
};
