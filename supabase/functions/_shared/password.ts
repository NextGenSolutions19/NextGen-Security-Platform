export async function hashPassword(password: string): Promise<string> {
  const { default: bcrypt } = await import("npm:bcryptjs@2.4.3");
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const { default: bcrypt } = await import("npm:bcryptjs@2.4.3");
  return bcrypt.compare(password, passwordHash);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyTokenHash(
  token: string,
  tokenHash: string,
): Promise<boolean> {
  return (await hashToken(token)) === tokenHash;
}
