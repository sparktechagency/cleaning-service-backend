import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { authService } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result.message,
    data: {
      email: result.email,
      userName: result.userName,
      otp: result.otp,
    },
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.verifyOtp(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: {
      email: result.email,
      userName: result.userName,
    },
  });
});

const completeRegistration = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.completeRegistration(req.body, req.files);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.user,
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body);

  // Set token in HTTP-only cookie for automatic authentication
  res.cookie("token", result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: result,
  });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Successfully logged out",
    data: null,
  });
});

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.getMyProfile(req.user.id);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "User profile retrieved successfully",
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  const result = await authService.changePassword(
    req.user.id,
    oldPassword,
    newPassword,
    confirmPassword
  );
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Password changed successfully",
    data: result,
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check your email!",
    data: result,
  });
});

const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const { email, otpType } = req.body;
  const result = await authService.resendOtp(email, otpType);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check your email!",
    data: result,
  });
});

const verifyForgotPasswordOtp = catchAsync(
  async (req: Request, res: Response) => {
    const result = await authService.verifyForgotPasswordOtp(req.body);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Now Redirect to Reset Password API!",
      data: result,
    });
  }
);

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, newPassword, confirmPassword } = req.body;

  await authService.resetPassword(email, newPassword, confirmPassword);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password Reset!",
    data: null,
  });
});

const checkTokenValidity = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.body;

  const result = await authService.checkTokenValidity(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Token validity checked successfully",
    data: result,
  });
});

export const AuthController = {
  register,
  verifyOtp,
  completeRegistration,
  loginUser,
  logoutUser,
  getMyProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  resendOtp,
  verifyForgotPasswordOtp,
  checkTokenValidity,
};
