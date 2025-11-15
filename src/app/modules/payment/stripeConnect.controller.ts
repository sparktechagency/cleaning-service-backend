import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import httpStatus from "http-status";
import { stripeConnectService } from "./stripeConnect.service";

// Create Stripe Connect onboarding link
const createOnboardingLink = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await stripeConnectService.createOnboardingLink(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stripe Connect onboarding link created successfully",
    data: result,
  });
});

// Check Stripe Connect account status
const getAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await stripeConnectService.checkAccountStatus(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stripe Connect account status retrieved successfully",
    data: result,
  });
});

// Get Stripe dashboard link
const getDashboardLink = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await stripeConnectService.getDashboardLink(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stripe dashboard link created successfully",
    data: result,
  });
});

// Disconnect Stripe Connect account
const disconnectAccount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await stripeConnectService.disconnectAccount(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stripe account disconnected successfully",
    data: result,
  });
});

// Handle Stripe Connect webhooks
const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  const rawBody = req.body;

  const result = await stripeConnectService.handleConnectWebhook(
    signature,
    rawBody
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Webhook processed successfully",
    data: result,
  });
});

export const stripeConnectController = {
  createOnboardingLink,
  getAccountStatus,
  getDashboardLink,
  disconnectAccount,
  handleWebhook,
};
