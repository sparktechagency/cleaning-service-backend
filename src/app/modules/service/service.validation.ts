import { z } from "zod";

const timeSchema = z
  .string()
  .refine(
    (val) => val === "" || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val),
    "Invalid time format (HH:MM)"
  )
  .optional()
  .default("");

// Day schedule schema
const dayScheduleSchema = z
  .object({
    day: z.string().optional(),
    isAvailable: z.preprocess((v) => {
      if (v === "true" || v === true) return true;
      if (v === "false" || v === false) return false;
      return v;
    }, z.boolean().default(false)),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .optional();

const workScheduleSchema = z
  .preprocess(
    (v) => {
      // If it's already an object, return as is
      if (typeof v === "object" && v !== null) return v;

      // If it's a string, try to parse as JSON
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch (error) {
          return v; // Return original string if parsing fails
        }
      }

      return v;
    },
    z
      .object({
        monday: dayScheduleSchema,
        tuesday: dayScheduleSchema,
        wednesday: dayScheduleSchema,
        thursday: dayScheduleSchema,
        friday: dayScheduleSchema,
        saturday: dayScheduleSchema,
        sunday: dayScheduleSchema,
      })
      .optional()
  )
  .optional();

const createServiceSchema = z.object({
  body: z.object({
    categoryId: z
      .string({
        required_error: "Category ID is required",
      })
      .min(1, "Category ID cannot be empty"),

    name: z
      .string({
        required_error: "Service name is required",
      })
      .min(2, "Service name must be at least 2 characters")
      .max(120, "Service name must not exceed 120 characters")
      .trim(),

    description: z
      .string()
      .max(5000, "Description must not exceed 5000 characters")
      .trim()
      .optional(),

    rateByHour: z
      .string({
        required_error: "Rate per hour is required",
      })
      .trim(),

    needApproval: z.preprocess((v) => {
      if (v === "true" || v === true) return true;
      if (v === "false" || v === false) return false;
      return v;
    }, z.boolean().optional().default(false)),

    gender: z.enum(["Male", "Female"], {
      required_error: "Gender is required",
      invalid_type_error: "Gender must be either Male or Female",
    }),

    languages: z.preprocess(
      (v) => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          return v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [];
      },
      z
        .array(z.enum(["English"]))
        .optional()
        .default([])
    ),

    // Work Schedule Validation
    workSchedule: workScheduleSchema,
  }),
});

const updateServiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Service ID is required"),
  }),
  body: z.object({
    categoryId: z.string().min(1).optional(),
    name: z.string().min(2).max(120).trim().optional(),
    description: z.string().max(5000).trim().optional(),
    rateByHour: z.string().trim().optional(),
    needApproval: z.preprocess((v) => {
      if (v === "true" || v === true) return true;
      if (v === "false" || v === false) return false;
      return v;
    }, z.boolean().optional()),
    gender: z.enum(["Male", "Female"]).optional(),
    languages: z.preprocess((v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        return v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return v;
    }, z.array(z.enum(["English"])).optional()),

    // Work Schedule Validation for updates
    workSchedule: workScheduleSchema,
  }),
});

const getServiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Service ID is required"),
  }),
});

const getServicesSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    categoryId: z.string().optional(),
    gender: z.enum(["Male", "Female"]).optional(),
    page: z.preprocess((v) => {
      if (typeof v === "string" && v.trim() !== "") return Number(v);
      return v;
    }, z.number().min(1).optional().default(1)),
    limit: z.preprocess((v) => {
      if (typeof v === "string" && v.trim() !== "") return Number(v);
      return v;
    }, z.number().min(1).max(100).optional().default(20)),
  }),
});

const deleteServiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Service ID is required"),
  }),
});

export const serviceValidation = {
  createServiceSchema,
  updateServiceSchema,
  getServiceSchema,
  getServicesSchema,
  deleteServiceSchema,
};
