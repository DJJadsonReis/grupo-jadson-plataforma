import { Pool } from "pg";

export const migrationId = "032-team-rooms";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS team_rooms (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    archived boolean NOT NULL DEFAULT false
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS team_room_members (
    room_id uuid NOT NULL REFERENCES team_rooms(id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES users(id),
    role text NOT NULL CHECK (role IN ('admin','member')),
    PRIMARY KEY (room_id, person_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS team_room_messages (
    id uuid PRIMARY KEY,
    room_id uuid NOT NULL REFERENCES team_rooms(id) ON DELETE CASCADE,
    author_kind text NOT NULL CHECK (author_kind IN ('person','bot')),
    author_id uuid NOT NULL,
    author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS team_room_messages_room_created_idx ON team_room_messages(room_id, created_at)");
}
