import mongoose from "mongoose";
import { Referral, ReferralStatus } from "../app/models/Referral.model";
import { User } from "../app/models/User.model";
import { Booking } from "../app/modules/booking/booking.model";
import { NotificationType } from "../app/models";
import { notificationService } from "../app/modules/notification/notification.service";

/**
 * Process referral rewards when an OWNER completes a booking
 * - First booking: Award 10 credits to referrer
 * - Third booking: Award additional 5 credits bonus to referrer
 */
export const processReferralRewards = async (
  customerId: string,
  session?: mongoose.ClientSession
) => {
  try {
    // Find the referral record where this user is the referee
    const referralRecord = await Referral.findOne({
      refereeId: customerId,
      refereeRole: "OWNER",
      status: ReferralStatus.PENDING,
    }).session(session || null);

    // If no referral record exists, this user wasn't referred by anyone
    if (!referralRecord) {
      return;
    }

    // Count completed bookings for this customer
    const completedBookingsCount = await Booking.countDocuments({
      customerId: customerId,
      status: "COMPLETED",
    }).session(session || null);

    // Update the completed bookings count in referral record
    referralRecord.completedBookingsCount = completedBookingsCount;

    let creditsToAward = 0;

    // First booking reward: 10 credits
    if (
      completedBookingsCount === 1 &&
      !referralRecord.firstBookingCreditAwarded
    ) {
      creditsToAward += 10;
      referralRecord.firstBookingCreditAwarded = true;
      referralRecord.creditsEarned += 10;

      // Notify referrer about earning first booking reward
      await notificationService.createNotification({
        recipientId: referralRecord.referrerId,
        type: NotificationType.REFERRAL_REWARD_EARNED,
        title: "Referral Reward Earned!",
        message: `You earned 10 credits! Your referral ${referralRecord.refereeName} completed their first booking.`,
        data: {
          creditsEarned: 10,
          refereeId: customerId,
          refereeName: referralRecord.refereeName,
          rewardType: "first_booking",
          refereeRole: "OWNER",
        },
      });
    }

    // Third booking bonus: Additional 5 credits
    if (
      completedBookingsCount >= 3 &&
      !referralRecord.bonusTierCreditAwarded &&
      referralRecord.firstBookingCreditAwarded
    ) {
      creditsToAward += 5;
      referralRecord.bonusTierCreditAwarded = true;
      referralRecord.creditsEarned += 5;

      // Notify referrer about earning bonus tier reward
      await notificationService.createNotification({
        recipientId: referralRecord.referrerId,
        type: NotificationType.REFERRAL_REWARD_EARNED,
        title: "Bonus Referral Reward!",
        message: `You earned an additional 5 credits! Your referral ${referralRecord.refereeName} completed their 3rd booking.`,
        data: {
          creditsEarned: 5,
          refereeId: customerId,
          refereeName: referralRecord.refereeName,
          rewardType: "bonus_tier_booking",
          refereeRole: "OWNER",
        },
      });
    }

    // If both rewards are awarded, mark referral as COMPLETED
    if (
      referralRecord.firstBookingCreditAwarded &&
      referralRecord.bonusTierCreditAwarded
    ) {
      referralRecord.status = ReferralStatus.COMPLETED;
    }

    // Save referral record updates
    await referralRecord.save({ session: session || undefined });

    // Award credits to referrer if any
    if (creditsToAward > 0) {
      await User.findByIdAndUpdate(
        referralRecord.referrerId,
        { $inc: { credits: creditsToAward } },
        { session: session || undefined }
      );

      // Record transaction for credit earnings
      const { transactionService } = await import(
        "../app/modules/transaction/transaction.service"
      );
      await transactionService.recordCreditEarned({
        userId: referralRecord.referrerId.toString(),
        creditsEarned: creditsToAward,
        reason: `Referral reward from ${referralRecord.refereeName} (Owner)`,
        referralId: referralRecord._id.toString(),
        metadata: {
          refereeId: customerId,
          refereeName: referralRecord.refereeName,
          refereeRole: "OWNER",
          completedBookingsCount,
          firstBookingReward: completedBookingsCount === 1,
          bonusTierReward: completedBookingsCount >= 3,
        },
      });
    }
  } catch (error) {
    console.error("Error processing referral rewards:", error);
    // Don't throw error - referral processing shouldn't block booking completion
  }
};

/**
 * Process referral rewards when a PROVIDER completes a service
 * - First service: Award 10 credits to referrer
 * - Third service: Award additional 5 credits bonus to referrer
 */
export const processProviderReferralRewards = async (
  providerId: string,
  session?: mongoose.ClientSession
) => {
  try {
    // Find the referral record where this provider is the referee
    const referralRecord = await Referral.findOne({
      refereeId: providerId,
      refereeRole: "PROVIDER",
      status: ReferralStatus.PENDING,
    }).session(session || null);

    // If no referral record exists, this provider wasn't referred by anyone
    if (!referralRecord) {
      return;
    }

    // Count completed services (bookings where this user is the provider)
    const completedServicesCount = await Booking.countDocuments({
      providerId: providerId,
      status: "COMPLETED",
    }).session(session || null);

    // Update the completed services count in referral record
    referralRecord.completedServicesCount = completedServicesCount;

    let creditsToAward = 0;

    // First service reward: 10 credits
    if (
      completedServicesCount === 1 &&
      !referralRecord.firstServiceCreditAwarded
    ) {
      creditsToAward += 10;
      referralRecord.firstServiceCreditAwarded = true;
      referralRecord.creditsEarned += 10;

      // Notify referrer about earning first service reward
      await notificationService.createNotification({
        recipientId: referralRecord.referrerId,
        type: NotificationType.REFERRAL_REWARD_EARNED,
        title: "Referral Reward Earned!",
        message: `You earned 10 credits! Your referral ${referralRecord.refereeName} completed their first service.`,
        data: {
          creditsEarned: 10,
          refereeId: providerId,
          refereeName: referralRecord.refereeName,
          rewardType: "first_service",
          refereeRole: "PROVIDER",
        },
      });
    }

    // Third service bonus: Additional 5 credits
    if (
      completedServicesCount >= 3 &&
      !referralRecord.bonusTierServiceCreditAwarded &&
      referralRecord.firstServiceCreditAwarded
    ) {
      creditsToAward += 5;
      referralRecord.bonusTierServiceCreditAwarded = true;
      referralRecord.creditsEarned += 5;

      // Notify referrer about earning bonus tier reward
      await notificationService.createNotification({
        recipientId: referralRecord.referrerId,
        type: NotificationType.REFERRAL_REWARD_EARNED,
        title: "Bonus Referral Reward!",
        message: `You earned an additional 5 credits! Your referral ${referralRecord.refereeName} completed their 3rd service.`,
        data: {
          creditsEarned: 5,
          refereeId: providerId,
          refereeName: referralRecord.refereeName,
          rewardType: "bonus_tier_service",
          refereeRole: "PROVIDER",
        },
      });
    }

    // If both rewards are awarded, mark referral as COMPLETED
    if (
      referralRecord.firstServiceCreditAwarded &&
      referralRecord.bonusTierServiceCreditAwarded
    ) {
      referralRecord.status = ReferralStatus.COMPLETED;
    }

    // Save referral record updates
    await referralRecord.save({ session: session || undefined });

    // Award credits to referrer if any
    if (creditsToAward > 0) {
      await User.findByIdAndUpdate(
        referralRecord.referrerId,
        { $inc: { credits: creditsToAward } },
        { session: session || undefined }
      );

      // Record transaction for credit earnings
      const { transactionService } = await import(
        "../app/modules/transaction/transaction.service"
      );
      await transactionService.recordCreditEarned({
        userId: referralRecord.referrerId.toString(),
        creditsEarned: creditsToAward,
        reason: `Referral reward from ${referralRecord.refereeName} (Provider)`,
        referralId: referralRecord._id.toString(),
        metadata: {
          refereeId: providerId,
          refereeName: referralRecord.refereeName,
          refereeRole: "PROVIDER",
          completedServicesCount,
          firstServiceReward: completedServicesCount === 1,
          bonusTierReward: completedServicesCount >= 3,
        },
      });
    }
  } catch (error) {
    console.error("Error processing provider referral rewards:", error);
  }
};

/**
 * Get referral progress for a user (how many bookings/services until next reward)
 */
export const getReferralProgress = async (userId: string) => {
  try {
    const referralRecord = await Referral.findOne({
      refereeId: userId,
    });

    if (!referralRecord) {
      return null;
    }

    const isOwner = referralRecord.refereeRole === "OWNER";
    const isProvider = referralRecord.refereeRole === "PROVIDER";

    if (isOwner) {
      const completedBookings = referralRecord.completedBookingsCount;
      const firstBookingRewardEarned = referralRecord.firstBookingCreditAwarded;
      const bonusTierRewardEarned = referralRecord.bonusTierCreditAwarded;

      let nextRewardAt: number | null = null;
      let nextRewardAmount: number | null = null;

      if (!firstBookingRewardEarned) {
        nextRewardAt = 1;
        nextRewardAmount = 10;
      } else if (!bonusTierRewardEarned) {
        nextRewardAt = 3;
        nextRewardAmount = 5;
      }

      return {
        hasReferrer: true,
        role: "OWNER",
        completedBookings,
        firstBookingRewardEarned,
        bonusTierRewardEarned,
        nextRewardAt,
        nextRewardAmount,
        activityType: "bookings",
      };
    } else if (isProvider) {
      const completedServices = referralRecord.completedServicesCount;
      const firstServiceRewardEarned = referralRecord.firstServiceCreditAwarded;
      const bonusTierRewardEarned =
        referralRecord.bonusTierServiceCreditAwarded;

      let nextRewardAt: number | null = null;
      let nextRewardAmount: number | null = null;

      if (!firstServiceRewardEarned) {
        nextRewardAt = 1;
        nextRewardAmount = 10;
      } else if (!bonusTierRewardEarned) {
        nextRewardAt = 3;
        nextRewardAmount = 5;
      }

      return {
        hasReferrer: true,
        role: "PROVIDER",
        completedServices,
        firstServiceRewardEarned,
        bonusTierRewardEarned,
        nextRewardAt,
        nextRewardAmount,
        activityType: "services",
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting referral progress:", error);
    return null;
  }
};
