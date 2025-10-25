import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import mongoose from "mongoose";
import handleZodError from "../../errors/handleZodError";
import ApiError from "../../errors/ApiErrors";
import parseMongooseValidationError from "../../errors/parseMongooseValidationError";

const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
};

const GlobalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode: any = httpStatus.INTERNAL_SERVER_ERROR;
  let message = err.message || "Something went wrong!";
  let errorSources = [];
  let errorDetails = err || null;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError?.statusCode;
    message = simplifiedError?.message;
    errorSources = simplifiedError?.errorSources;
  }
  // Handle Custom ApiError
  else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [{ type: "ApiError", details: err.message }];
  }
  // Handle Mongoose Validation Errors
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = parseMongooseValidationError(err);
    errorSources = Object.values(err.errors).map((error: any) => ({
      field: error.path,
      message: error.message,
    }));
  }
  // Handle Mongoose Cast Errors (Invalid ObjectId)
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = parseMongooseValidationError(err);
    errorSources = [{ type: "CastError", field: err.path, value: err.value }];
  }
  // Handle Mongoose Duplicate Key Errors
  else if (err.code === 11000) {
    statusCode = httpStatus.CONFLICT;
    message = parseMongooseValidationError(err);
    const field = Object.keys(err.keyValue)[0];
    errorSources = [
      { type: "DuplicateError", field, value: err.keyValue[field] },
    ];
  }
  // Handle MongoDB Connection Errors
  else if (err instanceof mongoose.Error.MongooseServerSelectionError) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = "Database connection failed. Please try again later.";
    errorSources = [{ type: "DatabaseConnectionError", details: err.message }];
  }
  // Generic Error Handling (e.g., JavaScript Errors)
  else if (err instanceof SyntaxError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Syntax error in the request. Please verify your input.";
    errorSources.push("Syntax Error");
  } else if (err instanceof TypeError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Type error in the application. Please verify your input.";
    errorSources.push("Type Error");
  } else if (err instanceof ReferenceError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Reference error in the application. Please verify your input.";
    errorSources.push("Reference Error");
  }
  // Catch any other error type
  else {
    message = "An unexpected error occurred!";
    errorSources.push("Unknown Error");
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    err,
    stack: config.NODE_ENV === "development" ? err?.stack : null,
  });
};

export default GlobalErrorHandler;
