import jwt from "jsonwebtoken";

const generateToken = (
  payload: any,
  secret: string,
  expiresIn: string
): string => {
  return jwt.sign(payload, secret, { expiresIn: expiresIn } as jwt.SignOptions);
};

const verifyToken = (token: string, secret: string): any => {
  return jwt.verify(token, secret);
};

export const jwtHelpers = {
  generateToken,
  verifyToken,
};
