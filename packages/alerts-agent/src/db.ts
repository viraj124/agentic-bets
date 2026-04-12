import pg from "pg";
import { logger } from "./logger.js";

const { Pool } = pg;

export type TriggerKind = "t2" | "t3";

export type Db = {
  init: () => Promise<void>;
  hasPost: (id: string) => Promise<boolean>;
  recordPost: (id: string, trigger: TriggerKind, content: string, messageId: string | null) => Promise<void>;
  countSince: (trigger: TriggerKind, since: Date) => Promise<number>;
  close: () => Promise<void>;
};

export function createDb(connectionString: string): Db {
  const pool = new Pool({
    connectionString,
    max: 4,
    // Enable SSL for any non-local host — covers Railway internal, public proxy,
    // and any hosted Postgres. Local (localhost/127.0.0.1) stays plaintext.
    ssl: isLocalConnection(connectionString) ? undefined : { rejectUnauthorized: false },
  });

  return {
    async init() {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS alerts_agent`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts_agent.posts (
          id TEXT PRIMARY KEY,
          trigger TEXT NOT NULL CHECK (trigger IN ('t2', 't3')),
          message_id TEXT,
          content TEXT NOT NULL,
          posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS posts_trigger_posted_at_idx
          ON alerts_agent.posts (trigger, posted_at DESC)`,
      );
      logger.info("DB initialized");
    },
    async hasPost(id: string) {
      const r = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM alerts_agent.posts WHERE id = $1) AS exists`,
        [id],
      );
      return r.rows[0]?.exists ?? false;
    },
    async recordPost(id, trigger, content, messageId) {
      await pool.query(
        `INSERT INTO alerts_agent.posts (id, trigger, content, message_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, trigger, content, messageId],
      );
    },
    async countSince(trigger, since) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM alerts_agent.posts
          WHERE trigger = $1 AND posted_at >= $2`,
        [trigger, since],
      );
      return parseInt(r.rows[0]?.count ?? "0", 10);
    },
    async close() {
      await pool.end();
    },
  };
}

function isLocalConnection(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}
