import crypto from "crypto";
import { User } from "../app/models/User.model";

/**
 * Generates a unique referral code
 * Format: 8 characters, alphanumeric, uppercase
 * Example: AB12CD34
 */
export const generateUniqueReferralCode = async () => {
  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Generate random 8-character code
    const code = crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()
      .substring(0, 8);

    // Check if code already exists
    const existingUser = await User.findOne({ referralCode: code });

    if (!existingUser) {
      return code;
    }

    attempts++;
  }

  // If we couldn't generate a unique code after maxAttempts, use timestamp-based approach
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return (timestamp + random).substring(0, 8);
};

export const validateReferralCode = async (referralCode: string) => {
  if (!referralCode || referralCode.trim() === "") {
    return null;
  }

  const user = await User.findOne({
    referralCode: referralCode.trim().toUpperCase(),
    isDeleted: { $ne: true },
    status: "ACTIVE",
    registrationStatus: "COMPLETED",
  });

  return user;
};
