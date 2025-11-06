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

    // Step 1: Build base query for services
    let serviceQuery: any = {};

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
        "userName email phoneNumber profilePicture lattitude longitude experience"
      )
      .sort({ createdAt: -1 })
      .lean();

    // Step 3: Filter by provider experience
    if (experience && experience.trim()) {
      const experienceYears = parseInt(experience);
      if (!isNaN(experienceYears)) {
        services = services.filter((service: any) => {
          const provider = service.providerId;
          if (!provider || !provider.experience) return false;

          // Extract years from experience string
          const providerExpMatch = provider.experience.match(/(\d+)/);
          if (!providerExpMatch) return false;

          const providerYears = parseInt(providerExpMatch[1]);
          return providerYears >= experienceYears;
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

    // Step 7: Transform and format the response
    const transformedServices = services.map((service: any) => ({
      _id: service._id,
      serviceName: service.name,
      serviceImage:
        service.coverImages && service.coverImages.length > 0
          ? service.coverImages[0]
          : null,
      averageRating: service.ratingsAverage || 0,
      providerName: service.providerId?.userName || "Unknown Provider",
      providerProfilePicture: service.providerId?.profilePicture || null,
      rateByHour: service.rateByHour,
    }));

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

  // Prepare response
  const homepageData = {
    location: {
      latitude: provider.lattitude || null,
      longitude: provider.longitude || null,
    },
    pendingBookings: pendingBookingsCount,
    unreadMessages: unreadMessageData.unreadCount,
    currentPlan: provider.plan || "FREE",
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
  getServiceRatingAndReview,
  getServiceProviderSchedule,
  searchAndFilterServices,
  getProviderHomepageContentData,
};
