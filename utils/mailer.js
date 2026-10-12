import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const email = process.env.NODEMAILER_EMAIL || process.env.SMTP_USER;
const password = process.env.NODEMAILER_PASSWORD || process.env.SMTP_PASS;
const port = Number(process.env.SMTP_PORT || 587);

const transportOptions = process.env.SMTP_HOST
  ? {
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE.toLowerCase() === "true"
        : port === 465,
    }
  : { service: process.env.NODEMAILER_SERVICE || "gmail" };

export const transporter = nodemailer.createTransport({
  ...transportOptions,
  auth: { user: email, pass: password },
});

export const sendEmail = async ({ to, subject, html }) => {
  if (!email || !password) {
    throw new Error("Email is not configured. Set NODEMAILER_EMAIL and NODEMAILER_PASSWORD.");
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || email,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Email delivery failed:", {
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      message: error.message,
    });
    throw new Error("Email delivery failed. Check the server mail configuration and logs.", { cause: error });
  }
};
