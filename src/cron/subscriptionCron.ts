import cron from "node-cron";
import { subscriptionService } from "../app/modules/subscription/subscription.service";

/**
 * Cron job to check and downgrade expired subscriptions
 * Runs every day at midnight (00:00)
 */
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

/**
 * Manual trigger function for testing
 */
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
