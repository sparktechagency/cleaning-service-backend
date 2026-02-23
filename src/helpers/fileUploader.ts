import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import streamifier from "streamifier";
import dotenv from "dotenv";

dotenv.config();

// Configure DigitalOcean Spaces
const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.DO_SPACE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.DO_SPACE_ACCESS_KEY || "",
    secretAccessKey: process.env.DO_SPACE_SECRET_KEY || "",
  },
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer configuration using memoryStorage (for DigitalOcean & Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Fixed Cloudinary Storage
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    public_id: (req, file) => `${Date.now()}_${file.originalname}`,
  },
});

const cloudinaryUpload = multer({ storage: cloudinaryStorage });

// Upload single image
const uploadSingle = upload.single("image");
const uploadFile = upload.single("file");

// Upload multiple images
const uploadMultipleImage = upload.fields([{ name: "images", maxCount: 15 }]);
const uploadMultipleFiles = upload.fields([{ name: "files", maxCount: 15 }]);

// Upload for messages (text + multiple images)
const uploadMessageFiles = upload.array("images", 10);

// Upload profile and banner images
const userMutipleFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

// ✅ Enhanced Cloudinary Upload with retry logic
const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string = "uploads",
  retries: number = 3
): Promise<{ Location: string; public_id: string }> => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  return new Promise((resolve, reject) => {
    // Generate unique filename
    const uniqueFilename = `${Date.now()}_${Math.random()
      .toString(36)
      .substring(2)}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;

    const attemptUpload = (attemptNumber: number) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: "auto",
          public_id: uniqueFilename.split(".")[0],
          unique_filename: true,
          overwrite: false,
          quality: "auto",
          fetch_format: "auto",
          timeout: 60000, // 60 seconds timeout
        },
        (error, result) => {
          if (error) {
            // Retry on network errors
            if (
              (error.message?.includes("ECONNRESET") ||
                error.message?.includes("ETIMEDOUT") ||
                error.message?.includes("ENOTFOUND")) &&
              attemptNumber < retries
            ) {
              console.error(
                `Cloudinary upload failed (attempt ${attemptNumber}/${retries}), retrying...`
              );
              setTimeout(
                () => attemptUpload(attemptNumber + 1),
                1000 * attemptNumber
              );
              return;
            }

            console.error("Error uploading file to Cloudinary:", error);
            return reject(error);
          }

          resolve({
            Location: result?.secure_url || "",
            public_id: result?.public_id || "",
          });
        }
      );

      // Convert buffer to stream and upload
      const readStream = streamifier.createReadStream(file.buffer);

      readStream.on("error", (streamError) => {
        console.error("Stream error:", streamError);
        if (attemptNumber < retries) {
          setTimeout(
            () => attemptUpload(attemptNumber + 1),
            1000 * attemptNumber
          );
        } else {
          reject(streamError);
        }
      });

      readStream.pipe(uploadStream);
    };

    attemptUpload(1);
  });
};

// ✅ Unchanged: DigitalOcean Upload
const uploadToDigitalOcean = async (file: Express.Multer.File) => {
  if (!file) {
    throw new Error("File is required for uploading.");
  }

  try {
    const Key = `nathancloud/${Date.now()}_${uuidv4()}_${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
      Body: file.buffer, // ✅ Use buffer instead of file path
      ACL: "public-read" as ObjectCannedACL,
      ContentType: file.mimetype,
    };

    // Upload file to DigitalOcean Spaces
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Format the URL
    const fileURL = `${process.env.DO_SPACE_ENDPOINT}/${process.env.DO_SPACE_BUCKET}/${Key}`;
    return {
      Location: fileURL,
      Bucket: process.env.DO_SPACE_BUCKET || "",
      Key,
    };
  } catch (error) {
    console.error("Error uploading file to DigitalOcean:", error);
    throw error;
  }
};

// Upload profile image specifically
const uploadProfileImage = async (file: Express.Multer.File) => {
  return uploadToCloudinary(file, "profile-images");
};

// Upload general file
const uploadGeneralFile = async (file: Express.Multer.File) => {
  return uploadToCloudinary(file, "user-files");
};

// Function to delete a file from Cloudinary
const deleteFromCloudinary = async (url: string): Promise<boolean> => {
  try {
    // Extract public_id from URL
    // URLs look like: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
    if (!url || typeof url !== "string") {
      return false;
    }

    const splitUrl = url.split("/");
    const publicIdWithExtension = splitUrl[splitUrl.length - 1];
    const publicIdParts = publicIdWithExtension.split(".");

    // Remove extension to get public_id
    let publicId = publicIdParts[0];

    // If URL has version (v1234567890), we need to get folder/public_id
    const folderIndex = splitUrl.indexOf("upload");
    if (folderIndex !== -1 && folderIndex + 2 < splitUrl.length) {
      // Get everything after 'upload', excluding the version part
      publicId = splitUrl.slice(folderIndex + 2).join("/");
      // Remove file extension if present
      publicId = publicId.split(".")[0];
    }

    // Destroy the image in Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);

    return result.result === "ok";
  } catch (error) {
    return false;
  }
};

export const fileUploader = {
  upload,
  uploadSingle,
  uploadMultipleFiles,
  uploadMultipleImage,
  userMutipleFiles,
  uploadFile,
  uploadMessageFiles,
  cloudinaryUpload,
  uploadToDigitalOcean,
  uploadToCloudinary,
  uploadProfileImage,
  uploadGeneralFile,
  deleteFromCloudinary,
};

// Export cloudinary instance for direct use
export { cloudinary };
