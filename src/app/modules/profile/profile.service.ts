import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { User } from "../../models/User.model";
import { fileUploader } from "../../../helpers/fileUploader";

interface IProviderProfileUpdate {
  userName?: string;
  phoneNumber?: string;
  address?: string;
  aboutMe?: string;
  experience?: string;
}

interface IOwnerProfileUpdate {
  userName?: string;
  phoneNumber?: string;
  address?: string;
}

const getProviderProfile = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }
  const user = await User.findById(userId).select(
    "profilePicture userName phoneNumber address aboutMe experience role referralCode credits"
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers can access provider profile"
    );
  }

  return {
    _id: user._id,
    profilePicture: user.profilePicture,
    userName: user.userName,
    phoneNumber: user.phoneNumber,
    address: user.address,
    aboutMe: user.aboutMe,
    experience: user.experience,
    referralCode: user.referralCode,
    credits: user.credits || 0,
  };
};

const providerProfileInformation = async (
  userId: string,
  payload: IProviderProfileUpdate,
  file?: Express.Multer.File
) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }

  // Check if at least one field or file is provided for update
  const hasPayloadFields = payload && Object.keys(payload).length > 0;
  if (!hasPayloadFields && !file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "At least one field or profile image is required for update"
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "PROVIDER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only providers can update provider profile"
    );
  }

  let profileImageUrl = user.profilePicture || "";

  if (file) {
    try {
      // Upload new profile image first
      const result = await fileUploader.uploadToCloudinary(
        file,
        "profile-pictures"
      );
      profileImageUrl = result?.Location || "";

      // Delete old profile image only after successful upload
      if (user.profilePicture && profileImageUrl) {
        try {
          await fileUploader.deleteFromCloudinary(user.profilePicture);
        } catch (deleteError) {
          console.error("Failed to delete old profile image:", deleteError);
        }
      }
    } catch (error) {
      console.error("Profile image upload error:", error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to upload profile image"
      );
    }
  }

  const updateData: any = {
    ...(payload || {}),
  };

  if (file && profileImageUrl) {
    updateData.profilePicture = profileImageUrl;
  }

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
    select:
      "profilePicture userName phoneNumber address aboutMe experience role",
  });

  if (!updatedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "Failed to update user profile");
  }

  return {
    _id: updatedUser._id,
    profilePicture: updatedUser.profilePicture,
    userName: updatedUser.userName,
    phoneNumber: updatedUser.phoneNumber,
    address: updatedUser.address,
    aboutMe: updatedUser.aboutMe,
    experience: updatedUser.experience,
  };
};

const getOwnerProfile = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }
  const user = await User.findById(userId).select(
    "profilePicture userName phoneNumber address role referralCode credits"
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only owners can access owner profile"
    );
  }

  return {
    _id: user._id,
    profilePicture: user.profilePicture,
    userName: user.userName,
    phoneNumber: user.phoneNumber,
    address: user.address,
    referralCode: user.referralCode,
    credits: user.credits || 0,
  };
};

const ownerProfileInformation = async (
  userId: string,
  payload: IOwnerProfileUpdate,
  file?: Express.Multer.File
) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID");
  }

  // Check if at least one field or file is provided for update
  const hasPayloadFields = payload && Object.keys(payload).length > 0;
  if (!hasPayloadFields && !file) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "At least one field or profile image is required for update"
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== "OWNER") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only owners can update owner profile"
    );
  }

  let profileImageUrl = user.profilePicture || "";

  if (file) {
    try {
      const result = await fileUploader.uploadToCloudinary(
        file,
        "profile-pictures"
      );
      profileImageUrl = result?.Location || "";

      if (user.profilePicture && profileImageUrl) {
        try {
          await fileUploader.deleteFromCloudinary(user.profilePicture);
        } catch (deleteError) {
          console.error("Failed to delete old profile image:", deleteError);
        }
      }
    } catch (error) {
      console.error("Profile image upload error:", error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to upload profile image"
      );
    }
  }

  const updateData: any = {
    ...(payload || {}),
  };

  if (file && profileImageUrl) {
    updateData.profilePicture = profileImageUrl;
  }

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
    select: "profilePicture userName phoneNumber address role",
  });

  if (!updatedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "Failed to update user profile");
  }

  return {
    _id: updatedUser._id,
    profilePicture: updatedUser.profilePicture,
    userName: updatedUser.userName,
    phoneNumber: updatedUser.phoneNumber,
    address: updatedUser.address,
  };
};

export const profileService = {
  providerProfileInformation,
  getProviderProfile,
  getOwnerProfile,
  ownerProfileInformation,
};
