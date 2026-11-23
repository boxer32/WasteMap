-- WasteMap schema. Safe for remote: contains no demo data (see dev-seed.sql).

CREATE TABLE reports (
	id TEXT PRIMARY KEY NOT NULL,
	category TEXT NOT NULL CHECK (category IN ('overflow','missed_collection','uncollected','illegal_dumping','other')),
	latitude REAL NOT NULL,
	longitude REAL NOT NULL,
	location_accuracy REAL,
	location_source TEXT NOT NULL CHECK (location_source IN ('exif','gps','manual')),
	public_latitude REAL NOT NULL,
	public_longitude REAL NOT NULL,
	image_key TEXT NOT NULL,
	image_hash TEXT,
	description TEXT,
	photo_captured_at TEXT,
	submitted_at TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','resolved','rejected')),
	possible_duplicate_of TEXT,
	resolved_at TEXT,
	tracking_token_hash TEXT NOT NULL,
	resolution_image_key TEXT,
	moderator_note TEXT
);
CREATE INDEX idx_reports_status_submitted ON reports (status, submitted_at);
CREATE INDEX idx_reports_category_submitted ON reports (category, submitted_at);

CREATE TABLE feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	report_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('more_info','fixed','removal_request')),
	text TEXT,
	image_key TEXT,
	created_at TEXT NOT NULL,
	handled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feedback_report ON feedback (report_id);
CREATE INDEX idx_feedback_handled ON feedback (handled, created_at);

CREATE TABLE moderators (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	salt TEXT NOT NULL,
	iterations INTEGER NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY NOT NULL,
	moderator_id INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
	key TEXT PRIMARY KEY NOT NULL,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL
);

-- server-side secrets generated on first use (public-coordinate salt, rate-limit salt)
CREATE TABLE meta (
	name TEXT PRIMARY KEY NOT NULL,
	value TEXT NOT NULL
);
