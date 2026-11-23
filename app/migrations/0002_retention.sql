-- 30-day retention: purged reports keep an anonymised row. Needs image_key / tracking_token_hash
-- nullable (SQLite cannot drop NOT NULL), so the table is rebuilt. Real latitude/longitude stay
-- NOT NULL: a purge overwrites them with the public (shifted) coordinates.
CREATE TABLE reports_new (
	id TEXT PRIMARY KEY NOT NULL,
	category TEXT NOT NULL CHECK (category IN ('overflow','missed_collection','uncollected','illegal_dumping','other')),
	latitude REAL NOT NULL,
	longitude REAL NOT NULL,
	location_accuracy REAL,
	location_source TEXT NOT NULL CHECK (location_source IN ('exif','gps','manual')),
	public_latitude REAL NOT NULL,
	public_longitude REAL NOT NULL,
	image_key TEXT,
	image_hash TEXT,
	description TEXT,
	photo_captured_at TEXT,
	submitted_at TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','resolved','rejected')),
	possible_duplicate_of TEXT,
	resolved_at TEXT,
	tracking_token_hash TEXT,
	resolution_image_key TEXT,
	moderator_note TEXT,
	purged_at TEXT
);
INSERT INTO reports_new (id, category, latitude, longitude, location_accuracy, location_source, public_latitude, public_longitude,
	image_key, image_hash, description, photo_captured_at, submitted_at, status, possible_duplicate_of, resolved_at,
	tracking_token_hash, resolution_image_key, moderator_note)
SELECT id, category, latitude, longitude, location_accuracy, location_source, public_latitude, public_longitude,
	image_key, image_hash, description, photo_captured_at, submitted_at, status, possible_duplicate_of, resolved_at,
	tracking_token_hash, resolution_image_key, moderator_note FROM reports;
DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;
CREATE INDEX idx_reports_status_submitted ON reports (status, submitted_at);
CREATE INDEX idx_reports_category_submitted ON reports (category, submitted_at);
CREATE INDEX idx_reports_purge ON reports (purged_at, submitted_at);
