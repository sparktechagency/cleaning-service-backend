import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import { User, UserStatus } from "../../models";
import haversineDistance from "../../../utils/HeversineDistance";
import { Types } from "mongoose";
import { Service } from "../service/service.model";

// Helper function to ensure coordinates exist and are valid
const ensureCoords = (user: any) => {
  let lat = user.lattitude;
  let lng = user.longitude;

  if (lat == null || lng == null) {
    return null;
  }

  // Convert to number if they're strings
  if (typeof lat === "string") {
    lat = parseFloat(lat);
  }
  if (typeof lng === "string") {
    lng = parseFloat(lng);
  }

  // Check if they're valid numbers after conversion
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    isNaN(lat) ||
    isNaN(lng)
  ) {
    return null;
  }

  // Check if they're within valid coordinate ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
};

// Calculate distance between two users
const distanceBetweenUsers = async (fromId: string, toId: string) => {
  try {
    if (!Types.ObjectId.isValid(fromId) || !Types.ObjectId.isValid(toId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user IDs provided");
    }

    // Fetch both users with coordinates
    const [userA, userB] = await Promise.all([
      User.findById(fromId).select({
        userName: 1,
        lattitude: 1,
        longitude: 1,
        status: 1,
      }),
      User.findById(toId).select({
        userName: 1,
        lattitude: 1,
        longitude: 1,
        status: 1,
      }),
    ]);

    if (!userA || !userB) {
      throw new ApiError(httpStatus.NOT_FOUND, "One or both users not found");
    }

    // if (
    //   userA.status === UserStatus.BLOCKED ||
    //   userB.status === UserStatus.BLOCKED
    // ) {
    //   throw new ApiError(
    //     httpStatus.FORBIDDEN,
    //     "Cannot calculate distance for blocked users"
    //   );
    // }

    // if (
    //   userA.status === UserStatus.INACTIVE ||
    //   userB.status === UserStatus.INACTIVE
    // ) {
    //   throw new ApiError(
    //     httpStatus.FORBIDDEN,
    //     "Cannot calculate distance for inactive users"
    //   );
    // }

    // Get coordinates for both users
    const coordsA = ensureCoords(userA);
    const coordsB = ensureCoords(userB);

    if (!coordsA || !coordsB) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Coordinates missing for one or both users"
      );
    }

    // Calculate distance using Haversine formula
    const distanceKm = haversineDistance(
      coordsA.lat,
      coordsA.lng,
      coordsB.lat,
      coordsB.lng
    );

    return {
      km: distanceKm,
      fromUser: {
        id: userA._id,
        name: `${userA.userName || ""}`.trim(),
        coordinates: { latitude: coordsA.lat, longitude: coordsA.lng },
      },
      toUser: {
        id: userB._id,
        name: `${userB.userName || ""}`.trim(),
        coordinates: { latitude: coordsB.lat, longitude: coordsB.lng },
      },
    };
  } catch (error) {
    console.error("Error calculating distance between users:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error calculating distance: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

// Find nearby users within radius, sorted by distance
const findNearbyUsers = async (opts: {
  userId: string;
  radiusKm?: number;
  role?: string;
  limit?: number;
}) => {
  try {
    const { userId, radiusKm = 10, role, limit = 50 } = opts;

    // Validate user ID
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID provided");
    }

    // Get the current user's coordinates
    const currentUser = await User.findById(userId).select({
      lattitude: 1,
      longitude: 1,
      status: 1,
    });

    if (!currentUser) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    if (currentUser.status !== UserStatus.ACTIVE) {
      throw new ApiError(httpStatus.FORBIDDEN, "User account is not active");
    }

    const currentCoords = ensureCoords(currentUser);
    if (!currentCoords) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Your coordinates are missing. Please update your profile with a complete address."
      );
    }

    // Build query to find nearby users who have services
    const query: any = {
      status: UserStatus.ACTIVE,
      lattitude: { $exists: true, $ne: null },
      longitude: { $exists: true, $ne: null },
    };

    // Map the role parameter to match database values
    if (role) {
      const dbRole = role === "PROVIDER" ? "PROVIDER" : role;
      query.role = dbRole;
    }

    // First, get all providers who have services
    const providersWithServices = await Service.aggregate([
      {
        $group: {
          _id: "$providerId",
          serviceCount: { $sum: 1 },
        },
      },
      {
        $match: {
          serviceCount: { $gt: 0 },
        },
      },
    ]);

    const providerIds = providersWithServices.map((p) => p._id);

    // Filter providers who have services, excluding current user
    const filteredProviderIds = providerIds.filter(
      (id) => id.toString() !== userId
    );

    // Add filter to only get providers who have services (excluding current user)
    query._id = { $in: filteredProviderIds };

    // Get all users that match the criteria and have services
    const allUsers = await User.find(query)
      .select({
        userName: 1,
        profilePicture: 1,
        lattitude: 1,
        longitude: 1,
      })
      .lean();

    // Calculate distance for each user and filter by radius, only include users with services
    const providerServices: Array<{
      _id: any;
      serviceName: string;
      serviceImage?: string;
      averageRatings: number;
      providerName: string;
      providerProfilePicture?: string;
      isApprovalRequired: boolean;
      price: string;
      distanceKm: number;
    }> = [];

    for (const user of allUsers) {
      const userCoords = ensureCoords(user);
      if (!userCoords) continue;

      const distanceKm = haversineDistance(
        currentCoords.lat,
        currentCoords.lng,
        userCoords.lat,
        userCoords.lng
      );

      // Only include users within the specified radius
      if (distanceKm <= radiusKm) {
        // Get services for this provider
        const services = await Service.find({
          providerId: user._id,
        })
          .select({
            name: 1,
            coverImages: 1,
            ratingsAverage: 1,
            needApproval: 1,
            rateByHour: 1,
          })
          .lean();

        // Create a combined object for each service with provider details
        services.forEach((service) => {
          providerServices.push({
            _id: service._id,
            serviceName: service.name,
            serviceImage:
              service.coverImages && service.coverImages.length > 0
                ? service.coverImages[0]
                : undefined,
            averageRatings: service.ratingsAverage || 0,
            providerName: `${user.userName || ""}`.trim() || "Unknown Provider",
            providerProfilePicture: user.profilePicture || undefined,
            isApprovalRequired: service.needApproval || false,
            price: service.rateByHour,
            distanceKm: Number(distanceKm.toFixed(2)),
          });
        });
      }
    }

    // Sort by distance and apply limit
    const sortedServices = providerServices
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return sortedServices;
  } catch (error) {
    console.error("Error finding nearby users:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error finding nearby users: " +
        (error instanceof Error ? error.message : "Unknown error")
    );
  }
};

export const DistanceService = {
  distanceBetweenUsers,
  findNearbyUsers,
};
