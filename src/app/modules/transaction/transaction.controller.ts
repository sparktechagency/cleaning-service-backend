import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { transactionService } from "./transaction.service";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";

export const getBookingPaymentHistory = catchAsync(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;

    const result = await transactionService.getBookingPaymentHistory({
      page: Number(page),
      limit: Number(limit),
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Booking payment transactions retrieved successfully",
      data: result,
    });
  }
);

export const searchBookingPaymentHistory = catchAsync(
  async (req: Request, res: Response) => {
    const { searchTerm, page = 1, limit = 20 } = req.query;

    if (!searchTerm || typeof searchTerm !== "string") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Search term is required and must be a string"
      );
    }

    const result = await transactionService.searchForBookingPaymentHistory(
      searchTerm,
      {
        page: Number(page),
        limit: Number(limit),
      }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Booking payment transactions search completed successfully",
      data: result,
    });
  }
);

export const getPaymentTracking = catchAsync(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;

    const result = await transactionService.paymentTracking({
      page: Number(page),
      limit: Number(limit),
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Subscription payment tracking retrieved successfully",
      data: result,
    });
  }
);
