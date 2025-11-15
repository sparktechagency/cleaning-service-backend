import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { subscriptionService } from "./subscription.service";
import { SubscriptionPlan } from "../../models/Subscription.model";

const getAllPlans = catchAsync(async (req: Request, res: Response) => {
  const result = subscriptionService.getAllPlans();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription plans retrieved successfully",
    data: result,
  });
});

const checkPlanLimits = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await subscriptionService.checkPlanLimits(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Plan limits checked successfully",
    data: result,
  });
});

const createCheckout = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { plan, creditsToRedeem, creditsToUse, timeline } = req.body;

  if (!Object.values(SubscriptionPlan).includes(plan)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Invalid subscription plan",
      data: null,
    });
  }

  // Support both creditsToRedeem and creditsToUse (creditsToUse for backwards compatibility)
  const creditsToRedeemFinal = creditsToRedeem || creditsToUse;

  const result = await subscriptionService.createSubscriptionCheckout(
    userId,
    plan,
    timeline || "MONTHLY",
    creditsToRedeemFinal
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Checkout session created successfully",
    data: result,
  });
});

const verifySubscription = catchAsync(async (req: Request, res: Response) => {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Session ID is required",
      data: null,
    });
  }

  const result = await subscriptionService.verifyAndActivateSubscription(
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription activated successfully",
    data: result,
  });
});

const activateFromCheckout = catchAsync(async (req: Request, res: Response) => {
  const { session_id } = req.query;

  if (!session_id || typeof session_id !== "string") {
    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(
      `${frontendUrl}/subscription/error?message=Missing session ID`
    );
  }

  try {
    const result = await subscriptionService.verifyAndActivateSubscription(
      session_id
    );

    // Redirect to frontend success page with subscription details
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(
      `${frontendUrl}/subscription/success?` +
        `subscription_id=${result._id}&` +
        `plan=${result.plan}&` +
        `status=${result.status}&` +
        `activated=true`
    );
  } catch (error) {
    console.error(`❌ Subscription activation failed:`, error);

    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const errorMessage = (error as Error).message || "Activation failed";
    res.redirect(
      `${frontendUrl}/subscription/error?` +
        `message=${encodeURIComponent(errorMessage)}&` +
        `session_id=${session_id}`
    );
  }
});

const getMySubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await subscriptionService.getMySubscription(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription details retrieved successfully",
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { reason } = req.body;

  const result = await subscriptionService.cancelSubscription(userId, reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription cancelled successfully",
    data: result,
  });
});

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (!signature || typeof signature !== "string") {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Missing stripe signature",
      data: null,
    });
  }

  const result = await subscriptionService.handleStripeWebhook(
    signature,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Webhook processed successfully",
    data: result,
  });
});

export const subscriptionController = {
  getAllPlans,
  checkPlanLimits,
  createCheckout,
  verifySubscription,
  activateFromCheckout,
  getMySubscription,
  cancelSubscription,
  handleWebhook,
};
