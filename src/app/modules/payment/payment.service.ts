import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";
import { Booking } from "../booking/booking.model";
import { User } from "../../models/User.model";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../../models";
import { transactionService } from "../transaction/transaction.service";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
});

const REFUND_WINDOW_HOURS = 2;

// Create Stripe Checkout Session for booking payment
const createBookingPayment = async (bookingId: string, ownerId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate("providerId", "email userName")
    .populate("customerId", "email userName");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Extract customer ID
  const customerId =
    typeof booking.customerId === "object" && booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId.toString();

  if (customerId !== ownerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only pay for your own bookings"
    );
  }

  if (booking.payment.status === "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Booking is already paid");
  }

  if (booking.status === "CANCELLED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot pay for cancelled booking"
    );
  }

  const provider = booking.providerId as any;
  const owner = booking.customerId as any;

  // Get or create Stripe customer for owner with EUR currency handling
  let ownerStripeCustomerId = owner.stripeCustomerId;

  // Check if customer exists and has currency conflicts
  if (ownerStripeCustomerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(
        ownerStripeCustomerId
      );

      // Check if customer has USD subscriptions/invoices
      if (existingCustomer && !existingCustomer.deleted) {
        const subscriptions = await stripe.subscriptions.list({
          customer: ownerStripeCustomerId,
          limit: 1,
        });

        // If customer has active USD items, create new EUR customer
        if (subscriptions.data.length > 0) {

          // Create new EUR-specific customer
          const newCustomer = await stripe.customers.create({
            email: owner.email,
            name: owner.userName,
            metadata: {
              userId: owner._id.toString(),
              currency: "EUR",
              migratedFrom: ownerStripeCustomerId,
              migrationDate: new Date().toISOString(),
            },
          });

          ownerStripeCustomerId = newCustomer.id;

          // Update user with new EUR customer ID
          await User.findByIdAndUpdate(owner._id, {
            stripeCustomerId: newCustomer.id,
            stripeCustomerIdUSD: owner.stripeCustomerId, // Keep old USD customer for reference
          });
        }
      }
    } catch (error: any) {
      // If customer doesn't exist or is deleted, create new one
      if (error.code === "resource_missing" || error.statusCode === 404) {
        ownerStripeCustomerId = "";
      } else {
        console.error(`Error checking customer currency:`, error);
      }
    }
  }

  // Create new customer if needed
  if (!ownerStripeCustomerId) {
    const customer = await stripe.customers.create({
      email: owner.email,
      name: owner.userName,
      metadata: {
        userId: owner._id.toString(),
        currency: "EUR",
      },
    });
    ownerStripeCustomerId = customer.id;
    await User.findByIdAndUpdate(owner._id, {
      stripeCustomerId: customer.id,
    });
  } // Get provider's full details including Stripe Connect account
  const providerUser = await User.findById(provider._id);

  if (!providerUser || !providerUser.stripeAccountId) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      "Provider has not connected their payment account. Cannot process payment."
    );
  }

  if (
    !providerUser.stripeOnboardingComplete ||
    providerUser.stripeAccountStatus !== "active"
  ) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      "Provider's payment account is not fully activated. Cannot process payment."
    );
  }

  const providerStripeAccountId = providerUser.stripeAccountId;

  // Get redirect URLs from config
  // Use configured URLs with booking ID as query parameter for tracking
  const successUrl = `${config.payment_success_url}`;
  const cancelUrl = `${config.payment_cancel_url}`;

  // Create Checkout Session with direct charge to connected account
  // No platform fee - admin earns through subscription plans only
  const session = await stripe.checkout.sessions.create({
    customer: ownerStripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Booking Payment #${booking._id.toString().slice(-6)}`,
            description: `Payment for booking service`,
          },
          unit_amount: Math.round(booking.totalAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      bookingId: booking._id.toString(),
      ownerId: owner._id.toString(),
      providerId: provider._id.toString(),
      providerStripeAccountId: providerStripeAccountId,
      type: "booking_payment",
    },
    payment_intent_data: {
      description: `Payment for booking #${booking._id}`,
      metadata: {
        bookingId: booking._id.toString(),
        ownerId: owner._id.toString(),
        providerId: provider._id.toString(),
        providerStripeAccountId: providerStripeAccountId,
        type: "booking_payment",
      },
      // Direct transfer to provider - no platform fee
      transfer_data: {
        destination: providerStripeAccountId,
      },
    },
  });

  return {
    sessionId: session.id,
    paymentUrl: session.url,
    amount: booking.totalAmount,
  };
};

// Confirm booking payment after successful payment intent
const confirmBookingPayment = async (
  bookingId: string,
  paymentIntentId: string
) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== "succeeded") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Payment not completed");
  }

  const booking = await Booking.findById(bookingId)
    .populate("providerId", "userName")
    .populate("customerId", "userName");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.payment.status === "PAID") {
    return booking; // Already marked as paid
  }

  // Extract ID
  const customerIdStr =
    typeof booking.customerId === "object" && booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId.toString();

  const providerIdStr =
    booking.providerId &&
    typeof booking.providerId === "object" &&
    booking.providerId._id
      ? booking.providerId._id.toString()
      : booking.providerId?.toString();

  // Update booking payment status
  booking.payment.status = "PAID";
  booking.payment.stripePaymentIntentId = paymentIntentId;
  booking.payment.transactionId = paymentIntentId;
  booking.payment.paidAt = new Date();
  await booking.save();

  // Get provider's Stripe Connect account
  const providerUser = await User.findById(booking.providerId).select(
    "stripeAccountId stripeCustomerId"
  );

  // Record transaction
  if (providerIdStr) {
    await transactionService.recordBookingPayment({
      bookingId: booking._id.toString(),
      ownerId: customerIdStr,
      providerId: providerIdStr,
      amount: booking.totalAmount,
      stripePaymentIntentId: paymentIntentId,
      stripeCustomerId: paymentIntent.customer as string,
      stripeConnectAccountId: providerUser?.stripeAccountId || "",
      metadata: {
        bookingNumber: booking._id.toString().slice(-6),
        serviceType: (booking as any).serviceType,
      },
    });
  }

  // Notify provider about payment received
  if (providerIdStr) {
    await notificationService.createNotification({
      recipientId: providerIdStr,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: "Payment Received",
      message: `You received payment of €${
        booking.totalAmount
      } for booking #${booking._id.toString().slice(-6)}`,
      data: {
        bookingId: booking._id.toString(),
        amount: booking.totalAmount,
        paymentIntentId,
      },
    });
  }

  // Notify owner about successful payment
  await notificationService.createNotification({
    recipientId: customerIdStr,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Payment Successful ✓",
    message: `Your payment of €${booking.totalAmount} for booking #${booking._id
      .toString()
      .slice(-6)} has been processed successfully.`,
    data: {
      bookingId: booking._id.toString(),
      amount: booking.totalAmount,
      paymentIntentId,
    },
  });

  return booking;
};

// Check if booking is eligible for refund (within 2 hours of creation)
const isRefundEligible = (booking: any) => {
  const bookingCreatedAt = new Date(booking.createdAt).getTime();
  const now = Date.now();
  const hoursSinceCreation = (now - bookingCreatedAt) / (1000 * 60 * 60);

  return hoursSinceCreation <= REFUND_WINDOW_HOURS;
};

// Refund booking payment (only within 2-hour window)
const refundBookingPayment = async (bookingId: string, ownerId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate("providerId", "userName")
    .populate("customerId", "userName");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Extract ID
  const customerId =
    typeof booking.customerId === "object" && booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId.toString();

  const providerIdStr =
    booking.providerId &&
    typeof booking.providerId === "object" &&
    booking.providerId._id
      ? booking.providerId._id.toString()
      : booking.providerId?.toString();

  if (customerId !== ownerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only refund your own bookings"
    );
  }

  if (booking.payment.status === "REFUNDED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Booking payment is already refunded"
    );
  }

  if (booking.payment.status !== "PAID") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Booking payment is not paid yet"
    );
  }

  if (booking.status === "COMPLETED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot refund completed bookings"
    );
  }

  // Check refund eligibility (2-hour window)
  if (!isRefundEligible(booking)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Refund window has expired. Refunds are only available within ${REFUND_WINDOW_HOURS} hours of booking creation.`
    );
  }

  if (!booking.payment.stripePaymentIntentId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No payment intent found for this booking"
    );
  }

  // Get provider's Stripe Connect account ID
  const providerUser = await User.findById(booking.providerId).select(
    "stripeAccountId"
  );

  if (!providerUser || !providerUser.stripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Provider Stripe account not found. Cannot process refund."
    );
  }

  // CRITICAL: Process refund with reverse_transfer to deduct from provider's account
  // When payment used transfer_data, refund MUST use reverse_transfer to take money back from provider
  const refund = await stripe.refunds.create({
    payment_intent: booking.payment.stripePaymentIntentId,
    reverse_transfer: true, // CRITICAL: This reverses the transfer from provider's account
    metadata: {
      bookingId: booking._id.toString(),
      providerId: providerUser._id.toString(),
      providerStripeAccountId: providerUser.stripeAccountId,
      reason: "Customer requested refund within 2-hour window",
    },
  });

  // Find original payment transaction
  const { Transaction } = await import("../../models/Transaction.model");
  const originalTransaction = await Transaction.findOne({
    bookingId: booking._id,
    stripePaymentIntentId: booking.payment.stripePaymentIntentId,
  });

  // Update booking
  booking.payment.status = "REFUNDED";
  booking.payment.refundId = refund.id;
  booking.payment.refundedAt = new Date();
  booking.status = "CANCELLED";
  await booking.save();

  // Record refund transaction
  if (providerIdStr) {
    await transactionService.recordBookingRefund({
      bookingId: booking._id.toString(),
      ownerId: customerId,
      providerId: providerIdStr,
      refundAmount: booking.totalAmount,
      refundId: refund.id,
      refundReason: "Customer requested refund within 2-hour window",
      originalTransactionId: originalTransaction?._id.toString(),
      metadata: {
        bookingNumber: booking._id.toString().slice(-6),
        refundStatus: refund.status,
      },
    });
  }

  // Notify provider about refund
  if (providerIdStr) {
    await notificationService.createNotification({
      recipientId: providerIdStr,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Booking Cancelled & Refunded",
      message: `Booking #${booking._id
        .toString()
        .slice(-6)} has been cancelled and payment of €${
        booking.totalAmount
      } has been refunded to the customer.`,
      data: {
        bookingId: booking._id.toString(),
        amount: booking.totalAmount,
        refundId: refund.id,
      },
    });
  }

  // Notify owner about refund
  await notificationService.createNotification({
    recipientId: customerId,
    type: NotificationType.BOOKING_CANCELLED,
    title: "Refund Processed",
    message: `Your booking has been cancelled and payment of €${booking.totalAmount} has been refunded successfully.`,
    data: {
      bookingId: booking._id.toString(),
      amount: booking.totalAmount,
      refundId: refund.id,
    },
  });

  return {
    booking,
    refund,
  };
};

// Check refund eligibility status for a booking
const getRefundEligibility = async (bookingId: string, ownerId: string) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Extract customer ID (handle both populated and non-populated)
  const customerId =
    typeof booking.customerId === "object" && booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId.toString();

  if (customerId !== ownerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only check your own bookings"
    );
  }

  const eligible = isRefundEligible(booking);
  const bookingCreatedAt = new Date(booking.createdAt).getTime();
  const now = Date.now();
  const hoursSinceCreation = (now - bookingCreatedAt) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, REFUND_WINDOW_HOURS - hoursSinceCreation);

  return {
    eligible,
    refundWindowHours: REFUND_WINDOW_HOURS,
    hoursSinceCreation: parseFloat(hoursSinceCreation.toFixed(2)),
    hoursRemaining: parseFloat(hoursRemaining.toFixed(2)),
    canRefund:
      eligible &&
      booking.payment.status === "PAID" &&
      booking.status !== "COMPLETED",
    reason: !eligible
      ? `Refund window expired. Refunds only available within ${REFUND_WINDOW_HOURS} hours.`
      : booking.payment.status !== "PAID"
      ? "Booking is not paid yet"
      : booking.status === "COMPLETED"
      ? "Cannot refund completed bookings"
      : "Refund available",
  };
};

// Handle Stripe webhooks for booking payments
const handleBookingPaymentWebhook = async (
  signature: string,
  rawBody: string | Buffer
) => {
  const webhookSecret = config.stripe_webhook_secret;

  if (!webhookSecret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Webhook secret not configured"
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${(error as Error).message}`
    );
  }

  // Validate event using centralized handler
  const { handleBookingPaymentEvent } = await import(
    "../../../helpers/handleStripeEvents"
  );

  if (!handleBookingPaymentEvent(event.type)) {
    return { received: true, eventType: event.type };
  }

  // Process action-required events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Verify this is a booking payment session
      if (session.metadata?.type === "booking_payment") {
        const bookingId = session.metadata.bookingId;
        const tempBookingId = session.metadata.tempBookingId;
        const paymentIntentId = session.payment_intent as string;

        if (session.payment_status === "paid") {
          // Create booking from temp booking with same ID
          if (bookingId) {
            try {
              const { bookingService } = await import(
                "../booking/booking.service"
              );
              await bookingService.confirmBookingAfterPayment(
                bookingId,
                paymentIntentId
              );
            } catch (error: any) {
              // Temp booking might have expired or already been processed
            }
          }
          // OLD FLOW: Backward compatibility for old temp bookings
          else if (tempBookingId) {
            try {
              const { bookingService } = await import(
                "../booking/booking.service"
              );
              await bookingService.confirmBookingAfterPayment(
                tempBookingId,
                paymentIntentId
              );
            } catch (error: any) {
              // Legacy booking processing error - non-blocking
            }
          }
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      if (paymentIntent.metadata?.type === "booking_payment") {
        const bookingId = paymentIntent.metadata.bookingId;
        const tempBookingId = paymentIntent.metadata.tempBookingId;

        // Create booking from temp booking with same ID
        if (bookingId) {
          try {
            const { bookingService } = await import(
              "../booking/booking.service"
            );
            await bookingService.confirmBookingAfterPayment(
              bookingId,
              paymentIntent.id
            );
          } catch (error: any) {
            // Error confirming booking after payment - non-blocking
          }
        }
        // Backward compatibility for old temp bookings
        else if (tempBookingId) {
          try {
            const { bookingService } = await import(
              "../booking/booking.service"
            );
            await bookingService.confirmBookingAfterPayment(
              tempBookingId,
              paymentIntent.id
            );
          } catch (error: any) {
            // Legacy booking processing error - non-blocking
          }
        }
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;

      const booking = await Booking.findOne({
        "payment.stripePaymentIntentId": paymentIntentId,
      });

      if (booking && booking.payment.status !== "REFUNDED") {
        booking.payment.status = "REFUNDED";
        booking.payment.refundedAt = new Date();
        await booking.save();
      }
      break;
    }

    default:
      // All other events are informational and already validated by handleBookingPaymentEvent
      break;
  }

  return { received: true, eventType: event.type };
};

// Get booking payment status for debugging
const getBookingPaymentStatus = async (bookingId: string) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  return {
    bookingId: booking._id,
    status: booking.status,
    payment: {
      status: booking.payment.status,
      stripePaymentIntentId: booking.payment.stripePaymentIntentId,
      transactionId: booking.payment.transactionId,
      paidAt: booking.payment.paidAt,
      refundedAt: booking.payment.refundedAt,
    },
    totalAmount: booking.totalAmount,
    createdAt: booking.createdAt,
    canRefund: isRefundEligible(booking) && booking.payment.status === "PAID",
  };
};

// Refund booking based on status (PENDING/ONGOING) - no time restriction
// Used when: Owner cancels PENDING, Provider rejects PENDING/ONGOING bookings
const refundBookingByStatus = async (
  bookingId: string,
  reason: string,
  initiatedBy: "owner" | "provider"
) => {
  const booking = await Booking.findById(bookingId)
    .populate("providerId", "userName stripeAccountId")
    .populate("customerId", "userName");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Extract IDs safely
  const customerId =
    typeof booking.customerId === "object" && booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId.toString();

  const providerIdStr =
    booking.providerId &&
    typeof booking.providerId === "object" &&
    booking.providerId._id
      ? booking.providerId._id.toString()
      : booking.providerId?.toString();

  // Validate payment status
  if (booking.payment.status === "REFUNDED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Payment has already been refunded"
    );
  }

  if (booking.payment.status !== "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot refund unpaid booking");
  }

  // Validate booking status (must be PENDING or ONGOING, not COMPLETED)
  if (booking.status === "COMPLETED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot refund completed bookings"
    );
  }

  if (booking.status === "CANCELLED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Booking is already cancelled");
  }

  if (!booking.payment.stripePaymentIntentId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No payment intent found for this booking"
    );
  }

  // Get provider's Stripe Connect account
  const provider = booking.providerId as any;
  const providerStripeAccountId = provider?.stripeAccountId;

  if (!providerStripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Provider Stripe account not found. Cannot process refund."
    );
  }

  // CRITICAL: Process refund with reverse_transfer
  // This reverses the transfer and takes money back from provider's account
  const refund = await stripe.refunds.create({
    payment_intent: booking.payment.stripePaymentIntentId!,
    reverse_transfer: true, // Reverses transfer from provider
    metadata: {
      bookingId: booking._id.toString(),
      providerId: providerIdStr || "",
      providerStripeAccountId: providerStripeAccountId,
      reason: reason,
      initiatedBy: initiatedBy,
    },
  });

  // Find original payment transaction for audit trail
  const { Transaction } = await import("../../models/Transaction.model");
  const originalTransaction = await Transaction.findOne({
    bookingId: booking._id,
    stripePaymentIntentId: booking.payment.stripePaymentIntentId,
  });

  // Update booking - mark as refunded and cancelled
  booking.payment.status = "REFUNDED";
  booking.payment.refundId = refund.id;
  booking.payment.refundedAt = new Date();
  booking.status = "CANCELLED";
  await booking.save();

  // Record refund transaction for audit trail
  if (providerIdStr) {
    await transactionService.recordBookingRefund({
      bookingId: booking._id.toString(),
      ownerId: customerId,
      providerId: providerIdStr,
      refundAmount: booking.totalAmount,
      refundId: refund.id,
      refundReason: reason,
      originalTransactionId: originalTransaction?._id.toString(),
      metadata: {
        bookingNumber: booking._id.toString().slice(-6),
        refundStatus: refund.status,
        initiatedBy: initiatedBy,
      },
    });
  }

  // Notify provider about refund
  if (providerIdStr) {
    await notificationService.createNotification({
      recipientId: providerIdStr,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Booking Cancelled & Refunded",
      message: `Booking #${booking._id
        .toString()
        .slice(-6)} has been cancelled. Payment of €${
        booking.totalAmount
      } has been refunded to the customer.`,
      data: {
        bookingId: booking._id.toString(),
        amount: booking.totalAmount,
        refundId: refund.id,
        reason: reason,
      },
    });
  }

  // Notify owner about refund
  await notificationService.createNotification({
    recipientId: customerId,
    type: NotificationType.BOOKING_CANCELLED,
    title: "Booking Cancelled - Refund Processed",
    message: `Your booking #${booking._id
      .toString()
      .slice(-6)} has been cancelled and payment of €${
      booking.totalAmount
    } has been refunded. Funds will be returned to your account within 5-7 business days.`,
    data: {
      bookingId: booking._id.toString(),
      amount: booking.totalAmount,
      refundId: refund.id,
      reason: reason,
    },
  });

  return {
    booking,
    refund,
    message: "Booking cancelled and refund processed successfully",
  };
};

export const paymentService = {
  createBookingPayment,
  refundBookingPayment,
  refundBookingByStatus,
  getRefundEligibility,
  handleBookingPaymentWebhook,
  getBookingPaymentStatus,
};
