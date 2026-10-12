import { pool } from "../utils/dbConn.js";

const USER_COLUMNS = `
  id,
  fullname,
  email,
  phone,
  password,
  role,
  profile,
  address,
  email_otp,
  phone_otp,
  is_email_verified,
  is_phone_verified,
  liked_items,
  created_at,
  updated_at
`;

// Preserve the API shape consumed by the existing frontend while storing data
// using PostgreSQL's native scalar and JSONB column types.
const toUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    fullname: row.fullname,
    email: row.email,
    phone: row.phone ?? {},
    password: row.password,
    role: row.role,
    profile: row.profile ?? {},
    address: row.address ?? {},
    emailOtp: row.email_otp,
    phoneOtp: row.phone_otp,
    isEmailVerified: row.is_email_verified,
    isPhoneVerified: row.is_phone_verified,
    likedItems: row.liked_items ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const User = {
  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = LOWER($1) LIMIT 1`,
      [email.trim()]
    );
    return toUser(rows[0]);
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return toUser(rows[0]);
  },

  async create({
    fullname,
    email,
    phone = {},
    password,
    role = "user",
    profile = {},
    address = {},
    emailOtp = null,
    phoneOtp = null,
    isEmailVerified = false,
    isPhoneVerified = false,
    likedItems = [],
  }) {
    const { rows } = await pool.query(
      `INSERT INTO users (
        fullname, email, phone, password, role, profile, address,
        email_otp, phone_otp, is_email_verified, is_phone_verified, liked_items
      ) VALUES ($1, LOWER($2), $3::jsonb, $4, $5, $6::jsonb, $7::jsonb,
        $8, $9, $10, $11, $12::jsonb)
      RETURNING ${USER_COLUMNS}`,
      [
        fullname.trim(), email.trim(), JSON.stringify(phone), password, role,
        JSON.stringify(profile), JSON.stringify(address), emailOtp, phoneOtp,
        isEmailVerified, isPhoneVerified, JSON.stringify(likedItems),
      ]
    );
    return toUser(rows[0]);
  },

  async updateById(id, changes) {
    const fields = {
      fullname: ["fullname", (value) => value],
      password: ["password", (value) => value],
      profile: ["profile", (value) => JSON.stringify(value), "jsonb"],
      address: ["address", (value) => JSON.stringify(value), "jsonb"],
      phone: ["phone", (value) => JSON.stringify(value), "jsonb"],
      emailOtp: ["email_otp", (value) => value],
      phoneOtp: ["phone_otp", (value) => value],
      isEmailVerified: ["is_email_verified", (value) => value],
      isPhoneVerified: ["is_phone_verified", (value) => value],
      likedItems: ["liked_items", (value) => JSON.stringify(value), "jsonb"],
    };
    const assignments = [];
    const values = [];
    for (const [key, value] of Object.entries(changes)) {
      const field = fields[key];
      if (!field) continue;
      values.push(field[1](value));
      const cast = field[2] ? `::${field[2]}` : "";
      assignments.push(`${field[0]} = $${values.length}${cast}`);
    }
    if (assignments.length === 0) return this.findById(id);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${assignments.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING ${USER_COLUMNS}`,
      values
    );
    return toUser(rows[0]);
  },
};
