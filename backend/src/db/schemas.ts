export const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_idx ON account(providerId, accountId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  chapter_id TEXT NOT NULL,
  theory_answers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(theory_answers)),
  practice_answers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(practice_answers)),
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS rooms_owner_updated_idx ON rooms(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_llm_credentials (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider = 'openai'),
  ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, auth_tag TEXT NOT NULL,
  encryption_version INTEGER NOT NULL, last_four TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_participants (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, room_id),
  CHECK (last_opened_at >= joined_at)
);
CREATE INDEX IF NOT EXISTS room_participants_user_recent_idx
  ON room_participants(user_id, last_opened_at DESC, room_id);
CREATE INDEX IF NOT EXISTS room_participants_room_idx ON room_participants(room_id);

-- Better Auth expects a logical name. This writable view supplies an empty
-- placeholder while the real user table stores no name.
CREATE VIEW IF NOT EXISTS auth_user AS
SELECT id, '' AS auth_placeholder, email, emailVerified, image, createdAt, updatedAt
FROM "user";

CREATE TRIGGER IF NOT EXISTS auth_user_insert
INSTEAD OF INSERT ON auth_user
BEGIN
  INSERT INTO "user" (id, email, emailVerified, image, createdAt, updatedAt)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.emailVerified, 0), NEW.image, NEW.createdAt, NEW.updatedAt);
END;

CREATE TRIGGER IF NOT EXISTS auth_user_update
INSTEAD OF UPDATE ON auth_user
BEGIN
  UPDATE "user"
  SET email = NEW.email,
      emailVerified = NEW.emailVerified,
      image = NEW.image,
      createdAt = NEW.createdAt,
      updatedAt = NEW.updatedAt
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS auth_user_delete
INSTEAD OF DELETE ON auth_user
BEGIN
  DELETE FROM "user" WHERE id = OLD.id;
END;
`;
