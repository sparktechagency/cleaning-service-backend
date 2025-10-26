import jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import { User } from "../app/models/User.model";
import { Message } from "../app/models/Message.model";
import { cloudinary } from "../helpers/fileUploader";
import config from "../config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

interface SendMessagePayload {
  receiverId: string;
  text?: string;
  image?: string | string[];
}

const onlineUsers = new Map<string, string>();

let ioInstance: Server | null = null;

export const getReceiverSocketId = (receiverId: string): string | undefined => {
  return onlineUsers.get(receiverId);
};

export const getIO = (): Server | null => {
  return ioInstance;
};

export const socketHandler = (io: Server) => {
  ioInstance = io;
  console.log("🔌 Socket.io server running...");

  // Middleware to authenticate socket connection
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.headers.authorization?.split(" ")[1] ||
        socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      const secret = config.jwt.jwt_secret;
      const decoded = jwt.verify(token, secret!);

      if (typeof decoded === "object" && decoded !== null && "id" in decoded) {
        socket.userId = (decoded as { id: string }).id;
        next();
      } else {
        next(new Error("Authentication error: Invalid token payload"));
      }
    } catch (err) {
      console.error("Socket auth error:", err);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId}`);
    const userId = socket.userId;

    if (!userId) {
      console.log("No userId found, disconnecting socket");
      socket.disconnect();
      return;
    }

    const findUser = await User.findById(userId).select("_id isOnline");
    if (!findUser) {
      console.log("User not found in DB, disconnecting socket");
      socket.disconnect();
      return;
    }

    await User.findByIdAndUpdate(userId, { isOnline: true });

    socket.join(userId);
    onlineUsers.set(userId, socket.id);
    io.emit("online_users", Array.from(onlineUsers.keys()));

    console.log(`📡 Online users: ${onlineUsers.size}`);

    // Handle: Get list of all users (optional - for chat list)
    socket.on("users_list", async () => {
      try {
        const users = await User.find({ _id: { $ne: userId } }).select(
          "_id userName email"
        );
        socket.emit("users_list_response", users);
      } catch (error) {
        console.error("Error fetching users list:", error);
        socket.emit("message_error", { error: "Failed to fetch users" });
      }
    });

    // Handle: Send message
    socket.on("send_message", async (payload: SendMessagePayload) => {
      const { receiverId, text = "", image } = payload;

      try {
        let imageUrls: string[] = [];

        if (image) {
          const imagesToProcess = Array.isArray(image) ? image : [image];

          // Convert Buffer objects to base64 strings if needed
          const processedImages = imagesToProcess.map((img: any) => {
            if (Buffer.isBuffer(img)) {
              return `data:image/jpeg;base64,${img.toString("base64")}`;
            }
            return img;
          });

          for (let i = 0; i < processedImages.length; i++) {
            const currentImage = processedImages[i];

            if (
              typeof currentImage !== "string" ||
              currentImage.trim() === ""
            ) {
              continue;
            }

            if (currentImage.length > 10000000) {
              socket.emit("message_error", {
                error: `Image ${i + 1} too large. Please use a smaller image.`,
              });
              return;
            }

            let currentImageUrl: string;
            if (currentImage.startsWith("http")) {
              // If it's already a URL, use it directly
              currentImageUrl = currentImage;
            } else {
              // Upload to Cloudinary
              try {
                const uploadResponse = await cloudinary.uploader.upload(
                  currentImage,
                  {
                    folder: "message_images",
                    resource_type: "auto",
                    transformation: [
                      { width: 1000, height: 1000, crop: "limit" },
                      { quality: "auto:good" },
                      { format: "auto" },
                    ],
                  }
                );
                currentImageUrl = uploadResponse.secure_url;
                console.log(
                  `Image ${i + 1} uploaded successfully:`,
                  currentImageUrl
                );
              } catch (cloudinaryError: any) {
                socket.emit("message_error", {
                  error: `Failed to upload image ${i + 1}: ${
                    cloudinaryError.message
                  }`,
                });
                return;
              }
            }

            imageUrls.push(currentImageUrl);
          }
        }

        console.log("imageUrls ", imageUrls);

        let messageText = text;
        if (!text || text.trim() === "") {
          if (imageUrls.length > 0) {
            messageText = " ";
          } else {
            socket.emit("message_error", {
              error: "Message must contain either text or images",
            });
            return;
          }
        }

        const newMessage = new Message({
          senderId: userId,
          receiverId,
          text: messageText,
          image: imageUrls,
        });
        const createdMessage = await newMessage.save();

        // Emit to receiver
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", createdMessage);
          console.log("Message sent to receiver");
        } else {
          console.log("Receiver not online");
        }

        // Confirm to sender
        socket.emit("message_sent", createdMessage);
      } catch (error: any) {
        console.error("Error sending message:", error);
        socket.emit("message_error", {
          error: "Failed to send message: " + error.message,
        });
      }
    });

    socket.on("disconnect", async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });
      io.emit("online_users", Array.from(onlineUsers.keys()));
      console.log(`User disconnected: ${userId}`);
    });
  });
};
