import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  env: process.env.NODE_ENV,
  database_url: process.env.DATABASE_URL,
  // stripe_key: process.env.STRIPE_SECRET_KEY,
  port: process.env.PORT,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt: {
    jwt_secret: process.env.JWT_SECRET,
    expires_in: process.env.EXPIRES_IN,
    reset_pass_secret: process.env.RESET_PASS_TOKEN,
    reset_pass_token_expires_in: process.env.RESET_PASS_TOKEN_EXPIRES_IN,
  },
  reset_pass_link: process.env.RESET_PASS_LINK,
  emailSender: {
    email: process.env.EMAIL,
    app_pass: process.env.APP_PASS,
  },

  mail_user: process.env.EMAIL_USER,
  mail_pass: process.env.EMAIL_PASS,

  site_name: process.env.WEBSITE_NAME,
  contact_mail: process.env.CONTACT_MAIL,
};
