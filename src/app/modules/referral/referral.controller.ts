import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { referralService } from "./referral.service";

const getMyReferralInfo = catchAsync(async (req, res) => {
  const result = await referralService.getMyReferralInfo(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your referral information retrieved successfully",
    data: result,
  });
});

export const referralController = {
  getMyReferralInfo,
};
