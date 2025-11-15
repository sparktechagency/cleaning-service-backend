import { z } from "zod";

const createBookingPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string({
      required_error: "Booking ID is required",
    }),
  }),
});

const verifyBookingPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string({
      required_error: "Booking ID is required",
    }),
  }),
});

const refundPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string({
      required_error: "Booking ID is required",
    }),
  }),
});

export const paymentValidation = {
  createBookingPaymentSchema,
  verifyBookingPaymentSchema,
  refundPaymentSchema,
};
