import mongoose from "mongoose";
import { IService, Service } from "./service.model";
import { User } from "../../models/User.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { Category } from "../admin/category.model";
import { fileUploader } from "../../../helpers/fileUploader";

const getAllCategories = async (options: { search?: string }) => {
  const { search } = options;

  let query = Category.find({});

  if (search) {
    query = query.find({
      name: { $regex: search, $options: "i" },
    });
  }

  const categories = await query
    .sort({ createdAt: -1 })
    .select("-__v -createdAt -updatedAt")
    .lean();

  // Get service count for each category
  const categoriesWithServiceCount = await Promise.all(
    categories.map(async (category) => {
      const serviceCount = await Service.countDocuments({
        categoryId: category._id,
      });

      return {
        ...category,
        serviceCount,
      };
    })
  );

  return {
    categories: categoriesWithServiceCount,
  };
};

const createService = async (
  payload: Partial<IService>,
  userId: string,
  files?: any
): Promise<IService> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers can create services"
    );
  }

  // Validate category exists
  const category = await Category.findById(payload.categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  //Process work schedule - create default schedule if not provided
  let processedWorkSchedule = payload.workSchedule;

  // Handle JSON string parsing if validation preprocessing didn't work
  if (typeof processedWorkSchedule === "string") {
    try {
      processedWorkSchedule = JSON.parse(processedWorkSchedule);
    } catch (error) {
      processedWorkSchedule = undefined;
    }
  }

  if (!processedWorkSchedule) {
    processedWorkSchedule = {
      monday: { day: "Monday", isAvailable: false, startTime: "", endTime: "" },
      tuesday: {
        day: "Tuesday",
        isAvailable: false,
        startTime: "",
        endTime: "",
      },
      wednesday: {
        day: "Wednesday",
        isAvailable: false,
        startTime: "",
        endTime: "",
      },
      thursday: {
        day: "Thursday",
        isAvailable: false,
        startTime: "",
        endTime: "",
      },
      friday: { day: "Friday", isAvailable: false, startTime: "", endTime: "" },
      saturday: {
        day: "Saturday",
        isAvailable: false,
        startTime: "",
        endTime: "",
      },
      sunday: { day: "Sunday", isAvailable: false, startTime: "", endTime: "" },
    };
  }

  // Validate work schedule consistency
  Object.entries(processedWorkSchedule).forEach(([dayKey, daySchedule]) => {
    if (daySchedule.isAvailable) {
      if (!daySchedule.startTime || !daySchedule.endTime) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Start time and end time are required for available days (${daySchedule.day})`
        );
      }

      // Validate that start time is before end time
      const startTime = new Date(`2000-01-01T${daySchedule.startTime}:00`);
      const endTime = new Date(`2000-01-01T${daySchedule.endTime}:00`);

      if (startTime >= endTime) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Start time must be before end time for ${daySchedule.day}`
        );
      }
    }
  });

  let coverImageUrls: string[] = [];

  // Handle file uploads for cover images (support both singular and plural field names)
  const imageFiles = files?.coverImages || [];

  if (imageFiles && imageFiles.length > 0) {
    try {
      const uploadPromises = imageFiles.map(async (file: any) => {
        const result = await fileUploader.uploadToCloudinary(
          file,
          "service-covers"
        );
        return result?.Location || "";
      });

      coverImageUrls = await Promise.all(uploadPromises);
      coverImageUrls = coverImageUrls.filter((url) => url !== ""); // Remove empty URLs
    } catch (error) {
      console.error("Image upload error:", error);
    }
  }

  // Check if service name already exists for this provider
  const existingService = await Service.findOne({
    providerId: user._id,
    name: { $regex: new RegExp(`^${payload.name}$`, "i") },
  });

  if (existingService) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "You already have a service with this name"
    );
  }

  // Prepare service data
  const serviceData = {
    ...payload,
    providerId: user._id,
    coverImages: coverImageUrls,
    workSchedule: processedWorkSchedule,
  };

  const newService = new Service(serviceData);
  await newService.save();

  return newService;
};

const getAllServices = async (options: {
  search?: string;
  categoryId?: string;
  gender?: string;
  page?: number;
  limit?: number;
  userId?: string;
}) => {
  const { search, categoryId, gender, page = 1, limit = 20, userId } = options;

  let query: any = {};

  // Search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by category
  if (categoryId) {
    query.categoryId = categoryId;
  }

  // Filter by gender
  if (gender) {
    query.gender = gender;
  }

  // If userId provided, filter by provider
  if (userId) {
    query.providerId = userId;
  }

  const total = await Service.countDocuments(query);

  const services = await Service.find(query)
    .populate("categoryId", "name description")
    .populate("providerId", "userName email phoneNumber profilePicture")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select("-__v")
    .lean();

  return {
    services,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getServiceById = async (serviceId: string): Promise<IService | null> => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId)
    .populate("categoryId", "name description")
    .populate("providerId", "userName email phoneNumber profilePicture")
    .lean();

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  return service;
};

const updateService = async (
  serviceId: string,
  payload: Partial<IService>,
  userId: string,
  files?: any
): Promise<IService | null> => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Check if user owns this service
  if (service.providerId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only update your own services"
    );
  }

  // Validate category if provided
  if (payload.categoryId) {
    const category = await Category.findById(payload.categoryId);
    if (!category) {
      throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
    }
  }

  // Process work schedule - handle JSON string parsing if needed
  let processedWorkSchedule = payload.workSchedule;
  if (typeof processedWorkSchedule === "string") {
    try {
      processedWorkSchedule = JSON.parse(processedWorkSchedule);
    } catch (error) {
      processedWorkSchedule = undefined;
    }
  }

  // Validate work schedule if provided
  if (processedWorkSchedule) {
    Object.entries(processedWorkSchedule).forEach(([dayKey, daySchedule]) => {
      if (daySchedule.isAvailable) {
        if (!daySchedule.startTime || !daySchedule.endTime) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Start time and end time are required for available days (${daySchedule.day})`
          );
        }

        // Validate that start time is before end time
        const startTime = new Date(`2000-01-01T${daySchedule.startTime}:00`);
        const endTime = new Date(`2000-01-01T${daySchedule.endTime}:00`);

        if (startTime >= endTime) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Start time must be before end time for ${daySchedule.day}`
          );
        }
      }
    });
  }

  let coverImageUrls: string[] = service.coverImages || [];

  // Handle new cover image uploads
  if (files && files.coverImages) {
    try {
      const uploadPromises = files.coverImages.map(async (file: any) => {
        const result = await fileUploader.uploadToCloudinary(file);
        return result?.Location || "";
      });

      const newImageUrls = await Promise.all(uploadPromises);
      coverImageUrls = [
        ...coverImageUrls,
        ...newImageUrls.filter((url) => url !== ""),
      ];
    } catch (error) {
      console.error("Image upload error:", error);
    }
  }

  const updatedService = await Service.findByIdAndUpdate(
    serviceId,
    {
      ...payload,
      coverImages: coverImageUrls,
      workSchedule: processedWorkSchedule,
    },
    { new: true, runValidators: true }
  )
    .populate("categoryId", "name description")
    .populate("providerId", "userName email phoneNumber profilePicture");

  return updatedService;
};

const deleteService = async (
  serviceId: string,
  userId: string
): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Check if user owns this service
  if (service.providerId.toString() !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You can only delete your own services"
    );
  }

  // Delete cover images from Cloudinary before deleting the service
  if (service.coverImages && service.coverImages.length > 0) {
    const deletePromises = service.coverImages.map(async (imageUrl: string) => {
      try {
        await fileUploader.deleteFromCloudinary(imageUrl);
      } catch (error) {
        console.error("Failed to delete image from Cloudinary:", error);
      }
    });
    await Promise.all(deletePromises);
  }

  await Service.findByIdAndDelete(serviceId);
};

const getServicesUnderCategory = async (categoryId: string) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
  }

  const services = await Service.find({ categoryId })
    .populate("providerId", "userName profilePicture")
    .select(
      "name coverImages ratingsAverage needApproval rateByHour providerId"
    )
    .sort({ createdAt: -1 })
    .lean();

  // Transform the data to include only required fields
  const transformedServices = services.map((service: any) => ({
    _id: service._id,
    serviceName: service.name,
    serviceImage:
      service.coverImages && service.coverImages.length > 0
        ? service.coverImages[0]
        : null,
    averageRatings: service.ratingsAverage || 0,
    providerName: service.providerId?.userName || "Unknown Provider",
    providerProfilePicture: service.providerId?.profilePicture || null,
    isApprovalRequired: service.needApproval || false,
    price: service.rateByHour,
  }));

  return transformedServices;
};

const getServiceOverview = async (serviceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId)
    .populate("providerId", "lattitude longitude")
    .select(
      "name description coverImages ratingsAverage needApproval rateByHour providerId totalOrders"
    )
    .lean();

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  const transformedService = {
    _id: service._id,
    serviceName: service.name,
    coverImage:
      service.coverImages && service.coverImages.length > 0
        ? service.coverImages[0]
        : null,
    price: service.rateByHour,
    lattitude: (service.providerId as any)?.lattitude || null,
    longitude: (service.providerId as any)?.longitude || null,
    averageRatings: service.ratingsAverage || 0,
    totalOrders: service.totalOrders || 0,
    isApprovalRequired: service.needApproval || false,
    description: service.description || "",
    photos: service.coverImages || [],
  };

  return transformedService;
};

const getServiceProviderDetails = async (serviceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId)
    .populate(
      "providerId",
      "userName profilePicture experience address aboutMe"
    )
    .select("providerId")
    .lean();

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  const provider = service.providerId as any;

  const providerDetails = {
    _id: provider._id,
    profilePicture: provider.profilePicture || null,
    userName: provider.userName,
    address: provider.address || null,
    experience: provider.experience || null,
    aboutMe: provider.aboutMe || null,
  };

  return providerDetails;
};

const getServiceProviderSchedule = async (serviceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId).select(
    "workSchedule providerId"
  );

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  return service.workSchedule;
};

export const serviceService = {
  getAllCategories,
  createService,
  getAllServices,
  getServiceOverview,
  getServiceProviderDetails,
  getServicesUnderCategory,
  getServiceById,
  updateService,
  deleteService,
  getServiceProviderSchedule,
};
