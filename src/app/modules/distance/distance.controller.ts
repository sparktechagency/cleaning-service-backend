import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { DistanceService } from "./distance.service";
import { Request } from "express";

// Calculate distance between two specific users
const getDistanceBetween = catchAsync(async (req: Request, res) => {
  const { fromId, toId } = req.params;

  if (!fromId || !toId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Both fromId and toId are required",
      data: null,
    });
  }

  const result = await DistanceService.distanceBetweenUsers(fromId, toId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Distance calculated successfully",
    data: {
      ...result,
      kmRounded: Number(result.km.toFixed(2)),
    },
  });
});

// Get nearby users for the authenticated user (GUEST can see nearby PROVIDERS)
const getMyNearbyUsers = catchAsync(
  async (req: Request & { user?: any }, res) => {
    if (!req.user?.id) {
      return sendResponse(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    // Parse query parameters
    const radiusKm = req.query.radiusKm
      ? Number(req.query.radiusKm)
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    // Validate query parameters
    if (radiusKm && (isNaN(radiusKm) || radiusKm <= 0)) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "radiusKm must be a positive number",
        data: null,
      });
    }

    if (limit && (isNaN(limit) || limit <= 0 || limit > 100)) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "limit must be a positive number between 1 and 100",
        data: null,
      });
    }

    const data = await DistanceService.findNearbyUsers({
      userId: req.user.id,
      radiusKm,
      role: "PROVIDER",
      limit,
    });

    

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Found ${data.length} services from nearby providers`,
      data: {
        services: data,
        count: data.length,
        searchRadius: radiusKm || 10,
        filters: {
          role: "PROVIDER",
          limit: limit || 50,
        },
      },
    });
  }
);

export const DistanceController = {
  getDistanceBetween,
  getMyNearbyUsers,
};
