import { z } from "zod";

const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Category name is required" })
      .min(2, "Category name must be at least 2 characters")
      .max(100, "Category name must not exceed 100 characters")
      .trim(),
  }),
});

const updateCategorySchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Category ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format"),
  }),
  body: z.object({
    name: z
      .string()
      .min(2, "Category name must be at least 2 characters")
      .max(100, "Category name must not exceed 100 characters")
      .trim()
      .optional(),
  }),
});

const getCategorySchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Category ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format"),
  }),
});

const deleteCategorySchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Category ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid category ID format"),
  }),
});

const getCategoriesQuerySchema = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, "Page must be a positive number"),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .refine(
        (val) => val > 0 && val <= 100,
        "Limit must be between 1 and 100"
      ),
  }),
});

const getUserSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "User ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format"),
  }),
});

const searchUsersSchema = z.object({
  params: z.object({
    searchTerm: z
      .string({ required_error: "Search term is required" })
      .min(1, "Search term must be at least 1 character")
      .max(100, "Search term must not exceed 100 characters")
      .trim(),
  }),
});

const searchBookingRequestsSchema = z.object({
  params: z.object({
    searchTerm: z
      .string({ required_error: "Search term is required" })
      .min(1, "Search term must be at least 1 character")
      .max(100, "Search term must not exceed 100 characters")
      .trim(),
  }),
});

const changeUserStatusSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "User ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format"),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: "isActive field is required" }),
  }),
});

const getBookingUserOverviewSchema = z.object({
  params: z.object({
    bookingId: z
      .string({ required_error: "Booking ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid booking ID format"),
  }),
});

const createKnowledgeHubArticleSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: "Title is required" })
      .min(3, "Title must be at least 3 characters long")
      .max(200, "Title cannot exceed 200 characters")
      .trim(),
    description: z
      .string({ required_error: "Description is required" })
      .min(10, "Description must be at least 10 characters long")
      .trim(),
  }),
});

const updateKnowledgeHubArticleSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Article ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid article ID format"),
  }),
  body: z.object({
    title: z
      .string({ required_error: "Title is required" })
      .min(3, "Title must be at least 3 characters long")
      .max(200, "Title cannot exceed 200 characters")
      .trim()
      .optional(),
    description: z
      .string({ required_error: "Description is required" })
      .min(10, "Description must be at least 10 characters long")
      .trim()
      .optional(),
  }),
});

const deleteKnowledgeHubArticleSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Article ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid article ID format"),
  }),
});

const getKnowledgeHubArticleSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Article ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid article ID format"),
  }),
});

const adminEditProfileSchema = z.object({
  body: z.object({
    userName: z
      .string({ required_error: "Username is required" })
      .min(2, "Username must be at least 2 characters long")
      .max(100, "Username cannot exceed 100 characters")
      .trim(),
  }),
});

export const adminValidation = {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  adminEditProfileSchema,
  updateKnowledgeHubArticleSchema,
  deleteCategorySchema,
  getCategoriesQuerySchema,
  getUserSchema,
  searchUsersSchema,
  changeUserStatusSchema,
  getBookingUserOverviewSchema,
  searchBookingRequestsSchema,
  createKnowledgeHubArticleSchema,
  deleteKnowledgeHubArticleSchema,
  getKnowledgeHubArticleSchema,
};
