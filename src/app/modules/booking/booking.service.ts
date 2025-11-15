import mongoose from "mongoose";
import { Booking } from "./booking.model";
import { Service } from "../service/service.model";
import { User } from "../../models/User.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import QRCode from "qrcode";
import crypto from "crypto";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../../models";
import { processReferralRewards } from "../../../utils/ReferralRewards";
import { on } from "events";

type CreateBookingPayload = {
  serviceId: string;
  scheduledAt: string | Date;
  phoneNumber: string;
  address: {
    city: string;
    latitude: number;
    longitude: number;
  };
  description?: string;
  serviceDuration: number; // Duration in hours
  paymentMethod: "STRIPE";
};

// Helper function to generate unique completion code
const generateCompletionCode = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

const createBooking = async (
  customerId: string,
  payload: CreateBookingPayload
) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const customer = await User.findById(customerId).session(session);
    if (!customer) {
      throw new ApiError(httpStatus.NOT_FOUND, "Customer not found");
    }

    const service = await Service.findById(payload.serviceId).session(session);
    if (!service) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
    }

    const scheduledDate =
      typeof payload.scheduledAt === "string"
        ? new Date(payload.scheduledAt)
        : payload.scheduledAt;

    if (scheduledDate <= new Date()) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Scheduled date must be in the future"
      );
    }

    // Validate service duration
    if (payload.serviceDuration <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Service duration must be greater than 0"
      );
    }

    // Calculate total amount
    const ratePerHour = parseFloat(service.rateByHour);
    const totalAmount = ratePerHour * payload.serviceDuration;

    // Create booking
    const bookingData = {
      customerId,
      serviceId: service._id,
      providerId: service.providerId,
      scheduledAt: new Date(payload.scheduledAt),
      phoneNumber: payload.phoneNumber,
      address: payload.address,
      description: payload.description,
      serviceDuration: payload.serviceDuration,
      totalAmount: totalAmount,
      status: "PENDING" as const,
      payment: {
        method: payload.paymentMethod,
        status: "UNPAID" as const, // Always unpaid initially, will be updated when payment is processed
        transactionId: undefined, // Will be set when payment is processed
      },
    };

    const booking = await Booking.create([bookingData], { session });

    await session.commitTransaction();

    // Send notifications after transaction commits
    const createdBooking = booking[0];

    // Notify provider about new booking request
    if (service.providerId) {
      await notificationService.createNotification({
        recipientId: service.providerId.toString(),
        senderId: customerId,
        type: NotificationType.BOOKING_CREATED,
        title: "New Booking Request",
        message: `You have a new pending booking request for ${service.name}`,
        data: {
          bookingId: createdBooking._id.toString(),
          serviceId: service._id.toString(),
          serviceName: service.name,
          scheduledAt: createdBooking.scheduledAt,
        },
      });
    }

    // Notify owner/customer that booking was created
    await notificationService.createNotification({
      recipientId: customerId,
      type: NotificationType.BOOKING_CREATED,
      title: "Booking Request Sent",
      message: `Your booking request for ${service.name} has been sent successfully`,
      data: {
        bookingId: createdBooking._id.toString(),
        serviceId: service._id.toString(),
        serviceName: service.name,
        scheduledAt: createdBooking.scheduledAt,
      },
    });

    // Return populated booking
    const populatedBooking = await Booking.findById(createdBooking._id)
      .populate("serviceId", "name rateByHour")
      .populate("providerId", "userName profilePicture");

    return populatedBooking;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getBookingsByCustomer = async (
  customerId: string,
  options: { status?: string; page?: number; limit?: number }
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
  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

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
  options: { status?: string; page?: number; limit?: number }
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
  // Transform the response to only include required fields
  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));
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
      "name coverImages rateByHour description ratingsAverage ratings reviews totalOrders needApproval"
    )
    .populate(
      "providerId",
      "_id userName email phoneNumber address experience aboutMe"
    );

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Check if user is authorized to view this booking
  const isCustomer = booking.customerId._id.toString() === userId;
  const isProvider = booking.providerId?._id.toString() === userId;

  if (!isCustomer && !isProvider) {
    throw new ApiError(httpStatus.FORBIDDEN, "Access denied");
  }

  // Transform the response to include only requested fields
  const service = booking.serviceId as any;
  const provider = booking.providerId as any;

  const response = {
    id: booking._id,
    service: {
      name: service.name,
      oneImage:
        service.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      rateByHour: service.rateByHour,
      ratingsAverage: service.ratingsAverage,
      ratings: service.ratings,
      reviews: service.reviews,
      totalOrders: service.totalOrders,
      instantBooking: service.needApproval,
      description: service.description,
      allImages: service.coverImages || [],
    },
    provider: {
      id: provider._id,
      name: provider.userName,
      phoneNumber: provider.phoneNumber,
      email: provider.email,
      address: provider.address,
      experience: provider.experience,
      aboutMe: provider.aboutMe,
    },
  };

  return response;
};

const getProviderBookingOverview = async (
  bookingId: string,
  userId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate("serviceId", "name coverImages rateByHour description")
    .populate(
      "customerId",
      "_id userName email phoneNumber address experience aboutMe"
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
      name: service.name,
      oneImage:
        service.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      address: booking.address,
      phoneNumber: booking.phoneNumber,
      description: booking.description,
      rateByHour: service.rateByHour,
      serviceDuration: booking.serviceDuration,
      totalAmount: booking.totalAmount,
      status: booking.status,
    },
    customer: {
      id: customer._id,
      name: customer.userName,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      address: customer.address,
      description: booking.description,
    },
  };

  return response;
};

const acceptBookingByProvider = async (
  bookingId: string,
  providerId: string
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
      "Only the assigned provider can accept this booking"
    );
  }

  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be accepted"
    );
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "ONGOING" },
    { new: true }
  ).populate("serviceId", "name");

  // Send notifications
  // Notify owner that booking was accepted
  await notificationService.createNotification({
    recipientId: updatedBooking!.customerId.toString(),
    senderId: providerId,
    type: NotificationType.BOOKING_ACCEPTED,
    title: "Booking Accepted",
    message: `Your booking request for ${
      (updatedBooking!.serviceId as any).name
    } has been confirmed by the provider`,
    data: {
      bookingId: bookingId,
      serviceId: updatedBooking!.serviceId._id.toString(),
      serviceName: (updatedBooking!.serviceId as any).name,
    },
  });

  // Notify provider (confirmation for themselves)
  await notificationService.createNotification({
    recipientId: providerId,
    type: NotificationType.BOOKING_ACCEPTED,
    title: "Booking Confirmed",
    message: `You have confirmed the booking request for ${
      (updatedBooking!.serviceId as any).name
    }`,
    data: {
      bookingId: bookingId,
      serviceId: updatedBooking!.serviceId._id.toString(),
      serviceName: (updatedBooking!.serviceId as any).name,
    },
  });

  return updatedBooking;
};

const rejectBookingByProvider = async (
  bookingId: string,
  providerId: string
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
      "Only the assigned provider can reject this booking"
    );
  }

  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be rejected"
    );
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "CANCELLED" },
    { new: true }
  );

  return updatedBooking;
};

const cancelBookingByOwner = async (bookingId: string, customerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.customerId.toString() !== customerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the booking owner can cancel this booking"
    );
  }

  if (booking.status !== "PENDING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only pending bookings can be cancelled"
    );
  }

  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "CANCELLED" },
    { new: true }
  );

  return updatedBooking;
};

const generateCompletionQRCodeByProvider = async (
  bookingId: string,
  providerId: string
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
      "Only the assigned provider can generate QR code for this booking"
    );
  }

  // Only ONGOING bookings can have QR code generated
  if (booking.status !== "ONGOING") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only ongoing bookings can have completion QR code generated"
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
      { new: true }
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
      "Failed to generate QR code"
    );
  }
};

const completeBookingByOwner = async (
  bookingId: string,
  completionCode: string,
  ownerId: string
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
  if (booking.customerId.toString() !== ownerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only complete your own bookings"
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
      "Only ongoing bookings can be completed"
    );
  }

  // Update booking status to COMPLETED
  const updatedBooking = await Booking.findByIdAndUpdate(
    bookingId,
    { status: "COMPLETED" },
    { new: true }
  )
    .populate("serviceId", "name")
    .populate("providerId", "userName");

  // Send notifications
  // Notify provider that booking was completed
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
      message: `You have successfully completed a booking for ${
        (updatedBooking!.serviceId as any).name
      }`,
      data: {
        bookingId: bookingId,
        serviceId: updatedBooking!.serviceId._id.toString(),
        serviceName: (updatedBooking!.serviceId as any).name,
      },
    });
  }

  // Notify owner that booking was completed
  await notificationService.createNotification({
    recipientId: ownerId,
    type: NotificationType.BOOKING_COMPLETED,
    title: "Service Completed",
    message: `You have successfully enjoyed the service ${
      (updatedBooking!.serviceId as any).name
    }. You can now rate and review!`,
    data: {
      bookingId: bookingId,
      serviceId: updatedBooking!.serviceId._id.toString(),
      serviceName: (updatedBooking!.serviceId as any).name,
    },
  });

  // Process referral rewards for owner (10 credits for first booking, 5 bonus for 3rd booking)
  await processReferralRewards(ownerId);

  // Process referral rewards for provider (10 credits for first service, 5 bonus for 3rd service)
  if (providerIdStr) {
    const { processProviderReferralRewards } = await import(
      "../../../utils/ReferralRewards"
    );
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
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getProviderAllPendingBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "PENDING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

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
      ownerName: customer.userName,
      ownerProfilePicture: customer.profilePicture || null,
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
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getOwnerAllOngoingBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "ONGOING",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getOwnerAllCancelledBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "CANCELLED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getProviderAllCancelledBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "CANCELLED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getProviderAllCompletedBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "COMPLETED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getOwnerAllCompletedBookings = async (ownerId: string) => {
  const bookings = await Booking.find({
    customerId: ownerId,
    status: "COMPLETED",
  })
    .populate("serviceId", "name rateByHour coverImages")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    oneImage:
      (booking.serviceId as any).coverImages &&
      (booking.serviceId as any).coverImages.length > 0
        ? (booking.serviceId as any).coverImages[0]
        : null,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getRatingAndReviewPage = async (bookingId: string) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  // Find the booking and populate provider details
  const booking = await Booking.findById(bookingId).populate(
    "providerId",
    "userName"
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
  review: string
) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  if (rating < 1 || rating > 5) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Rating must be between 1 and 5"
    );
  }

  const booking = await Booking.findById(bookingId).populate("serviceId");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.customerId.toString() !== customerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only rate your own bookings"
    );
  }

  if (booking.status !== "COMPLETED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only completed bookings can be rated and reviewed"
    );
  }

  if (booking.rating || booking.review) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This booking has already been rated and reviewed"
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
      { new: true, session }
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
        { session }
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
