CREATE TABLE "access_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"scope_type" varchar(50) NOT NULL,
	"scope_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_type" varchar(50) NOT NULL,
	"scope_id" uuid NOT NULL,
	"requester_email" varchar(255) NOT NULL,
	"requester_name" varchar(255),
	"message" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"cover_photo_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"r2_key" text NOT NULL,
	"thumbnail_key" text,
	"taken_at" timestamp,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"place" varchar(255),
	"lat" text,
	"lng" text,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"caption" text,
	"visibility" varchar(50) DEFAULT 'public',
	"album_id" uuid,
	"width" integer,
	"height" integer,
	"tags_pending" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grants_scope_idx" ON "access_grants" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "access_grants_email_idx" ON "access_grants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "access_grants_token_hash_idx" ON "access_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_requests_scope_idx" ON "access_requests" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "access_requests_requester_idx" ON "access_requests" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "photos_owner_id_idx" ON "photos" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "photos_visibility_idx" ON "photos" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "photos_tags_idx" ON "photos" USING btree ("tags");