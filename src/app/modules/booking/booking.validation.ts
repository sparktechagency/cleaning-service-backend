import { z } from "zod";

const createBookingSchema = z.object({
  body: z.object({
    serviceId: z
      .string({
        required_error: "Service ID is required",
      })
      .min(1, "Service ID cannot be empty"),
    scheduledAt: z
      .string({
        required_error: "Scheduled date and time is required",
      })
      .datetime(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)"
      ),
    phoneNumber: z
      .string({
        required_error: "Phone number is required",
      })
      .regex(/^\+?[1-9]\d{1,14}$/, "Please provide a valid phone number"),
    address: z.object({
      city: z
        .string({
          required_error: "City is required",
        })
        .min(2, "City must be at least 2 characters"),
      latitude: z
        .number({
          required_error: "Latitude is required",
        })
        .min(-90, "Invalid latitude")
        .max(90, "Invalid latitude"),
      longitude: z
        .number({
          required_error: "Longitude is required",
        })
        .min(-180, "Invalid longitude")
        .max(180, "Invalid longitude"),
    }),
    description: z.string().optional(),
    serviceDuration: z
      .number({
        required_error: "Service duration is required",
      })
      .min(0.5, "Service duration must be at least 0.5 hours")
      .max(24, "Service duration cannot exceed 24 hours"),
    paymentMethod: z.enum(["STRIPE"], {
      required_error: "Payment method is required",
    }),
  }),
});

const getBookingsSchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "ONGOING", "COMPLETED", "CANCELLED"]).optional(),
    page: z.string().regex(/^\d+$/, "Page must be a number").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a number").optional(),
  }),
});

const getBookingSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Booking ID is required",
      })
      .min(1, "Booking ID cannot be empty"),
  }),
});

const updateBookingStatusSchema = z.object({
  body: z.object({
    status: z.enum(["ONGOING", "COMPLETED", "CANCELLED"], {
      required_error: "Status is required",
      invalid_type_error: "Status must be ONGOING, COMPLETED, or CANCELLED",
    }),
  }),
});

const completeBookingByQRSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Booking ID is required",
      })
      .min(1, "Booking ID cannot be empty"),
  }),
  body: z.object({
    completionCode: z
      .string({
        required_error: "Completion code is required",
      })
      .min(1, "Completion code cannot be empty"),
  }),
});

export const bookingValidation = {
  createBookingSchema,
  getBookingsSchema,
  getBookingSchema,
  updateBookingStatusSchema,
  completeBookingByQRSchema,
};
