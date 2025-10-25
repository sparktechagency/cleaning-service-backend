import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
  _id: string;
  name: string;
  image: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

CategorySchema.index({ name: "text" });

export const Category = mongoose.model<ICategory>("Category", CategorySchema);
