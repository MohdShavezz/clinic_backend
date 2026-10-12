import express from "express";
import {
  register,
  login,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  updateProfile,
  myself,
  verifyEmailOtp,
  sendEmailOtp,
} from "../controllers/user.controller.js";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import { singleUpload } from "../middlewares/multer.js";
const router = express.Router();

// Authentication routes
router
  .post("/register", register)
  .post("/login", login)
  .post("/logout", logout)
  .post("/send-email-otp", sendEmailOtp)
  .post("/verify-email-otp", verifyEmailOtp)
  .post("/change-password", isAuthenticated, changePassword)
  .post("/forgot-password", forgotPassword)
  .post("/reset-password/:resetToken", resetPassword)
  .put("/update-profile", isAuthenticated, singleUpload, updateProfile)
  .get("/myself", isAuthenticated, myself)

export default router;
