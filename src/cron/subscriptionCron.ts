import cron from "node-cron";
import { subscriptionService } from "../app/modules/subscription/subscription.service";

//  Cron job to check and downgrade expired subscriptions
//  Runs every day at midnight (00:00)
export const startSubscriptionCronJob = () => {
  // Run every day at midnight
  cron.schedule("0 0 * * *", async () => {
    try {
      await subscriptionService.downgradeExpiredSubscriptions();
    } catch (error) {
      // Error processing expired subscriptions
    }
  });
};

//  Manual trigger function for testing monthly limit reset
export const startMonthlyLimitResetCronJob = () => {
  cron.schedule("0 0 1 * *", async () => {
    try {
      await subscriptionService.resetMonthlyBookingLimits();
    } catch (error) {
      // Error resetting monthly booking limits
    }
  });
};

//  Manual trigger function for testing
export const triggerSubscriptionCheck = async () => {
  try {
    const result = await subscriptionService.downgradeExpiredSubscriptions();
    return result;
  } catch (error) {
    throw error;
  }
};

//  Manual trigger function for testing monthly limit reset
export const triggerMonthlyLimitReset = async () => {
  try {
    const result = await subscriptionService.resetMonthlyBookingLimits();
    return result;
  } catch (error) {
    throw error;
  }
};
