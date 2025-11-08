import httpStatus from "http-status";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { User } from "../../models/User.model";

const getMyReferralInfo = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }

  const user = await User.findById(userId).select(
    "referralCode credits userName role"
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // const totalReferrals = await Referral.countDocuments({
  //   referrerId: userId,
  //   status: "COMPLETED",
  // });

  return {
    myReferralCode: user.referralCode,
    myCredits: user.credits || 0,
    //totalReferrals: totalReferrals,
    //referredBy: user.referredBy || null,
    shareMessage: `Join Cleaning Service using my referral code ${user.referralCode} and we both benefit! 🎉`,
  };
};

export const referralService = {
  getMyReferralInfo,
};
