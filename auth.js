import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { config } from './config.js';
import { HttpError } from './http.js';

const COOKIE_NAME = 'fitmeal_session';

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, req.get('user-agent') || null, req.ip || null]
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });
}

export async function clearSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
}

export async function getUserFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.address, u.role, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)]
  );
  return result.rows[0] || null;
}

export async function requireAuth(req, res, next) {
  const user = await getUserFromRequest(req);
  if (!user) return next(new HttpError(401, 'Bạn cần đăng nhập để tiếp tục.'));
  req.user = user;
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return next(new HttpError(403, 'Bạn không có quyền quản trị.'));
  return next();
}

export async function registerUser({ email, password, fullName, phone, address, role = 'customer' }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount) throw new HttpError(409, 'Email này đã được đăng ký.');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, phone, address, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, full_name, phone, address, role, created_at`,
    [normalizedEmail, passwordHash, fullName.trim(), phone?.trim() || null, address?.trim() || null, role]
  );
  return result.rows[0];
}

export async function authenticateUser(email, password) {
  const result = await query(
    `SELECT id, email, password_hash, full_name, phone, address, role, created_at
     FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  delete user.password_hash;
  return user;
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullname: user.full_name ?? user.fullname,
    phone: user.phone,
    address: user.address,
    role: user.role,
    createdAt: user.created_at ?? user.createdAt
  };
}
