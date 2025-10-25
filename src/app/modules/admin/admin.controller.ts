import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { adminService } from "./admin.service";
import { Request, Response } from "express";
import { fileUploader } from "../../../helpers/fileUploader";
import ApiError from "../../../errors/ApiErrors";

const createCategory = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const imageFile = files?.image?.[0];

  if (!imageFile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Category image is required");
  }

  const uploadResult = await fileUploader.uploadToCloudinary(
    imageFile,
    "categories"
  );

  const categoryData = {
    ...req.body,
    image: uploadResult.Location,
  };

  const result = await adminService.createCategory(categoryData);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Category created successfully",
    data: result,
  });
});

const getCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getCategories(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Categories retrieved successfully",
    meta: result.pagination,
    data: result.categories,
  });
});

const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await adminService.getCategoryById(id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category retrieved successfully",
    data: result,
  });
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const imageFile = files?.image?.[0];

  let updateData = { ...req.body };
  let oldImageUrl: string | null = null;

  if (imageFile) {
    const existingCategory = await adminService.getCategoryById(id);
    oldImageUrl = existingCategory.image;

    const uploadResult = await fileUploader.uploadToCloudinary(
      imageFile,
      "categories"
    );
    updateData.image = uploadResult.Location;
  }

  const result = await adminService.updateCategory(id, updateData);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category updated successfully",
    data: result,
  });
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await adminService.deleteCategory(id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Category deleted successfully",
    data: result,
  });
});

export const adminController = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
