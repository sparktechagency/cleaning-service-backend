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
    // This check happens when a booking is being created
    // We need to verify the provider's limits
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

// Middleware to check if provider has connected Stripe account before creating services
export const checkStripeAccountActive = async (
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

    const { User } = await import("../models/User.model");
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Check if Stripe account is connected and active
    if (!user.stripeAccountId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You must connect your Stripe account before creating services. Please visit your profile to set up payment receiving."
      );
    }

    if (
      !user.stripeOnboardingComplete ||
      user.stripeAccountStatus !== "active"
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Your Stripe account setup is incomplete or not active. Please complete the onboarding process to start receiving payments."
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
