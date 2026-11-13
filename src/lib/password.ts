import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, 64, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(24).toString("hex");
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [version, salt, expected] = hash.split("$");
  if (
    version !== "scrypt-v1" ||
    !salt ||
    !expected ||
    !/^[0-9a-f]{128}$/.test(expected) ||
    password.length > 128
  )
    return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
// A missing account still performs the same expensive password derivation.
export const dummyHash =
  "scrypt-v1$000000000000000000000000000000000000000000000000$" +
  "00".repeat(64);
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function newToken() {
  return randomBytes(32).toString("hex");
}
