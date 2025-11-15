import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import httpStatus from "http-status";
import { redemptionService } from "./redemption.service";

// Get current user's credit statistics
const getMyCredits = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await redemptionService.getRedemptionStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Credit statistics retrieved successfully",
    data: result,
  });
});

// Get redemption history
const getRedemptionHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await redemptionService.getRedemptionHistory(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Redemption history retrieved successfully",
    data: result,
  });
});

// Calculate redemption preview (how much discount/money user can get)
const calculateRedemptionPreview = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { credits, subscriptionPrice } = req.body;

    if (!credits || credits <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Credits must be greater than 0",
        data: null,
      });
    }

    const dollarValue = redemptionService.calculateDollarValue(credits);

    let result: any = {
      credits,
      dollarValue,
      minimumCreditsRequired: redemptionService.MINIMUM_CREDITS_FOR_REDEMPTION,
      conversionRate: "10 credits = €2",
    };

    // If subscription price provided, calculate discount
    if (subscriptionPrice && subscriptionPrice > 0) {
      const discountCalc = redemptionService.calculateDiscount(
        credits,
        subscriptionPrice
      );
      result = {
        ...result,
        subscriptionDiscount: {
          originalPrice: subscriptionPrice,
          discountAmount: discountCalc.discount,
          finalPrice: Math.max(0, subscriptionPrice - discountCalc.discount),
          creditsUsed: discountCalc.creditsToUse,
          creditsRemaining: credits - discountCalc.creditsToUse,
        },
      };
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Redemption preview calculated successfully",
      data: result,
    });
  }
);

// Owner redeems credits for cash via Stripe Connect transfer
// Money transfers from platform Stripe account to owner's Stripe Connect account
const redeemForCash = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { credits } = req.body;

  const result = await redemptionService.redeemCreditsForCash(userId, credits);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Credits redeemed successfully! Money has been transferred to your Stripe account.",
    data: result,
  });
});

export const redemptionController = {
  getMyCredits,
  getRedemptionHistory,
  calculateRedemptionPreview,
  redeemForCash,
};
