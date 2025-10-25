import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { Category, ICategory } from "./category.model";
import { Types } from "mongoose";
import { fileUploader } from "../../../helpers/fileUploader";

const createCategory = async (
  categoryData: Partial<ICategory>
): Promise<ICategory> => {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${categoryData.name}$`, "i") },
      }).session(session);

      if (existingCategory) {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Category with name '${categoryData.name}' already exists`
        );
      }

      const category = await Category.create([categoryData], { session });
      return category[0];
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const getCategories = async (options: {
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const { search, page = 1, limit = 20 } = options;

  let query = Category.find({});

  if (search) {
    query = query.find({
      name: { $regex: search, $options: "i" },
    });
  }

  const total = await Category.countDocuments(query.getFilter());

  const categories = await query
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    categories,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getCategoryById = async (categoryId: string): Promise<ICategory> => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
  }

  const category = await Category.findById(categoryId);

  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  return category;
};

const updateCategory = async (
  categoryId: string,
  updateData: Partial<ICategory>
): Promise<ICategory> => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingCategory = await Category.findById(categoryId).session(
        session
      );
      if (!existingCategory) {
        throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
      }

      if (updateData.name) {
        const duplicateCategory = await Category.findOne({
          _id: { $ne: categoryId },
          name: { $regex: new RegExp(`^${updateData.name}$`, "i") },
        }).session(session);

        if (duplicateCategory) {
          throw new ApiError(
            httpStatus.CONFLICT,
            `Category with name '${updateData.name}' already exists`
          );
        }
      }

      const oldImageUrl = updateData.image ? existingCategory.image : null;

      const updatedCategory = await Category.findByIdAndUpdate(
        categoryId,
        { ...updateData, updatedAt: new Date() },
        { new: true, session, runValidators: true }
      );

      if (!updatedCategory) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update category"
        );
      }

      if (oldImageUrl && updateData.image && oldImageUrl !== updateData.image) {
        try {
          await fileUploader.deleteFromCloudinary(oldImageUrl);
        } catch (error) {
          console.error("Error deleting old image from Cloudinary:", error);
        }
      }

      return updatedCategory;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const deleteCategory = async (
  categoryId: string
): Promise<{ message: string }> => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const categoryToDelete = await Category.findById(categoryId).session(
        session
      );

      if (!categoryToDelete) {
        throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
      }

      const deletedCategory = await Category.findByIdAndDelete(
        categoryId
      ).session(session);

      if (!deletedCategory) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to delete category"
        );
      }

      if (categoryToDelete.image) {
        try {
          await fileUploader.deleteFromCloudinary(categoryToDelete.image);
        } catch (error) {
          console.error("Error deleting image from Cloudinary:", error);
        }
      }

      return { message: "Category deleted successfully" };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

export const adminService = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
