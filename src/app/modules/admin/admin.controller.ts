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

const getTotalCount = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.totalCount();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User statistics retrieved successfully",
    data: result,
  });
});

const getRecentUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.recentJoinedUsers();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Recent users retrieved successfully",
    data: result,
  });
});

const getIndividualUserDetails = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await adminService.getIndividualUserDetails(id);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "User retrieved successfully",
      data: result,
    });
  }
);

const getAllOwners = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getAllOwners(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Owners retrieved successfully",
    meta: result.pagination,
    data: result.owners,
  });
});

const getAllProviders = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getAllProviders(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Providers retrieved successfully",
    meta: result.pagination,
    data: result.providers,
  });
});

const searchUsers = catchAsync(async (req: Request, res: Response) => {
  const { searchTerm } = req.params;

  const result = await adminService.searchUsers(searchTerm, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users retrieved successfully",
    meta: result.pagination,
    data: result.users,
  });
});

const getBookingRequestOverview = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.bookingRequestOverview(req.query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Booking requests retrieved successfully",
      meta: result.pagination,
      data: result.bookings,
    });
  }
);

const searchBookingRequests = catchAsync(
  async (req: Request, res: Response) => {
    const { searchTerm } = req.params;

    const result = await adminService.searchBookingRequestOverview(
      searchTerm,
      req.query
    );

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Booking requests retrieved successfully",
      meta: result.pagination,
      data: result.bookings,
    });
  }
);

const changeUserStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const result = await adminService.changeUserStatus(id, isActive);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const getBookingUserOverview = catchAsync(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const result = await adminService.bookingUserOverview(bookingId);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Booking user overview retrieved successfully",
      data: result,
    });
  }
);

const getOwnerProfileStatus = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.ownerProfileStatus(req.query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Owner profile status retrieved successfully",
      meta: result.pagination,
      data: result.owners,
    });
  }
);

const getProviderProfileStatus = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.providerProfileStatus(req.query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Provider profile status retrieved successfully",
      meta: result.pagination,
      data: result.providers,
    });
  }
);

const getBookingDetailsForSuspension = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.bookingDetailsForSuspension(req.query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Booking details for suspension retrieved successfully",
      meta: result.pagination,
      data: result.bookings,
    });
  }
);

const searchBookingDetailsForSuspension = catchAsync(
  async (req: Request, res: Response) => {
    const { searchTerm } = req.params;
    const result = await adminService.searchBookingDetailsForSuspension(
      searchTerm,
      req.query
    );

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Search booking details for suspension retrieved successfully",
      meta: result.pagination,
      data: result.bookings,
    });
  }
);

const searchForProfileStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { searchTerm } = req.params;
    const result = await adminService.searchForProfileStatus(
      searchTerm,
      req.query
    );

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Search profile status retrieved successfully",
      meta: result.pagination,
      data: result.users,
    });
  }
);

const createKnowledgeHubArticle = catchAsync(
  async (req: Request, res: Response) => {
    const { title, description } = req.body;
    const result = await adminService.createKnowledgeHubArticle(
      title,
      description
    );

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Knowledge Hub article created successfully",
      data: result,
    });
  }
);

const getKnowledgeHubArticles = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.getKnowledgeHubArticles();

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Knowledge Hub articles retrieved successfully",
      data: result,
    });
  }
);

const updateKnowledgeHubArticle = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, description } = req.body;
    const result = await adminService.updateKnowledgeHubArticle(id, {
      title,
      description,
    });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Knowledge Hub article updated successfully",
      data: result,
    });
  }
);

const deleteKnowledgeHubArticle = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    await adminService.deleteKnowledgeHubArticle(id);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Knowledge Hub article deleted successfully",
      data: null,
    });
  }
);

const getKnowledgeHubArticleById = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await adminService.getKnowledgeHubArticleById(id);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Knowledge Hub article retrieved successfully",
      data: result,
    });
  }
);

const adminEditProfile = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.user;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const profilePictureFile = files?.profilePicture?.[0];

  const updateData: any = {};

  // Get userName from form data body
  if (req.body.userName) {
    updateData.userName = req.body.userName;
  }

  // Upload new profile picture if provided
  if (profilePictureFile) {
    const uploadResult = await fileUploader.uploadToCloudinary(
      profilePictureFile,
      "admin-profiles"
    );
    updateData.profilePicture = uploadResult.Location;
  }

  const result = await adminService.adminEditProfile(id, updateData);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin profile updated successfully",
    data: result,
  });
});

const updateAboutUs = catchAsync(async (req: Request, res: Response) => {
  const { text } = req.body;
  const result = await adminService.updateAboutUs(text);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "About Us content updated successfully",
    data: result,
  });
});

const updatePrivacyPolicy = catchAsync(async (req: Request, res: Response) => {
  const { text } = req.body;
  const result = await adminService.updatePrivacyPolicy(text);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Privacy Policy content updated successfully",
    data: result,
  });
});

const updateTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const { text } = req.body;
    const result = await adminService.updateTermsAndConditions(text);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Terms and Conditions content updated successfully",
      data: result,
    });
  }
);

const getAboutUs = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getAboutUs();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "About Us content retrieved successfully",
    data: result,
  });
});

const getPrivacyPolicy = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getPrivacyPolicy();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Privacy Policy content retrieved successfully",
    data: result,
  });
});

const getTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const result = await adminService.getTermsAndConditions();

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Terms and Conditions content retrieved successfully",
      data: result,
    });
  }
);

const updateAfialiationProgram = catchAsync(
  async (req: Request, res: Response) => {
    const { text } = req.body;
    const result = await adminService.updateAfialiationProgram(text);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Affiliation Program content updated successfully",
      data: result,
    });
  }
);

const getAfiliationProgram = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.getAfiliationProgram();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Affiliation Program content retrieved successfully",
    data: result,
  });
});

export const adminController = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getTotalCount,
  getRecentUsers,
  getIndividualUserDetails,
  getAllOwners,
  getAllProviders,
  searchUsers,
  getBookingRequestOverview,
  changeUserStatus,
  getBookingUserOverview,
  getOwnerProfileStatus,
  getProviderProfileStatus,
  getBookingDetailsForSuspension,
  searchBookingRequests,
  searchBookingDetailsForSuspension,
  searchForProfileStatus,
  createKnowledgeHubArticle,
  getKnowledgeHubArticles,
  updateKnowledgeHubArticle,
  deleteKnowledgeHubArticle,
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
};
