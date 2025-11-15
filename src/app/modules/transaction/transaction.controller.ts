import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { transactionService } from "./transaction.service";
import { Transaction } from "../../models/Transaction.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";

/**
 * Get current user's transaction history
 * @route GET /api/transactions/my-transactions
 * @access Private (All authenticated users)
 */
export const getMyTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "User not authenticated");
    }

    const { page = 1, limit = 20, type, status } = req.query;

    const result = await transactionService.getUserTransactions(userId, {
      page: Number(page),
      limit: Number(limit),
      type: type as any,
      status: status as any,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Transactions retrieved successfully",
      data: result,
    });
  }
);

/**
 * Get specific transaction by ID
 * @route GET /api/transactions/:id
 * @access Private (Transaction owner or admin)
 */
export const getTransactionById = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      throw new ApiError(httpStatus.NOT_FOUND, "Transaction not found");
    }

    // Check if user has permission to view this transaction
    const isOwner =
      transaction.payerId?.toString() === userId ||
      transaction.receiverId?.toString() === userId;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    if (!isOwner && !isAdmin) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You don't have permission to view this transaction"
      );
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Transaction retrieved successfully",
      data: transaction,
    });
  }
);

/**
 * Get all transactions (Admin only)
 * @route GET /api/transactions/admin/all
 * @access Admin
 */
export const getAllTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 50,
      type,
      status,
      userId,
      startDate,
      endDate,
    } = req.query;

    const result = await transactionService.getAllTransactions({
      page: Number(page),
      limit: Number(limit),
      type: type as any,
      status: status as any,
      userId: userId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "All transactions retrieved successfully",
      data: result,
    });
  }
);

/**
 * Get transaction statistics (Admin only)
 * @route GET /api/transactions/admin/stats
 * @access Admin
 */
export const getTransactionStats = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const stats = await transactionService.getTransactionStats({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Transaction statistics retrieved successfully",
      data: stats,
    });
  }
);

/**
 * Get revenue statistics (Admin only)
 * @route GET /api/transactions/admin/revenue
 * @access Admin
 */
export const getRevenueStats = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const revenue = await transactionService.getRevenueStats({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Revenue statistics retrieved successfully",
      data: revenue,
    });
  }
);
