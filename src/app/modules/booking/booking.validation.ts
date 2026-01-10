import { z } from "zod";

const createBookingSchema = z.object({
  body: z.object({
    serviceId: z
      .string({
        required_error: "Service ID is required",
      })
      .min(1, "Service ID cannot be empty"),
    scheduledDate: z
      .string({
        required_error: "Scheduled date is required",
      })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Use YYYY-MM-DD"),
    scheduledTime: z
      .string({
        required_error: "Scheduled time is required",
      })
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Invalid time format. Use HH:MM (24-hour format)"
      )
      .refine(
        (time) => {
          const [, minutes] = time.split(":").map(Number);
          return minutes % 15 === 0;
        },
        {
          message:
            "Scheduled time must be in 15-minute intervals (e.g., 09:00, 09:15, 09:30, 09:45)",
        }
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

const giveRatingAndReviewSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "Booking ID is required",
      })
      .min(1, "Booking ID cannot be empty"),
  }),
  body: z.object({
    rating: z
      .number({
        required_error: "Rating is required",
      })
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot exceed 5")
  }),
});

export const bookingValidation = {
  createBookingSchema,
  getBookingsSchema,
  getBookingSchema,
  updateBookingStatusSchema,
  completeBookingByQRSchema,
  giveRatingAndReviewSchema,
};
