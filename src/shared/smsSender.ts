import twilio from "twilio";
import config from "../config";

// SMS Configuration Constants
const SMS_CONFIG = {
  APP_NAME: config.site_name || "Cleaning Service",
  VERIFICATION_OTP_EXPIRY_MINUTES: 10,
  PASSWORD_RESET_OTP_EXPIRY_MINUTES: 15,
};

// Initialize Twilio client
const getTwilioClient = () => {
  const accountSid = config.twilio.accountSid;
  const authToken = config.twilio.authToken;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials are not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables."
    );
  }

  return twilio(accountSid, authToken);
};

/**
 * Validate phone number format
 * @param phoneNumber - The phone number to validate
 * @returns boolean - true if valid, false otherwise
 */
const isValidPhoneNumber = (phoneNumber: string): boolean => {
  // E.164 format validation: + followed by country code and number
  // Total length: 8-15 digits (including country code)
  // Allows country codes starting with any digit 1-9
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  return phoneRegex.test(phoneNumber);
};

/**
 * Mask phone number for logging (privacy protection)
 * @param phoneNumber - The phone number to mask
 * @returns Masked phone number showing only last 4 digits
 */
const maskPhoneNumber = (phoneNumber: string): string => {
  if (phoneNumber.length <= 4) {
    return "****";
  }
  return `***${phoneNumber.slice(-4)}`;
};

/**
 * Send SMS using Twilio
 * @param phoneNumber - The recipient's phone number (must include country code, e.g., +1234567890)
 * @param message - The SMS message content
 * @returns Twilio message response
 */
const sendSMS = async (phoneNumber: string, message: string) => {
  try {
    // Validate phone number format
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new Error(
        `Invalid phone number format: ${maskPhoneNumber(phoneNumber)}. Phone number must be in E.164 format (e.g., +1234567890).`
      );
    }

    const client = getTwilioClient();
    const twilioPhoneNumber = config.twilio.phoneNumber;

    if (!twilioPhoneNumber) {
      throw new Error(
        "Twilio phone number is not configured. Please set TWILIO_PHONE_NUMBER environment variable."
      );
    }

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(
      `SMS sent successfully to ${maskPhoneNumber(phoneNumber)}.`
    );
    return result;
  } catch (error) {
    console.error(
      `SMS sending failed to ${maskPhoneNumber(phoneNumber)}.`
    );
    throw error;
  }
};

/**
 * Send verification OTP via SMS
 * @param phoneNumber - The recipient's phone number (must include country code)
 * @param otp - The OTP code to send
 * @param userName - The user's name for personalization
 * @returns Twilio message response
 */
const sendVerificationOTP = async (
  phoneNumber: string,
  otp: string,
  userName: string
) => {
  const message = `Hello ${userName}! Your ${SMS_CONFIG.APP_NAME} verification code is: ${otp}. This code will expire in ${SMS_CONFIG.VERIFICATION_OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send password reset OTP via SMS
 * @param phoneNumber - The recipient's phone number (must include country code)
 * @param otp - The OTP code to send
 * @param userName - The user's name for personalization
 * @returns Twilio message response
 */
const sendPasswordResetOTP = async (
  phoneNumber: string,
  otp: string,
  userName: string
) => {
  const message = `Hello ${userName}! Your ${SMS_CONFIG.APP_NAME} password reset code is: ${otp}. This code will expire in ${SMS_CONFIG.PASSWORD_RESET_OTP_EXPIRY_MINUTES} minutes. If you didn't request this, please ignore this message.`;
  return sendSMS(phoneNumber, message);
};

/**
 * Send welcome message via SMS
 * @param phoneNumber - The recipient's phone number (must include country code)
 * @param userName - The user's name for personalization
 * @param userRole - The user's role (OWNER or PROVIDER)
 * @returns Twilio message response
 */
const sendWelcomeMessage = async (
  phoneNumber: string,
  userName: string,
  userRole: string
) => {
  const message = `Welcome to ${SMS_CONFIG.APP_NAME}, ${userName}! Your registration as a ${userRole} is complete. Start exploring our platform for professional cleaning services. Thank you for joining us!`;
  return sendSMS(phoneNumber, message);
};

export default {
  sendSMS,
  sendVerificationOTP,
  sendPasswordResetOTP,
  sendWelcomeMessage,
};
