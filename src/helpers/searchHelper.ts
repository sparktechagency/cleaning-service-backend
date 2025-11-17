import { User } from "../app/models/User.model";
import { Category } from "../app/modules/admin/category.model";
import { Service } from "../app/modules/service/service.model";

// Universal search helper for finding matching users
// Searches by userName, email, and phoneNumber
export const findMatchingUsers = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const regex = new RegExp(searchTerm.trim(), "i");

  const users = await User.find({
    isDeleted: { $ne: true },
    $or: [{ userName: regex }, { email: regex }, { phoneNumber: regex }],
  }).select("_id");

  return users.map((user) => user._id);
};

// Universal search helper for finding matching categories
// Searches by category name
export const findMatchingCategories = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const regex = new RegExp(searchTerm.trim(), "i");

  const categories = await Category.find({
    name: regex,
  }).select("_id");

  return categories.map((cat) => cat._id);
};

// Universal search helper for finding matching services through categories
// Returns service IDs for services that belong to matching categories
export const findMatchingServices = async (categoryIds: any[]) => {
  if (!categoryIds || categoryIds.length === 0) {
    return [];
  }

  const services = await Service.find({
    categoryId: { $in: categoryIds },
  }).select("_id");

  return services.map((service: any) => service._id);
};

// Calculate relevance score for search results
// Higher score = better match
// Exact match (1000) > Starts with (700) > Contains (400)
export const calculateRelevanceScore = (
  value: string,
  searchTerm: string
): number => {
  if (!value) return 0;

  const valueLower = value.toLowerCase();
  const searchLower = searchTerm.toLowerCase();

  if (valueLower === searchLower) return 1000; // Exact match
  if (valueLower.startsWith(searchLower)) return 700; // Starts with
  if (valueLower.includes(searchLower)) return 400; // Contains

  return 0;
};

// Sort results by relevance score for multiple fields
// Returns a comparison function for array.sort()
export const sortByRelevance = <T extends Record<string, any>>(
  searchTerm: string,
  fields: (keyof T)[],
  fieldWeights?: Record<keyof T, number>
) => {
  return (a: T, b: T): number => {
    const searchLower = searchTerm.toLowerCase();

    let scoreA = 0;
    let scoreB = 0;

    // Calculate scores for each field
    fields.forEach((field, index) => {
      const valueA = String(a[field] || "").toLowerCase();
      const valueB = String(b[field] || "").toLowerCase();

      // Base score priority (first field has highest priority)
      const basePriority = (fields.length - index) * 100;
      const weight = fieldWeights?.[field] || 1;

      // Calculate field scores
      if (valueA === searchLower) scoreA += 1000 * basePriority * weight;
      else if (valueA.startsWith(searchLower))
        scoreA += 700 * basePriority * weight;
      else if (valueA.includes(searchLower))
        scoreA += 400 * basePriority * weight;

      if (valueB === searchLower) scoreB += 1000 * basePriority * weight;
      else if (valueB.startsWith(searchLower))
        scoreB += 700 * basePriority * weight;
      else if (valueB.includes(searchLower))
        scoreB += 400 * basePriority * weight;
    });

    // Sort by score (descending - highest score first)
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // If scores are equal, maintain original order or sort by date if available
    if ("createdAt" in a && "createdAt" in b) {
      return (
        new Date(b.createdAt as any).getTime() -
        new Date(a.createdAt as any).getTime()
      );
    }

    return 0;
  };
};

// Apply pagination to array results
export const paginateResults = <T>(
  results: T[],
  page: number = 1,
  limit: number = 20
) => {
  const total = results.length;
  const paginatedResults = results.slice((page - 1) * limit, page * limit);

  return {
    results: paginatedResults,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Build search query for models with user relationships
// Supports searching by user IDs and other criteria
export const buildUserRelatedSearchQuery = (
  userIds: any[],
  additionalCriteria?: any
): any => {
  const query: any = {
    $or: [],
  };

  if (userIds.length > 0) {
    query.$or.push(
      { customerId: { $in: userIds } },
      { providerId: { $in: userIds } },
      { payerId: { $in: userIds } },
      { receiverId: { $in: userIds } },
      { referrerId: { $in: userIds } },
      { refereeId: { $in: userIds } }
    );
  }

  if (additionalCriteria) {
    Object.assign(query, additionalCriteria);
  }

  return query;
};
