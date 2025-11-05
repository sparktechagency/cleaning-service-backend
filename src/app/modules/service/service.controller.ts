import httpStatus from "http-status";
import { Request, Response } from "express";
import sendResponse from "../../../shared/sendResponse";
import catchAsync from "../../../shared/catchAsync";
import { serviceService } from "./service.service";

const getCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await serviceService.getAllCategories(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories retrieved successfully",
    data: result.categories,
  });
});

const createService = catchAsync(async (req: Request, res: Response) => {
  const result = await serviceService.createService(
    req.body,
    req.user.id,
    req.files
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Service created successfully",
    data: result,
  });
});

const getAllServices = catchAsync(async (req: Request, res: Response) => {
  const result = await serviceService.getAllServices(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Services retrieved successfully",
    data: result.services,
    meta: result.pagination,
  });
});

const getMyServices = catchAsync(async (req: Request, res: Response) => {
  const result = await serviceService.getAllServices({
    ...req.query,
    userId: req.user.id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your services retrieved successfully",
    data: result.services,
    meta: result.pagination,
  });
});

const getServiceById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await serviceService.getServiceById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service retrieved successfully",
    data: result,
  });
});

const updateService = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await serviceService.updateService(
    id,
    req.body,
    req.user.id,
    req.files
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service updated successfully",
    data: result,
  });
});

const deleteService = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  await serviceService.deleteService(id, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service deleted successfully",
    data: null,
  });
});

const getServicesUnderCategory = catchAsync(
  async (req: Request, res: Response) => {
    const { categoryId } = req.params;
    const result = await serviceService.getServicesUnderCategory(categoryId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Services retrieved successfully",
      data: result,
    });
  }
);

const getServiceOverview = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await serviceService.getServiceOverview(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service retrieved successfully",
    data: result,
  });
});

const getServiceProviderDetails = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await serviceService.getServiceProviderDetails(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service provider details retrieved successfully",
      data: result,
    });
  }
);

const getServiceProviderSchedule = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await serviceService.getServiceProviderSchedule(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service provider schedule retrieved successfully",
      data: result,
    });
  }
);

const getServiceRatingAndReview = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await serviceService.getServiceRatingAndReview(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Service ratings and reviews retrieved successfully",
      data: result,
    });
  }
);

const searchAndFilterServices = catchAsync(
  async (req: Request, res: Response) => {
    const result = await serviceService.searchAndFilterServices(req.query);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Services filtered successfully",
      data: {
        services: result.services,
        total: result.total,
        filters: result.filters,
      },
    });
  }
);

export const serviceController = {
  getCategories,
  createService,
  getAllServices,
  getMyServices,
  getServiceById,
  updateService,
  deleteService,
  getServicesUnderCategory,
  getServiceOverview,
  getServiceProviderDetails,
  getServiceProviderSchedule,
  getServiceRatingAndReview,
  searchAndFilterServices,
};
