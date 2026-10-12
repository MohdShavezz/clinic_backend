import jwt from "jsonwebtoken";
import { BlacklistedToken } from "../models/blacklistedToken.model.js";

const isAuthenticated = async (req, res, next) => {
  const authorization = req.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  const token = req.cookies?.token || bearerToken;

  if (!token) {
    return res.status(401).json({ message: "User not authenticated.", success: false });
  }
  if (!process.env.SECRET_KEY) {
    console.error("SECRET_KEY is not configured");
    return res.status(500).json({ message: "Authentication is unavailable.", success: false });
  }

  try {
    if (await BlacklistedToken.exists(token)) {
      return res.status(401).json({ message: "Token has been revoked. Please log in again.", success: false });
    }
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    if (!decoded.userId) {
      return res.status(401).json({ message: "Invalid token.", success: false });
    }
    req.id = decoded.userId;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token is invalid or expired. Please log in again.", success: false });
    }
    console.error("Authentication error:", error);
    return res.status(500).json({ message: "Unable to authenticate this request.", success: false });
  }
};

export default isAuthenticated;
