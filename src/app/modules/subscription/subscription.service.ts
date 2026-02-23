import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  PLAN_LIMITS,
  PLAN_PRICES,
} from "../../models/Subscription.model";
import { User } from "../../models/User.model";
import { Service } from "../service/service.model";
import { Booking } from "../booking/booking.model";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../../models";
import { transactionService } from "../transaction/transaction.service";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
});

// Get plan details and limits
const getPlanDetails = (plan: SubscriptionPlan) => {
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    price: PLAN_PRICES[plan],
  };
};

// Get all available subscription plans
const getAllPlans = () => {
  return Object.values(SubscriptionPlan).map((plan) => ({
    ...getPlanDetails(plan),
    features: getFeaturesList(plan),
  }));
};

// Get feature list for a plan
const getFeaturesList = (plan: SubscriptionPlan) => {
  const limits = PLAN_LIMITS[plan];

  const features = [];

  if (limits.servicesLimit === -1) {
    features.push("Unlimited service creation");
  } else {
    features.push(`Create up to ${limits.servicesLimit} services`);
  }

  if (limits.bookingsPerMonth === -1) {
    features.push("Unlimited booking requests per month");
  } else {
    features.push(
      `Receive up to ${limits.bookingsPerMonth} booking requests per month`
    );
  }

  if (limits.categoriesLimit === -1) {
    features.push("Services in all categories");
  } else {
    features.push(`Services in ${limits.categoriesLimit} category at a time`);
  }

  if (limits.badge) {
    features.push(`${limits.badge} badge on profile`);
  }

  features.push(`Priority level ${limits.priority} in service listings`);

  if (plan === SubscriptionPlan.FREE) {
    features.push("Limited visibility after reaching limits");
  }

  return features;
};

// Check if user has reached their plan limits
const checkPlanLimits = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers have subscription plans"
    );
  }

  const subscription = await Subscription.findOne({
    userId,
    status: SubscriptionStatus.ACTIVE,
  }).sort({ createdAt: -1 });

  const currentPlan =
    subscription && subscription.status === SubscriptionStatus.ACTIVE
      ? subscription.plan
      : SubscriptionPlan.FREE;

  const limits = PLAN_LIMITS[currentPlan];

  // Count current usage
  const servicesCount = await Service.countDocuments({ providerId: userId });

  // Determine booking count period based on plan type:
  // - PAID plans: count from subscription start date (30-day rolling period)
  // - FREE plans: count from calendar month start
  let bookingCountStartDate: Date;

  if (subscription && subscription.status === SubscriptionStatus.ACTIVE) {
    // Paid plan: count bookings from subscription start date
    bookingCountStartDate = new Date(subscription.startDate);
  } else {
    // Free plan: count bookings from calendar month start
    bookingCountStartDate = new Date();
    bookingCountStartDate.setDate(1);
    bookingCountStartDate.setHours(0, 0, 0, 0);
  }

  const bookingsInPeriod = await Booking.countDocuments({
    providerId: userId,
    createdAt: { $gte: bookingCountStartDate },
  });

  // Count unique categories
  const services = await Service.find({ providerId: userId }).select(
    "categoryId"
  );
  const uniqueCategories = new Set(services.map((s) => s.categoryId.toString()))
    .size;

  return {
    currentPlan,
    limits,
    usage: {
      services: servicesCount,
      bookingsInPeriod,
      categories: uniqueCategories,
    },
    canCreateService:
      limits.servicesLimit === -1 || servicesCount < limits.servicesLimit,
    canReceiveBooking:
      limits.bookingsPerMonth === -1 ||
      bookingsInPeriod < limits.bookingsPerMonth,
    canAddCategory:
      limits.categoriesLimit === -1 ||
      uniqueCategories < limits.categoriesLimit,
  };
};

// Create Stripe customer for user with EUR currency handling
const createStripeCustomer = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  let stripeCustomerId = user.stripeCustomerId;

  // Check if customer exists and has currency conflicts
  if (stripeCustomerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(
        stripeCustomerId
      );

      // Check if customer has USD subscriptions/invoices
      if (existingCustomer && !existingCustomer.deleted) {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 1,
        });

        // If customer has active USD items, create new EUR customer
        if (subscriptions.data.length > 0) {

          // Create new EUR-specific customer
          const newCustomer = await stripe.customers.create({
            email: user.email,
            name: user.userName,
            metadata: {
              userId: user._id.toString(),
              currency: "EUR",
              migratedFrom: stripeCustomerId,
              migrationDate: new Date().toISOString(),
            },
          });

          stripeCustomerId = newCustomer.id;

          // Update user with new EUR customer ID
          await User.findByIdAndUpdate(userId, {
            stripeCustomerId: newCustomer.id,
            stripeCustomerIdUSD: user.stripeCustomerId, // Keep old USD customer for reference
          });

          return newCustomer.id;
        }
      }
    } catch (error: any) {
      // If customer doesn't exist or is deleted, create new one
      if (error.code === "resource_missing" || error.statusCode === 404) {
        stripeCustomerId = ""; // Will create new below
      } else {
        console.error(`Error checking customer currency:`, error);
        // Continue with existing customer ID
      }
    }
  }

  // Create new customer if needed
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.userName,
      metadata: {
        userId: user._id.toString(),
        currency: "EUR",
      },
    });

    await User.findByIdAndUpdate(userId, {
      stripeCustomerId: customer.id,
    });

    return customer.id;
  }

  return stripeCustomerId;
};

// Create checkout session for subscription purchase
// Supports credit redemption for discounts and yearly subscriptions with 20% discount
const createSubscriptionCheckout = async (
  userId: string,
  plan: SubscriptionPlan,
  timeline: "MONTHLY" | "YEARLY" = "MONTHLY",
  creditsToRedeem?: number
) => {
  if (plan === SubscriptionPlan.FREE) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "FREE plan does not require payment"
    );
  }

  // Validate timeline
  if (timeline !== "MONTHLY" && timeline !== "YEARLY") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid timeline. Must be either MONTHLY or YEARLY"
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers can purchase subscription plans"
    );
  }

  // Check if user already has active subscription to this plan
  const existingSubscription = await Subscription.findOne({
    userId,
    plan,
    status: SubscriptionStatus.ACTIVE,
  });

  if (existingSubscription && existingSubscription.endDate > new Date()) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You already have an active subscription to this plan"
    );
  }

  // Get or create Stripe customer
  const stripeCustomerId = await createStripeCustomer(userId);

  // Calculate pricing based on timeline
  const monthlyPrice = PLAN_PRICES[plan];
  let originalAmount: number; // Price before ANY discounts
  let amountAfterYearlyDiscount: number; // Price after yearly discount (if applicable)
  let yearlyDiscount = 0;
  let subscriptionDurationDays: number;
  let billingIntervalCount: number;

  if (timeline === "YEARLY") {
    // Yearly subscription: 12 months price with 20% discount
    originalAmount = monthlyPrice * 12; // Full yearly price
    yearlyDiscount = originalAmount * 0.2; // 20% discount
    amountAfterYearlyDiscount = originalAmount - yearlyDiscount; // Price after yearly discount
    subscriptionDurationDays = 365; // 1 year
    billingIntervalCount = 12; // 12 months
  } else {
    // Monthly subscription
    originalAmount = monthlyPrice;
    amountAfterYearlyDiscount = monthlyPrice; // No yearly discount for monthly
    subscriptionDurationDays = 30; // 1 month
    billingIntervalCount = 1; // 1 month
  }

  let finalAmount = amountAfterYearlyDiscount;
  let redemptionId: string | undefined;
  let creditsDiscountApplied = 0;

  // Handle credit redemption if requested
  if (creditsToRedeem && creditsToRedeem > 0) {
    const { redemptionService } = await import(
      "../redemption/redemption.service"
    );

    // This will throw an error if user doesn't have enough credits
    // The error will be caught by the catchAsync wrapper and sent to client
    const redemptionResult =
      await redemptionService.redeemCreditsForSubscription(
        userId,
        creditsToRedeem,
        amountAfterYearlyDiscount // Use price after yearly discount for credit calculation
      );

    redemptionId = redemptionResult.redemptionId;
    finalAmount = redemptionResult.finalPrice;
    creditsDiscountApplied = redemptionResult.discountAmount;
  }

  // If final amount is 0 or less (fully covered by credits), activate subscription immediately
  if (finalAmount <= 0) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + subscriptionDurationDays);

    const subscription = await Subscription.create({
      userId,
      plan,
      status: SubscriptionStatus.ACTIVE,
      startDate: new Date(),
      endDate,
      autoRenew: false,
      metadata: {
        paidWithCredits: true,
        timeline,
        originalPrice: originalAmount,
        monthlyPrice,
        yearlyDiscount: timeline === "YEARLY" ? yearlyDiscount : 0,
        creditsUsed: creditsToRedeem,
        creditsDiscountApplied,
        totalDiscount:
          (timeline === "YEARLY" ? yearlyDiscount : 0) + creditsDiscountApplied,
      },
    });

    // Complete redemption
    if (redemptionId) {
      const { redemptionService } = await import(
        "../redemption/redemption.service"
      );
      await redemptionService.completeSubscriptionRedemption(
        redemptionId,
        subscription._id.toString()
      );
    }

    // Update user's plan and badge
    await User.findByIdAndUpdate(userId, {
      plan,
      badge: PLAN_LIMITS[plan].badge,
      bookingLimitExceeded: false, // Reset limit status on plan upgrade
    });

    // Record transaction
    await transactionService.recordSubscriptionPurchase({
      userId,
      subscriptionId: subscription._id.toString(),
      plan,
      amount: originalAmount,
      creditsUsed: creditsToRedeem,
      creditDollarValue: creditsDiscountApplied,
      redemptionId,
      metadata: {
        paidWithCredits: true,
        timeline,
        yearlyDiscount: timeline === "YEARLY" ? yearlyDiscount : 0,
        autoRenew: false,
      },
    });

    // Notify user
    const durationText = timeline === "YEARLY" ? "1 year" : "30 days";
    const savingsText =
      timeline === "YEARLY"
        ? ` You saved €${yearlyDiscount.toFixed(2)} with the yearly plan!`
        : "";

    await notificationService.createNotification({
      recipientId: userId,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: "Subscription Activated! 🎉",
      message: `Your ${plan} ${timeline.toLowerCase()} subscription has been activated using ${creditsToRedeem} credits. Enjoy your benefits for ${durationText}!${savingsText}`,
      data: {
        subscriptionId: subscription._id.toString(),
        plan,
        timeline,
        paidWithCredits: true,
        yearlyDiscount: timeline === "YEARLY" ? yearlyDiscount : 0,
      },
    });

    // Calculate total discount for fully-paid-with-credits case
    const totalDiscount = yearlyDiscount + creditsDiscountApplied;

    return {
      sessionId: null,
      url: null,
      subscriptionId: subscription._id.toString(),
      paidWithCredits: true,
      message: "Subscription activated successfully with credits",
      timeline,
      monthlyPrice,
      originalAmount, // Full price before any discounts
      amountAfterYearlyDiscount, // Price after yearly discount (if applicable)
      yearlyDiscount: timeline === "YEARLY" ? yearlyDiscount : 0,
      creditsDiscountApplied,
      totalDiscount,
      finalAmount: 0,
      creditsUsed: creditsToRedeem || 0,
      durationDays: subscriptionDurationDays,
      savings:
        totalDiscount > 0 ? `You saved €${totalDiscount.toFixed(2)}!` : null,
    };
  }

  // Create checkout session for remaining amount
  const durationText = timeline === "YEARLY" ? "1 year" : "1 month";
  const intervalText = timeline === "YEARLY" ? "year" : "month";

  // Build description with all discount details
  let description = `${plan} plan - ${durationText} access`;

  if (timeline === "YEARLY") {
    description += ` (20% yearly discount: €${yearlyDiscount.toFixed(
      2
    )} saved)`;
  }

  if (creditsDiscountApplied > 0) {
    description += ` | Credit discount: €${creditsDiscountApplied.toFixed(2)}`;
  }

  const totalDiscount = yearlyDiscount + creditsDiscountApplied;
  if (totalDiscount > 0) {
    description += ` | Total saved: €${totalDiscount.toFixed(2)}`;
  }

  const lineItems: any[] = [
    {
      price_data: {
        currency: "eur",
        product_data: {
          name: `${plan} Subscription Plan (${timeline})`,
          description,
        },
        unit_amount: Math.round(finalAmount * 100), // Convert to cents
        recurring: {
          interval: intervalText as "month" | "year",
          interval_count: 1,
        },
      },
      quantity: 1,
    },
  ];

  // Get backend URL for activation callback
  const backendUrl =
    process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`;

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "subscription",
    // CRITICAL: Redirect to BACKEND first to activate subscription, then redirect to frontend
    // This ensures subscription activates even if frontend is not connected
    success_url: `${backendUrl}/api/subscription/activate-from-checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${
      process.env.FRONTEND_URL || "http://103.159.73.129:3000"
    }/payment-cancel`,
    metadata: {
      type: "subscription_payment", // CRITICAL: Identifies this as subscription payment for webhook routing
      userId: userId,
      plan: plan,
      timeline: timeline,
      subscriptionDurationDays: subscriptionDurationDays.toString(),
      monthlyPrice: monthlyPrice.toString(),
      yearlyDiscount: yearlyDiscount.toString(),
      redemptionId: redemptionId || "",
      originalAmount: originalAmount.toString(),
      creditsDiscountApplied: creditsDiscountApplied.toString(),
      totalDiscount: totalDiscount.toString(),
      creditsUsed: (creditsToRedeem || 0).toString(),
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
    timeline,
    monthlyPrice,
    originalAmount, // Full price before any discounts
    amountAfterYearlyDiscount, // Price after yearly discount (if applicable)
    yearlyDiscount: timeline === "YEARLY" ? yearlyDiscount : 0,
    creditsDiscountApplied,
    totalDiscount,
    finalAmount, // Final price after all discounts
    creditsUsed: creditsToRedeem || 0,
    durationDays: subscriptionDurationDays,
    savings:
      totalDiscount > 0 ? `You saved €${totalDiscount.toFixed(2)}!` : null,
  };
};

// Verify checkout session and activate subscription
const verifyAndActivateSubscription = async (sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });

  if (!session || session.payment_status !== "paid") {
    console.error(
      `Payment not completed for session ${sessionId}. Status: ${session.payment_status}`
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Payment not completed or session invalid"
    );
  }

  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan as SubscriptionPlan;

  if (!userId || !plan) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid session metadata");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // Check if subscription already created for this session
  const existingSubscription = await Subscription.findOne({
    stripeSubscriptionId: (session.subscription as Stripe.Subscription)?.id,
  });

  if (existingSubscription) {
    return existingSubscription;
  }

  // Extract timeline and duration from metadata
  const timeline = (session.metadata?.timeline || "MONTHLY") as
    | "MONTHLY"
    | "YEARLY";
  const subscriptionDurationDays = session.metadata?.subscriptionDurationDays
    ? parseInt(session.metadata.subscriptionDurationDays)
    : 30;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + subscriptionDurationDays);

  // Cancel any existing active subscriptions
  await Subscription.updateMany(
    {
      userId,
      status: SubscriptionStatus.ACTIVE,
    },
    {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: "Upgraded to new plan",
    }
  );

  // Create new subscription
  // Extract customer ID - handle both expanded object and string
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer)?.id;

  const subscription = await Subscription.create({
    userId,
    plan,
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: (session.subscription as Stripe.Subscription)?.id,
    stripeCustomerId: customerId,
    amount: PLAN_PRICES[plan],
    currency: "EUR",
    startDate,
    endDate,
    autoRenew: true,
    metadata: {
      sessionId,
      timeline,
      subscriptionDurationDays,
      monthlyPrice: session.metadata?.monthlyPrice || null,
      yearlyDiscount: session.metadata?.yearlyDiscount || null,
      redemptionId: session.metadata?.redemptionId || null,
      originalAmount: session.metadata?.originalAmount || null,
      creditsDiscountApplied: session.metadata?.creditsDiscountApplied || null,
      totalDiscount: session.metadata?.totalDiscount || null,
      creditsUsed: session.metadata?.creditsUsed || null,
    },
  });

  const redemptionId = session.metadata?.redemptionId;
  if (redemptionId) {
    try {
      const { redemptionService } = await import(
        "../redemption/redemption.service"
      );
      await redemptionService.completeSubscriptionRedemption(
        redemptionId,
        subscription._id.toString()
      );
    } catch (error: any) {
      console.error(
        `CRITICAL: Failed to complete redemption ${redemptionId}:`,
        error
      );
      console.error("MANUAL REVIEW REQUIRED - Redemption completion failed:", {
        error: error.message,
        stack: error.stack,
        userId,
        subscriptionId: subscription._id.toString(),
        redemptionId,
        timestamp: new Date().toISOString(),
        action:
          "Review redemption record and manually deduct credits if needed",
      });
    }
  }

  // Update user plan and badge in database

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      plan,
      badge: PLAN_LIMITS[plan].badge,
      bookingLimitExceeded: false, // Reset limit status on plan upgrade
    },
    { new: true } // Return updated document
  );

  if (!updatedUser) {
    console.error(`Failed to update user plan for user: ${userId}`);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update user plan"
    );
  }

  // Send notification
  const creditsUsed = session.metadata?.creditsUsed
    ? parseInt(session.metadata.creditsUsed)
    : 0;
  const creditsDiscountApplied = session.metadata?.creditsDiscountApplied
    ? parseFloat(session.metadata.creditsDiscountApplied)
    : 0;
  const yearlyDiscount = session.metadata?.yearlyDiscount
    ? parseFloat(session.metadata.yearlyDiscount)
    : 0;
  const totalDiscount = session.metadata?.totalDiscount
    ? parseFloat(session.metadata.totalDiscount)
    : 0;
  const originalAmount = session.metadata?.originalAmount
    ? parseFloat(session.metadata.originalAmount)
    : PLAN_PRICES[plan];

  // Record transaction
  try {
    await transactionService.recordSubscriptionPurchase({
      userId,
      subscriptionId: subscription._id.toString(),
      plan,
      amount: originalAmount,
      creditsUsed: creditsUsed || undefined,
      creditDollarValue: creditsDiscountApplied || undefined,
      stripePaymentIntentId: (session as any).payment_intent?.toString(),
      stripeSubscriptionId: (session.subscription as Stripe.Subscription)?.id,
      stripeCustomerId: customerId, // Use the extracted customerId
      redemptionId: redemptionId || undefined,
      metadata: {
        sessionId,
        timeline,
        subscriptionDurationDays,
        yearlyDiscount: yearlyDiscount || undefined,
        totalDiscount: totalDiscount || undefined,
        autoRenew: true,
      },
    });
  } catch (error) {
    console.error("Failed to record subscription transaction:", error);
  }

  // Build notification message
  const durationText = timeline === "YEARLY" ? "1 year" : "30 days";
  let message = `Your ${plan} ${timeline.toLowerCase()} subscription has been activated successfully.`;

  if (totalDiscount > 0) {
    const discountParts = [];
    if (yearlyDiscount > 0) {
      discountParts.push(`€${yearlyDiscount.toFixed(2)} yearly savings`);
    }
    if (creditsDiscountApplied > 0) {
      discountParts.push(
        `€${creditsDiscountApplied.toFixed(2)} credits discount`
      );
    }
    message += ` You saved ${discountParts.join(
      " + "
    )} = €${totalDiscount.toFixed(2)} total!`;
  }

  message += ` Enjoy your new benefits for ${durationText}!`;

  await notificationService.createNotification({
    recipientId: userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Subscription Activated! 🎉",
    message,
    data: {
      plan,
      timeline,
      startDate,
      endDate,
      durationDays: subscriptionDurationDays,
      features: getFeaturesList(plan),
      creditsUsed,
      creditsDiscountApplied,
      yearlyDiscount,
      totalDiscount,
    },
  });

  return subscription;
};

// Get user's current subscription
const getMySubscription = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers have subscriptions"
    );
  }

  const subscription = await Subscription.findOne({
    userId,
    status: SubscriptionStatus.ACTIVE,
  }).sort({ createdAt: -1 });

  const currentPlan = subscription?.plan || SubscriptionPlan.FREE;
  const limits = await checkPlanLimits(userId);

  return {
    subscription: subscription || null,
    currentPlan,
    badge: user.badge,
    limits: limits.limits,
    usage: limits.usage,
    canCreateService: limits.canCreateService,
    canReceiveBooking: limits.canReceiveBooking,
    canAddCategory: limits.canAddCategory,
    daysRemaining: subscription
      ? Math.ceil(
          (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : 0,
  };
};

// Cancel subscription at period end
const cancelSubscription = async (userId: string, reason?: string) => {
  const subscription = await Subscription.findOne({
    userId,
    status: SubscriptionStatus.ACTIVE,
  }).sort({ createdAt: -1 });

  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, "No active subscription found");
  }

  if (subscription.plan === SubscriptionPlan.FREE) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot cancel FREE plan");
  }

  // Cancel Stripe subscription at period end
  if (subscription.stripeSubscriptionId) {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  subscription.autoRenew = false;
  subscription.cancellationReason = reason || "User requested cancellation";
  await subscription.save();

  // Notify user
  await notificationService.createNotification({
    recipientId: userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Subscription Cancellation Scheduled",
    message: `Your ${
      subscription.plan
    } subscription will be cancelled at the end of the billing period. You can continue using premium features until ${subscription.endDate.toLocaleDateString()}.`,
    data: {
      plan: subscription.plan,
      endDate: subscription.endDate,
    },
  });

  return subscription;
};

// Downgrade expired subscriptions to FREE (called by cron job)
const downgradeExpiredSubscriptions = async () => {
  const expiredSubscriptions = await Subscription.find({
    status: SubscriptionStatus.ACTIVE,
    endDate: { $lte: new Date() },
    plan: { $ne: SubscriptionPlan.FREE },
  });

  const results = [];

  for (const subscription of expiredSubscriptions) {
    try {
      // Update subscription status
      subscription.status = SubscriptionStatus.EXPIRED;
      await subscription.save();

      // Downgrade user to FREE plan
      await User.findByIdAndUpdate(subscription.userId, {
        plan: SubscriptionPlan.FREE,
        badge: null,
      });

      // Notify user
      await notificationService.createNotification({
        recipientId: subscription.userId.toString(),
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: "Subscription Expired",
        message: `Your ${subscription.plan} subscription has expired and you've been moved to the FREE plan. Upgrade anytime to restore premium features!`,
        data: {
          previousPlan: subscription.plan,
          currentPlan: SubscriptionPlan.FREE,
        },
      });

      results.push({
        userId: subscription.userId,
        previousPlan: subscription.plan,
        success: true,
      });
    } catch (error) {
      console.error(
        `Error downgrading subscription for user ${subscription.userId}:`,
        error
      );
      results.push({
        userId: subscription.userId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  return {
    processed: results.length,
    results,
  };
};

// Handle Stripe webhooks
const handleStripeWebhook = async (
  signature: string,
  rawBody: string | Buffer
) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

  const { handleSubscriptionEvent } = await import(
    "../../../helpers/handleStripeEvents"
  );

  if (!handleSubscriptionEvent(event.type)) {
    return { received: true, eventType: event.type };
  }

  // Handle action-required events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await verifyAndActivateSubscription(session.id);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        {
          status:
            subscription.status === "active"
              ? SubscriptionStatus.ACTIVE
              : SubscriptionStatus.CANCELLED,
        },
        { new: true }
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      const sub = await Subscription.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (sub) {
        sub.status = SubscriptionStatus.CANCELLED;
        sub.cancelledAt = new Date();
        await sub.save();

        // Downgrade to FREE
        await User.findByIdAndUpdate(sub.userId, {
          plan: SubscriptionPlan.FREE,
          badge: null,
        });
      }
      break;
    }

    case "customer.subscription.created":
      break;

    default:
      break;
  }

  return { received: true, eventType: event.type };
};

//  Get list of provider IDs who have exceeded their booking limits. Uses real-time database query to ensure accuracy. Called by service queries to filter out limit-exceeded providers.

const getProvidersExceedingLimit = async (): Promise<string[]> => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Get all FREE plan providers (no active subscription or plan is FREE)
  const freeProviders = await User.find({
    role: "PROVIDER",
    $or: [{ plan: "FREE" }, { plan: { $exists: false } }, { plan: null }],
  })
    .select("_id")
    .lean();

  const exceededProviderIds: string[] = [];

  // Check each FREE provider's booking count
  for (const provider of freeProviders) {
    const bookingCount = await Booking.countDocuments({
      providerId: provider._id,
      createdAt: { $gte: startOfMonth },
    });

    // FREE plan limit is 2 bookings per month
    if (bookingCount >= PLAN_LIMITS.FREE.bookingsPerMonth) {
      exceededProviderIds.push(provider._id.toString());
    }
  }

  return exceededProviderIds;
};

// Check if a specific provider has exceeded their booking limit. Sends notification if limit just exceeded (first time).

const checkAndNotifyProviderLimit = async (
  providerId: string
): Promise<boolean> => {
  const limits = await checkPlanLimits(providerId);

  // If provider can still receive bookings, no action needed
  if (limits.canReceiveBooking) {
    return false;
  }

  // Provider has reached their limit
  const user = await User.findById(providerId);
  if (!user) return true;

  // Check if we already sent notification (avoid duplicate notifications)
  if (!user.bookingLimitExceeded) {
    // First time reaching limit - set flag and send notification
    await User.findByIdAndUpdate(providerId, { bookingLimitExceeded: true });

    const planLimit = limits.limits.bookingsPerMonth;
    await notificationService.createNotification({
      recipientId: providerId,
      type: NotificationType.BOOKING_LIMIT_EXCEEDED,
      title: "Booking Limit Reached",
      message: `You've reached your ${limits.currentPlan} plan limit of ${planLimit} bookings. Your services are now hidden from owners. Upgrade your plan to restore visibility!`,
      data: {
        currentPlan: limits.currentPlan,
        bookingsInPeriod: limits.usage.bookingsInPeriod,
        monthlyLimit: planLimit,
      },
    });
  }

  return true;
};

// Reset booking limit exceeded flag for FREE plan providers.
// Called by cron job on the 1st of each month.
const resetMonthlyBookingLimits = async (): Promise<{ resetCount: number }> => {
  const result = await User.updateMany(
    {
      role: "PROVIDER",
      bookingLimitExceeded: true,
      $or: [{ plan: "FREE" }, { plan: { $exists: false } }, { plan: null }],
    },
    { bookingLimitExceeded: false }
  );

  return { resetCount: result.modifiedCount };
};

export const subscriptionService = {
  getPlanDetails,
  getAllPlans,
  checkPlanLimits,
  createSubscriptionCheckout,
  verifyAndActivateSubscription,
  getMySubscription,
  cancelSubscription,
  downgradeExpiredSubscriptions,
  handleStripeWebhook,
  getProvidersExceedingLimit,
  checkAndNotifyProviderLimit,
  resetMonthlyBookingLimits,
};
