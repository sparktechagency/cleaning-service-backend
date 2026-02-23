import mongoose from "mongoose";
import { Booking } from "./booking.model";
import { Service } from "../service/service.model";
import { User } from "../../models/User.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import QRCode from "qrcode";
import crypto from "crypto";
import { notificationService } from "../notification/notification.service";
import { subscriptionService } from "../subscription/subscription.service";
import { transactionService } from "../transaction/transaction.service";
import { NotificationType, TempBooking } from "../../models";
import { processReferralRewards } from "../../../utils/ReferralRewards";
import Stripe from "stripe";
import config from "../../../config";

const stripe = new Stripe(config.stripe_key as string, {
  apiVersion: "2024-06-20",
});

type CreateBookingPayload = {
  serviceId: string;
  scheduledDate: string;
  scheduledTime: string;
  phoneNumber: string;
  address: {
    city: string;
    latitude: number;
    longitude: number;
  };
  description?: string;
  serviceDuration: number;
  paymentMethod: "STRIPE";
};

// Helper function to generate unique completion code
const generateCompletionCode = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

// Create temp booking and initiate payment immediately
const createBooking = async (
  customerId: string,
  payload: CreateBookingPayload,
) => {
  // Step 1: Validate customer
  const customer = await User.findById(customerId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, "Customer not found");
  }

  // Step 2: Validate service
  const service = await Service.findById(payload.serviceId)
    .select("+workSchedule +bufferTime")
    .populate(
      "providerId",
      "email userName stripeAccountId stripeOnboardingComplete stripeAccountStatus",
    );
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Step 3: Validate and combine scheduled date and time
  // Combine date and time in ISO format (treating as UTC)
  const scheduledDateTimeString = `${payload.scheduledDate}T${payload.scheduledTime}:00.000Z`;
  const scheduledDate = new Date(scheduledDateTimeString);

  // Validate date is valid
  if (isNaN(scheduledDate.getTime())) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid scheduled date or time",
    );
  }

  // Check if booking is in the past
  const currentTime = Date.now();
  if (scheduledDate.getTime() < currentTime) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You cannot book a service in the past",
    );
  }

  // Validate booking is at least 30 minutes in the future
  const minimumAdvanceMs = 30 * 60 * 1000; // 30 minutes in milliseconds
  const minimumBookingTime = currentTime + minimumAdvanceMs;

  if (scheduledDate.getTime() < minimumBookingTime) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You must book a service at least 30 minutes before it starts",
    );
  }

  // Step 3.5: Validate day-of-week availability
  if (service.workSchedule) {
    const dayOfWeek = scheduledDate.getUTCDay();
    const dayMap = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ] as const;
    const dayKey = dayMap[dayOfWeek];
    const daySchedule = service.workSchedule[dayKey];

    if (daySchedule && daySchedule.isAvailable === false) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `This service is not available on ${daySchedule.day}s. Please choose another date.`,
      );
    }

    // Step 3.6: Validate time-range availability
    if (
      daySchedule &&
      daySchedule.isAvailable &&
      daySchedule.startTime &&
      daySchedule.endTime
    ) {
      // Function to parse "HH:MM" to minutes since midnight
      const parseTimeToMinutes = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };

      // Function to format minutes to "HH:MM"
      const formatMinutesToTime = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, "0")}:${mins
          .toString()
          .padStart(2, "0")}`;
      };

      // Get booking start time in minutes (UTC)
      const bookingStartMinutes =
        scheduledDate.getUTCHours() * 60 + scheduledDate.getUTCMinutes();

      // Calculate booking end time in minutes
      const bookingEndMinutes =
        bookingStartMinutes + payload.serviceDuration * 60;

      // Parse provider's working hours
      const providerStartMinutes = parseTimeToMinutes(daySchedule.startTime);
      const providerEndMinutes = parseTimeToMinutes(daySchedule.endTime);

      // Validate booking start time
      if (bookingStartMinutes < providerStartMinutes) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Booking starts at ${formatMinutesToTime(
            bookingStartMinutes,
          )} but provider is only available from ${daySchedule.startTime} on ${
            daySchedule.day
          }s. Please choose another time.`,
        );
      }

      // Validate booking end time
      if (bookingEndMinutes > providerEndMinutes) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Booking ends at ${formatMinutesToTime(
            bookingEndMinutes,
          )} but provider is only available until ${daySchedule.endTime} on ${
            daySchedule.day
          }s. Please choose another time.`,
        );
      }
    }
  }

  // Step 4: Validate service duration
  if (payload.serviceDuration <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Service duration must be greater than 0",
    );
  }

  // Step 5: Calculate total amount
  const ratePerHour = parseFloat(service.rateByHour);
  const totalAmount = ratePerHour * payload.serviceDuration;

  // Step 6: Validate provider's Stripe account
  const provider = service.providerId as any;
  if (!provider || !provider.stripeAccountId) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      "This provider has not connected their payment account yet. Please choose another provider or try again later.",
    );
  }

  if (
    !provider.stripeOnboardingComplete ||
    provider.stripeAccountStatus !== "active"
  ) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      "This provider's payment account is not fully activated yet. Please choose another provider or try again later.",
    );
  }

  // Step 7: Check for booking conflicts (PENDING or ONGOING bookings)
  // Include bufferTime in end time calculation
  const serviceBufferTime = service.bufferTime || 0;
  const scheduledEndTime = new Date(scheduledDate);
  scheduledEndTime.setMinutes(
    scheduledEndTime.getMinutes() +
      payload.serviceDuration * 60 +
      serviceBufferTime,
  );

  const conflictingBooking = await Booking.findOne({
    providerId: provider._id,
    status: { $in: ["PENDING", "ONGOING"] },
    $or: [
      {
        // New booking starts during existing booking (including buffer)
        // Use $gt for exclusive end time (matches available slots logic)
        scheduledAt: { $lte: scheduledDate },
        $expr: {
          $gt: [
            {
              $add: [
                "$scheduledAt",
                { $multiply: ["$serviceDuration", 60 * 60 * 1000] },
                { $multiply: ["$bufferTime", 60 * 1000] },
              ],
            },
            scheduledDate,
          ],
        },
      },
      {
        // New booking ends during existing booking
        scheduledAt: { $lt: scheduledEndTime },
        $expr: {
          $gt: [
            {
              $add: [
                "$scheduledAt",
                { $multiply: ["$serviceDuration", 60 * 60 * 1000] },
                { $multiply: ["$bufferTime", 60 * 1000] },
              ],
            },
            scheduledEndTime,
          ],
        },
      },
      {
        // New booking completely overlaps existing booking
        scheduledAt: { $gte: scheduledDate, $lt: scheduledEndTime },
      },
    ],
  });

  if (conflictingBooking) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `This provider already has a ${conflictingBooking.status.toLowerCase()} booking at this time. Please choose a different time slot.`,
    );
  }

  // Step 7.5: Check for TempBooking conflicts (pending payment - race condition prevention)
  // This prevents two users from initiating payment for the same time slot
  const conflictingTempBooking = await TempBooking.findOne({
    providerId: provider._id,
    $or: [
      {
        // New booking starts during existing temp booking (including buffer)
        scheduledAt: { $lte: scheduledDate },
        $expr: {
          $gt: [
            {
              $add: [
                "$scheduledAt",
                { $multiply: ["$serviceDuration", 60 * 60 * 1000] },
                { $multiply: ["$bufferTime", 60 * 1000] },
              ],
            },
            scheduledDate,
          ],
        },
      },
      {
        // New booking ends during existing temp booking
        scheduledAt: { $lt: scheduledEndTime },
        $expr: {
          $gt: [
            {
              $add: [
                "$scheduledAt",
                { $multiply: ["$serviceDuration", 60 * 60 * 1000] },
                { $multiply: ["$bufferTime", 60 * 1000] },
              ],
            },
            scheduledEndTime,
          ],
        },
      },
      {
        // New booking completely overlaps existing temp booking
        scheduledAt: { $gte: scheduledDate, $lt: scheduledEndTime },
      },
    ],
  });

  if (conflictingTempBooking) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "A payment is currently in progress for this time slot. You can try again in about 10 minutes if the payment isn't completed, or feel free to choose a different time slot.",
    );
  }

  // Step 8: Generate unique booking ID (will be used for both temp and permanent)
  const bookingId = new mongoose.Types.ObjectId();

  // Step 9: Create temporary booking with pre-generated ID
  const tempBookingData = {
    customerId,
    serviceId: service._id,
    providerId: provider._id,
    scheduledAt: scheduledDate,
    phoneNumber: payload.phoneNumber,
    address: payload.address,
    description: payload.description,
    serviceDuration: payload.serviceDuration,
    bufferTime: serviceBufferTime,
    totalAmount: totalAmount,
    paymentMethod: payload.paymentMethod,
  };

  const tempBooking = await TempBooking.create({
    _id: bookingId,
    ...tempBookingData,
  });

  // Step 10: Get or create Stripe customer for owner
  let ownerStripeCustomerId = customer.stripeCustomerId;

  // Check for currency conflicts
  if (ownerStripeCustomerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(
        ownerStripeCustomerId,
      );

      if (existingCustomer && !existingCustomer.deleted) {
        const subscriptions = await stripe.subscriptions.list({
          customer: ownerStripeCustomerId,
          limit: 1,
        });

        // If customer has USD subscriptions, create new EUR customer
        if (subscriptions.data.length > 0) {
          const newCustomer = await stripe.customers.create({
            email: customer.email,
            name: customer.userName,
            metadata: {
              userId: customer._id.toString(),
              currency: "EUR",
              migratedFrom: ownerStripeCustomerId,
            },
          });

          ownerStripeCustomerId = newCustomer.id;
          await User.findByIdAndUpdate(customer._id, {
            stripeCustomerId: newCustomer.id,
            stripeCustomerIdUSD: customer.stripeCustomerId,
          });
        }
      }
    } catch (error: any) {
      if (error.code === "resource_missing" || error.statusCode === 404) {
        ownerStripeCustomerId = "";
      }
    }
  }

  // Create new customer if needed
  if (!ownerStripeCustomerId) {
    const newCustomer = await stripe.customers.create({
      email: customer.email,
      name: customer.userName,
      metadata: {
        userId: customer._id.toString(),
        currency: "EUR",
      },
    });
    ownerStripeCustomerId = newCustomer.id;
    await User.findByIdAndUpdate(customer._id, {
      stripeCustomerId: newCustomer.id,
    });
  }

  // Step 11: Create Stripe Checkout Session
  const successUrl = `${config.payment_success_url}`;
  const cancelUrl = `${config.payment_cancel_url}`;

  const session = await stripe.checkout.sessions.create({
    customer: ownerStripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Service Booking - ${service.name}`,
            description: `${
              payload.serviceDuration
            }h service on ${scheduledDate.toLocaleDateString()}`,
          },
          unit_amount: Math.round(totalAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      bookingId: bookingId.toString(),
      customerId: customer._id.toString(),
      serviceId: service._id.toString(),
      providerId: provider._id.toString(),
      providerStripeAccountId: provider.stripeAccountId,
      type: "booking_payment",
    },
    payment_intent_data: {
      description: `Booking for ${service.name}`,
      metadata: {
        bookingId: bookingId.toString(),
        customerId: customer._id.toString(),
        serviceId: service._id.toString(),
        providerId: provider._id.toString(),
        providerStripeAccountId: provider.stripeAccountId,
        type: "booking_payment",
      },
      // Direct transfer to provider
      transfer_data: {
        destination: provider.stripeAccountId,
      },
    },
  });

  // Step 12: Update temp booking with session ID
  await TempBooking.findByIdAndUpdate(bookingId, {
    stripeSessionId: session.id,
  });

  // Step 13: Return payment URL and booking info
  return {
    bookingId: bookingId.toString(),
    sessionId: session.id,
    paymentUrl: session.url,
    totalAmount: totalAmount,
    serviceName: service.name,
    scheduledAt: scheduledDate,
    message:
      "Temporary booking created. Please complete payment to confirm your booking.",
  };
};

// Confirm booking after successful payment with retry logic
const confirmBookingAfterPayment = async (
  bookingId: string,
  paymentIntentId: string,
  retryCount = 0,
): Promise<any> => {
  const MAX_RETRIES = 3;

  // Helper function to record transaction for existing booking
  const recordTransactionForBooking = async (booking: any) => {
    try {
      const customerIdStr =
        booking.customerId?._id?.toString() || booking.customerId?.toString();
      const providerIdStr =
        booking.providerId?._id?.toString() || booking.providerId?.toString();

      if (customerIdStr && providerIdStr) {
        // Check if transaction already exists for this booking
        const { Transaction } = await import("../../models/Transaction.model");
        const existingTransaction = await Transaction.findOne({
          bookingId: booking._id,
          transactionType: "BOOKING_PAYMENT",
        });

        if (!existingTransaction) {
          const [customerUser, providerUser, service] = await Promise.all([
            User.findById(customerIdStr).select("stripeCustomerId").lean(),
            User.findById(providerIdStr).select("stripeAccountId").lean(),
            Service.findById(booking.serviceId).select("name").lean(),
          ]);

          await transactionService.recordBookingPayment({
            bookingId: booking._id.toString(),
            ownerId: customerIdStr,
            providerId: providerIdStr,
            amount: booking.totalAmount,
            stripePaymentIntentId: paymentIntentId,
            stripeCustomerId: customerUser?.stripeCustomerId || "",
            stripeConnectAccountId: providerUser?.stripeAccountId || "",
            metadata: {
              bookingNumber: booking._id.toString().slice(-6),
              serviceName: service?.name,
              scheduledAt: booking.scheduledAt,
            },
          });
        }
      }
    } catch (transactionError) {
      // Failed to record booking transaction - non-blocking
    }
  };

  // Step 1: Check if booking already exists OUTSIDE transaction (faster)
  const existingBooking = await Booking.findById(bookingId);

  if (existingBooking && existingBooking.payment.status === "PAID") {
    // Booking already confirmed, clean up temp booking and record transaction if missing
    await TempBooking.findByIdAndDelete(bookingId);
    await recordTransactionForBooking(existingBooking);
    return existingBooking;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Step 2: Find and delete temp booking atomically
    const tempBooking =
      await TempBooking.findByIdAndDelete(bookingId).session(session);

    if (!tempBooking) {
      // Temp booking might have expired or already been processed
      await session.abortTransaction();

      // Double-check if booking was created by another webhook
      const bookingCreated = await Booking.findById(bookingId);

      if (bookingCreated) {
        await recordTransactionForBooking(bookingCreated);
        return bookingCreated;
      }

      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Temporary booking not found or already processed",
      );
    }

    // Step 3: Fetch service to check needApproval flag
    const service = await Service.findById(tempBooking.serviceId)
      .select("name needApproval")
      .session(session);

    if (!service) {
      await session.abortTransaction();
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }

    // Determine booking status:
    // needApproval === false => instant booking (ONGOING)
    // needApproval === true or undefined => requires provider approval (PENDING)
    const bookingStatus =
      service.needApproval === false
        ? ("ONGOING" as const)
        : ("PENDING" as const);

    // Step 4: Create permanent booking with same ID
    const bookingData = {
      _id: bookingId,
      customerId: tempBooking.customerId,
      serviceId: tempBooking.serviceId,
      providerId: tempBooking.providerId,
      scheduledAt: tempBooking.scheduledAt,
      phoneNumber: tempBooking.phoneNumber,
      address: tempBooking.address,
      description: tempBooking.description,
      serviceDuration: tempBooking.serviceDuration,
      bufferTime: (tempBooking as any).bufferTime || 0,
      totalAmount: tempBooking.totalAmount,
      status: bookingStatus,
      payment: {
        method: tempBooking.paymentMethod,
        status: "PAID" as const,
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
      },
    };

    const booking = await Booking.create([bookingData], { session });
    const createdBooking = booking[0];

    await session.commitTransaction();

    // Step 5: Send notifications (after transaction commits)
    const providerIdStr =
      createdBooking.providerId?._id?.toString() ||
      createdBooking.providerId?.toString();
    const customerIdStr =
      createdBooking.customerId?._id?.toString() ||
      createdBooking.customerId?.toString();

    if (bookingStatus === "ONGOING") {
      // Instant booking — no provider approval needed
      if (providerIdStr && customerIdStr) {
        await notificationService.createNotification({
          recipientId: providerIdStr,
          senderId: customerIdStr,
          type: NotificationType.BOOKING_ACCEPTED,
          title: "New Booking Auto-Confirmed!",
          message: `A new booking for ${service.name} has been automatically confirmed. Payment completed.`,
          data: {
            bookingId: createdBooking._id.toString(),
            serviceId: service._id.toString(),
            serviceName: service.name,
            scheduledAt: createdBooking.scheduledAt,
            totalAmount: createdBooking.totalAmount,
          },
        });
      }
      if (customerIdStr) {
        await notificationService.createNotification({
          recipientId: customerIdStr,
          type: NotificationType.BOOKING_ACCEPTED,
          title: "Booking Confirmed & Active!",
          message: `Your booking for ${service.name} is confirmed and active. No provider approval needed.`,
          data: {
            bookingId: createdBooking._id.toString(),
            serviceId: service._id.toString(),
            serviceName: service.name,
            scheduledAt: createdBooking.scheduledAt,
            totalAmount: createdBooking.totalAmount,
          },
        });
      }
    } else {
      // Standard booking — needs provider approval
      if (providerIdStr && customerIdStr) {
        await notificationService.createNotification({
          recipientId: providerIdStr,
          senderId: customerIdStr,
          type: NotificationType.BOOKING_CREATED,
          title: "New Booking Request!",
          message: `You have a new paid booking request for ${service.name}. The payment is already completed.`,
          data: {
            bookingId: createdBooking._id.toString(),
            serviceId: service._id.toString(),
            serviceName: service.name,
            scheduledAt: createdBooking.scheduledAt,
            totalAmount: createdBooking.totalAmount,
          },
        });
      }
      if (customerIdStr) {
        await notificationService.createNotification({
          recipientId: customerIdStr,
          type: NotificationType.BOOKING_CREATED,
          title: "Booking Confirmed!",
          message: `Your booking for ${service.name} has been confirmed. Payment completed. Waiting for provider approval.`,
          data: {
            bookingId: createdBooking._id.toString(),
            serviceId: service._id.toString(),
            serviceName: service.name,
            scheduledAt: createdBooking.scheduledAt,
            totalAmount: createdBooking.totalAmount,
          },
        });
      }
    }

    // Check provider's booking limit and send notification if exceeded
    if (createdBooking.providerId) {
      const providerIdForLimit =
        createdBooking.providerId?._id?.toString() ||
        createdBooking.providerId?.toString();
      if (providerIdForLimit) {
        try {
          await subscriptionService.checkAndNotifyProviderLimit(
            providerIdForLimit,
          );
        } catch (err) {
          // Non-critical - don't fail the booking
        }
      }
    }

    // Step 6: Record transaction (outside MongoDB session for safety)
    await recordTransactionForBooking(createdBooking);

    // Step 7: Return populated booking
    const populatedBooking = await Booking.findById(createdBooking._id)
      .populate("serviceId", "name rateByHour coverImages")
      .populate("providerId", "userName profilePicture email");

    return populatedBooking;
  } catch (error: any) {
    await session.abortTransaction();

    // Handle write conflict errors with retry
    if (
      error.message?.includes("Write conflict") ||
      error.code === 112 ||
      error.codeName === "WriteConflict"
    ) {
      if (retryCount < MAX_RETRIES) {
        // Wait with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount)),
        );
        return confirmBookingAfterPayment(
          bookingId,
          paymentIntentId,
          retryCount + 1,
        );
      } else {
        // Last attempt: Check if booking was created successfully
        const finalCheck = await Booking.findById(bookingId);

        if (finalCheck) {
          await recordTransactionForBooking(finalCheck);
          return finalCheck;
        }
      }
    }

    throw error;
  } finally {
    session.endSession();
  }
};

const getBookingsByCustomer = async (
  customerId: string,
  options: { status?: string; page?: number; limit?: number },
) => {
  const { status, page = 1, limit = 10 } = options;

  const query: any = { customerId };
  if (status) {
    query.status = status;
  }

  const total = await Booking.countDocuments(query);
  const bookings = await Booking.find(query, {
    id: 1,
    address: 1,
    phoneNumber: 1,
    description: 1,
    serviceDuration: 1,
    totalAmount: 1,
    status: 1,
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  // Transform the response to only include required fields
  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return {
    bookings: transformedBookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getBookingsByProvider = async (
  providerId: string,
  options: { status?: string; page?: number; limit?: number },
) => {
  const { status, page = 1, limit = 10 } = options;

  const query: any = { providerId };
  if (status) {
    query.status = status;
  }

  const total = await Booking.countDocuments(query);
  const bookings = await Booking.find(query, {
    id: 1,
    address: 1,
    phoneNumber: 1,
    description: 1,
    serviceDuration: 1,
    totalAmount: 1,
    status: 1,
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit);

  // Transform the response to only include required fields
  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });
  return {
    bookings: transformedBookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getOwnerBookingOverview = async (bookingId: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate(
      "serviceId",
      "name coverImages rateByHour description ratingsAverage ratings reviews totalOrders needApproval",
    )
    .populate(
      "providerId",
      "_id userName email profilePicture phoneNumber address experience aboutMe",
    );

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Check if user is authorized to view this booking
  const customerIdStr =
    booking.customerId?._id?.toString() || booking.customerId?.toString() || "";
  const providerIdStr =
    booking.providerId?._id?.toString() || booking.providerId?.toString() || "";
  const isCustomer = customerIdStr === userId;
  const isProvider = providerIdStr === userId;

  if (!isCustomer && !isProvider) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  // Transform the response to include only requested fields
  const service = booking.serviceId as any;
  const provider = booking.providerId as any;

  const response = {
    id: booking._id,
    service: {
      name: service?.name || "Service Unavailable",
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      rateByHour: service?.rateByHour || 0,
      ratingsAverage: service?.ratingsAverage || 0,
      ratings: service?.ratings || 0,
      reviews: service?.reviews || 0,
      totalOrders: service?.totalOrders || 0,
      instantBooking: service?.needApproval || false,
      description: service?.description || "",
      allImages: service?.coverImages || [],
    },
    provider: {
      id: provider?._id || null,
      name: provider?.userName || "Unknown Provider",
      profilePicture: provider?.profilePicture || null,
      phoneNumber: provider?.phoneNumber || "",
      email: provider?.email || "",
      address: provider?.address || null,
      experience: provider?.experience || "",
      aboutMe: provider?.aboutMe || "",
    },
  };

  return response;
};

const getProviderBookingOverview = async (
  bookingId: string,
  userId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("serviceId", "name coverImages rateByHour description")
    .populate(
      "customerId",
      "_id userName email phoneNumber address experience aboutMe",
    );

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const isProvider = booking.providerId?.toString() === userId;

  if (!isProvider) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  const service = booking.serviceId as any;
  const customer = booking.customerId as any;

  const response = {
    id: booking._id,
    booking: {
      scheduledAt: booking.scheduledAt,
      name: service?.name || "Service Unavailable",
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      address: booking.address,
      phoneNumber: booking.phoneNumber,
      description: booking.description,
      rateByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    },
    customer: {
      id: customer?._id || null,
      name: customer?.userName || "Unknown Customer",
      phoneNumber: customer?.phoneNumber || "",
      email: customer?.email || "",
      address: customer?.address || null,
      description: booking.description,
    },
  };

  return response;
};

const acceptBookingByProvider = async (
  bookingId: string,
  providerId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.providerId?.toString() !== providerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the assigned provider can accept this booking",
    );
  }

  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be accepted",
    );
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "ONGOING" },
    { new: true },
  ).populate("serviceId", "name");

  // Send notifications
  // Notify owner that booking was accepted
  const serviceName = (updatedBooking!.serviceId as any)?.name || "a service";
  const customerIdStr =
    updatedBooking!.customerId?._id?.toString() ||
    updatedBooking!.customerId?.toString() ||
    "";
  if (customerIdStr) {
    await notificationService.createNotification({
      recipientId: customerIdStr,
      senderId: providerId,
      type: NotificationType.BOOKING_ACCEPTED,
      title: "Booking Accepted",
      message: `Your booking request for ${serviceName} has been confirmed by the provider`,
      data: {
        bookingId: bookingId,
        serviceId: updatedBooking!.serviceId?._id?.toString() || bookingId,
        serviceName: serviceName,
      },
    });
  }

  // Notify provider (confirmation for themselves)
  await notificationService.createNotification({
    recipientId: providerId,
    type: NotificationType.BOOKING_ACCEPTED,
    title: "Booking Confirmed",
    message: `You have confirmed the booking request for ${serviceName}`,
    data: {
      bookingId: bookingId,
      serviceId: updatedBooking!.serviceId?._id?.toString() || bookingId,
      serviceName: serviceName,
    },
  });

  // Check if provider has reached their booking limit and notify
  try {
    await subscriptionService.checkAndNotifyProviderLimit(providerId);
  } catch (err) {
    // Non-critical - don't fail the booking acceptance
  }

  return updatedBooking;
};

const rejectBookingByProvider = async (
  bookingId: string,
  providerId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId).populate(
    "customerId",
    "userName",
  );
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.providerId?.toString() !== providerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the assigned provider can reject this booking",
    );
  }

  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be rejected",
    );
  }

  // Check if payment was made - if PAID, process refund
  if (booking.payment.status === "PAID") {
    const { paymentService } = await import("../payment/payment.service");
    await paymentService.refundBookingByStatus(
      bookingId,
      "Provider rejected the booking request",
      "provider",
    );
    // Note: refundBookingByStatus already updates status to CANCELLED
    return await Booking.findById(bookingId);
  }

  // If payment not made (UNPAID), just cancel the booking
  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "CANCELLED" },
    { new: true },
  );

  // Send notification to owner about rejection
  const customerIdStr =
    booking.customerId &&
    typeof booking.customerId === "object" &&
    booking.customerId._id
      ? booking.customerId._id.toString()
      : booking.customerId?.toString();

  if (customerIdStr) {
    await notificationService.createNotification({
      recipientId: customerIdStr,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Booking Request Rejected",
      message: `Provider has rejected your booking request #${booking._id
        .toString()
        .slice(-6)}`,
      data: {
        bookingId: booking._id.toString(),
      },
    });
  }

  return updatedBooking;
};

const cancelBookingByOwner = async (bookingId: string, customerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId).populate(
    "providerId",
    "userName",
  );
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const bookingCustomerId =
    booking.customerId?._id?.toString() || booking.customerId?.toString() || "";
  if (bookingCustomerId !== customerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the booking owner can cancel this booking",
    );
  }

  // Block cancellation for ONGOING bookings (both manually accepted and auto-confirmed)
  if (booking.status === "ONGOING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot cancel an ongoing booking. Please contact the provider or request a refund.",
    );
  }

  // Only allow cancellation of PENDING bookings
  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be cancelled by the owner",
    );
  }

  // Check if payment was made - if PAID, process refund
  if (booking.payment.status === "PAID") {
    const { paymentService } = await import("../payment/payment.service");
    await paymentService.refundBookingByStatus(
      bookingId,
      "Owner cancelled booking before provider acceptance",
      "owner",
    );
    // Note: refundBookingByStatus already updates status to CANCELLED
    return await Booking.findById(bookingId);
  }

  // If payment not made (UNPAID), just cancel the booking
  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "CANCELLED" },
    { new: true },
  );

  // Send notification to provider (if assigned)
  const providerIdStr =
    booking.providerId &&
    typeof booking.providerId === "object" &&
    booking.providerId._id
      ? booking.providerId._id.toString()
      : booking.providerId?.toString();

  if (providerIdStr) {
    await notificationService.createNotification({
      recipientId: providerIdStr,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Booking Cancelled",
      message: `Owner has cancelled booking #${booking._id
        .toString()
        .slice(-6)}`,
      data: {
        bookingId: booking._id.toString(),
      },
    });
  }

  return updatedBooking;
};

const generateCompletionQRCodeByProvider = async (
  bookingId: string,
  providerId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Only the assigned provider can generate QR code
  if (booking.providerId?.toString() !== providerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the assigned provider can generate QR code for this booking",
    );
  }

  // Only ONGOING bookings can have QR code generated
  if (booking.status !== "ONGOING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only ongoing bookings can have completion QR code generated",
    );
  }

  // Generate unique completion code
  const completionCode = generateCompletionCode();

  // Create QR code data (booking ID + completion code for security)
  const qrCodeData = JSON.stringify({
    bookingId: booking._id,
    completionCode: completionCode,
    providerId: providerId,
    timestamp: new Date().toISOString(),
  });

  try {
    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(qrCodeData);

    // Update booking with completion code and QR code URL
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        completionCode: completionCode,
        qrCodeUrl: qrCodeUrl,
      },
      { new: true },
    );

    return {
      bookingId: booking._id,
      qrCodeUrl: qrCodeUrl,
      completionCode: completionCode,
      message:
        "QR code generated successfully. Share this with the customer to complete the booking.",
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to generate QR code",
    );
  }
};

const completeBookingByOwner = async (
  bookingId: string,
  completionCode: string,
  ownerId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("serviceId", "name")
    .populate("providerId", "userName");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Verify the owner is the correct customer
  const bookingCustomerId =
    booking.customerId?._id?.toString() || booking.customerId?.toString() || "";
  if (bookingCustomerId !== ownerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only complete your own bookings",
    );
  }

  // Verify the completion code matches
  if (booking.completionCode !== completionCode) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid completion code");
  }

  // Only ONGOING bookings can be completed via QR code
  if (booking.status !== "ONGOING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only ongoing bookings can be completed",
    );
  }

  // Update booking status to COMPLETED
  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "COMPLETED" },
    { new: true },
  )
    .populate("serviceId", "name")
    .populate("providerId", "userName");

  // Send notifications
  // Notify provider that booking was completed
  const serviceName = (updatedBooking!.serviceId as any)?.name || "a service";
  let providerIdStr: string | null = null;
  if (updatedBooking!.providerId) {
    providerIdStr =
      typeof updatedBooking!.providerId === "object"
        ? (updatedBooking!.providerId as any)._id?.toString()
        : (updatedBooking!.providerId as any)?.toString();

    await notificationService.createNotification({
      recipientId: providerIdStr,
      senderId: ownerId,
      type: NotificationType.BOOKING_COMPLETED,
      title: "Booking Completed",
      message: `You have successfully completed a booking for ${serviceName}`,
      data: {
        bookingId: bookingId,
        serviceId: updatedBooking!.serviceId?._id?.toString() || bookingId,
        serviceName: serviceName,
      },
    });
  }

  // Notify owner that booking was completed
  await notificationService.createNotification({
    recipientId: ownerId,
    type: NotificationType.BOOKING_COMPLETED,
    title: "Service Completed",
    message: `You have successfully enjoyed the service ${serviceName}. You can now rate and review!`,
    data: {
      bookingId: bookingId,
      serviceId: updatedBooking!.serviceId?._id?.toString() || bookingId,
      serviceName: serviceName,
    },
  });

  // Process referral rewards for owner (10 credits for first booking, 5 bonus for 3rd booking)
  await processReferralRewards(ownerId);

  // Process referral rewards for provider (10 credits for first service, 5 bonus for 3rd service)
  if (providerIdStr) {
    const { processProviderReferralRewards } =
      await import("../../../utils/ReferralRewards");
    await processProviderReferralRewards(providerIdStr);
  }

  return {
    booking: updatedBooking,
    message:
      "Booking completed successfully! You can now rate and review the service.",
  };
};

const getOwnerAllPendingBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "PENDING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ createdAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getProviderAllPendingBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "PENDING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ createdAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

// Helper function to calculate time ago format
const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  }
};

const getProviderPendingBookingsForHomepage = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "PENDING",
  })
    .populate("customerId", "userName profilePicture")
    .sort({ createdAt: -1 }); // Sort by creation time (newest first)

  const transformedBookings = bookings.map((booking) => {
    const customer = booking.customerId as any;
    return {
      bookingId: booking._id,
      ownerName: customer?.userName || "Unknown User",
      ownerProfilePicture: customer?.profilePicture || null,
      bookingDateTime: booking.scheduledAt,
      timeAgo: getTimeAgo(booking.createdAt),
    };
  });

  return transformedBookings;
};

const getProviderAllOngoingBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "ONGOING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ createdAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getOwnerAllOngoingBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "ONGOING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ createdAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getOwnerAllCancelledBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "CANCELLED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ updatedAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getProviderAllCancelledBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "CANCELLED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ updatedAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getProviderAllCompletedBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "COMPLETED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ updatedAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getOwnerAllCompletedBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "COMPLETED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ updatedAt: -1 });

  const transformedBookings = bookings.map((booking) => {
    const service = booking.serviceId as any;
    return {
      id: booking.id,
      serviceName: service?.name || "Service Unavailable",
      ownerAddress: booking.address,
      ownerPhoneNumber: booking.phoneNumber,
      description: booking.description,
      oneImage:
        service?.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      priceByHour: service?.rateByHour || 0,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    };
  });

  return transformedBookings;
};

const getRatingAndReviewPage = async (bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  // Find the booking and populate provider details
  const booking = await Booking.findById(bookingId).populate(
    "providerId",
    "userName",
  );

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const provider = booking.providerId as any;

  return {
    providerName: provider.userName,
  };
};

const giveRatingAndReview = async (
  bookingId: string,
  customerId: string,
  rating: number,
  review: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  if (rating < 1 || rating > 5) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Rating must be between 1 and 5",
    );
  }

  const booking = await Booking.findById(bookingId).populate("serviceId");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const bookingCustomerId =
    booking.customerId?._id?.toString() || booking.customerId?.toString() || "";
  if (bookingCustomerId !== customerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only rate your own bookings",
    );
  }

  if (booking.status !== "COMPLETED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only completed bookings can be rated and reviewed",
    );
  }

  if (booking.rating || booking.review) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This booking has already been rated and reviewed",
    );
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        rating: rating,
        review: review,
      },
      { new: true, session },
    );

    const service = await Service.findById(booking.serviceId).session(session);
    if (service) {
      const currentRatingsCount = service.ratingsCount || 0;
      const currentRatingsAverage = service.ratingsAverage || 0;

      // Calculate new average rating
      const newRatingsCount = currentRatingsCount + 1;
      const newRatingsAverage =
        (currentRatingsAverage * currentRatingsCount + rating) /
        newRatingsCount;

      await Service.findByIdAndUpdate(
        booking.serviceId,
        {
          ratingsAverage: parseFloat(newRatingsAverage.toFixed(2)),
          ratingsCount: newRatingsCount,
        },
        { session },
      );
    }

    await session.commitTransaction();

    // Send notification to provider about the rating
    if (booking.providerId) {
      await notificationService.createNotification({
        recipientId: booking.providerId.toString(),
        senderId: customerId,
        type: NotificationType.BOOKING_RATED,
        title: "New Rating Received",
        message: `You received a ${rating}-star rating for your service`,
        data: {
          bookingId: bookingId,
          serviceId: booking.serviceId._id.toString(),
          rating: rating,
          review: review,
        },
      });
    }

    return {
      rating: rating,
      review: review,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const bookingService = {
  createBooking,
  confirmBookingAfterPayment,
  getBookingsByCustomer,
  getBookingsByProvider,
  getOwnerAllOngoingBookings,
  getOwnerBookingOverview,
  getProviderBookingOverview,
  acceptBookingByProvider,
  rejectBookingByProvider,
  cancelBookingByOwner,
  generateCompletionQRCodeByProvider,
  completeBookingByOwner,
  getOwnerAllPendingBookings,
  getProviderAllPendingBookings,
  getProviderPendingBookingsForHomepage,
  getProviderAllOngoingBookings,
  getProviderAllCompletedBookings,
  getOwnerAllCompletedBookings,
  getOwnerAllCancelledBookings,
  getProviderAllCancelledBookings,
  getRatingAndReviewPage,
  giveRatingAndReview,
};
