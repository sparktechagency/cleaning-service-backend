import httpStatus from "http-status";
import { Request, Response } from "express";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { profileService } from "./profile.service";

const getProviderProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await profileService.getProviderProfile(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Provider profile retrieved successfully",
    data: result,
  });
});

const updateProviderProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const result = await profileService.providerProfileInformation(
      userId,
      req.body,
      req.file
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Provider profile updated successfully",
      data: result,
    });
  }
);

const getOwnerProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await profileService.getOwnerProfile(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Owner profile retrieved successfully",
    data: result,
  });
});

const updateOwnerProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await profileService.ownerProfileInformation(
    userId,
    req.body,
    req.file
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Owner profile updated successfully",
    data: result,
  });
});

export const profileController = {
  updateProviderProfile,
  getProviderProfile,
  getOwnerProfile,
  updateOwnerProfile,
};
