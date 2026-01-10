import { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";
import ApiError from "../../errors/ApiErrors";
import { subscriptionService } from "../modules/subscription/subscription.service";

// Middleware to check if provider can create a new service based on their subscription plan
export const checkServiceCreationLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    if (userRole !== "PROVIDER") {
      return next();
    }

    const limits = await subscriptionService.checkPlanLimits(userId);

    if (!limits.canCreateService) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `You have reached the service creation limit for your ${limits.currentPlan} plan. Please upgrade your subscription to create more services.`
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if provider can receive new booking based on their subscription plan
export const checkBookingLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // This check happens when a booking is being created. We need to verify the provider's limits
    const { serviceId } = req.body;

    if (!serviceId) {
      return next();
    }

    // Get service to find provider
    const { Service } = await import("../modules/service/service.model");
    const service = await Service.findById(serviceId);

    if (!service) {
      return next();
    }

    const providerId = service.providerId.toString();
    const limits = await subscriptionService.checkPlanLimits(providerId);

    if (!limits.canReceiveBooking) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `This provider has reached their monthly booking limit for their ${limits.currentPlan} plan. Please choose another provider.`
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if provider can add service in a new category
export const checkCategoryLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const { categoryId } = req.body;

    if (userRole !== "PROVIDER" || !categoryId) {
      return next();
    }

    const limits = await subscriptionService.checkPlanLimits(userId);

    // If unlimited categories, allow
    if (limits.limits.categoriesLimit === -1) {
      return next();
    }

    // Check if this is a new category
    const { Service } = await import("../modules/service/service.model");
    const existingServices = await Service.find({ providerId: userId }).select(
      "categoryId"
    );

    const existingCategories = new Set(
      existingServices.map((s) => s.categoryId.toString())
    );

    const isNewCategory = !existingCategories.has(categoryId);

    if (isNewCategory && !limits.canAddCategory) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `You have reached the category limit for your ${limits.currentPlan} plan. To add services in a new category, please delete all services from your current category first, or upgrade your subscription.`
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/*
  Middleware to check if provider has connected and activated Stripe account
  before creating services or performing payment-related operations.
 
  IMPORTANT: This middleware includes intelligent fallback logic to handle
  timing issues between Stripe webhook delivery and service creation attempts.
 
  Flow:
  1. Check if user has stripeAccountId
  2. If status shows pending/incomplete, query Stripe API for fresh status
  3. Refetch user from database after status update
  4. Make final decision based on fresh data
 
  This prevents false negatives when:
   - User completes onboarding but webhook hasn't arrived yet
   - Frontend didn't call the complete-callback endpoint
   - Database write delay occurred
 */
export const checkStripeAccountActive = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    // Only apply this check to PROVIDER role
    if (userRole !== "PROVIDER") {
      return next();
    }

    const { User } = await import("../models/User.model");
    let user = await User.findById(userId);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // First check: Ensure Stripe account exists
    if (!user.stripeAccountId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You must connect your Stripe account before creating services. Please visit your profile to set up payment receiving."
      );
    }

    // Second check: Verify account is active
    // If status is NOT active, make a fresh check with Stripe API as fallback
    // This handles timing issues with webhook delivery
    const isCurrentlyActive =
      user.stripeOnboardingComplete === true &&
      user.stripeAccountStatus === "active";

    if (!isCurrentlyActive) {
      // Status is pending/incomplete - perform fresh check with Stripe API
      try {
        const { stripeConnectService } = await import(
          "../modules/payment/stripeConnect.service"
        );

        // Query Stripe API and update database
        const freshStatus = await stripeConnectService.checkAccountStatus(
          userId
        );

        // Refetch user after status check (which updates the database)
        user = await User.findById(userId);

        if (!user) {
          throw new ApiError(
            httpStatus.NOT_FOUND,
            "User not found after refresh"
          );
        }

        // Check again with fresh data from database
        const isNowActive =
          user.stripeOnboardingComplete === true &&
          user.stripeAccountStatus === "active";

        if (!isNowActive) {
          // Even after fresh check, account is not active
          throw new ApiError(
            httpStatus.FORBIDDEN,
            freshStatus.message ||
              "Your Stripe account setup is incomplete or not active. Please complete the onboarding process to start receiving payments."
          );
        }

        // Success - account is now confirmed active, proceed
        return next();
      } catch (error: any) {
        // If the fresh check itself threw an ApiError (like account incomplete)
        if (error instanceof ApiError) {
          throw error;
        }

        // If Stripe API call failed for other reasons (network, rate limit, etc.), fail safely by rejecting the request
        console.error(
          "[Stripe Status Check] Failed to verify account status:",
          error
        );
        throw new ApiError(
          httpStatus.SERVICE_UNAVAILABLE,
          "Unable to verify your Stripe account status at this time. Please try again in a moment."
        );
      }
    }

    // Account is already active in database, proceed immediately
    next();
  } catch (error) {
    next(error);
  }
};
