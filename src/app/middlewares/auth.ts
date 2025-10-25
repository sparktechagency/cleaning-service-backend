import { NextFunction, Request, Response } from "express";

import config from "../../config";
import { JwtPayload, Secret } from "jsonwebtoken";

import httpStatus from "http-status";
import ApiError from "../../errors/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import { User, UserStatus } from "../models";

const auth = (...roles: string[]) => {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ) => {
    try {
      let token: string | undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }

      if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }

      if (!token && req.query.token) {
        token = req.query.token as string;
      }

      if (!token && req.body && req.body.token) {
        token = req.body.token;
      }

      if (!token && req.headers["x-auth-token"]) {
        token = req.headers["x-auth-token"] as string;
      }

      if (!token) {
        throw new ApiError(
          httpStatus.UNAUTHORIZED,
          "Authentication token not found! Please provide token via: Authorization header (Bearer), cookies, query params, or x-auth-token header."
        );
      }

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as string
      );
      const { id } = verifiedUser;

      const user = await User.findById(id);

      if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
      }

      if (user.status === UserStatus.BLOCKED) {
        throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked!");
      }

      if (user.isDeleted) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Your account has been deleted!"
        );
      }

      req.user = verifiedUser as JwtPayload;

      if (roles.length && !roles.includes(verifiedUser.role)) {
        throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;
