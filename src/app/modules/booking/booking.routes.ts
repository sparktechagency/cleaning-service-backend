import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { bookingController } from "./booking.controller";
import { bookingValidation } from "./booking.validation";
import { UserRole } from "../../models";

const router = express.Router();

router.post(
  "/book-now",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.createBookingSchema),
  bookingController.createBooking
);

router.get(
  "/my-bookings",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.getBookingsSchema),
  bookingController.getMyBookings
);

router.get(
  "/provider-bookings",
  auth(UserRole.PROVIDER),
  validateRequest(bookingValidation.getBookingsSchema),
  bookingController.getProviderBookings
);

router.get(
  "/owner/pending-bookings",
  auth(UserRole.OWNER),
  bookingController.getOwnerAllPendingBookings
);

router.get(
  "/provider/pending-bookings",
  auth(UserRole.PROVIDER),
  bookingController.getProviderAllPendingBookings
);

router.get(
  "/provider/pending-bookings-homepage",
  auth(UserRole.PROVIDER),
  bookingController.getProviderPendingBookingsForHomepage
);

router.get(
  "/provider/ongoing-bookings",
  auth(UserRole.PROVIDER),
  bookingController.getProviderAllOngoingBookings
);

router.get(
  "/owner/ongoing-bookings",
  auth(UserRole.OWNER),
  bookingController.getOwnerAllOngoingBookings
);

router.get(
  "/owner/cancelled-bookings",
  auth(UserRole.OWNER),
  bookingController.getOwnerAllCancelledBookings
);

router.get(
  "/provider/cancelled-bookings",
  auth(UserRole.PROVIDER),
  bookingController.getProviderAllCancelledBookings
);

// Specific routes must come before parameterized routes

router.get(
  "/owner/:id",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.getOwnerBookingOverview
);

router.get(
  "/provider/:id",
  auth(UserRole.PROVIDER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.getProviderBookingOverview
);

router.patch(
  "/accept/:id",
  auth(UserRole.PROVIDER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.acceptBookingByProvider
);

router.patch(
  "/reject/:id",
  auth(UserRole.PROVIDER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.rejectBookingByProvider
);

router.patch(
  "/cancel/:id",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.cancelBookingByOwner
);

router.post(
  "/generate-qr/:id",
  auth(UserRole.PROVIDER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.generateCompletionQRCode
);

router.patch(
  "/complete-by-qr/:id",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.completeBookingByQRSchema),
  bookingController.completeBookingByQRCode
);

router.post(
  "/rating-review/:id",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.giveRatingAndReviewSchema),
  bookingController.giveRatingAndReview
);

router.get(
  "/rating-review-page/:id",
  auth(UserRole.OWNER),
  validateRequest(bookingValidation.getBookingSchema),
  bookingController.getRatingAndReviewPage
);

export const bookingRoutes = router;
