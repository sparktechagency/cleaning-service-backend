import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";
import { User } from "../../models/User.model";
import {
  Redemption,
  RedemptionType,
  RedemptionStatus,
} from "../../models/Redemption.model";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../../models";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
});

// Credit to euro conversion rate: 10 credits = €2
const CREDITS_TO_DOLLAR_RATE = 0.2; // €0.2 per credit
const MINIMUM_CREDITS_FOR_REDEMPTION = 10; // Minimum 10 credits (€2)

const calculateDollarValue = (credits: number): number => {
  return credits * CREDITS_TO_DOLLAR_RATE;
};

const calculateDiscount = (
  credits: number,
  price: number
): { discount: number; creditsToUse: number } => {
  const maxDiscount = calculateDollarValue(credits);

  // Discount cannot exceed the price
  if (maxDiscount >= price) {
    // Use only enough credits to cover the price
    const creditsNeeded = Math.ceil(price / CREDITS_TO_DOLLAR_RATE);
    return {
      discount: price,
      creditsToUse: creditsNeeded,
    };
  }

  return {
    discount: maxDiscount,
    creditsToUse: credits,
  };
};

const redeemCreditsForSubscription = async (
  userId: string,
  creditsToRedeem: number,
  subscriptionPrice: number
) => {
  // Validate inputs
  if (
    !creditsToRedeem ||
    creditsToRedeem <= 0 ||
    !Number.isInteger(creditsToRedeem)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid credits amount. Please provide a positive whole number of credits."
    );
  }

  if (creditsToRedeem < MINIMUM_CREDITS_FOR_REDEMPTION) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Minimum ${MINIMUM_CREDITS_FOR_REDEMPTION} credits required for redemption`
    );
  }

  if (subscriptionPrice <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid subscription price");
  }

  // Get user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers can redeem credits for subscription discount"
    );
  }

  // Check if user has enough credits
  const userCredits = user.credits || 0;

  if (userCredits < creditsToRedeem) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient credits! You have ${userCredits} credits but tried to redeem ${creditsToRedeem} credits. You need ${
        creditsToRedeem - userCredits
      } more credits.`
    );
  }

  // Calculate discount based on available credits
  // Note: creditsToRedeem might be more than needed if price is low
  const { discount, creditsToUse } = calculateDiscount(
    creditsToRedeem,
    subscriptionPrice
  );

  // IMPORTANT: Validate that user has enough credits for what will actually be used
  if (userCredits < creditsToUse) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient credits! You have ${userCredits} credits but ${creditsToUse} credits will be used for this redemption.`
    );
  }

  const finalPrice = Math.max(0, subscriptionPrice - discount);
  const dollarValue = calculateDollarValue(creditsToUse);

  // Create redemption record (status PENDING until subscription is confirmed)
  const redemption = await Redemption.create({
    userId,
    userRole: "PROVIDER",
    redemptionType: RedemptionType.SUBSCRIPTION_DISCOUNT,
    creditsRedeemed: creditsToUse,
    dollarValue,
    status: RedemptionStatus.PENDING,
    originalPrice: subscriptionPrice,
    discountApplied: discount,
    finalPrice,
    metadata: {
      requestedCredits: creditsToRedeem,
      actualCreditsUsed: creditsToUse,
    },
  });

  return {
    redemptionId: redemption._id.toString(),
    originalPrice: subscriptionPrice,
    discountAmount: discount,
    finalPrice,
    creditsUsed: creditsToUse,
    dollarValue,
    availableCredits: userCredits,
    remainingCredits: userCredits, // Not deducted yet until subscription confirmed
  };
};

//Complete subscription redemption after payment confirmation
// Called by subscription service after successful payment
const completeSubscriptionRedemption = async (
  redemptionId: string,
  subscriptionId: string
) => {
  const redemption = await Redemption.findById(redemptionId);

  if (!redemption) {
    throw new ApiError(httpStatus.NOT_FOUND, "Redemption record not found");
  }

  if (redemption.status !== RedemptionStatus.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Redemption is not in pending state"
    );
  }

  // Deduct credits from user
  const user = await User.findById(redemption.userId).select("credits");
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const currentCredits = user.credits || 0;
  if (currentCredits < redemption.creditsRedeemed) {
    // Edge case: credits changed between initiation and completion
    redemption.status = RedemptionStatus.FAILED;
    redemption.errorMessage = "Insufficient credits at completion time";
    await redemption.save();

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Insufficient credits. Please try again."
    );
  }

  // CRITICAL: Deduct credits using findByIdAndUpdate to avoid validation issues
  // This prevents Mongoose from validating other fields that might have invalid values
  const newCreditBalance = currentCredits - redemption.creditsRedeemed;

  const updatedUser = await User.findByIdAndUpdate(
    redemption.userId,
    {
      $set: { credits: newCreditBalance },
    },
    {
      new: true,
      runValidators: false, // Skip validation to avoid issues with other fields
      select: "credits",
    }
  );

  if (!updatedUser) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update user credits"
    );
  }

  // Update redemption status
  redemption.status = RedemptionStatus.COMPLETED;
  redemption.subscriptionId = subscriptionId as any;
  await redemption.save();

  // Notify user
  await notificationService.createNotification({
    recipientId: updatedUser._id.toString(),
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Credits Redeemed Successfully! 🎉",
    message: `You redeemed ${
      redemption.creditsRedeemed
    } credits (€${redemption.dollarValue.toFixed(
      2
    )}) for subscription discount. New balance: ${updatedUser.credits} credits`,
    data: {
      redemptionId: redemption._id.toString(),
      creditsRedeemed: redemption.creditsRedeemed,
      dollarValue: redemption.dollarValue,
      newBalance: updatedUser.credits,
    },
  });

  return {
    success: true,
    creditsDeducted: redemption.creditsRedeemed,
    remainingCredits: updatedUser.credits,
  };
};

// Cancel subscription redemption (if payment failed)
const cancelSubscriptionRedemption = async (redemptionId: string) => {
  const redemption = await Redemption.findById(redemptionId);

  if (!redemption) {
    return; // Already cancelled or doesn't exist
  }

  if (redemption.status === RedemptionStatus.PENDING) {
    redemption.status = RedemptionStatus.CANCELLED;
    redemption.errorMessage = "Subscription payment failed or cancelled";
    await redemption.save();
  }
};

const redeemCreditsForCash = async (
  userId: string,
  creditsToRedeem: number
) => {
  // Validate inputs
  if (
    !creditsToRedeem ||
    creditsToRedeem <= 0 ||
    !Number.isInteger(creditsToRedeem)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid credits amount. Please provide a positive whole number of credits."
    );
  }

  if (creditsToRedeem < MINIMUM_CREDITS_FOR_REDEMPTION) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Minimum ${MINIMUM_CREDITS_FOR_REDEMPTION} credits required for redemption`
    );
  }

  // Get user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only owners can redeem credits for cash"
    );
  }

  // CRITICAL: Check if user has connected their Stripe account
  if (!user.stripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Please connect your Stripe account first to receive payments. Go to Settings > Payment Settings to add your Stripe account."
    );
  }

  // Verify Stripe account is active and can receive transfers
  let stripeAccount: Stripe.Account;
  try {
    stripeAccount = await stripe.accounts.retrieve(user.stripeAccountId);

    // Check if account can receive transfers
    if (!stripeAccount.payouts_enabled) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Your Stripe account is not yet fully set up to receive payments. Please complete your Stripe account setup."
      );
    }

    if (!stripeAccount.charges_enabled) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Your Stripe account has restrictions. Please check your Stripe dashboard or contact support."
      );
    }
  } catch (error: any) {
    if (
      error.type === "StripeInvalidRequestError" ||
      error.code === "account_invalid"
    ) {
      // Account doesn't exist or was deleted - clear from user record
      await User.findByIdAndUpdate(userId, {
        stripeAccountId: null,
        stripeAccountStatus: null,
        stripeOnboardingComplete: false,
      });

      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Your Stripe account is no longer valid. Please reconnect your Stripe account in Settings."
      );
    }

    // Re-throw if it's our custom ApiError
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to verify Stripe account: ${error.message}`
    );
  }

  // CRITICAL: Check if user has enough credits before processing
  const userCredits = user.credits || 0;

  if (userCredits < creditsToRedeem) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient credits! You have ${userCredits} credits but tried to redeem ${creditsToRedeem} credits. You need ${
        creditsToRedeem - userCredits
      } more credits.`
    );
  }

  const dollarValue = calculateDollarValue(creditsToRedeem);
  const amountInCents = Math.round(dollarValue * 100); // Convert to cents

  // OPTIONAL: Check platform balance before attempting transfer (helps catch issues early)
  try {
    const balance = await stripe.balance.retrieve();
    const availableBalance =
      balance.available.find((b) => b.currency === "eur")?.amount || 0;

    if (availableBalance < amountInCents) {
      const isTestMode =
        config.stripe_key?.includes("_test_") ||
        config.stripe_key?.startsWith("sk_test_");

      if (!isTestMode) {
        // Production mode - log alert for monitoring
        console.error(
          `CRITICAL: Platform balance insufficient! Available: €${
            availableBalance / 100
          }, Needed: €${dollarValue}`
        );
      }
    }
  } catch (balanceError: any) {
    // Don't fail the request if balance check fails, just log it
    console.error("Could not check platform balance:", balanceError);
  }

  // CRITICAL: Create transfer from platform account to user's Stripe Connect account
  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: "eur",
      destination: user.stripeAccountId,
      description: `Credit redemption: ${creditsToRedeem} credits = €${dollarValue}`,
      metadata: {
        userId: user._id.toString(),
        creditsRedeemed: creditsToRedeem.toString(),
        dollarValue: dollarValue.toString(),
        redemptionType: "credit_to_cash",
      },
    });
  } catch (error: any) {
    console.error(`Transfer failed:`, error);

    // Handle specific Stripe error codes
    if (error.code === "balance_insufficient") {
      // Check if we're in test mode
      const isTestMode =
        config.stripe_key?.includes("_test_") ||
        config.stripe_key?.startsWith("sk_test_");

      if (isTestMode) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `TEST MODE: Insufficient funds in platform Stripe test account.`
        );
      } else {
        // Production mode - critical error
        throw new ApiError(
          httpStatus.SERVICE_UNAVAILABLE,
          `Platform balance insufficient to process redemption. Our team has been notified. Please try again in a few hours or contact support.`
        );
      }
    }

    // Handle account-related errors
    if (
      error.code === "account_invalid" ||
      error.code === "destination_invalid"
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Your Stripe account connection is invalid. Please reconnect your account`
      );
    }

    // Generic error
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to process transfer: ${
        error.message || "Unknown error"
      }. Please try again or contact support.`
    );
  }

  // Deduct credits from user
  user.credits = userCredits - creditsToRedeem;
  await user.save();

  // Create redemption record
  const redemption = await Redemption.create({
    userId,
    userRole: "OWNER",
    redemptionType: RedemptionType.BANK_TRANSFER,
    creditsRedeemed: creditsToRedeem,
    dollarValue,
    status: RedemptionStatus.COMPLETED,
    stripePayoutId: transfer.id, // Store transfer ID instead of payout ID
    bankAccountLast4: stripeAccount.external_accounts?.data[0]?.last4 || "****",
    bankName: "Stripe Connect Account",
    transferDate: new Date(),
    metadata: {
      stripeAccountId: user.stripeAccountId,
      transferId: transfer.id,
      transferAmount: transfer.amount,
      transferDestination: transfer.destination,
    },
  });

  // Record transaction
  try {
    const { transactionService } = await import(
      "../transaction/transaction.service"
    );
    await transactionService.recordCreditRedemption({
      userId: user._id.toString(),
      creditsRedeemed: creditsToRedeem,
      dollarValue,
      stripePayoutId: transfer.id, // Store transfer ID
      redemptionId: redemption._id.toString(),
      bankAccountLast4:
        stripeAccount.external_accounts?.data[0]?.last4 || "****",
      metadata: {
        stripeAccountId: user.stripeAccountId,
        transferId: transfer.id,
        transferAmount: transfer.amount,
        accountType: "stripe_connect",
      },
    });
  } catch (transactionError: any) {
    // Log error but don't fail the redemption since transfer already succeeded
    console.error(`Failed to record transaction:`, transactionError);
    console.error(
      `Redemption successful but transaction recording failed. Manual review needed.`
    );
    // Add error info to redemption metadata for tracking
    redemption.metadata = {
      ...redemption.metadata,
      transactionRecordingError: transactionError.message,
      transactionRecordingFailed: true,
    };
    await redemption.save();
  }

  // Notify user
  await notificationService.createNotification({
    recipientId: user._id.toString(),
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Credits Redeemed Successfully!",
    message: `You redeemed ${creditsToRedeem} credits for €${dollarValue}. Money has been transferred to your Stripe account and will be available based on your Stripe payout schedule.`,
    data: {
      redemptionId: redemption._id.toString(),
      creditsRedeemed: creditsToRedeem,
      dollarValue,
      transferId: transfer.id,
      newBalance: user.credits,
    },
  });

  return {
    success: true,
    redemptionId: redemption._id.toString(),
    creditsRedeemed: creditsToRedeem,
    dollarValue,
    transferId: transfer.id,
    stripeAccountId: user.stripeAccountId,
    estimatedArrival:
      "Instantly transferred to your Stripe account. Payout timing depends on your Stripe settings.",
    remainingCredits: user.credits,
  };
};

// Get user's redemption history
const getRedemptionHistory = async (userId: string) => {
  const redemptions = await Redemption.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("subscriptionId", "plan status startDate endDate")
    .lean();

  const user = await User.findById(userId).select("credits");

  return {
    currentCredits: user?.credits || 0,
    redemptions: redemptions.map((r) => ({
      id: r._id.toString(),
      type: r.redemptionType,
      creditsRedeemed: r.creditsRedeemed,
      dollarValue: r.dollarValue,
      status: r.status,
      date: r.createdAt,
      details:
        r.redemptionType === RedemptionType.SUBSCRIPTION_DISCOUNT
          ? {
              originalPrice: r.originalPrice,
              discountApplied: r.discountApplied,
              finalPrice: r.finalPrice,
              subscription: r.subscriptionId,
            }
          : {
              bankLast4: r.bankAccountLast4,
              bankName: r.bankName,
              transferDate: r.transferDate,
              payoutId: r.stripePayoutId,
            },
    })),
  };
};

// Get redemption statistics for user
const getRedemptionStats = async (userId: string) => {
  const user = await User.findById(userId).select("credits");
  const currentCredits = user?.credits || 0;

  const totalRedeemed = await Redemption.aggregate([
    {
      $match: {
        userId: userId as any,
        status: RedemptionStatus.COMPLETED,
      },
    },
    {
      $group: {
        _id: null,
        totalCreditsRedeemed: { $sum: "$creditsRedeemed" },
        totalDollarValue: { $sum: "$dollarValue" },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = totalRedeemed[0] || {
    totalCreditsRedeemed: 0,
    totalDollarValue: 0,
    count: 0,
  };

  return {
    currentCredits,
    currentDollarValue: calculateDollarValue(currentCredits),
    totalRedemptions: stats.count,
    totalCreditsRedeemed: stats.totalCreditsRedeemed,
    totalDollarValueRedeemed: stats.totalDollarValue,
    canRedeem: currentCredits >= MINIMUM_CREDITS_FOR_REDEMPTION,
    minimumCreditsRequired: MINIMUM_CREDITS_FOR_REDEMPTION,
    conversionRate: `10 credits = €2`,
  };
};

export const redemptionService = {
  calculateDollarValue,
  calculateDiscount,
  redeemCreditsForSubscription,
  completeSubscriptionRedemption,
  cancelSubscriptionRedemption,
  redeemCreditsForCash,
  getRedemptionHistory,
  getRedemptionStats,
  MINIMUM_CREDITS_FOR_REDEMPTION,
  CREDITS_TO_DOLLAR_RATE,
};
