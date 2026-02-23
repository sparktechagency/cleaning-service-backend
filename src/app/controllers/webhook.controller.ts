import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catchAsync";
import sendResponse from "../../shared/sendResponse";
import Stripe from "stripe";
import config from "../../config";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
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

  let eventType: string = "";
  let metadata: any = {};

  try {
    let parsedBody: any;

    if (Buffer.isBuffer(req.body)) {
      parsedBody = JSON.parse(req.body.toString("utf8"));
    } else if (typeof req.body === "string") {
      parsedBody = JSON.parse(req.body);
    } else {
      parsedBody = req.body;
    }

    eventType = parsedBody.type || "";
    metadata = parsedBody.data?.object?.metadata || {};
  } catch (error) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Invalid webhook payload",
      data: null,
    });
  }

  try {
    let result;

    const isBookingPayment =
      metadata.type === "booking_payment" || eventType === "charge.refunded";

    const isSubscription =
      metadata.type === "subscription_payment" ||
      (eventType && eventType.includes("subscription")) ||
      (eventType && eventType.includes("invoice")) ||
      (eventType === "checkout.session.completed" && metadata.plan);

    if (isBookingPayment) {
      const { paymentService } = await import(
        "../modules/payment/payment.service"
      );
      result = await paymentService.handleBookingPaymentWebhook(
        signature,
        req.body
      );
    } else if (isSubscription) {
      const { subscriptionService } = await import(
        "../modules/subscription/subscription.service"
      );
      result = await subscriptionService.handleStripeWebhook(
        signature,
        req.body
      );
    } else {
      // Use centralized event handler for validation
      const { isGeneralInformationalEvent } = await import(
        "../../helpers/handleStripeEvents"
      );

      // Validate and acknowledge all general informational events
      if (isGeneralInformationalEvent(eventType)) {
        result = { received: true, eventType, note: "Event acknowledged" };
      } else {
        result = { received: true, eventType, note: "Event acknowledged" };
      }
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Webhook processed successfully",
      data: result,
    });
  } catch (error) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: false,
      message: `Webhook processing error: ${(error as Error).message}`,
      data: { received: true, error: true },
    });
  }
});

export const webhookController = {
  handleWebhook,
};
