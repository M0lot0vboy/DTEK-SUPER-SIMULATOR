#!/usr/bin/env node
import { createHmac, pbkdf2Sync, randomBytes, scryptSync } from "node:crypto";

const HASH_PREFIX = "dtek-fbi-v1";
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PBKDF2_ITERS = 210_000;

const username = (process.argv[2] ?? "").trim();
const password = process.argv[3] ?? "";

if (!username || !password) {
  console.error("Usage: node scripts/hash-admin-password.mjs <ADMIN_USER> <ADMIN_PASSWORD>");
  process.exit(1);
}

const saltHex = randomBytes(16).toString("hex");
const normPass = password.normalize("NFKC");
const normUser = username.normalize("NFKC");

const stage1 = scryptSync(normPass, Buffer.from(`dtek-scrypt:${saltHex}`, "utf8"), 64, SCRYPT_PARAMS);
const stage2 = pbkdf2Sync(
  stage1,
  Buffer.from(`dtek-pbkdf2:${saltHex}:${normUser}`, "utf8"),
  PBKDF2_ITERS,
  64,
  "sha512",
);
const digestHex = createHmac("sha512", Buffer.from(`dtek-hmac-pepper-v1:${normUser}`, "utf8"))
  .update(stage2)
  .digest("hex");

console.log(`ADMIN_USER=${normUser}`);
console.log(`ADMIN_PASSWORD_HASH=${HASH_PREFIX}$${saltHex}$${digestHex}`);
