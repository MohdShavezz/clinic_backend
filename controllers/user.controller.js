import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cloudinary from "../utils/cloudinary.js";
import { transporter } from "../utils/mailer.js";
import { sendEmail } from "../utils/nodemailer.js";
import { BlacklistedToken } from "../models/blacklistedToken.model.js";
import { User } from "../models/user.model.js";
import getDataUri from "../utils/datauri.js";

const DEFAULT_PROFILE_PHOTO =
  "https://cdn-icons-png.flaticon.com/512/9187/9187532.png";

const publicUser = ({ password, ...user }) => user;
const makeOtp = () => Math.floor(1000 + Math.random() * 9000);

export const register = async (req, res) => {
  try {
    const fullname = req.body.fullname?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;
    if (!fullname || !email || !password) {
      return res.status(400).json({ message: "All fields are required!", success: false });
    }
    if (!process.env.SECRET_KEY) {
      throw new Error("SECRET_KEY is not configured");
    }
    if (await User.findByEmail(email)) {
      return res.status(409).json({ message: "User already exists with this email.", success: false });
    }

    const emailOtp = makeOtp();
    const user = await User.create({
      fullname,
      email,
      password: await bcrypt.hash(password, 10),
      emailOtp,
      profile: { profilePhoto: DEFAULT_PROFILE_PHOTO },
    });
    const token = jwt.sign({ userId: user.id }, process.env.SECRET_KEY, { expiresIn: "1d" });

    return res
      .status(201)
      .cookie("token", token, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      })
      .json({
        message: `Welcome ${fullname}, your registration was successful!`,
        user: { ...publicUser(user), token },
        token,
        success: true,
      });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "User already exists with this email.", success: false });
    }
    console.error("Error during user registration:", error);
    return res.status(500).json({ message: "Something went wrong. Please try again.", success: false });
  }
};

export const sendEmailOtp = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required!", success: false });
    const user = await User.findByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found with this email.", success: false });

    const emailOtp = makeOtp();
    await User.updateById(user.id, { emailOtp });
    await sendEmail({
      to: email,
      subject: "Verify Your Email Address",
      html: `<p>Hi ${user.fullname},</p><p>Your verification OTP is: <strong>${emailOtp}</strong></p><p>Please use this OTP to verify your email address.</p>`,
    });
    return res.status(200).json({ message: `OTP sent successfully to ${email}. Please check your email.`, success: true });
  } catch (error) {
    console.error("Error sending email verification OTP:", error);
    return res.status(500).json({ message: "Something went wrong. Please try again.", success: false });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const otp = Number(req.body.otp);
    if (!email || !Number.isInteger(otp)) {
      return res.status(400).json({ message: "Email and OTP are required.", success: false });
    }
    const user = await User.findByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found.", success: false });
    if (user.emailOtp !== otp) return res.status(400).json({ message: "Invalid OTP.", success: false });
    await User.updateById(user.id, { isEmailVerified: true, emailOtp: null });
    return res.status(200).json({ message: "Email verified successfully.", success: true });
  } catch (error) {
    console.error("Error during email verification:", error);
    return res.status(500).json({ message: "Something went wrong. Please try again.", success: false });
  }
};

export const login = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required.", success: false });
    const user = await User.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Incorrect email or password.", success: false });
    }
    if (!process.env.SECRET_KEY) throw new Error("SECRET_KEY is not configured");
    const token = jwt.sign({ userId: user.id }, process.env.SECRET_KEY, { expiresIn: "1d" });
    return res
      .status(200)
      .cookie("token", token, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      })
      .json({ message: `Welcome ${user.fullname}`, user: { ...publicUser(user), token }, success: true });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Unable to log in right now.", success: false });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req?.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(400).json({ message: "No token found.", success: false });
    await BlacklistedToken.add(token.trim());
    return res.status(200).clearCookie("token", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" }).json({ message: "Logged out successfully.", success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Internal server error.", success: false });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Both current password and new password are required.", success: false });
    const user = await User.findById(req.id);
    if (!user) return res.status(404).json({ message: "User not found.", success: false });
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ message: "Current password is incorrect.", success: false });
    await User.updateById(user.id, { password: await bcrypt.hash(newPassword, 10) });
    return res.status(200).json({ message: "Password changed successfully.", success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "An error occurred while changing the password.", success: false });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required.", success: false });
    const user = await User.findByEmail(email);
    if (!user) return res.status(404).json({ message: "User with this email does not exist.", success: false });
    if (!process.env.RESET_PASSWORD_KEY) throw new Error("RESET_PASSWORD_KEY is not configured");
    if (!process.env.CLIENT_URL) throw new Error("CLIENT_URL is not configured");
    const clientUrl = new URL(process.env.CLIENT_URL);
    const resetToken = jwt.sign({ id: user.id }, process.env.RESET_PASSWORD_KEY, { expiresIn: "30m" });
    const resetUrl = `${clientUrl.origin}${clientUrl.pathname.replace(/\/$/, "")}/reset-password/${encodeURIComponent(resetToken)}`;
    const delivery = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.NODEMAILER_EMAIL || process.env.SMTP_USER,
      to: user.email,
      subject: "Password Reset Request",
      html: `<h3>Password Reset Request</h3><p>Hello ${user.fullname},</p><p>You requested a password reset. Click the link below to reset your password:</p><a href="${resetUrl}" target="_blank">Reset Password</a><p>This link will expire in 30 minutes.</p><p>If you did not request this, please ignore this email.</p>`,
    });
    const acceptedRecipients = (delivery.accepted || []).map((recipient) =>
      (typeof recipient === "string" ? recipient : recipient.address || "").toLowerCase()
    );
    if (!acceptedRecipients.includes(user.email.toLowerCase())) {
      throw new Error("SMTP did not accept the reset email recipient.");
    }
    console.info("Password reset email accepted by SMTP:", {
      messageId: delivery.messageId,
      acceptedRecipientCount: acceptedRecipients.length,
      rejectedRecipientCount: delivery.rejected?.length || 0,
      response: delivery.response,
    });
    return res.status(200).json({
      message: "The email provider accepted your reset email. Check your inbox, Spam, and Promotions folders.",
      success: true,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "An error occurred. Please try again later.", success: false });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { newPassword } = req.body;
    if (!resetToken || !newPassword) return res.status(400).json({ message: "Invalid request.", success: false });
    if (!process.env.RESET_PASSWORD_KEY) throw new Error("RESET_PASSWORD_KEY is not configured");
    const decoded = jwt.verify(resetToken, process.env.RESET_PASSWORD_KEY);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found.", success: false });
    await User.updateById(user.id, { password: await bcrypt.hash(newPassword, 10) });
    return res.status(200).json({ message: "Password reset successfully!", success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "This reset link has expired. Please request a new one.", success: false });
    }
    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      console.warn("Rejected invalid password reset token:", error.message);
      return res.status(400).json({ message: "This reset link is invalid. Please request a new one.", success: false });
    }
    return res.status(500).json({ message: "An error occurred. Please try again later.", success: false });
  }
};

export const myself = async (req, res) => {
  try {
    const user = await User.findById(req.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.status(200).json(publicUser(user));
  } catch (error) {
    console.error("Fetch profile error:", error);
    return res.status(500).json({ success: false, message: "Unable to load profile." });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.id);
    if (!user) return res.status(404).json({ message: "User not found.", success: false });
    const changes = {};
    const fullname = req.body.fullname?.trim();
    if (fullname) changes.fullname = fullname;

    let address = user.address ?? {};
    const bodyAddress = req.body.address;
    if (bodyAddress && typeof bodyAddress === "object") {
      address = { ...address, ...bodyAddress };
    } else {
      for (const key of ["street", "city", "state", "postalCode", "country"]) {
        if (req.body[`address[${key}]`] !== undefined) address[key] = req.body[`address[${key}]`];
      }
    }
    if (Object.keys(address).length) changes.address = address;

    if (req.file) {
      const fileUri = getDataUri(req.file);
      let cloudResponse;
      try {
        cloudResponse = await cloudinary.uploader.upload(fileUri.content, {
          folder: "clinic/profile-images",
          resource_type: "image",
        });
      } catch (error) {
        console.error("Cloudinary profile image upload failed:", error);
        return res.status(502).json({
          message: "Profile image could not be uploaded. Check the Cloudinary server configuration.",
          success: false,
        });
      }
      if (!cloudResponse?.secure_url) {
        console.error("Cloudinary returned no secure image URL.");
        return res.status(502).json({ message: "Cloudinary did not return an image URL.", success: false });
      }
      changes.profile = {
        ...(user.profile ?? {}),
        profilePhoto: cloudResponse.secure_url,
        profileName: req.file.originalname,
      };
    }
    const updatedUser = await User.updateById(user.id, changes);
    return res.status(200).json({ message: "Profile updated successfully.", user: publicUser(updatedUser), success: true });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ message: "Internal server error.", success: false });
  }
};
