// Creates (or promotes) the admin account from env vars. Run with `pnpm seed`.
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME (optional)
import "./env";
import { hashPassword, normalizeEmail, validateEmail, validatePassword } from "../src/lib/auth-core";
import { getDb } from "../src/lib/db";
import { createUser, getUserWithHashByEmail, setPassword, setRole } from "../src/lib/repo/users";

async function main() {
  const email = normalizeEmail(process.env.SEED_ADMIN_EMAIL ?? "");
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";
  await getDb(); // connects (and, for local PGlite, applies migrations)
  if (!email) {
    console.log("Database ready. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create an admin.");
    return;
  }
  const emailErr = validateEmail(email);
  if (emailErr) throw new Error(emailErr);
  const existing = await getUserWithHashByEmail(email);
  if (existing) {
    await setRole(existing.id, "admin");
    if (password) {
      const err = validatePassword(password);
      if (err) throw new Error(err);
      await setPassword(existing.id, await hashPassword(password));
    }
    console.log(`Promoted ${email} to admin${password ? " and reset the password" : ""}.`);
    return;
  }
  const err = validatePassword(password);
  if (err) throw new Error(`SEED_ADMIN_PASSWORD: ${err}`);
  await createUser({ email, name, passwordHash: await hashPassword(password), role: "admin" });
  console.log(`Created admin ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
