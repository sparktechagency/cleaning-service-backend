import { model, Schema, Document } from "mongoose";

export interface IWebsiteContent extends Document {
  type: "aboutUs" | "privacyPolicy" | "termsAndConditions";
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const websiteContentSchema = new Schema<IWebsiteContent>(
  {
    type: {
      type: String,
      required: [true, "Content type is required"],
      enum: {
        values: ["aboutUs", "privacyPolicy", "termsAndConditions"],
        message: "{VALUE} is not a valid content type",
      },
      unique: true,
    },
    text: {
      type: String,
      required: [true, "Content text is required"],
      trim: true,
      minlength: [10, "Content text must be at least 10 characters long"],
    },
  },
  {
    timestamps: true,
  }
);

export const WebsiteContent = model<IWebsiteContent>(
  "WebsiteContent",
  websiteContentSchema
);
