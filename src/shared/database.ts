import mongoose from "mongoose";
import config from "../config";
import { User, UserRole } from "../app/models";
import bcrypt from "bcrypt";

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

    await initiateSuperAdmin();
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

async function initiateSuperAdmin() {
  const hashedPassword = await bcrypt.hash(
    "12345678",
    Number(config.bcrypt_salt_rounds)
  );
  const payload = {
    userName: "Super Admin",
    email: "admin@gmail.com",
    phoneNumber: "01234567890",
    password: hashedPassword,
    role: UserRole.ADMIN,
    status: "ACTIVE",
    lattitude: 23.8103,
    longitude: 90.4125,
    resultRange: 50,
    plan: "PRO",
  };

  const isExistUser = await User.findOne({
    email: payload.email,
  });

  if (isExistUser) return;

  await User.create(payload);
}

connectMongoDB();

export { connectMongoDB };
