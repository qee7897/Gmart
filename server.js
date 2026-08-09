import express from "express";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

const adminKey = process.env.ADMIN_KEY || "dev-admin";

async function db(query, params=[]) {
  return pool.query(query, params);
}

async function initDb() {
  await db(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      member_code VARCHAR(30) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) UNIQUE NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      points INTEGER NOT NULL,
      amount NUMERIC(12,2),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      points INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      reward_id INTEGER NOT NULL REFERENCES rewards(id),
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      description TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      prize TEXT,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS event_entries (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      ticket_code VARCHAR(40) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const count = await db("SELECT COUNT(*) FROM rewards");
  if (Number(count.rows[0].count) === 0) {
    await db(
      `INSERT INTO rewards (name, points, stock) VALUES
       ('น้ำดื่ม 1 แพ็ก', 100, 20),
       ('ขนม/ของใช้ มูลค่า 50 บาท', 200, 20),
       ('คูปองส่วนลด 100 บาท', 400, 10)`
    );
  }

  const eventCount = await db("SELECT COUNT(*) FROM events");
  if (Number(eventCount.rows[0].count) === 0) {
    await db(
      `INSERT INTO events (name, description, points, prize, starts_at, ends_at)
       VALUES ('ลุ้นโชคประจำเดือน', 'ใช้คะแนนแลกสิทธิ์จับรางวัล', 50, 'รางวัลเงินสด 1,000 บาท',
       NOW(), NOW() + INTERVAL '30 days')`
    );
  }
}

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== adminKey) return res.status(401).json({error:"Unauthorized"});
  next();
}

app.get("/api/health", async (req,res) => {
  try { await db("SELECT 1"); res.json({ok:true}); }
  catch(e) { res.status(500).json({ok:false}); }
});

app.post("/api/members", async (req,res) => {
  try {
    const {name, phone} = req.body;
    if (!name || !phone) return res.status(400).json({error:"กรุณากรอกชื่อและเบอร์โทร"});
    const code = "M" + Date.now().toString().slice(-8);
    const result = await db(
      `INSERT INTO members (member_code,name,phone) VALUES ($1,$2,$3)
       RETURNING id,member_code,name,phone,points,created_at`,
      [code, name.trim(), phone.trim()]
    );
    res.json(result.rows[0]);
  } catch(e) {
    if (e.code === "23505") return res.status(409).json({error:"เบอร์โทรนี้เป็นสมาชิกแล้ว"});
    res.status(500).json({error:"เกิดข้อผิดพลาด"});
  }
});

app.get("/api/members/:code", async (req,res) => {
  const m = await db("SELECT id,member_code,name,phone,points,created_at FROM members WHERE member_code=$1",[req.params.code]);
  if (!m.rows[0]) return res.status(404).json({error:"ไม่พบสมาชิก"});
  const tx = await db(
    `SELECT type,points,amount,description,created_at FROM transactions
     WHERE member_id=$1 ORDER BY created_at DESC LIMIT 30`, [m.rows[0].id]
  );
  res.json({...m.rows[0], transactions: tx.rows});
});

app.post("/api/admin/earn", requireAdmin, async (req,res) => {
  const {memberCode, amount, description="ซื้อสินค้า"} = req.body;
  const numericAmount = Number(amount);
  if (!memberCode || !numericAmount || numericAmount < 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  const points = Math.floor(numericAmount / 20);
  if (points <= 0) return res.status(400).json({error:"ยอดซื้อต้องถึง 20 บาท"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[memberCode]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");
    await client.query("UPDATE members SET points=points+$1 WHERE id=$2",[points,m.rows[0].id]);
    await client.query(
      `INSERT INTO transactions (member_id,type,points,amount,description) VALUES ($1,'earn',$2,$3,$4)`,
      [m.rows[0].id,points,numericAmount,description]
    );
    await client.query("COMMIT");
    res.json({ok:true,points});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/api/rewards", async (req,res) => {
  const r = await db("SELECT * FROM rewards WHERE active=true ORDER BY points");
  res.json(r.rows);
});

app.post("/api/redeem", async (req,res) => {
  const {memberCode,rewardId} = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[memberCode]);
    const r = await client.query("SELECT * FROM rewards WHERE id=$1 AND active=true FOR UPDATE",[rewardId]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");
    if (!r.rows[0]) throw new Error("ไม่พบของรางวัล");
    if (r.rows[0].stock <= 0) throw new Error("ของรางวัลหมด");
    if (m.rows[0].points < r.rows[0].points) throw new Error("คะแนนไม่เพียงพอ");

    await client.query("UPDATE members SET points=points-$1 WHERE id=$2",[r.rows[0].points,m.rows[0].id]);
    await client.query("UPDATE rewards SET stock=stock-1 WHERE id=$1",[rewardId]);
    await client.query(
      `INSERT INTO redemptions (member_id,reward_id,points) VALUES ($1,$2,$3)`,
      [m.rows[0].id,rewardId,r.rows[0].points]
    );
    await client.query(
      `INSERT INTO transactions (member_id,type,points,description) VALUES ($1,'redeem',$2,$3)`,
      [m.rows[0].id,-r.rows[0].points,`แลก ${r.rows[0].name}`]
    );
    await client.query("COMMIT");
    res.json({ok:true,message:"แลกของรางวัลสำเร็จ"});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/api/events", async (req,res) => {
  const r = await db("SELECT * FROM events WHERE active=true ORDER BY created_at DESC");
  res.json(r.rows);
});

app.post("/api/events/join", async (req,res) => {
  const {memberCode,eventId} = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[memberCode]);
    const ev = await client.query("SELECT * FROM events WHERE id=$1 AND active=true FOR UPDATE",[eventId]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");
    if (!ev.rows[0]) throw new Error("ไม่พบ Event");
    if (m.rows[0].points < ev.rows[0].points) throw new Error("คะแนนไม่เพียงพอ");

    const duplicate = await client.query("SELECT id FROM event_entries WHERE event_id=$1 AND member_id=$2",[eventId,m.rows[0].id]);
    if (duplicate.rows[0]) throw new Error("คุณเข้าร่วม Event นี้แล้ว");

    const ticket = "T-" + crypto.randomBytes(5).toString("hex").toUpperCase();
    await client.query("UPDATE members SET points=points-$1 WHERE id=$2",[ev.rows[0].points,m.rows[0].id]);
    await client.query(
      `INSERT INTO event_entries (event_id,member_id,points,ticket_code) VALUES ($1,$2,$3,$4)`,
      [eventId,m.rows[0].id,ev.rows[0].points,ticket]
    );
    await client.query(
      `INSERT INTO transactions (member_id,type,points,description) VALUES ($1,'event',$2,$3)`,
      [m.rows[0].id,-ev.rows[0].points,`เข้าร่วม ${ev.rows[0].name}`]
    );
    await client.query("COMMIT");
    res.json({ok:true,ticket});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/api/admin/stats", requireAdmin, async (req,res) => {
  const [members, points, entries] = await Promise.all([
    db("SELECT COUNT(*) FROM members"),
    db("SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points ELSE 0 END),0) earned, COALESCE(SUM(CASE WHEN type<>'earn' THEN -points ELSE 0 END),0) used FROM transactions"),
    db("SELECT COUNT(*) FROM event_entries")
  ]);
  res.json({
    members: Number(members.rows[0].count),
    earned: Number(points.rows[0].earned),
    used: Number(points.rows[0].used),
    eventEntries: Number(entries.rows[0].count)
  });
});

app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const port = process.env.PORT || 10000;
initDb()
  .then(() => app.listen(port, () => console.log(`Running on ${port}`)))
  .catch(err => { console.error(err); process.exit(1); });
