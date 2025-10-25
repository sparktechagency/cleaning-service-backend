import express, { Application, NextFunction, Request, Response } from "express";

import httpStatus from "http-status";
import cors from "cors";
import cookieParser from "cookie-parser";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import router from "./app/routes";
import { LANDING_PAGE_TEMPLATE } from "./utils/Template";

const app: Application = express();
export const corsOptions = {
  origin: ["http://localhost:3001", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Middleware setup
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads")); // Serve uploaded files

// Route handler for root endpoint
app.get("/", (req: Request, res: Response) => {
  res.send(LANDING_PAGE_TEMPLATE);
});

// Router setup
app.use("/api", router);

// Error handling middleware
app.use(GlobalErrorHandler);

// Not found handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
