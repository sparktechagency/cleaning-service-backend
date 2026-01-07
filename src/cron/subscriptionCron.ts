import cron from "node-cron";
import { subscriptionService } from "../app/modules/subscription/subscription.service";

//  Cron job to check and downgrade expired subscriptions
//  Runs every day at midnight (00:00)
export const startSubscriptionCronJob = () => {
  // Run every day at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Checking for expired subscriptions...");

    try {
      const result = await subscriptionService.downgradeExpiredSubscriptions();

      console.log(`[CRON] Processed ${result.processed} expired subscriptions`);

      if (result.processed > 0) {
        console.log("[CRON] Downgrade results:", result.results);
      }
    } catch (error) {
      console.error("[CRON] Error processing expired subscriptions:", error);
    }
  });

  console.log(
    "[CRON] Subscription expiry check job started (runs daily at midnight)"
  );
};

//  Manual trigger function for testing monthly limit reset
export const startMonthlyLimitResetCronJob = () => {
  cron.schedule("0 0 1 * *", async () => {
    console.log(
      "[CRON] Resetting monthly booking limits for FREE plan providers..."
    );

    try {
      const result = await subscriptionService.resetMonthlyBookingLimits();

      console.log(
        `[CRON] Reset booking limit status for ${result.resetCount} FREE plan providers`
      );
    } catch (error) {
      console.error("[CRON] Error resetting monthly booking limits:", error);
    }
  });

  console.log(
    "[CRON] Monthly booking limit reset job started (runs on 1st of each month at midnight UTC - FREE plans only)"
  );
};

//  Manual trigger function for testing
export const triggerSubscriptionCheck = async () => {
  console.log("[MANUAL] Triggering subscription expiry check...");

  try {
    const result = await subscriptionService.downgradeExpiredSubscriptions();

    console.log(`[MANUAL] Processed ${result.processed} expired subscriptions`);

    return result;
  } catch (error) {
    console.error("[MANUAL] Error processing expired subscriptions:", error);
    throw error;
  }
};

//  Manual trigger function for testing monthly limit reset
export const triggerMonthlyLimitReset = async () => {
  console.log("[MANUAL] Triggering monthly booking limit reset...");

  try {
    const result = await subscriptionService.resetMonthlyBookingLimits();

    console.log(
      `[MANUAL] Reset booking limit status for ${result.resetCount} providers`
    );

    return result;
  } catch (error) {
    console.error("[MANUAL] Error resetting monthly booking limits:", error);
    throw error;
  }
};
