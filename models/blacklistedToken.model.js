import { pool } from "../utils/dbConn.js";

export const BlacklistedToken = {
  async exists(token) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM blacklisted_tokens WHERE token = $1 AND expires_at > NOW() LIMIT 1",
      [token]
    );
    return rowCount > 0;
  },

  async add(token) {
    await pool.query(
      `INSERT INTO blacklisted_tokens (token, expires_at)
       VALUES ($1, NOW() + INTERVAL '1 day')
       ON CONFLICT (token) DO UPDATE SET created_at = NOW(), expires_at = EXCLUDED.expires_at`,
      [token]
    );
  },
};
