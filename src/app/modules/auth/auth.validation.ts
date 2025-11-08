import { z } from "zod";

const registerSchema = z.object({
  body: z
    .object({
      userName: z
        .string({
          required_error: "User name is required",
        })
        .min(2, "User name must be at least 2 characters"),
      email: z
        .string({
          required_error: "Email is required",
        })
        .email("Invalid email format"),
      phoneNumber: z
        .string({
          required_error: "Phone number is required",
        })
        .min(10, "Phone number must be at least 10 digits"),
      password: z
        .string({
          required_error: "Password is required",
        })
        .min(8, "Password must be at least 8 characters"),
      confirmPassword: z
        .string({
          required_error: "Confirm password is required",
        })
        .min(8, "Confirm password must be at least 8 characters"),
      referralCode: z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }),
});

const completeRegistrationSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    otp: z
      .string()
      .length(6, "OTP must be 6 digits")
      .optional(),
    role: z.enum(["PROVIDER", "OWNER"]),
    lattitude: z.string().transform((val) => parseFloat(val)),
    longitude: z.string().transform((val) => parseFloat(val)),
    resultRange: z
      .string()
      .transform((val) => parseInt(val))
      .optional(),
    plan: z.enum(["FREE", "SILVER", "GOLD", "PLATINUM"]).optional(),
    affiliationCondition: z
      .union([z.string(), z.boolean()])
      .transform((val) => val === "true" || val === true),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: "Email is required",
      })
      .email("Invalid email format"),
    otp: z
      .string({
        required_error: "OTP is required",
      })
      .length(6, "OTP must be 6 digits"),
    otpType: z.enum(["RESET_PASSWORD", "VERIFY_EMAIL", "VERIFY_PHONE"]),
  }),
});

const loginValidationSchema = z.object({
  body: z.object({
    email: z.string().email("Please provide a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    fcmToken: z.string().optional(),
  }),
});

const changePasswordValidationSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(8),
    newPassword: z.string().min(8),
  }),
});

const resetPasswordValidationSchema = z.object({
  body: z
    .object({
      email: z.string().email("Please provide a valid email address"),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters long"),
      confirmPassword: z
        .string()
        .min(8, "Confirm password must be at least 8 characters long"),
      otp: z.string().min(6, "OTP must be at least 6 characters long"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    }),
});

const resendOtpSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: "Email is required",
      })
      .email("Invalid email format"),
    otpType: z
      .enum(["RESET_PASSWORD", "VERIFY_EMAIL"])
      .default("RESET_PASSWORD")
      .optional(),
  }),
});

export const authValidation = {
  registerSchema,
  completeRegistrationSchema,
  verifyOtpSchema,
  loginValidationSchema,
  changePasswordValidationSchema,
  resetPasswordValidationSchema,
  resendOtpSchema,
};
