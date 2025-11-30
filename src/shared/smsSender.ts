import twilio from "twilio";
import config from "../config";

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
 * Send SMS using Twilio
 * @param phoneNumber - The recipient's phone number (must include country code, e.g., +1234567890)
 * @param message - The SMS message content
 * @returns Twilio message response
 */
const sendSMS = async (phoneNumber: string, message: string) => {
  try {
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

    console.log(`SMS sent successfully to ${phoneNumber}. SID: ${result.sid}`);
    return result;
  } catch (error) {
    console.error("SMS sending failed:", error);
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
  const message = `Hello ${userName}! Your Cleaning Service verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;
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
  const message = `Hello ${userName}! Your Cleaning Service password reset code is: ${otp}. This code will expire in 15 minutes. If you didn't request this, please ignore this message.`;
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
  const message = `Welcome to Cleaning Service, ${userName}! Your registration as a ${userRole} is complete. Start exploring our platform for professional cleaning services. Thank you for joining us!`;
  return sendSMS(phoneNumber, message);
};

export default {
  sendSMS,
  sendVerificationOTP,
  sendPasswordResetOTP,
  sendWelcomeMessage,
};
