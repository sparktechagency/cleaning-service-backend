import mongoose from "mongoose";
import config from "../config";

async function connectMongoDB() {
  try {
    await mongoose.connect(config.database_url as string, {
      serverSelectionTimeoutMS: 30000, // Increased timeout
      heartbeatFrequencyMS: 2000,
      retryWrites: true,
      ssl: true,
      tlsAllowInvalidCertificates: true,
    });
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    console.log("Attempting to reconnect in 5 seconds...");
    // Instead of exiting, retry connection after delay
    setTimeout(() => {
      connectMongoDB();
    }, 5000);
  }
}

mongoose.connection.on("connected", () => {
  console.log("Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("Mongoose disconnected from MongoDB");
});

connectMongoDB();

export { connectMongoDB };
