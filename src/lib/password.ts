import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hash a plaintext password. Never store plaintext. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
