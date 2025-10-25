import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { bookingService } from "./booking.service";

const createBooking = catchAsync(async (req, res) => {
  const result = await bookingService.createBooking(req.user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Booking created successfully",
    data: result,
  });
});

const getMyBookings = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await bookingService.getBookingsByCustomer(req.user.id, {
    status: status as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookings retrieved successfully",
    data: result,
  });
});

const getProviderBookings = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await bookingService.getBookingsByProvider(req.user.id, {
    status: status as string,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Provider bookings retrieved successfully",
    data: result,
  });
});

const getOwnerBookingOverview = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.getOwnerBookingOverview(id, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking retrieved successfully",
    data: result,
  });
});

const getProviderBookingOverview = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.getProviderBookingOverview(
    id,
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking retrieved successfully",
    data: result,
  });
});

const acceptBookingByProvider = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.acceptBookingByProvider(id, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking accepted successfully",
    data: result,
  });
});

const rejectBookingByProvider = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.rejectBookingByProvider(id, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking rejected successfully",
    data: result,
  });
});

const cancelBookingByOwner = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.cancelBookingByOwner(id, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking cancelled successfully",
    data: result,
  });
});

const generateCompletionQRCode = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await bookingService.generateCompletionQRCodeByProvider(
    id,
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "QR code generated successfully",
    data: result,
  });
});

const completeBookingByQRCode = catchAsync(async (req, res) => {
  const { id: bookingId } = req.params;
  const { completionCode } = req.body;
  const result = await bookingService.completeBookingByOwner(
    bookingId,
    completionCode,
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Booking completed successfully",
    data: result,
  });
});

const getOwnerAllPendingBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getOwnerAllPendingBookings(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending bookings retrieved successfully",
    data: result,
  });
});

const getProviderAllPendingBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getProviderAllPendingBookings(
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending bookings retrieved successfully",
    data: result,
  });
});

const getProviderAllOngoingBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getProviderAllOngoingBookings(
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ongoing bookings retrieved successfully",
    data: result,
  });
});

const getOwnerAllOngoingBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getOwnerAllOngoingBookings(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ongoing bookings retrieved successfully",
    data: result,
  });
});

const getOwnerAllCancelledBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getOwnerAllCancelledBookings(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cancelled bookings retrieved successfully",
    data: result,
  });
});

const getProviderAllCancelledBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getProviderAllCancelledBookings(
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cancelled bookings retrieved successfully",
    data: result,
  });
});

export const bookingController = {
  createBooking,
  getMyBookings,
  getProviderBookings,
  getOwnerBookingOverview,
  getProviderBookingOverview,
  acceptBookingByProvider,
  rejectBookingByProvider,
  cancelBookingByOwner,
  generateCompletionQRCode,
  completeBookingByQRCode,
  getOwnerAllPendingBookings,
  getProviderAllPendingBookings,
  getProviderAllOngoingBookings,
  getOwnerAllOngoingBookings,
  getOwnerAllCancelledBookings,
  getProviderAllCancelledBookings,
};
