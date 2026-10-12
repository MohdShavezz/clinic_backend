import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { dbConn } from "./utils/dbConn.js";
import userRoute from "./routes/user.route.js";
import clinicRoute from "./routes/clinic.route.js";

const app = express();
const normalizeOrigin = (value) => {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};
const allowedOrigins = new Set(
  [process.env.CLIENT_URL, ...(process.env.CORS_ORIGINS || "").split(",")]
    .map(normalizeOrigin)
    .filter(Boolean)
);

let databaseReady = null;
const initializeDatabase = () => {
  if (!databaseReady) {
    databaseReady = dbConn().catch((error) => {
      // Allow a later request to retry if Neon was unavailable during a cold start.
      databaseReady = null;
      throw error;
    });
  }
  return databaseReady;
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

app.use(async (_req, res, next) => {
  try {
    await initializeDatabase();
    return next();
  } catch (error) {
    console.error("Unable to initialize PostgreSQL:", error);
    return res.status(503).json({ success: false, message: "Database is unavailable. Please try again later." });
  }
});

app.use("/api/user", userRoute);
app.use("/api/clinic", clinicRoute);
app.get("/api/test", (_req, res) => res.json({ success: true, message: "Clinic API is running." }));

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error);
  return res.status(500).json({ success: false, message: "An unexpected server error occurred." });
});

export default app;
