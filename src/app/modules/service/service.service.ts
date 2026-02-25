import mongoose from "mongoose";
import { IService, Service } from "./service.model";
import { User } from "../../models/User.model";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { Category } from "../admin/category.model";
import { fileUploader } from "../../../helpers/fileUploader";
import { Booking } from "../booking/booking.model";
import haversineDistance from "../../../utils/HeversineDistance";
import { messageService } from "../message/message.service";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "../../models/Transaction.model";

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

  // Process languages - handle comma-separated string or array
  let processedLanguages: string[] | undefined = payload.languages;
  if (processedLanguages) {
    if (typeof processedLanguages === "string") {
      // Split by comma and trim whitespace
      processedLanguages = (processedLanguages as string)
        .split(",")
        .map((lang: string) => lang.trim())
        .filter((lang: string) => lang !== "");
    } else if (Array.isArray(processedLanguages)) {
      // Clean up array elements
      processedLanguages = processedLanguages
        .map((lang: any) => (typeof lang === "string" ? lang.trim() : lang))
        .filter((lang: string) => lang !== "");
    }
  }

  let coverImageUrls: string[] = [];
  let coverImagesMeta: any[] = [];

  // Handle file uploads for cover images (support both singular and plural field names)
  const imageFiles = files?.coverImages || [];

  if (imageFiles && imageFiles.length > 0) {
    try {
      const uploadPromises = imageFiles.map(
        async (file: any, index: number) => {
          const result = await fileUploader.uploadToCloudinary(
            file,
            "service-covers"
          );
          return {
            publicId: result?.public_id || "",
            url: result?.Location || "",
            uploadedAt: new Date(),
            order: index,
          };
        }
      );

      coverImagesMeta = await Promise.all(uploadPromises);
      coverImagesMeta = coverImagesMeta.filter((img) => img.url !== ""); // Remove empty
      coverImageUrls = coverImagesMeta.map((img) => img.url);
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
    coverImagesMeta: coverImagesMeta,
    workSchedule: processedWorkSchedule,
    languages: processedLanguages,
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

  // If userId provided, filter by provider (provider viewing own services)
  if (userId) {
    query.providerId = userId;
  } else {
    // When not viewing own services, exclude limit-exceeded providers
    // Use real-time check to get providers who have exceeded their booking limit
    const { subscriptionService } = await import(
      "../subscription/subscription.service"
    );
    const limitExceededProviderIds =
      await subscriptionService.getProvidersExceedingLimit();

    if (limitExceededProviderIds.length > 0) {
      query.providerId = { $nin: limitExceededProviderIds };
    }
  }

  const total = await Service.countDocuments(query);

  // Get services with provider plan information for priority sorting
  const services = await Service.find(query)
    .populate("categoryId", "name description")
    .populate(
      "providerId",
      "userName email phoneNumber profilePicture plan badge"
    )
    .select("-__v")
    .lean();

  // Sort by subscription priority, then by rating, then by creation date
  const sortedServices = services.sort((a: any, b: any) => {
    // Define priority mapping (lower number = higher priority)
    const priorityMap: Record<string, number> = {
      PLATINUM: 1,
      GOLD: 2,
      SILVER: 3,
      FREE: 4,
    };

    const aPlan = a.providerId?.plan || "FREE";
    const bPlan = b.providerId?.plan || "FREE";
    const aPriority = priorityMap[aPlan] || 5;
    const bPriority = priorityMap[bPlan] || 5;

    // First, sort by subscription priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // If same priority, sort by rating average
    const aRating = a.ratingsAverage || 0;
    const bRating = b.ratingsAverage || 0;
    if (aRating !== bRating) {
      return bRating - aRating;
    }

    // If same rating, sort by creation date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Apply pagination after sorting
  const paginatedServices = sortedServices.slice(
    (page - 1) * limit,
    page * limit
  );

  return {
    services: paginatedServices,
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

  // Process languages - handle comma-separated string or array
  let processedLanguages: string[] | undefined = payload.languages;
  if (processedLanguages) {
    if (typeof processedLanguages === "string") {
      processedLanguages = (processedLanguages as string)
        .split(",")
        .map((lang: string) => lang.trim())
        .filter((lang: string) => lang !== "");
    } else if (Array.isArray(processedLanguages)) {
      processedLanguages = processedLanguages
        .map((lang: any) => (typeof lang === "string" ? lang.trim() : lang))
        .filter((lang: string) => lang !== "");
    }
  }

  let coverImageUrls: string[] = service.coverImages || [];
  let coverImagesMeta: any[] = (service as any).coverImagesMeta || [];

  // Handle new cover image uploads
  if (files && files.coverImages) {
    try {
      // Get the next order number
      const nextOrder =
        coverImagesMeta.length > 0
          ? Math.max(...coverImagesMeta.map((img: any) => img.order)) + 1
          : 0;

      const uploadPromises = files.coverImages.map(
        async (file: any, index: number) => {
          const result = await fileUploader.uploadToCloudinary(
            file,
            "service-covers"
          );
          return {
            publicId: result?.public_id || "",
            url: result?.Location || "",
            uploadedAt: new Date(),
            order: nextOrder + index,
          };
        }
      );

      const newImagesMeta = await Promise.all(uploadPromises);
      const validImagesMeta = newImagesMeta.filter((img) => img.url !== "");
      const newImageUrls = validImagesMeta.map((img) => img.url);

      coverImageUrls = [...coverImageUrls, ...newImageUrls];
      coverImagesMeta = [...coverImagesMeta, ...validImagesMeta];
    } catch (error) {
      console.error("Image upload error:", error);
    }
  }

  const updatedService = await Service.findByIdAndUpdate(
    serviceId,
    {
      ...payload,
      coverImages: coverImageUrls,
      coverImagesMeta: coverImagesMeta,
      workSchedule: processedWorkSchedule,
      languages: processedLanguages,
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
  // Prefer using publicId from metadata, fallback to URL parsing
  const coverImagesMeta = (service as any).coverImagesMeta || [];

  if (coverImagesMeta.length > 0) {
    // Use metadata with publicId for efficient deletion
    const deletePromises = coverImagesMeta.map(async (img: any) => {
      try {
        await fileUploader.deleteFromCloudinary(img.url);
      } catch (error) {
        console.error(
          `Failed to delete image ${img.id} from Cloudinary:`,
          error
        );
      }
    });
    await Promise.all(deletePromises);
  } else if (service.coverImages && service.coverImages.length > 0) {
    // Fallback to legacy URL-based deletion for old data
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

const deleteSinglePhoto = async (
  serviceId: string,
  photoId: string,
  userId: string
): Promise<void> => {
  // Validate serviceId
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
      "You can only delete photos from your own services"
    );
  }

  const coverImagesMeta = (service as any).coverImagesMeta || [];
  const coverImages = service.coverImages || [];

  // Find photo by ID in metadata
  const photoIndex = coverImagesMeta.findIndex(
    (img: any) => img._id.toString() === photoId
  );

  if (photoIndex === -1) {
    throw new ApiError(httpStatus.NOT_FOUND, "Photo not found");
  }

  // Ensure at least one photo remains
  if (coverImagesMeta.length <= 1 && coverImages.length <= 1) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot delete the last photo. Service must have at least one photo."
    );
  }

  const photoToDelete = coverImagesMeta[photoIndex];

  // Delete from Cloudinary using publicId
  try {
    if (photoToDelete.publicId) {
      await fileUploader.deleteFromCloudinary(photoToDelete.url);
    }
  } catch (error) {
    console.error("Failed to delete photo from Cloudinary:", error);
    // Continue with database update even if Cloudinary deletion fails
  }

  // Remove photo from both arrays
  coverImagesMeta.splice(photoIndex, 1);
  const urlIndex = coverImages.indexOf(photoToDelete.url);
  if (urlIndex > -1) {
    coverImages.splice(urlIndex, 1);
  }

  // Reorder remaining photos
  coverImagesMeta.forEach((img: any, index: number) => {
    img.order = index;
  });

  // Update service
  await Service.findByIdAndUpdate(
    serviceId,
    {
      coverImages: coverImages,
      coverImagesMeta: coverImagesMeta,
    },
    { new: true }
  );
};

const getServicesUnderCategory = async (categoryId: string) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
  }

  // Get providers who have exceeded their booking limit (real-time check)
  const { subscriptionService } = await import(
    "../subscription/subscription.service"
  );
  const limitExceededProviderIds =
    await subscriptionService.getProvidersExceedingLimit();

  // Build query to exclude limit-exceeded providers
  const query: any = { categoryId };
  if (limitExceededProviderIds.length > 0) {
    query.providerId = { $nin: limitExceededProviderIds };
  }

  const services = await Service.find(query)
    .populate("providerId", "userName profilePicture plan")
    .select(
      "name coverImages coverImagesMeta ratingsAverage needApproval rateByHour providerId createdAt"
    )
    .lean();

  // Sort by subscription priority, then rating, then creation date
  const priorityMap: Record<string, number> = {
    PLATINUM: 1,
    GOLD: 2,
    SILVER: 3,
    FREE: 4,
  };

  services.sort((a: any, b: any) => {
    const aPriority = priorityMap[a.providerId?.plan || "FREE"] || 5;
    const bPriority = priorityMap[b.providerId?.plan || "FREE"] || 5;

    if (aPriority !== bPriority) return aPriority - bPriority;

    const aRating = a.ratingsAverage || 0;
    const bRating = b.ratingsAverage || 0;
    if (aRating !== bRating) return bRating - aRating;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Transform the data to include only required fields
  const transformedServices = services.map((service: any) => {
    const imagesMeta = service.coverImagesMeta || [];
    const sortedImages =
      imagesMeta.length > 0
        ? imagesMeta.sort((a: any, b: any) => a.order - b.order)
        : [];
    const firstImage = sortedImages[0]?.url || service.coverImages?.[0] || null;

    return {
      _id: service._id,
      serviceName: service.name,
      serviceImage: firstImage,
      averageRatings: service.ratingsAverage || 0,
      providerName: service.providerId?.userName || "Unknown Provider",
      providerProfilePicture: service.providerId?.profilePicture || null,
      isApprovalRequired: service.needApproval || false,
      price: service.rateByHour,
    };
  });

  return transformedServices;
};

const getServiceOverview = async (serviceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId)
    .populate("providerId", "lattitude longitude")
    .select(
      "name description coverImages coverImagesMeta ratingsAverage needApproval rateByHour providerId totalOrders bufferTime"
    )
    .lean();

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  const imagesMeta = (service as any).coverImagesMeta || [];
  const sortedImages =
    imagesMeta.length > 0
      ? imagesMeta.sort((a: any, b: any) => a.order - b.order)
      : [];
  const firstImage = sortedImages[0]?.url || service.coverImages?.[0] || null;
  const allPhotos =
    sortedImages.length > 0
      ? sortedImages.map((img: any) => ({
          id: img._id,
          url: img.url,
          uploadedAt: img.uploadedAt,
          order: img.order,
        }))
      : (service.coverImages || []).map((url: string, index: number) => ({
          url,
          order: index,
        }));

  const transformedService = {
    _id: service._id,
    name: service.name,
    oneImage: firstImage,
    rateByHour: service.rateByHour,
    bufferTime: service.bufferTime || 0,
    lattitude: (service.providerId as any)?.lattitude || null,
    longitude: (service.providerId as any)?.longitude || null,
    averageRatings: service.ratingsAverage || 0,
    totalOrders: service.totalOrders || 0,
    instantBooking: service.needApproval || false,
    description: service.description || "",
    photos: allPhotos,
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
    name: provider.userName,
    address: provider.address || null,
    experience: provider.experience || null,
    aboutMe: provider.aboutMe || null,
  };

  return providerDetails;
};

const getServiceRatingAndReview = async (serviceId: string) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  const service = await Service.findById(serviceId);

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Import Booking model
  const { Booking } = require("../booking/booking.model");

  // Find all bookings for this service that have ratings and reviews
  const bookingsWithReviews = await Booking.find({
    serviceId: serviceId,
    rating: { $exists: true, $ne: null },
    review: { $exists: true, $ne: null },
  })
    .populate("customerId", "userName profilePicture")
    .select("customerId rating review createdAt")
    .sort({ createdAt: -1 })
    .lean();

  // Transform the data to show owner details with their ratings and reviews
  const reviews = bookingsWithReviews.map((booking: any) => ({
    ownerName: booking.customerId?.userName || "Unknown User",
    ownerProfilePicture: booking.customerId?.profilePicture || null,
    rating: booking.rating,
    review: booking.review,
  }));

  return reviews;
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

const getServiceProviderAvailableSlots = async (
  serviceId: string,
  date: string
) => {
  // Validate serviceId
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service ID");
  }

  // Fetch service with workSchedule, providerId and bufferTime
  const service = await Service.findById(serviceId).select(
    "workSchedule providerId bufferTime"
  );

  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
  }

  // Parse date and get day of week
  const [year, month, day] = date.split("-").map(Number);
  const selectedDate = new Date(Date.UTC(year, month - 1, day));

  if (isNaN(selectedDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid date format");
  }

  const dayOfWeek = selectedDate.getUTCDay();
  const dayMap = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const dayKey = dayMap[dayOfWeek];

  // Get schedule for the selected day
  const daySchedule = service.workSchedule?.[dayKey];

  // Check if provider is available on this day
  if (!daySchedule || !daySchedule.isAvailable) {
    return {
      date,
      day: daySchedule?.day || dayKey.charAt(0).toUpperCase() + dayKey.slice(1),
      isAvailable: false,
      message: "Provider is not available on this day",
      slots: [],
    };
  }

  // Validate startTime and endTime exist
  if (!daySchedule.startTime || !daySchedule.endTime) {
    return {
      date,
      day: daySchedule.day,
      isAvailable: false,
      message: "Provider has not set working hours for this day",
      slots: [],
    };
  }

  // Parse time to minutes helper
  const parseTimeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Format minutes to time helper
  const formatMinutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}`;
  };

  const startMinutes = parseTimeToMinutes(daySchedule.startTime);
  const endMinutes = parseTimeToMinutes(daySchedule.endTime);

  // Generate 15-minute slots
  const SLOT_DURATION = 15;
  const allSlots: { time: string; minutes: number }[] = [];

  for (let m = startMinutes; m < endMinutes; m += SLOT_DURATION) {
    allSlots.push({
      time: formatMinutesToTime(m),
      minutes: m,
    });
  }

  // Get start and end of the selected date in UTC
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Fetch all non-cancelled bookings for this provider on this date
  // Only confirmed bookings block time slots (not TempBookings pending payment)
  const bookings = await Booking.find({
    providerId: service.providerId,
    status: { $ne: "CANCELLED" },
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
  }).select("scheduledAt serviceDuration bufferTime");

  // Convert bookings to time ranges in minutes (including bufferTime from service)
  const bookedRanges = bookings.map((booking) => {
    const bookingStart = new Date(booking.scheduledAt);
    const bookingStartMinutes =
      bookingStart.getUTCHours() * 60 + bookingStart.getUTCMinutes();
    const bookingBufferTime = service.bufferTime || 0; // Use service bufferTime instead of booking bufferTime
    const bookingEndMinutes =
      bookingStartMinutes + booking.serviceDuration * 60 + bookingBufferTime;
    return { start: bookingStartMinutes, end: bookingEndMinutes };
  });

  // Check each slot for availability
  const slots = allSlots.map((slot) => {
    const slotStart = slot.minutes;

    // Check if slot overlaps with any booking (including buffer time)
    const isBooked = bookedRanges.some(
      (range) => slotStart >= range.start && slotStart < range.end
    );

    return {
      time: slot.time,
      available: !isBooked,
    };
  });

  return {
    date,
    day: daySchedule.day,
    isAvailable: true,
    workingHours: {
      startTime: daySchedule.startTime,
      endTime: daySchedule.endTime,
    },
    slots,
  };
};

const searchAndFilterServices = async (queryParams: {
  search?: string;
  categoryId?: string;
  date?: string; // Format: YYYY-MM-DD
  time?: string; // Format: HH:MM
  latitude?: string;
  longitude?: string;
  minPrice?: string;
  maxPrice?: string;
  experience?: string;
  instantBooking?: string;
  gender?: string;
  language?: string;
}) => {
  try {
    const {
      search,
      categoryId,
      date,
      time,
      latitude,
      longitude,
      minPrice,
      maxPrice,
      experience,
      instantBooking,
      gender,
      language,
    } = queryParams;

    // Step 0: Get providers who have exceeded their booking limit (real-time check)
    const { subscriptionService } = await import(
      "../subscription/subscription.service"
    );
    const limitExceededProviderIds =
      await subscriptionService.getProvidersExceedingLimit();

    // Step 1: Build base query for services
    let serviceQuery: any = {};

    // Exclude services from limit-exceeded providers
    if (limitExceededProviderIds.length > 0) {
      serviceQuery.providerId = { $nin: limitExceededProviderIds };
    }

    // Search by name or description
    if (search && search.trim()) {
      serviceQuery.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // Filter by category (if not "all")
    if (categoryId && categoryId !== "all") {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid category ID");
      }
      serviceQuery.categoryId = categoryId;
    }

    // Filter by gender
    if (gender && (gender === "Male" || gender === "Female")) {
      serviceQuery.gender = gender;
    }

    // Filter by language
    if (language && language.trim()) {
      serviceQuery.languages = { $in: [language.trim()] };
    }

    // Filter by price range (rateByHour)
    if (minPrice || maxPrice) {
      const min = minPrice ? parseFloat(minPrice) : 0;
      const max = maxPrice ? parseFloat(maxPrice) : Number.MAX_SAFE_INTEGER;

      if (isNaN(min) || isNaN(max)) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid price range");
      }
    }

    // Filter by instant booking (needApproval field)
    if (instantBooking) {
      if (instantBooking.toLowerCase() === "yes") {
        // User wants instant booking (no approval needed)
        serviceQuery.needApproval = false;
      } else if (instantBooking.toLowerCase() === "no") {
        // User wants services that require approval
        serviceQuery.needApproval = true;
      }
    }

    // Step 2: Get services based on base query
    let services = await Service.find(serviceQuery)
      .populate("categoryId", "name description image")
      .populate(
        "providerId",
        "userName email phoneNumber profilePicture lattitude longitude experience plan"
      )
      .sort({ createdAt: -1 })
      .lean();

    // Step 3: Filter by provider experience (exact match for enum values: "0-1", "1-5", "+5")
    if (experience && experience.trim()) {
      const validExperiences = ["0-1", "1-5", "+5"];
      const requestedExp = experience.trim();
      
      if (validExperiences.includes(requestedExp)) {
        // Filter services where provider has exact matching experience
        services = services.filter((service: any) => {
          const provider = service.providerId;
          if (!provider || !provider.experience) return false;

          // Exact match only
          return provider.experience === requestedExp;
        });
      }
    }

    // Step 4: Filter by date and time (check for ongoing bookings)
    if (date && time) {
      try {
        // Parse the date and time
        const [year, month, day] = date.split("-").map(Number);
        const [hours, minutes] = time.split(":").map(Number);

        if (
          isNaN(year) ||
          isNaN(month) ||
          isNaN(day) ||
          isNaN(hours) ||
          isNaN(minutes)
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time"
          );
        }

        const selectedDateTime = new Date(year, month - 1, day, hours, minutes);

        // Check if the date is in the past
        if (selectedDateTime < new Date()) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Selected date and time cannot be in the past"
          );
        }

        // Get day of week (0 = Sunday, 1 = Monday, etc.)
        const dayOfWeek = selectedDateTime.getDay();
        const dayNames = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];
        const selectedDay = dayNames[dayOfWeek];

        // Get all provider IDs from current services
        const providerIds = services.map((service: any) =>
          service.providerId._id.toString()
        );

        // Find providers with ongoing bookings at the selected date and time
        const ongoingBookings = await Booking.find({
          providerId: { $in: providerIds },
          status: "ONGOING",
          scheduledAt: {
            $gte: new Date(selectedDateTime.getTime() - 60 * 60 * 1000), // 1 hour before
            $lte: new Date(selectedDateTime.getTime() + 60 * 60 * 1000), // 1 hour after
          },
        }).select("providerId");

        const busyProviderIds = ongoingBookings
          .filter((booking) => booking.providerId)
          .map((booking) => booking.providerId!.toString());

        // Filter out services from busy providers and check work schedule
        services = services.filter((service: any) => {
          const provider = service.providerId;

          // Remove if provider has ongoing booking
          if (busyProviderIds.includes(provider._id.toString())) {
            return false;
          }

          // Check if provider is available on the selected day
          const workSchedule = service.workSchedule;
          if (!workSchedule || !workSchedule[selectedDay]) {
            return false;
          }

          const daySchedule = workSchedule[selectedDay];
          if (!daySchedule.isAvailable) {
            return false;
          }

          // Check if selected time is within provider's working hours
          if (!daySchedule.startTime || !daySchedule.endTime) {
            return false;
          }

          const [startHour, startMin] = daySchedule.startTime
            .split(":")
            .map(Number);
          const [endHour, endMin] = daySchedule.endTime.split(":").map(Number);

          const workStartTime = hours * 60 + minutes;
          const scheduleStartTime = startHour * 60 + startMin;
          const scheduleEndTime = endHour * 60 + endMin;

          return (
            workStartTime >= scheduleStartTime &&
            workStartTime <= scheduleEndTime
          );
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Error processing date and time filter"
        );
      }
    }

    // Step 5: Filter by location (20km radius)
    if (latitude && longitude) {
      const userLat = parseFloat(latitude);
      const userLon = parseFloat(longitude);

      if (isNaN(userLat) || isNaN(userLon)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid latitude or longitude"
        );
      }

      if (userLat < -90 || userLat > 90 || userLon < -180 || userLon > 180) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Latitude must be between -90 and 90, longitude between -180 and 180"
        );
      }

      const RADIUS_KM = 20;

      services = services.filter((service: any) => {
        const provider = service.providerId;
        if (!provider || !provider.lattitude || !provider.longitude) {
          return false;
        }

        const distance = haversineDistance(
          userLat,
          userLon,
          provider.lattitude,
          provider.longitude
        );

        return distance <= RADIUS_KM;
      });
    }

    // Step 6: Filter by price range (post-processing since rateByHour is string)
    if (minPrice || maxPrice) {
      const min = minPrice ? parseFloat(minPrice) : 0;
      const max = maxPrice ? parseFloat(maxPrice) : Number.MAX_SAFE_INTEGER;

      services = services.filter((service: any) => {
        if (!service.rateByHour) return false;

        const rate = parseFloat(service.rateByHour);
        if (isNaN(rate)) return false;

        return rate >= min && rate <= max;
      });
    }

    // Step 7: Sort by subscription priority, then rating, then creation date
    const priorityMap: Record<string, number> = {
      PLATINUM: 1,
      GOLD: 2,
      SILVER: 3,
      FREE: 4,
    };

    services.sort((a: any, b: any) => {
      const aPriority = priorityMap[a.providerId?.plan || "FREE"] || 5;
      const bPriority = priorityMap[b.providerId?.plan || "FREE"] || 5;

      if (aPriority !== bPriority) return aPriority - bPriority;

      const aRating = a.ratingsAverage || 0;
      const bRating = b.ratingsAverage || 0;
      if (aRating !== bRating) return bRating - aRating;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Step 8: Transform and format the response
    const transformedServices = services.map((service: any) => {
      const imagesMeta = service.coverImagesMeta || [];
      const sortedImages =
        imagesMeta.length > 0
          ? imagesMeta.sort((a: any, b: any) => a.order - b.order)
          : [];
      const firstImage =
        sortedImages[0]?.url || service.coverImages?.[0] || null;

      return {
        _id: service._id,
        serviceName: service.name,
        serviceImage: firstImage,
        averageRating: service.ratingsAverage || 0,
        providerName: service.providerId?.userName || "Unknown Provider",
        providerProfilePicture: service.providerId?.profilePicture || null,
        rateByHour: service.rateByHour,
      };
    });

    return {
      success: true,
      total: transformedServices.length,
      services: transformedServices,
      filters: {
        search: search || null,
        categoryId: categoryId || "all",
        date: date || null,
        time: time || null,
        location:
          latitude && longitude
            ? { latitude, longitude, radius: "20km" }
            : null,
        priceRange:
          minPrice || maxPrice
            ? {
                min: minPrice || "0",
                max: maxPrice || "unlimited",
              }
            : null,
        experience: experience || null,
        instantBooking: instantBooking || null,
        gender: gender || null,
        language: language || null,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error searching and filtering services"
    );
  }
};

const getProviderHomepageContentData = async (providerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(providerId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid provider ID");
  }

  // Fetch provider details
  const provider = await User.findById(providerId).select(
    "lattitude longitude plan role"
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, "Provider not found");
  }

  if (provider.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "This endpoint is only for providers"
    );
  }

  // Get pending bookings count
  const pendingBookingsCount = await Booking.countDocuments({
    providerId: providerId,
    status: "PENDING",
  });

  // Get unread message count (number of people with unread messages)
  const unreadMessageData = await messageService.getUnreadMessageCount(
    providerId
  );

  // Calculate total earnings for current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const monthlyEarnings = await Transaction.aggregate([
    {
      $match: {
        receiverId: new mongoose.Types.ObjectId(providerId),
        transactionType: TransactionType.BOOKING_PAYMENT,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: "$amount" },
      },
    },
  ]);

  const totalMonthlyEarnings =
    monthlyEarnings.length > 0 ? monthlyEarnings[0].totalEarnings : 0;

  // Prepare response
  const homepageData = {
    location: {
      latitude: provider.lattitude || null,
      longitude: provider.longitude || null,
    },
    pendingBookings: pendingBookingsCount,
    unreadMessages: unreadMessageData.unreadCount,
    currentPlan: provider.plan || "FREE",
    monthlyEarnings: parseFloat(totalMonthlyEarnings.toFixed(2)),
  };

  return homepageData;
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
  deleteSinglePhoto,
  getServiceRatingAndReview,
  getServiceProviderSchedule,
  getServiceProviderAvailableSlots,
  searchAndFilterServices,
  getProviderHomepageContentData,
};
