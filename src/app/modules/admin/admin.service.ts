import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { Category, ICategory } from "./category.model";
import { Types } from "mongoose";
import { fileUploader } from "../../../helpers/fileUploader";
import { User } from "../../models/User.model";
import { Booking } from "../booking/booking.model";
import { Service } from "../service/service.model";
import { KnowledgeHub } from "./knowledgeHub.model";
import { WebsiteContent } from "./websiteContent.model";
import * as notificationService from "../notification/notification.service";
import { NotificationType } from "../../models";
import { Referral } from "../../models/Referral.model";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "../../models/Transaction.model";
import {
  findMatchingUsers,
  findMatchingCategories,
  findMatchingServices,
  sortByRelevance,
  paginateResults,
} from "../../../helpers/searchHelper";

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

const totalCount = async (year?: number) => {
  // Use provided year or default to current year
  const targetYear = year || new Date().getFullYear();

  // Validate year range (e.g., between 2000 and current year + 1)
  const currentYear = new Date().getFullYear();
  if (targetYear < 2000 || targetYear > currentYear + 1) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid year. Please provide a year between 2000 and ${currentYear + 1}`
    );
  }

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
          $gte: new Date(`${targetYear}-01-01`),
          $lte: new Date(`${targetYear}-12-31T23:59:59`),
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

  // Calculate monthly subscription earnings for the target year
  const monthlyEarningsData = await Transaction.aggregate([
    {
      $match: {
        transactionType: {
          $in: [
            TransactionType.SUBSCRIPTION_PURCHASE,
            TransactionType.SUBSCRIPTION_RENEWAL,
          ],
        },
        status: TransactionStatus.COMPLETED,
        completedAt: {
          $gte: new Date(`${targetYear}-01-01`),
          $lte: new Date(`${targetYear}-12-31T23:59:59`),
        },
      },
    },
    {
      $group: {
        _id: { $month: "$completedAt" },
        earnings: { $sum: "$amount" },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Calculate total admin earnings from all subscription purchases (all time)
  const totalSubscriptionTransactions = await Transaction.aggregate([
    {
      $match: {
        transactionType: {
          $in: [
            TransactionType.SUBSCRIPTION_PURCHASE,
            TransactionType.SUBSCRIPTION_RENEWAL,
          ],
        },
        status: TransactionStatus.COMPLETED,
      },
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: "$amount" },
      },
    },
  ]);

  const totalAdminEarnings =
    totalSubscriptionTransactions.length > 0
      ? totalSubscriptionTransactions[0].totalEarnings
      : 0;

  // Format monthly earnings data - show all 12 months like ownerOverview
  const formatMonthlyEarnings = (monthlyData: any[]) => {
    const formattedData = [];
    let cumulativeEarnings = 0;
    let previousMonthTotal = 0;

    for (let i = 1; i <= 12; i++) {
      const monthData = monthlyData.find((m) => m._id === i);
      const newEarnings = monthData ? monthData.earnings : 0;
      cumulativeEarnings += newEarnings;

      let growthPercentage = 0;
      if (previousMonthTotal > 0) {
        growthPercentage = (newEarnings / previousMonthTotal) * 100;
      } else if (newEarnings > 0) {
        growthPercentage = 100;
      }

      formattedData.push({
        month: monthNames[i - 1],
        earnings: parseFloat(newEarnings.toFixed(2)),
        growthPercentage: parseFloat(growthPercentage.toFixed(2)),
      });

      previousMonthTotal =
        cumulativeEarnings > 0 ? cumulativeEarnings : newEarnings;
    }

    return formattedData;
  };

  const earningsMonthlyData = formatMonthlyEarnings(monthlyEarningsData);

  return {
    summary: {
      totalOwners,
      totalProviders,
      totalAdminEarnings: parseFloat(totalAdminEarnings.toFixed(2)),
    },
    ownerOverview: {
      year: targetYear,
      monthlyOverview: ownerMonthlyData,
    },
    earningsOverview: {
      year: targetYear,
      monthlyOverview: earningsMonthlyData,
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
    "_id userName email profilePicture role phoneNumber address createdAt experience aboutMe NIDFront referredBy"
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role === "OWNER") {
    return {
      _id: user._id,
      userName: user.userName,
      profilePicture: user.profilePicture,
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
      profilePicture: user.profilePicture,
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

const getAllOwners = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const query = { role: "OWNER", isDeleted: { $ne: true } };
  const total = await User.countDocuments(query);

  const owners = await User.find(query)
    .select(
      "_id profilePicture userName role createdAt phoneNumber email address"
    )
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    owners,
  };
};

const getAllProviders = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const query = { role: "PROVIDER", isDeleted: { $ne: true } };
  const total = await User.countDocuments(query);

  const providers = await User.find(query)
    .select(
      "_id profilePicture userName role createdAt phoneNumber email address"
    )
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    providers,
  };
};

const searchUsers = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      users: [],
    };
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  // Find all matching users
  const users = await User.find({
    isDeleted: { $ne: true },
    $or: [{ userName: regex }, { email: regex }, { phoneNumber: regex }],
  }).select(
    "_id profilePicture userName role createdAt phoneNumber email address"
  );

  // Convert to plain objects for sorting
  const plainUsers = users.map((user) => user.toObject());

  // Sort by relevance using centralized helper
  const sortedUsers = plainUsers.sort(
    sortByRelevance(trimmedSearch, ["userName", "email", "phoneNumber"])
  );

  // Apply pagination using centralized helper
  const { results: paginatedUsers, pagination } = paginateResults(
    sortedUsers,
    page,
    limit
  );

  return {
    pagination,
    users: paginatedUsers,
  };
};

const bookingRequestOverview = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const total = await Booking.countDocuments();

  const bookings = await Booking.find()
    .populate({
      path: "customerId",
      select: "userName profilePicture",
    })
    .populate({
      path: "providerId",
      select: "userName profilePicture",
    })
    .populate({
      path: "serviceId",
      select: "categoryId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const formattedBookings = bookings.map((booking: any) => ({
    ownerName: booking.customerId?.userName,
    ownerProfilePicture: booking.customerId?.profilePicture,
    providerName: booking.providerId?.userName,
    providerProfilePicture: booking.providerId?.profilePicture,
    bookingDate: booking.scheduledAt,
    category: booking.serviceId?.categoryId?.name,
    amount: booking.totalAmount,
    serviceDuration: booking.serviceDuration,
    status: booking.status,
  }));

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    bookings: formattedBookings,
  };
};

const searchBookingRequestOverview = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      bookings: [],
    };
  }

  const trimmedSearch = searchTerm.trim();

  // Use centralized search helpers
  const userIds = await findMatchingUsers(trimmedSearch);
  const categoryIds = await findMatchingCategories(trimmedSearch);
  const serviceIds = await findMatchingServices(categoryIds);

  const searchQuery: any = {
    $or: [],
  };

  if (userIds.length > 0) {
    searchQuery.$or.push(
      { customerId: { $in: userIds } },
      { providerId: { $in: userIds } }
    );
  }

  if (serviceIds.length > 0) {
    searchQuery.$or.push({ serviceId: { $in: serviceIds } });
  }

  if (searchQuery.$or.length === 0) {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      bookings: [],
    };
  }

  // Find bookings matching the search criteria
  const bookings = await Booking.find(searchQuery)
    .populate({
      path: "customerId",
      select: "userName",
    })
    .populate({
      path: "providerId",
      select: "userName",
    })
    .populate({
      path: "serviceId",
      select: "categoryId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .lean();

  // Format the results
  const formattedBookings = bookings.map((booking: any) => ({
    ownerName: booking.customerId?.userName,
    providerName: booking.providerId?.userName,
    bookingDate: booking.scheduledAt,
    category: booking.serviceId?.categoryId?.name,
    amount: booking.totalAmount,
    serviceDuration: booking.serviceDuration,
    status: booking.status,
  }));

  // Sort by relevance using centralized helper
  const sortedBookings = formattedBookings.sort(
    sortByRelevance(trimmedSearch, ["ownerName", "providerName", "category"])
  );

  // Apply pagination using centralized helper
  const { results: paginatedBookings, pagination } = paginateResults(
    sortedBookings,
    page,
    limit
  );

  return {
    pagination,
    bookings: paginatedBookings,
  };
};

const changeUserStatus = async (userId: string, isActive: boolean) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { status: isActive ? "ACTIVE" : "BLOCKED" },
    { new: true }
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    message: `User has been ${
      isActive ? "activated" : "deactivated"
    } successfully`,
  };
};

const bookingUserOverview = async (bookingId: string) => {
  if (!Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid booking ID");
  }

  const booking = await Booking.findById(bookingId)
    .populate({
      path: "customerId",
      select: "userName role createdAt phoneNumber email address referredBy",
    })
    .populate({
      path: "providerId",
      select:
        "userName role createdAt phoneNumber email address experience referredBy",
    })
    .lean();

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  const owner: any = booking.customerId;
  const provider: any = booking.providerId;

  if (!owner || !provider) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Owner or Provider information not found"
    );
  }

  const ownerTotalOrders = await Booking.countDocuments({
    customerId: owner._id,
  });

  const ownerCompletedOrders = await Booking.countDocuments({
    customerId: owner._id,
    status: "COMPLETED",
  });

  const ownerCancelledOrders = await Booking.countDocuments({
    customerId: owner._id,
    status: "CANCELLED",
  });

  const providerTotalOrders = await Booking.countDocuments({
    providerId: provider._id,
  });

  const providerCompletedOrders = await Booking.countDocuments({
    providerId: provider._id,
    status: "COMPLETED",
  });

  const providerCancelledOrders = await Booking.countDocuments({
    providerId: provider._id,
    status: "CANCELLED",
  });

  const providerServiceCategories = await Booking.aggregate([
    {
      $match: {
        providerId: new mongoose.Types.ObjectId(provider._id),
      },
    },
    {
      $lookup: {
        from: "services",
        localField: "serviceId",
        foreignField: "_id",
        as: "serviceInfo",
      },
    },
    {
      $unwind: "$serviceInfo",
    },
    {
      $lookup: {
        from: "categories",
        localField: "serviceInfo.categoryId",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    {
      $unwind: "$categoryInfo",
    },
    {
      $group: {
        _id: "$categoryInfo._id",
        categoryName: { $first: "$categoryInfo.name" },
      },
    },
  ]);

  const categoryNames = providerServiceCategories.map(
    (cat) => cat.categoryName
  );

  return {
    ownerInformation: {
      userName: owner.userName,
      role: owner.role,
      accountCreationDate: owner.createdAt,
      phoneNumber: owner.phoneNumber,
      email: owner.email,
      address: owner.address,
      referredBy: owner.referredBy || null,
      totalOrders: ownerTotalOrders,
      totalCompletedOrders: ownerCompletedOrders,
      totalCancelledOrders: ownerCancelledOrders,
    },
    providerInformation: {
      userName: provider.userName,
      serviceCategories: categoryNames,
      role: provider.role,
      accountCreationDate: provider.createdAt,
      phoneNumber: provider.phoneNumber,
      email: provider.email,
      address: provider.address,
      experience: provider.experience,
      referredBy: provider.referredBy || null,
      totalOrders: providerTotalOrders,
      totalCompletedOrders: providerCompletedOrders,
      totalCancelledOrders: providerCancelledOrders,
    },
  };
};

const ownerProfileStatus = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const query = { role: "OWNER", isDeleted: { $ne: true } };
  const total = await User.countDocuments(query);

  const owners = await User.find(query)
    .select("_id profilePicture userName role email phoneNumber")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const ownersWithStats = await Promise.all(
    owners.map(async (owner: any) => {
      const totalOrders = await Booking.countDocuments({
        customerId: owner._id,
      });

      const completedOrders = await Booking.countDocuments({
        customerId: owner._id,
        status: "COMPLETED",
      });

      const pendingOrders = await Booking.countDocuments({
        customerId: owner._id,
        status: { $in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
      });

      const cancelledOrders = await Booking.countDocuments({
        customerId: owner._id,
        status: "CANCELLED",
      });

      return {
        _id: owner._id,
        profilePicture: owner.profilePicture,
        userName: owner.userName,
        role: owner.role,
        email: owner.email,
        phoneNumber: owner.phoneNumber,
        completed: completedOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
        total: totalOrders,
      };
    })
  );

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    owners: ownersWithStats,
  };
};

const providerProfileStatus = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const query = { role: "PROVIDER", isDeleted: { $ne: true } };
  const total = await User.countDocuments(query);

  const providers = await User.find(query)
    .select("_id profilePicture userName role email phoneNumber")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const providersWithStats = await Promise.all(
    providers.map(async (provider: any) => {
      const totalOrders = await Booking.countDocuments({
        providerId: provider._id,
      });

      const completedOrders = await Booking.countDocuments({
        providerId: provider._id,
        status: "COMPLETED",
      });

      const pendingOrders = await Booking.countDocuments({
        providerId: provider._id,
        status: { $in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
      });

      const cancelledOrders = await Booking.countDocuments({
        providerId: provider._id,
        status: "CANCELLED",
      });

      return {
        _id: provider._id,
        profilePicture: provider.profilePicture,
        userName: provider.userName,
        role: provider.role,
        email: provider.email,
        phoneNumber: provider.phoneNumber,
        completed: completedOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
        total: totalOrders,
      };
    })
  );

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    providers: providersWithStats,
  };
};

const searchForProfileStatus = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      users: [],
    };
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  const users = await User.find({
    isDeleted: { $ne: true },
    $or: [{ userName: regex }, { email: regex }, { phoneNumber: regex }],
  })
    .select("_id profilePicture userName role email phoneNumber")
    .sort({ createdAt: -1 })
    .lean();

  const usersWithStats = await Promise.all(
    users.map(async (user: any) => {
      let totalOrders, completedOrders, pendingOrders, cancelledOrders;

      if (user.role === "OWNER") {
        totalOrders = await Booking.countDocuments({
          customerId: user._id,
        });

        completedOrders = await Booking.countDocuments({
          customerId: user._id,
          status: "COMPLETED",
        });

        pendingOrders = await Booking.countDocuments({
          customerId: user._id,
          status: { $in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
        });

        cancelledOrders = await Booking.countDocuments({
          customerId: user._id,
          status: "CANCELLED",
        });
      } else if (user.role === "PROVIDER") {
        totalOrders = await Booking.countDocuments({
          providerId: user._id,
        });

        completedOrders = await Booking.countDocuments({
          providerId: user._id,
          status: "COMPLETED",
        });

        pendingOrders = await Booking.countDocuments({
          providerId: user._id,
          status: { $in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
        });

        cancelledOrders = await Booking.countDocuments({
          providerId: user._id,
          status: "CANCELLED",
        });
      } else {
        totalOrders = 0;
        completedOrders = 0;
        pendingOrders = 0;
        cancelledOrders = 0;
      }

      return {
        _id: user._id,
        profilePicture: user.profilePicture,
        userName: user.userName,
        role: user.role,
        email: user.email,
        phoneNumber: user.phoneNumber,
        completed: completedOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
        total: totalOrders,
      };
    })
  );

  // Sort by relevance using centralized helper
  const sortedUsers = usersWithStats.sort(
    sortByRelevance(trimmedSearch, ["userName", "email", "phoneNumber"])
  );

  // Apply pagination using centralized helper
  const { results: paginatedUsers, pagination } = paginateResults(
    sortedUsers,
    page,
    limit
  );

  return {
    pagination,
    users: paginatedUsers,
  };
};

const bookingDetailsForSuspension = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const query = { status: "COMPLETED" };
  const total = await Booking.countDocuments(query);

  const bookings = await Booking.find(query)
    .populate({
      path: "customerId",
      select: "userName profilePicture email status",
    })
    .populate({
      path: "providerId",
      select: "userName profilePicture email status",
    })
    .populate({
      path: "serviceId",
      select: "categoryId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const formattedBookings = bookings.map((booking: any) => ({
    ownerId: booking.customerId?._id,
    ownerUserName: booking.customerId?.userName,
    ownerProfilePicture: booking.customerId?.profilePicture,
    providerId: booking.providerId?._id,
    providerUserName: booking.providerId?.userName,
    providerProfilePicture: booking.providerId?.profilePicture,
    bookingDate: booking.scheduledAt,
    ownerEmail: booking.customerId?.email,
    providerEmail: booking.providerId?.email,
    bookingService: booking.serviceId?.categoryId?.name,
    rating: booking.rating,
    providerAccountStatus: booking.providerId?.status,
  }));

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    bookings: formattedBookings,
  };
};

const searchBookingDetailsForSuspension = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      bookings: [],
    };
  }

  const trimmedSearch = searchTerm.trim();

  // Use centralized search helpers
  const userIds = await findMatchingUsers(trimmedSearch);
  const categoryIds = await findMatchingCategories(trimmedSearch);
  const serviceIds = await findMatchingServices(categoryIds);

  const searchQuery: any = {
    status: "COMPLETED",
    $or: [],
  };

  if (userIds.length > 0) {
    searchQuery.$or.push(
      { customerId: { $in: userIds } },
      { providerId: { $in: userIds } }
    );
  }

  if (serviceIds.length > 0) {
    searchQuery.$or.push({ serviceId: { $in: serviceIds } });
  }

  if (searchQuery.$or.length === 0) {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      bookings: [],
    };
  }

  const bookings = await Booking.find(searchQuery)
    .populate({
      path: "customerId",
      select: "userName profilePicture email status",
    })
    .populate({
      path: "providerId",
      select: "userName profilePicture email status",
    })
    .populate({
      path: "serviceId",
      select: "categoryId",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .sort({ createdAt: -1 })
    .lean();

  const formattedBookings = bookings.map((booking: any) => ({
    ownerUserName: booking.customerId?.userName,
    ownerProfilePicture: booking.customerId?.profilePicture,
    providerUserName: booking.providerId?.userName,
    providerProfilePicture: booking.providerId?.profilePicture,
    bookingDate: booking.scheduledAt,
    ownerEmail: booking.customerId?.email,
    providerEmail: booking.providerId?.email,
    bookingService: booking.serviceId?.categoryId?.name,
    rating: booking.rating,
    providerAccountStatus: booking.providerId?.status,
  }));

  // Sort by relevance using centralized helper
  const sortedBookings = formattedBookings.sort(
    sortByRelevance(trimmedSearch, [
      "ownerUserName",
      "providerUserName",
      "bookingService",
    ])
  );

  // Apply pagination using centralized helper
  const { results: paginatedBookings, pagination } = paginateResults(
    sortedBookings,
    page,
    limit
  );

  return {
    pagination,
    bookings: paginatedBookings,
  };
};

const createKnowledgeHubArticle = async (
  title: string,
  description: string
) => {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingArticle = await KnowledgeHub.findOne({
        title: { $regex: new RegExp(`^${title}$`, "i") },
      }).session(session);

      if (existingArticle) {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Knowledge Hub article with title '${title}' already exists`
        );
      }

      const article = await KnowledgeHub.create(
        [
          {
            title,
            description,
          },
        ],
        { session }
      );

      return article;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const getKnowledgeHubArticles = async () => {
  const articles = await KnowledgeHub.find().sort({ createdAt: -1 });
  return articles;
};

const getKnowledgeHubArticleById = async (articleId: string) => {
  if (!Types.ObjectId.isValid(articleId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid article ID");
  }

  const article = await KnowledgeHub.findById(articleId);

  if (!article) {
    throw new ApiError(httpStatus.NOT_FOUND, "Knowledge Hub article not found");
  }

  return article;
};

const updateKnowledgeHubArticle = async (
  articleId: string,
  updateData: Partial<{
    title: string;
    description: string;
  }>
) => {
  if (!Types.ObjectId.isValid(articleId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid article ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingArticle = await KnowledgeHub.findById(articleId).session(
        session
      );

      if (!existingArticle) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Knowledge Hub article not found"
        );
      }

      if (updateData.title && updateData.title !== existingArticle.title) {
        const duplicateArticle = await KnowledgeHub.findOne({
          title: { $regex: new RegExp(`^${updateData.title}$`, "i") },
        }).session(session);

        if (duplicateArticle) {
          throw new ApiError(
            httpStatus.CONFLICT,
            `Knowledge Hub article with title '${updateData.title}' already exists`
          );
        }
      }

      const updatedArticle = await KnowledgeHub.findByIdAndUpdate(
        articleId,
        { ...updateData, updatedAt: new Date() },
        { new: true, session, runValidators: true }
      );

      if (!updatedArticle) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update Knowledge Hub article"
        );
      }

      return updatedArticle;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const deleteKnowledgeHubArticle = async (articleId: string) => {
  if (!Types.ObjectId.isValid(articleId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid article ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const articleToDelete = await KnowledgeHub.findById(articleId).session(
        session
      );

      if (!articleToDelete) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Knowledge Hub article not found"
        );
      }

      const deletedArticle = await KnowledgeHub.findByIdAndDelete(
        articleId
      ).session(session);

      if (!deletedArticle) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to delete Knowledge Hub article"
        );
      }

      return { message: "Knowledge Hub article deleted successfully" };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const adminEditProfile = async (
  adminId: string,
  updateData: Partial<{
    userName: string;
    profilePicture: string;
  }>
) => {
  if (!Types.ObjectId.isValid(adminId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid admin ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const existingAdmin = await User.findById(adminId).session(session);

      if (!existingAdmin) {
        throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
      }

      const oldProfilePicture = updateData.profilePicture
        ? existingAdmin.profilePicture
        : null;

      const fieldsToUpdate: any = {};
      if (updateData.userName) {
        fieldsToUpdate.userName = updateData.userName;
      }
      if (updateData.profilePicture) {
        fieldsToUpdate.profilePicture = updateData.profilePicture;
      }

      const updateAdmin = await User.findByIdAndUpdate(
        adminId,
        fieldsToUpdate,
        { new: true, session, runValidators: true }
      ).select("_id userName email role profilePicture");

      if (!updateAdmin) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update admin profile"
        );
      }

      // Delete old profile picture from Cloudinary if a new one was uploaded
      if (
        oldProfilePicture &&
        updateData.profilePicture &&
        oldProfilePicture !== updateData.profilePicture
      ) {
        try {
          await fileUploader.deleteFromCloudinary(oldProfilePicture);
        } catch (error) {
          console.error(
            "Error deleting old profile picture from Cloudinary:",
            error
          );
        }
      }

      return updateAdmin;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const updateAboutUs = async (text: string) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "About Us text is required and must be a non-empty string"
    );
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      let content = await WebsiteContent.findOne({ type: "aboutUs" }).session(
        session
      );

      if (content) {
        content.text = text.trim();
        await content.save({ session });
      } else {
        const newContent = await WebsiteContent.create(
          [
            {
              type: "aboutUs",
              text: text.trim(),
            },
          ],
          { session }
        );
        content = newContent[0];
      }

      return {
        type: content.type,
        text: content.text,
        updatedAt: content.updatedAt,
      };
    });

    // Send notifications to all users about the content update
    const allUsers = await User.find({}, { _id: 1 });
    const recipientIds = allUsers.map((user) => user._id.toString());

    if (recipientIds.length > 0) {
      await notificationService.createBulkNotifications(recipientIds, {
        type: NotificationType.WEBSITE_CONTENT_UPDATED,
        title: "About Us Updated",
        message: "The About Us page has been updated. Check it out!",
        data: { contentType: "aboutUs" },
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
};

const updatePrivacyPolicy = async (text: string) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Privacy Policy text is required and must be a non-empty string"
    );
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      let content = await WebsiteContent.findOne({
        type: "privacyPolicy",
      }).session(session);

      if (content) {
        content.text = text.trim();
        await content.save({ session });
      } else {
        const newContent = await WebsiteContent.create(
          [
            {
              type: "privacyPolicy",
              text: text.trim(),
            },
          ],
          { session }
        );
        content = newContent[0];
      }

      return {
        type: content.type,
        text: content.text,
        updatedAt: content.updatedAt,
      };
    });

    // Send notifications to all users about the content update
    const allUsers = await User.find({}, { _id: 1 });
    const recipientIds = allUsers.map((user) => user._id.toString());

    if (recipientIds.length > 0) {
      await notificationService.createBulkNotifications(recipientIds, {
        type: NotificationType.WEBSITE_CONTENT_UPDATED,
        title: "Privacy Policy Updated",
        message:
          "Our Privacy Policy has been updated. Please review the changes.",
        data: { contentType: "privacyPolicy" },
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
};

const updateTermsAndConditions = async (text: string) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Terms and Conditions text is required and must be a non-empty string"
    );
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      let content = await WebsiteContent.findOne({
        type: "termsAndConditions",
      }).session(session);

      if (content) {
        content.text = text.trim();
        await content.save({ session });
      } else {
        const newContent = await WebsiteContent.create(
          [
            {
              type: "termsAndConditions",
              text: text.trim(),
            },
          ],
          { session }
        );
        content = newContent[0];
      }

      return {
        type: content.type,
        text: content.text,
        updatedAt: content.updatedAt,
      };
    });

    // Send notifications to all users about the content update
    const allUsers = await User.find({}, { _id: 1 });
    const recipientIds = allUsers.map((user) => user._id.toString());

    if (recipientIds.length > 0) {
      await notificationService.createBulkNotifications(recipientIds, {
        type: NotificationType.WEBSITE_CONTENT_UPDATED,
        title: "Terms and Conditions Updated",
        message:
          "Our Terms and Conditions have been updated. Please review the changes.",
        data: { contentType: "termsAndConditions" },
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
};

const updateAfialiationProgram = async (text: string) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Affiliation Program text is required and must be a non-empty string"
    );
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      let content = await WebsiteContent.findOne({
        type: "affiliationProgram",
      }).session(session);

      if (content) {
        content.text = text.trim();
        await content.save({ session });
      } else {
        const newContent = await WebsiteContent.create(
          [
            {
              type: "affiliationProgram",
              text: text.trim(),
            },
          ],
          { session }
        );
        content = newContent[0];
      }

      return {
        type: content.type,
        text: content.text,
        updatedAt: content.updatedAt,
      };
    });

    // Send notifications to all users about the content update
    const allUsers = await User.find({}, { _id: 1 });
    const recipientIds = allUsers.map((user) => user._id.toString());

    if (recipientIds.length > 0) {
      await notificationService.createBulkNotifications(recipientIds, {
        type: NotificationType.WEBSITE_CONTENT_UPDATED,
        title: "Affiliation Program Updated",
        message:
          "Our Affiliation Program has been updated. Check out the new details!",
        data: { contentType: "affiliationProgram" },
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
};

const getAboutUs = async () => {
  const content = await WebsiteContent.findOne({ type: "aboutUs" });

  if (!content) {
    throw new ApiError(httpStatus.NOT_FOUND, "About Us content not found");
  }

  return {
    type: content.type,
    text: content.text,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
};

const getPrivacyPolicy = async () => {
  const content = await WebsiteContent.findOne({ type: "privacyPolicy" });

  if (!content) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Privacy Policy content not found"
    );
  }

  return {
    type: content.type,
    text: content.text,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
};

const getTermsAndConditions = async () => {
  const content = await WebsiteContent.findOne({
    type: "termsAndConditions",
  });

  if (!content) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Terms and Conditions content not found"
    );
  }

  return {
    type: content.type,
    text: content.text,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
};

const getAfiliationProgram = async () => {
  const content = await WebsiteContent.findOne({ type: "affiliationProgram" });

  if (!content) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Affiliation Program content not found"
    );
  }

  return {
    type: content.type,
    text: content.text,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
};

const referralProgram = async (
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  const total = await Referral.countDocuments();

  const referrals = await Referral.find()
    .populate("referrerId", "userName email role profilePicture")
    .populate("refereeId", "userName email role profilePicture")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const formattedReferrals = referrals.map((referral: any) => ({
    Name: referral.refereeId?.userName || referral.refereeName,
    refereeProfilePicture:
      referral.refereeId?.profilePicture || referral.refereeProfilePicture,
    ReferredName: referral.referrerId?.userName || referral.referrerName,
    referrerProfilePicture:
      referral.referrerId?.profilePicture || referral.referrerProfilePicture,
    createdAt: referral.createdAt,
    Email: referral.refereeId?.email || referral.refereeEmail,
    ReferredEmail: referral.referrerId?.email || referral.referrerEmail,
    referrerRole: referral.referrerId?.role || referral.referrerRole,
    creditsEarned: referral.creditsEarned,
  }));

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    referrals: formattedReferrals,
  };
};

const searchForReferralProgram = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      referrals: [],
    };
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  // Use centralized search helper
  const userIds = await findMatchingUsers(trimmedSearch);

  const searchQuery: any = {
    $or: [],
  };

  if (userIds.length > 0) {
    searchQuery.$or.push(
      { referrerId: { $in: userIds } },
      { refereeId: { $in: userIds } }
    );
  }

  // Also search by cached names and emails
  searchQuery.$or.push(
    { referrerName: regex },
    { referrerEmail: regex },
    { refereeName: regex },
    { refereeEmail: regex }
  );

  if (searchQuery.$or.length === 0) {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      referrals: [],
    };
  }

  // Find referrals matching the search criteria
  const referrals = await Referral.find(searchQuery)
    .populate("referrerId", "userName email role")
    .populate("refereeId", "userName email role")
    .sort({ createdAt: -1 })
    .lean();

  // Format the results
  const formattedReferrals = referrals.map((referral: any) => ({
    Name: referral.refereeId?.userName || referral.refereeName,
    ReferredName: referral.referrerId?.userName || referral.referrerName,
    createdAt: referral.createdAt,
    Email: referral.refereeId?.email || referral.refereeEmail,
    ReferredEmail: referral.referrerId?.email || referral.referrerEmail,
    referrerRole: referral.referrerId?.role || referral.referrerRole,
    creditsEarned: referral.creditsEarned,
  }));

  // Sort by relevance using centralized helper
  const sortedReferrals = formattedReferrals.sort(
    sortByRelevance(trimmedSearch, [
      "Name",
      "ReferredName",
      "Email",
      "ReferredEmail",
    ])
  );

  // Apply pagination using centralized helper
  const { results: paginatedReferrals, pagination } = paginateResults(
    sortedReferrals,
    page,
    limit
  );

  return {
    pagination,
    referrals: paginatedReferrals,
  };
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
  searchUsers,
  bookingRequestOverview,
  changeUserStatus,
  bookingUserOverview,
  ownerProfileStatus,
  providerProfileStatus,
  bookingDetailsForSuspension,
  searchBookingRequestOverview,
  searchBookingDetailsForSuspension,
  searchForProfileStatus,
  createKnowledgeHubArticle,
  updateKnowledgeHubArticle,
  deleteKnowledgeHubArticle,
  getKnowledgeHubArticles,
  getKnowledgeHubArticleById,
  adminEditProfile,
  updateAboutUs,
  updatePrivacyPolicy,
  updateTermsAndConditions,
  getAboutUs,
  getPrivacyPolicy,
  getTermsAndConditions,
  updateAfialiationProgram,
  getAfiliationProgram,
  referralProgram,
  searchForReferralProgram,
};
