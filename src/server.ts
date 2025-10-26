import { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import config from "./config";
import "./shared/database";
import app from "./app";
import { socketHandler } from "./socket/socketHandler";

let server: Server;

async function startServer() {
  server = app.listen(config.port, () => {
    console.log("Server is listening on port ", config.port);
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
}

async function main() {
  await startServer();
  const exitHandler = () => {
    if (server) {
      server.close(() => {
        console.info("Server closed!");
        restartServer();
      });
    } else {
      process.exit(1);
    }
  };

  const restartServer = () => {
    console.info("Restarting server...");
    main();
  };

  process.on("uncaughtException", (error) => {
    console.log("Uncaught Exception: ", error);
    exitHandler();
  });

  process.on("unhandledRejection", (error) => {
    console.log("Unhandled Rejection: ", error);
    exitHandler();
  });

  // Handling the server shutdown with SIGTERM and SIGINT
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Shutting down gracefully...");
    exitHandler();
  });

  process.on("SIGINT", () => {
    console.log("SIGINT signal received. Shutting down gracefully...");
    exitHandler();
  });
}

main();
