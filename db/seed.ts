/**
 * Database Seed Script
 *
 * Creates initial data for development:
 * - Owner user (from env)
 * - Sample invite
 *
 * Run with: bun run db:seed
 */

import { db, users, invites } from "../src/db";
import { nanoid } from "nanoid";
import { createHash } from "crypto";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@example.com";
const OWNER_NAME = process.env.OWNER_NAME || "Owner";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create owner user
  const ownerId = nanoid();

  const existingOwner = db.query.users.findFirst({
    where: (users, { eq }) => eq(users.role, "owner"),
  });

  if (!existingOwner) {
    db.insert(users)
      .values({
        id: ownerId,
        email: OWNER_EMAIL,
        name: OWNER_NAME,
        role: "owner",
      })
      .run();

    console.log(`✅ Created owner user: ${OWNER_EMAIL}`);

    // Create a sample invite
    const inviteToken = nanoid(16);
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");

    db.insert(invites)
      .values({
        id: nanoid(),
        token_hash: tokenHash,
        role: "operator",
        note: "Sample invite for development",
        created_by: ownerId,
      })
      .run();

    console.log(`✅ Created sample invite token: ${inviteToken}`);
    console.log(`   (Save this - it won't be shown again!)`);
  } else {
    console.log("⏭️  Owner user already exists, skipping seed");
  }

  console.log("🌱 Seeding complete!");
}

seed().catch(console.error);
