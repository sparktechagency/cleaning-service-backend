import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { Category, ICategory } from "./category.model";
import { Types } from "mongoose";
import { fileUploader } from "../../../helpers/fileUploader";
import { User } from "../../models/User.model";

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

const totalCount = async () => {
  const currentYear = new Date().getFullYear();

  const totalOwners = await User.countDocuments({
    role: "OWNER",
    isDeleted: { $ne: true },
  });

  const totalProviders = await User.countDocuments({
    role: "PROVIDER",
    isDeleted: { $ne: true },
  });

  const ownerMonthlyGrowth = await User.aggregate([
    {
      $match: {
        role: "OWNER",
        isDeleted: { $ne: true },
        createdAt: {
          $gte: new Date(`${currentYear}-01-01`),
          $lte: new Date(`${currentYear}-12-31T23:59:59`),
        },
      },
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const formatMonthlyData = (monthlyData: any[]) => {
    const formattedData = [];
    let cumulativeCount = 0;
    let previousMonthTotal = 0;

    for (let i = 1; i <= 12; i++) {
      const monthData = monthlyData.find((m) => m._id === i);
      const newUsers = monthData ? monthData.count : 0;
      cumulativeCount += newUsers;

      let growthPercentage = 0;
      if (previousMonthTotal > 0) {
        growthPercentage = (newUsers / previousMonthTotal) * 100;
      } else if (newUsers > 0) {
        growthPercentage = 100;
      }

      formattedData.push({
        month: monthNames[i - 1],
        newUsers,
        growthPercentage: parseFloat(growthPercentage.toFixed(2)),
      });

      previousMonthTotal = cumulativeCount > 0 ? cumulativeCount : newUsers;
    }

    return formattedData;
  };

  const ownerMonthlyData = formatMonthlyData(ownerMonthlyGrowth);

  return {
    summary: {
      totalOwners,
      totalProviders,
    },
    ownerOverview: {
      year: currentYear,
      monthlyOverview: ownerMonthlyData,
    },
  };
};

const recentJoinedUsers = async (limit: number = 6) => {
  const users = await User.find({ isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select(
      "_id profilePicture userName role createdAt phoneNumber email address "
    );

  return users;
};

const getIndividualUserDetails = async (userId: string) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }

  const user = await User.findById(userId).select(
    "_id userName email role phoneNumber address createdAt experience aboutMe NIDFront referredBy"
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role === "OWNER") {
    return {
      _id: user._id,
      userName: user.userName,
      role: user.role,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
      email: user.email,
      address: user.address,
      referredBy: user.referredBy || null,
    };
  } else if (user.role === "PROVIDER") {
    return {
      _id: user._id,
      userName: user.userName,
      role: user.role,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
      email: user.email,
      address: user.address,
      experience: user.experience,
      aboutMe: user.aboutMe,
      referredBy: user.referredBy || null,
      NIDFront: user.NIDFront,
    };
  }
};

const getAllOwners = async () => {
  const owners = await User.find({ role: "OWNER", isDeleted: { $ne: true } })
    .select(
      "_id profilePicture userName role createdAt phoneNumber email address"
    )
    .sort({ createdAt: -1 });

  return owners;
};

const getAllProviders = async () => {
  const providers = await User.find({
    role: "PROVIDER",
    isDeleted: { $ne: true },
  })
    .select(
      "_id profilePicture userName role createdAt phoneNumber email address"
    )
    .sort({ createdAt: -1 });

  return providers;
};

export const adminService = {
  createCategory,
  getCategories,
  getCategoryById,
  getIndividualUserDetails,
  totalCount,
  recentJoinedUsers,
  updateCategory,
  deleteCategory,
  getAllOwners,
  getAllProviders,
};
