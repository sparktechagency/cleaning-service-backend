import crypto from "crypto";

/**
 * Generates a random OTP (One Time Password) of the specified length.
 * The OTP is a numeric string.
 *
 * @param {number} validTime default: 5 minutes - The time (in minutes ) for which the OTP is valid.
 * @returns {number, Date} - The generated OTP and its expiration time.
 */
export const generateOTP = (
  validTime: number = 5
): { otp: number; otpExpires: Date } => {
  const otp = Number(crypto.randomInt(1000, 9999));

  const otpExpires = new Date(Date.now() + validTime * 60 * 1000);

  return { otp, otpExpires };
};

/**
 * Generates a 6-digit OTP string
 * @returns {string} - 6-digit OTP string
 */
export const generateOTPString = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};
