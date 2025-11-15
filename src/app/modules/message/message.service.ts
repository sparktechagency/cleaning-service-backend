import { Message } from "../../models/Message.model";
import { User } from "../../models/User.model";
import { cloudinary } from "../../../helpers/fileUploader";
import { getReceiverSocketId, getIO } from "../../../socket/socketHandler";

// Get users for sidebar (users with conversation history)
const getUsersForSidebar = async (loggedInUserId: string) => {
  const messages = await Message.find({
    $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
  }).select("senderId receiverId");

  const userIds = new Set<string>();
  messages.forEach((message) => {
    if (message.senderId.toString() !== loggedInUserId.toString()) {
      userIds.add(message.senderId.toString());
    }
    if (message.receiverId.toString() !== loggedInUserId.toString()) {
      userIds.add(message.receiverId.toString());
    }
  });

  const userIdsArray = Array.from(userIds);

  if (userIdsArray.length === 0) {
    return [];
  }

  const filteredUsers = await User.find({
    _id: { $in: userIdsArray },
  }).select("_id userName email role profilePicture");

  // Get unread message count for each user
  const usersWithUnreadCount = await Promise.all(
    filteredUsers.map(async (user) => {
      const unreadCount = await Message.countDocuments({
        senderId: user._id,
        receiverId: loggedInUserId,
        isSeen: false,
      });

      return {
        _id: user._id,
        userName: user.userName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        unreadCount,
      };
    })
  );

  return usersWithUnreadCount;
};

// Get messages between two users
const getMessages = async (myId: string, userToChatId: string) => {
  const messages = await Message.find({
    $or: [
      { senderId: myId, receiverId: userToChatId },
      { senderId: userToChatId, receiverId: myId },
    ],
  }).sort({ createdAt: -1 });

  // Mark all messages sent to me (where I am the receiver) as seen
  await Message.updateMany(
    {
      senderId: userToChatId,
      receiverId: myId,
      isSeen: false,
    },
    {
      $set: { isSeen: true },
    }
  );

  return messages;
};

// Send message with image upload support (handles both form-data files and base64/URL strings)
const sendMessage = async (
  senderId: string,
  receiverId: string,
  data: {
    text?: string;
    image?: string | string[];
    files?: Express.Multer.File[];
  }
) => {
  const { text, image, files } = data;

  // Validate that at least text or image/files are provided
  if (
    (!text || text.trim() === "") &&
    !image &&
    (!files || files.length === 0)
  ) {
    throw new Error("Message must contain either text or image");
  }

  // Handle image upload (supports both file uploads and base64/URL strings)
  let imageUrls: string[] = [];

  // Priority 1: Handle file uploads from form-data (REST API)
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        // Upload to Cloudinary using the file buffer
        const uploadResponse = await cloudinary.uploader.upload(
          `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
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
        imageUrls.push(uploadResponse.secure_url);
      } catch (cloudinaryError: any) {
        console.error(
          `Failed to upload image ${i + 1}:`,
          cloudinaryError.message
        );
        throw new Error(
          `Failed to upload image ${i + 1}: ${cloudinaryError.message}`
        );
      }
    }
  }
  // Priority 2: Handle base64 strings or URLs (Socket.IO)
  else if (image) {
    const imagesToProcess = Array.isArray(image) ? image : [image];

    for (let i = 0; i < imagesToProcess.length; i++) {
      const currentImage = imagesToProcess[i];

      if (typeof currentImage !== "string" || currentImage.trim() === "") {
        continue;
      }

      // Check if it's already a URL
      if (currentImage.startsWith("http")) {
        imageUrls.push(currentImage);
      } else {
        // Upload to Cloudinary (base64 string)
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
          imageUrls.push(uploadResponse.secure_url);
        } catch (cloudinaryError: any) {
          console.error(
            `Failed to upload image ${i + 1}:`,
            cloudinaryError.message
          );
          throw new Error(
            `Failed to upload image ${i + 1}: ${cloudinaryError.message}`
          );
        }
      }
    }
  }

  let messageText = text;
  if (!text || text.trim() === "") {
    messageText = " ";
  }

  const newMessage = new Message({
    senderId,
    receiverId,
    text: messageText,
    image: imageUrls,
  });

  await newMessage.save();

  // Emit to receiver via socket if online
  const io = getIO();
  const receiverSocketId = getReceiverSocketId(receiverId);
  if (io && receiverSocketId) {
    io.to(receiverSocketId).emit("receive_message", newMessage);
  }

  return newMessage;
};

// Get count of how many people have sent unread messages
const getUnreadMessageCount = async (userId: string) => {
  const unreadMessages = await Message.find({
    receiverId: userId,
    isSeen: false,
  }).distinct("senderId");

  const unreadCount = unreadMessages.length;

  return { unreadCount };
};

export const messageService = {
  getUsersForSidebar,
  getMessages,
  sendMessage,
  getUnreadMessageCount,
};
