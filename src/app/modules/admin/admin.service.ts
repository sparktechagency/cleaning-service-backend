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

const searchUsers = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
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

  // Sort results by match priority
  const sortedUsers = users.sort((a, b) => {
    const searchLower = trimmedSearch.toLowerCase();

    // Calculate match scores for user A
    const aUserNameLower = (a.userName || "").toLowerCase();
    const aEmailLower = (a.email || "").toLowerCase();
    const aPhoneLower = (a.phoneNumber || "").toLowerCase();

    let scoreA = 0;
    // Exact match (highest priority)
    if (aUserNameLower === searchLower) scoreA = 1000;
    else if (aEmailLower === searchLower) scoreA = 900;
    else if (aPhoneLower === searchLower) scoreA = 800;
    // Starts with match (second priority)
    else if (aUserNameLower.startsWith(searchLower)) scoreA = 700;
    else if (aEmailLower.startsWith(searchLower)) scoreA = 600;
    else if (aPhoneLower.startsWith(searchLower)) scoreA = 500;
    // Contains match (lowest priority)
    else if (aUserNameLower.includes(searchLower)) scoreA = 400;
    else if (aEmailLower.includes(searchLower)) scoreA = 300;
    else if (aPhoneLower.includes(searchLower)) scoreA = 200;

    // Calculate match scores for user B
    const bUserNameLower = (b.userName || "").toLowerCase();
    const bEmailLower = (b.email || "").toLowerCase();
    const bPhoneLower = (b.phoneNumber || "").toLowerCase();

    let scoreB = 0;
    // Exact match (highest priority)
    if (bUserNameLower === searchLower) scoreB = 1000;
    else if (bEmailLower === searchLower) scoreB = 900;
    else if (bPhoneLower === searchLower) scoreB = 800;
    // Starts with match (second priority)
    else if (bUserNameLower.startsWith(searchLower)) scoreB = 700;
    else if (bEmailLower.startsWith(searchLower)) scoreB = 600;
    else if (bPhoneLower.startsWith(searchLower)) scoreB = 500;
    // Contains match (lowest priority)
    else if (bUserNameLower.includes(searchLower)) scoreB = 400;
    else if (bEmailLower.includes(searchLower)) scoreB = 300;
    else if (bPhoneLower.includes(searchLower)) scoreB = 200;

    // Sort by score (descending - highest score first)
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // If scores are equal, sort alphabetically by userName
    return aUserNameLower.localeCompare(bUserNameLower);
  });

  return sortedUsers;
};

const bookingRequestOverview = async () => {
  const bookings = await Booking.find()
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

  const formattedBookings = bookings.map((booking: any) => ({
    ownerName: booking.customerId?.userName,
    providerName: booking.providerId?.userName,
    bookingDate: booking.scheduledAt,
    category: booking.serviceId?.categoryId?.name,
    amount: booking.totalAmount,
    serviceDuration: booking.serviceDuration,
    status: booking.status,
  }));

  return formattedBookings;
};

const searchBookingRequestOverview = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  const matchingUsers = await User.find({
    isDeleted: { $ne: true },
    $or: [{ userName: regex }, { email: regex }, { phoneNumber: regex }],
  }).select("_id");

  const userIds = matchingUsers.map((user) => user._id);

  const matchingCategories = await Category.find({
    name: regex,
  }).select("_id");

  const categoryIds = matchingCategories.map((cat) => cat._id);

  const searchQuery: any = {
    $or: [],
  };

  if (userIds.length > 0) {
    searchQuery.$or.push(
      { customerId: { $in: userIds } },
      { providerId: { $in: userIds } }
    );
  }

  if (categoryIds.length > 0) {
    const matchingServices = await Service.find({
      categoryId: { $in: categoryIds },
    }).select("_id");

    const serviceIds = matchingServices.map((service: any) => service._id);

    if (serviceIds.length > 0) {
      searchQuery.$or.push({ serviceId: { $in: serviceIds } });
    }
  }

  if (searchQuery.$or.length === 0) {
    return [];
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

  const searchLower = trimmedSearch.toLowerCase();
  const sortedBookings = formattedBookings.sort((a: any, b: any) => {
    const aOwnerLower = (a.ownerName || "").toLowerCase();
    const aProviderLower = (a.providerName || "").toLowerCase();
    const aCategoryLower = (a.category || "").toLowerCase();

    const bOwnerLower = (b.ownerName || "").toLowerCase();
    const bProviderLower = (b.providerName || "").toLowerCase();
    const bCategoryLower = (b.category || "").toLowerCase();

    let scoreA = 0;
    if (aOwnerLower === searchLower) scoreA = 1000;
    else if (aProviderLower === searchLower) scoreA = 900;
    else if (aCategoryLower === searchLower) scoreA = 800;
    else if (aOwnerLower.startsWith(searchLower)) scoreA = 700;
    else if (aProviderLower.startsWith(searchLower)) scoreA = 600;
    else if (aCategoryLower.startsWith(searchLower)) scoreA = 500;
    else if (aOwnerLower.includes(searchLower)) scoreA = 400;
    else if (aProviderLower.includes(searchLower)) scoreA = 300;
    else if (aCategoryLower.includes(searchLower)) scoreA = 200;

    let scoreB = 0;
    if (bOwnerLower === searchLower) scoreB = 1000;
    else if (bProviderLower === searchLower) scoreB = 900;
    else if (bCategoryLower === searchLower) scoreB = 800;
    else if (bOwnerLower.startsWith(searchLower)) scoreB = 700;
    else if (bProviderLower.startsWith(searchLower)) scoreB = 600;
    else if (bCategoryLower.startsWith(searchLower)) scoreB = 500;
    else if (bOwnerLower.includes(searchLower)) scoreB = 400;
    else if (bProviderLower.includes(searchLower)) scoreB = 300;
    else if (bCategoryLower.includes(searchLower)) scoreB = 200;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return (
      new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()
    );
  });

  return sortedBookings;
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

const ownerProfileStatus = async () => {
  const owners = await User.find({ role: "OWNER", isDeleted: { $ne: true } })
    .select("_id profilePicture userName role email phoneNumber")
    .sort({ createdAt: -1 })
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

  return ownersWithStats;
};

const providerProfileStatus = async () => {
  const providers = await User.find({
    role: "PROVIDER",
    isDeleted: { $ne: true },
  })
    .select("_id profilePicture userName role email phoneNumber")
    .sort({ createdAt: -1 })
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

  return providersWithStats;
};

const searchForProfileStatus = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
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

  const searchLower = trimmedSearch.toLowerCase();
  const sortedUsers = usersWithStats.sort((a: any, b: any) => {
    const aUserNameLower = (a.userName || "").toLowerCase();
    const aEmailLower = (a.email || "").toLowerCase();
    const aPhoneLower = (a.phoneNumber || "").toLowerCase();

    const bUserNameLower = (b.userName || "").toLowerCase();
    const bEmailLower = (b.email || "").toLowerCase();
    const bPhoneLower = (b.phoneNumber || "").toLowerCase();

    let scoreA = 0;
    if (aUserNameLower === searchLower) scoreA = 1000;
    else if (aEmailLower === searchLower) scoreA = 900;
    else if (aPhoneLower === searchLower) scoreA = 800;
    else if (aUserNameLower.startsWith(searchLower)) scoreA = 700;
    else if (aEmailLower.startsWith(searchLower)) scoreA = 600;
    else if (aPhoneLower.startsWith(searchLower)) scoreA = 500;
    else if (aUserNameLower.includes(searchLower)) scoreA = 400;
    else if (aEmailLower.includes(searchLower)) scoreA = 300;
    else if (aPhoneLower.includes(searchLower)) scoreA = 200;

    let scoreB = 0;
    if (bUserNameLower === searchLower) scoreB = 1000;
    else if (bEmailLower === searchLower) scoreB = 900;
    else if (bPhoneLower === searchLower) scoreB = 800;
    else if (bUserNameLower.startsWith(searchLower)) scoreB = 700;
    else if (bEmailLower.startsWith(searchLower)) scoreB = 600;
    else if (bPhoneLower.startsWith(searchLower)) scoreB = 500;
    else if (bUserNameLower.includes(searchLower)) scoreB = 400;
    else if (bEmailLower.includes(searchLower)) scoreB = 300;
    else if (bPhoneLower.includes(searchLower)) scoreB = 200;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return aUserNameLower.localeCompare(bUserNameLower);
  });

  return sortedUsers;
};

const bookingDetailsForSuspension = async () => {
  const bookings = await Booking.find({ status: "COMPLETED" })
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

  return formattedBookings;
};

const searchBookingDetailsForSuspension = async (searchTerm: string) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  const matchingUsers = await User.find({
    isDeleted: { $ne: true },
    $or: [{ userName: regex }, { email: regex }, { phoneNumber: regex }],
  }).select("_id");

  const userIds = matchingUsers.map((user) => user._id);

  const matchingCategories = await Category.find({
    name: regex,
  }).select("_id");

  const categoryIds = matchingCategories.map((cat) => cat._id);

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

  if (categoryIds.length > 0) {
    const matchingServices = await Service.find({
      categoryId: { $in: categoryIds },
    }).select("_id");

    const serviceIds = matchingServices.map((service: any) => service._id);

    if (serviceIds.length > 0) {
      searchQuery.$or.push({ serviceId: { $in: serviceIds } });
    }
  }

  if (searchQuery.$or.length === 0) {
    return [];
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

  const searchLower = trimmedSearch.toLowerCase();
  const sortedBookings = formattedBookings.sort((a: any, b: any) => {
    const aOwnerLower = (a.ownerUserName || "").toLowerCase();
    const aProviderLower = (a.providerUserName || "").toLowerCase();
    const aServiceLower = (a.bookingService || "").toLowerCase();

    const bOwnerLower = (b.ownerUserName || "").toLowerCase();
    const bProviderLower = (b.providerUserName || "").toLowerCase();
    const bServiceLower = (b.bookingService || "").toLowerCase();

    let scoreA = 0;
    if (aOwnerLower === searchLower) scoreA = 1000;
    else if (aProviderLower === searchLower) scoreA = 900;
    else if (aServiceLower === searchLower) scoreA = 800;
    else if (aOwnerLower.startsWith(searchLower)) scoreA = 700;
    else if (aProviderLower.startsWith(searchLower)) scoreA = 600;
    else if (aServiceLower.startsWith(searchLower)) scoreA = 500;
    else if (aOwnerLower.includes(searchLower)) scoreA = 400;
    else if (aProviderLower.includes(searchLower)) scoreA = 300;
    else if (aServiceLower.includes(searchLower)) scoreA = 200;

    let scoreB = 0;
    if (bOwnerLower === searchLower) scoreB = 1000;
    else if (bProviderLower === searchLower) scoreB = 900;
    else if (bServiceLower === searchLower) scoreB = 800;
    else if (bOwnerLower.startsWith(searchLower)) scoreB = 700;
    else if (bProviderLower.startsWith(searchLower)) scoreB = 600;
    else if (bServiceLower.startsWith(searchLower)) scoreB = 500;
    else if (bOwnerLower.includes(searchLower)) scoreB = 400;
    else if (bProviderLower.includes(searchLower)) scoreB = 300;
    else if (bServiceLower.includes(searchLower)) scoreB = 200;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return (
      new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()
    );
  });

  return sortedBookings;
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
  }>
) => {
  if (!Types.ObjectId.isValid(adminId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid admin ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const updateAdmin = await User.findByIdAndUpdate(
        adminId,
        { userName: updateData.userName },
        { new: true, session, runValidators: true }
      ).select("_id userName email role profilePicture");

      if (!updateAdmin) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to update admin profile"
        );
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
};
