import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  uuid,
  timestamp,
  varchar,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id),
    r2Key: text("r2_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    takenAt: timestamp("taken_at"),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    place: varchar("place", { length: 255 }),
    lat: text("lat"),
    lng: text("lng"),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`),
    caption: text("caption"),
    visibility: varchar("visibility", { length: 50 }).default("public"),
    albumId: uuid("album_id").references(() => albums.id),
    width: integer("width"),
    height: integer("height"),
    tagsPending: integer("tags_pending").default(0), // 0 = complete, 1 = pending
  },
  (table) => ({
    ownerIdIdx: index("photos_owner_id_idx").on(table.ownerId),
    visibilityIdx: index("photos_visibility_idx").on(table.visibility),
    tagsIdx: index("photos_tags_idx").on(table.tags),
  })
);

export const albums = pgTable("albums", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  coverPhotoId: uuid("cover_photo_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
});

export const accessRequests = pgTable(
  "access_requests",
  {
    id: serial("id").primaryKey(),
    scopeType: varchar("scope_type", { length: 50 }).notNull(), // 'photo' or 'album'
    scopeId: uuid("scope_id").notNull(),
    requesterEmail: varchar("requester_email", { length: 255 }).notNull(),
    requesterName: varchar("requester_name", { length: 255 }),
    message: text("message"),
    status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'approved', 'denied'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (table) => ({
    scopeIdx: index("access_requests_scope_idx").on(
      table.scopeType,
      table.scopeId
    ),
    requesterIdx: index("access_requests_requester_idx").on(
      table.requesterEmail
    ),
    statusIdx: index("access_requests_status_idx").on(table.status),
  })
);

export const accessGrants = pgTable(
  "access_grants",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    scopeType: varchar("scope_type", { length: 50 }).notNull(), // 'photo' or 'album'
    scopeId: uuid("scope_id").notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    scopeIdx: index("access_grants_scope_idx").on(table.scopeType, table.scopeId),
    emailIdx: index("access_grants_email_idx").on(table.email),
    tokenHashIdx: index("access_grants_token_hash_idx").on(table.tokenHash),
  })
);
