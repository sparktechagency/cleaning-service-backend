import mongoose from "mongoose";
import { Booking } from "./booking.model";
import { Service } from "../service/service.model";
import { User } from "../../models/User.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import QRCode from "qrcode";
import crypto from "crypto";

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

    // Return populated booking
    return;
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
    .populate("serviceId", "name rateByHour")
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
    .populate("serviceId", "name rateByHour")
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
  );

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
  );

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
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
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
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));

  return transformedBookings;
};

const getProviderAllOngoingBookings = async (providerId: string) => {
  const bookings = await Booking.find({
    providerId: providerId,
    status: "ONGOING",
  })
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
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
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
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
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
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
    .populate("serviceId", "name rateByHour")
    .sort({ scheduledAt: 1 });

  const transformedBookings = bookings.map((booking) => ({
    id: booking.id,
    serviceName: (booking.serviceId as any).name,
    ownerAddress: booking.address,
    ownerPhoneNumber: booking.phoneNumber,
    description: booking.description,
    priceByHour: (booking.serviceId as any).rateByHour,
    serviceDuration: booking.serviceDuration,
    totalAmount: booking.totalAmount,
    status: booking.status,
  }));



  return transformedBookings;
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
  getProviderAllOngoingBookings,
  getOwnerAllCancelledBookings,
  getProviderAllCancelledBookings,
};
