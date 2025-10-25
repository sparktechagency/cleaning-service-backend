// Function to parse Mongoose validation error messages
const parseMongooseValidationError = (error: any) => {
  // Handle Mongoose ValidationError
  if (error.name === "ValidationError") {
    const errorMessages: string[] = [];

    Object.keys(error.errors).forEach((field) => {
      const fieldError = error.errors[field];

      switch (fieldError.kind) {
        case "required":
          errorMessages.push(`${field} is required`);
          break;
        case "min":
          errorMessages.push(
            `${field} must be at least ${fieldError.properties.min} characters`
          );
          break;
        case "max":
          errorMessages.push(
            `${field} must be at most ${fieldError.properties.max} characters`
          );
          break;
        case "minlength":
          errorMessages.push(
            `${field} must be at least ${fieldError.properties.minlength} characters long`
          );
          break;
        case "maxlength":
          errorMessages.push(
            `${field} must be at most ${fieldError.properties.maxlength} characters long`
          );
          break;
        case "enum":
          errorMessages.push(
            `${field} must be one of: ${fieldError.properties.enumValues.join(
              ", "
            )}`
          );
          break;
        case "unique":
          errorMessages.push(`${field} already exists`);
          break;
        case "user defined":
          errorMessages.push(`${field}: ${fieldError.message}`);
          break;
        default:
          errorMessages.push(`${field}: ${fieldError.message}`);
      }
    });

    return errorMessages.join("; ");
  }

  // Handle Mongoose CastError (invalid ObjectId, wrong data types)
  if (error.name === "CastError") {
    if (error.kind === "ObjectId") {
      return `Invalid ${error.path}: ${error.value} is not a valid ID`;
    }
    return `Invalid ${error.path}: Expected ${
      error.kind
    }, received ${typeof error.value}`;
  }

  // Handle duplicate key error (MongoDB 11000)
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return `${field} already exists`;
  }

  // Handle other MongoDB errors
  if (error.name === "MongoError" || error.name === "MongoServerError") {
    return error.message;
  }

  // Fallback for unknown errors
  return error.message || "Unknown validation error occurred";
};

export default parseMongooseValidationError;
