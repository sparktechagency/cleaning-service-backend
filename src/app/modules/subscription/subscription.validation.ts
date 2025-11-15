import { z } from "zod";
import { SubscriptionPlan } from "../../models/Subscription.model";

// Timeline enum for subscription duration
export enum SubscriptionTimeline {
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

const createCheckoutSchema = z.object({
  body: z
    .object({
      plan: z.enum([
        SubscriptionPlan.SILVER,
        SubscriptionPlan.GOLD,
        SubscriptionPlan.PLATINUM,
      ]),
      timeline: z
        .enum([SubscriptionTimeline.MONTHLY, SubscriptionTimeline.YEARLY], {
          required_error: "Timeline is required (MONTHLY or YEARLY)",
          invalid_type_error: "Timeline must be either MONTHLY or YEARLY",
        })
        .default(SubscriptionTimeline.MONTHLY),
      // Support both creditsToRedeem and creditsToUse for backwards compatibility
      creditsToRedeem: z
        .number({
          invalid_type_error: "Credits to redeem must be a number",
        })
        .int("Credits must be an integer")
        .positive("Credits must be positive")
        .optional(),
      creditsToUse: z
        .number({
          invalid_type_error: "Credits to use must be a number",
        })
        .int("Credits must be an integer")
        .positive("Credits must be positive")
        .optional(),
    })
    .refine(
      (data) => {
        // Ensure user doesn't send both creditsToRedeem and creditsToUse
        if (data.creditsToRedeem && data.creditsToUse) {
          return false;
        }
        return true;
      },
      {
        message:
          "Please use either 'creditsToRedeem' or 'creditsToUse', not both",
      }
    ),
});

const cancelSubscriptionSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const subscriptionValidation = {
  createCheckoutSchema,
  cancelSubscriptionSchema,
};
