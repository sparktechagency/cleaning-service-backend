import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";
import { User } from "../../models/User.model";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../../models";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
});

const createConnectAccount = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER" && user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers and owners can create Stripe Connect accounts"
    );
  }

  // Check if already has account
  if (user.stripeAccountId && user.stripeOnboardingComplete) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Stripe account already connected"
    );
  }

  // Create Stripe Connect Express account
  const account = await stripe.accounts.create({
    type: "express",
    country: "US", // Change based on your target country
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: {
      userId: user._id.toString(),
    },
  });

  // Update user with Stripe account ID
  await User.findByIdAndUpdate(userId, {
    stripeAccountId: account.id,
    stripeAccountStatus: "pending",
    stripeOnboardingComplete: false,
  });

  return {
    accountId: account.id,
    status: "pending",
  };
};

// Create onboarding link for provider to complete Stripe Connect setup
const createOnboardingLink = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER" && user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers and owners can access Stripe Connect onboarding"
    );
  }

  // Create account if doesn't exist
  let accountId = user.stripeAccountId;
  if (!accountId) {
    const result = await createConnectAccount(userId);
    accountId = result.accountId;
  }

  // Get frontend URL and ensure it has protocol
  const frontendUrl = config.frontend_url;
  const baseUrl = frontendUrl.startsWith("http")
    ? frontendUrl
    : `https://${frontendUrl}`;

  // Determine role-based paths (providers and owners use different frontend paths)
  const rolePath = user.role === "PROVIDER" ? "provider" : "owner";

  // Create account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/${rolePath}/stripe-connect/refresh`,
    return_url: `${baseUrl}/${rolePath}/stripe-connect/complete`,
    type: "account_onboarding",
  });

  return {
    url: accountLink.url,
    accountId,
  };
};

// Check if provider's Stripe account is fully set up
const checkAccountStatus = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER" && user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers and owners have Stripe Connect accounts"
    );
  }

  if (!user.stripeAccountId) {
    return {
      connected: false,
      status: "none",
      canReceivePayments: false,
      message:
        "No Stripe account connected. Please connect your account to receive payments.",
    };
  }

  try {
    // Retrieve account from Stripe
    const account = await stripe.accounts.retrieve(user.stripeAccountId);

    const isActive = account.charges_enabled && account.payouts_enabled;
    const status = isActive
      ? "active"
      : account.requirements?.disabled_reason || "pending";

    // Update user status
    await User.findByIdAndUpdate(userId, {
      stripeAccountStatus: isActive ? "active" : "pending",
      stripeOnboardingComplete: isActive,
    });

    return {
      connected: true,
      status,
      canReceivePayments: isActive,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
      message: isActive
        ? "Your Stripe account is active and ready to receive payments"
        : "Please complete your Stripe account setup to receive payments",
    };
  } catch (error: any) {
    // If account doesn't exist or access revoked, clear the stored account ID
    if (
      error.code === "account_invalid" ||
      error.type === "StripePermissionError"
    ) {
      await User.findByIdAndUpdate(userId, {
        stripeAccountId: null,
        stripeAccountStatus: null,
        stripeOnboardingComplete: false,
      });

      return {
        connected: false,
        status: "none",
        canReceivePayments: false,
        message:
          "No Stripe account connected. Please connect your account to receive payments.",
      };
    }

    // Re-throw other errors
    throw error;
  }
};

// Get provider's Stripe account dashboard link
const getDashboardLink = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.stripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No Stripe account connected. Please connect your account first."
    );
  }

  try {
    // Create login link for Express dashboard
    const loginLink = await stripe.accounts.createLoginLink(
      user.stripeAccountId
    );

    return {
      url: loginLink.url,
    };
  } catch (error: any) {
    // If account doesn't exist or access revoked, clear the stored account ID
    if (
      error.code === "account_invalid" ||
      error.type === "StripePermissionError"
    ) {
      await User.findByIdAndUpdate(userId, {
        stripeAccountId: null,
        stripeAccountStatus: null,
        stripeOnboardingComplete: false,
      });

      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Stripe account no longer exists. Please reconnect your account."
      );
    }

    // Re-throw other errors
    throw error;
  }
};

/**
 * Disconnect provider's Stripe account
 */
const disconnectAccount = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.stripeAccountId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No Stripe account to disconnect"
    );
  }

  try {
    // Delete the Stripe account
    await stripe.accounts.del(user.stripeAccountId);
  } catch (error: any) {
    // If account already deleted or doesn't exist, continue anyway
    console.log("Stripe account deletion warning:", error.message);
  }

  // Update user - clear all Stripe-related fields
  await User.findByIdAndUpdate(userId, {
    stripeAccountId: null,
    stripeAccountStatus: null,
    stripeOnboardingComplete: false,
  });

  // Notify user
  await notificationService.createNotification({
    recipientId: userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Stripe Account Disconnected",
    message:
      "Your Stripe account has been disconnected. You will need to reconnect to receive payments.",
    data: {},
  });

  return {
    success: true,
    message: "Stripe account disconnected successfully",
  };
};

// Handle Stripe Connect webhooks
const handleConnectWebhook = async (
  signature: string,
  rawBody: string | Buffer
) => {
  const webhookSecret =
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;

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

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const userId = account.metadata?.userId;

      if (userId) {
        const isActive = account.charges_enabled && account.payouts_enabled;

        await User.findByIdAndUpdate(userId, {
          stripeAccountStatus: isActive ? "active" : "pending",
          stripeOnboardingComplete: isActive,
        });

        // Notify provider when account becomes active
        if (isActive) {
          await notificationService.createNotification({
            recipientId: userId,
            type: NotificationType.SYSTEM_ANNOUNCEMENT,
            title: "Stripe Account Activated!",
            message:
              "Your Stripe account is now active and you can start receiving payments from bookings.",
            data: {
              accountId: account.id,
            },
          });
        }
      }
      break;
    }

    case "account.external_account.created":
    case "account.external_account.updated": {
      // Provider added/updated bank account
      const externalAccount = event.data.object as Stripe.BankAccount;
      const accountId = (externalAccount as any).account;

      const user = await User.findOne({ stripeAccountId: accountId });
      if (user) {
        await notificationService.createNotification({
          recipientId: user._id.toString(),
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: "Bank Account Updated",
          message: "Your payout bank account has been updated successfully.",
          data: {},
        });
      }
      break;
    }

    default:
      console.log(`Unhandled Connect event type: ${event.type}`);
  }

  return { received: true };
};

export const stripeConnectService = {
  createConnectAccount,
  createOnboardingLink,
  checkAccountStatus,
  getDashboardLink,
  disconnectAccount,
  handleConnectWebhook,
};
