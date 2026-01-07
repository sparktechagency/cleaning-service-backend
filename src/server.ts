import { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import config from "./config";
import "./shared/database";
import app from "./app";
import { socketHandler } from "./socket/socketHandler";
import {
  startSubscriptionCronJob,
  startMonthlyLimitResetCronJob,
} from "./cron/subscriptionCron";

let server: Server;

async function startServer() {
  server = app.listen(config.port, () => {
    console.log("Server is listening 📡 on port ", config.port);
  });

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*", // Will Configure this based on frontend URL in production
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Initialize socket handler
  socketHandler(io);

  // Start subscription expiry cron job
  startSubscriptionCronJob();

  // Start monthly booking limit reset cron job
  startMonthlyLimitResetCronJob();
}

async function main() {
  await startServer();

  const exitHandler = () => {
    if (server) {
      server.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(1);
    }
  };

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    exitHandler();
  });

  process.on("unhandledRejection", (error) => {
    console.error("Unhandled Rejection:", error);
    // Don't exit on unhandled rejections - just log them
    // This prevents Cloudinary/network errors from killing the server
  });

  // Handling the server shutdown with SIGTERM and SIGINT
  process.on("SIGTERM", () => {
    exitHandler();
  });

  process.on("SIGINT", () => {
    exitHandler();
  });
}

main();
