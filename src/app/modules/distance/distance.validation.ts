import { z } from "zod";

const distanceBetweenUsersSchema = z.object({
  params: z.object({
    fromId: z
      .string({ required_error: "fromId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "fromId must be a valid MongoDB ObjectId"),
    toId: z
      .string({ required_error: "toId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "toId must be a valid MongoDB ObjectId"),
  }),
});

const myNearbyUsersSchema = z.object({
  query: z.object({
    radiusKm: z
      .string()
      .optional()
      .transform((val) => (val ? Number(val) : undefined))
      .refine((val) => val === undefined || (val > 0 && val <= 1000), {
        message: "radiusKm must be a positive number between 1 and 1000",
      }),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? Number(val) : undefined))
      .refine((val) => val === undefined || (val > 0 && val <= 100), {
        message: "limit must be a positive number between 1 and 100",
      }),
  }),
});

export const DistanceValidation = {
  distanceBetweenUsersSchema,
  myNearbyUsersSchema,
};
