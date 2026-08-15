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

    CREATE SEQUENCE IF NOT EXISTS member_code_seq START 100001;

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

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      barcode VARCHAR(50) UNIQUE,
      name VARCHAR(200) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      category VARCHAR(100) DEFAULT 'ทั่วไป',
      stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
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
    const cleanPhone = phone.replace(/[^0-9]/g,"");
    if (cleanPhone.length < 9 || cleanPhone.length > 10) return res.status(400).json({error:"เบอร์โทรไม่ถูกต้อง"});
    const seq = await db("SELECT nextval('member_code_seq') AS n");
    const code = String(seq.rows[0].n);
    const result = await db(
      `INSERT INTO members (member_code,name,phone) VALUES ($1,$2,$3)
       RETURNING id,member_code,name,phone,points,created_at`,
      [code, name.trim(), cleanPhone]
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

// ค้นหาด้วยรหัสสมาชิก หรือ เบอร์โทร (exact match เท่านั้น เพื่อความเป็นส่วนตัว — ใช้ตอนลูกค้าเช็คคะแนนของตัวเอง)
app.get("/api/members/lookup/find", async (req,res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({error:"กรุณากรอกรหัสสมาชิกหรือเบอร์โทร"});
  const cleanQ = q.replace(/[^0-9]/g,"") || q;
  const m = await db("SELECT id,member_code,name,phone,points,created_at FROM members WHERE member_code=$1 OR phone=$1",[cleanQ]);
  if (!m.rows[0]) return res.status(404).json({error:"ไม่พบสมาชิก กรุณาตรวจสอบรหัสสมาชิกหรือเบอร์โทรอีกครั้ง"});
  const tx = await db(
    `SELECT type,points,amount,description,created_at FROM transactions
     WHERE member_id=$1 ORDER BY created_at DESC LIMIT 30`, [m.rows[0].id]
  );
  res.json({...m.rows[0], transactions: tx.rows});
});

// ค้นหาแบบไม่ตรงเป๊ะ (รหัส/เบอร์/ชื่อ) — เฉพาะแอดมินเท่านั้น เพื่อป้องกันการเปิดเผยข้อมูลสมาชิกคนอื่น
app.get("/api/admin/members", requireAdmin, async (req,res) => {
  const q = String(req.query.search || "").trim();
  if (!q) {
    const all = await db("SELECT id,member_code,name,phone,points,created_at FROM members ORDER BY created_at DESC LIMIT 50");
    return res.json(all.rows);
  }
  const like = `%${q}%`;
  const r = await db(
    `SELECT id,member_code,name,phone,points,created_at FROM members
     WHERE member_code ILIKE $1 OR phone ILIKE $1 OR name ILIKE $1
     ORDER BY created_at DESC LIMIT 50`, [like]
  );
  res.json(r.rows);
});

app.delete("/api/admin/members/:code", requireAdmin, async (req,res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[req.params.code]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");
    await client.query("DELETE FROM members WHERE id=$1",[m.rows[0].id]);
    await client.query("COMMIT");
    res.json({ok:true, name:m.rows[0].name});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
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

app.post("/api/admin/adjust", requireAdmin, async (req,res) => {
  const {memberCode, delta, reason} = req.body;
  const numericDelta = Math.trunc(Number(delta));
  if (!memberCode || !Number.isFinite(numericDelta) || numericDelta === 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[memberCode]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");
    if (m.rows[0].points + numericDelta < 0) throw new Error("แต้มคงเหลือไม่พอสำหรับการปรับนี้");
    await client.query("UPDATE members SET points=points+$1 WHERE id=$2",[numericDelta,m.rows[0].id]);
    await client.query(
      `INSERT INTO transactions (member_id,type,points,description) VALUES ($1,'adjust',$2,$3)`,
      [m.rows[0].id,numericDelta,String(reason||"ปรับคะแนนโดยแอดมิน").slice(0,200)]
    );
    await client.query("COMMIT");
    res.json({ok:true,points:numericDelta});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/api/rewards", async (req,res) => {
  const r = await db("SELECT * FROM rewards WHERE active=true ORDER BY points");
  res.json(r.rows);
});

// จัดการของรางวัล (แอดมิน) — ดูทั้งหมดรวมที่ปิดใช้งาน
app.get("/api/admin/rewards", requireAdmin, async (req,res) => {
  const r = await db("SELECT * FROM rewards ORDER BY created_at DESC");
  res.json(r.rows);
});

app.post("/api/admin/rewards", requireAdmin, async (req,res) => {
  const {name, points, stock} = req.body;
  const numPoints = Math.trunc(Number(points));
  const numStock = Math.trunc(Number(stock));
  if (!name || !Number.isFinite(numPoints) || numPoints <= 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  if (!Number.isFinite(numStock) || numStock < 0) return res.status(400).json({error:"จำนวนคงเหลือไม่ถูกต้อง"});
  const r = await db(
    "INSERT INTO rewards (name,points,stock) VALUES ($1,$2,$3) RETURNING *",
    [String(name).trim().slice(0,150), numPoints, numStock]
  );
  res.json(r.rows[0]);
});

app.put("/api/admin/rewards/:id", requireAdmin, async (req,res) => {
  const {name, points, stock, active} = req.body;
  const existing = await db("SELECT * FROM rewards WHERE id=$1",[req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({error:"ไม่พบของรางวัล"});
  const cur = existing.rows[0];
  const newName = name !== undefined ? String(name).trim().slice(0,150) : cur.name;
  const newPoints = points !== undefined ? Math.trunc(Number(points)) : cur.points;
  const newStock = stock !== undefined ? Math.trunc(Number(stock)) : cur.stock;
  const newActive = active !== undefined ? !!active : cur.active;
  if (!newName || !Number.isFinite(newPoints) || newPoints <= 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  if (!Number.isFinite(newStock) || newStock < 0) return res.status(400).json({error:"จำนวนคงเหลือไม่ถูกต้อง"});
  const r = await db(
    "UPDATE rewards SET name=$1, points=$2, stock=$3, active=$4 WHERE id=$5 RETURNING *",
    [newName, newPoints, newStock, newActive, req.params.id]
  );
  res.json(r.rows[0]);
});

app.delete("/api/admin/rewards/:id", requireAdmin, async (req,res) => {
  try {
    const r = await db("DELETE FROM rewards WHERE id=$1 RETURNING id",[req.params.id]);
    if (!r.rows[0]) return res.status(404).json({error:"ไม่พบของรางวัล"});
    res.json({ok:true});
  } catch(e) {
    if (e.code === "23503") {
      // มีประวัติแลกของรางวัลนี้แล้ว ลบไม่ได้ ให้ปิดใช้งานแทน
      await db("UPDATE rewards SET active=false WHERE id=$1",[req.params.id]);
      return res.json({ok:true, deactivated:true, message:"ของรางวัลนี้เคยถูกแลกแล้ว จึงปิดการใช้งานแทนการลบ"});
    }
    res.status(500).json({error:"เกิดข้อผิดพลาด"});
  }
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

// จัดการ Event (แอดมิน) — ดูทั้งหมดรวมที่ปิดใช้งาน
app.get("/api/admin/events", requireAdmin, async (req,res) => {
  const r = await db("SELECT * FROM events ORDER BY created_at DESC");
  res.json(r.rows);
});

app.post("/api/admin/events", requireAdmin, async (req,res) => {
  const {name, description, points, prize, startsAt, endsAt} = req.body;
  const numPoints = Math.trunc(Number(points));
  if (!name || !Number.isFinite(numPoints) || numPoints < 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  const r = await db(
    `INSERT INTO events (name,description,points,prize,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [String(name).trim().slice(0,180), description||null, numPoints, prize||null, startsAt||null, endsAt||null]
  );
  res.json(r.rows[0]);
});

app.put("/api/admin/events/:id", requireAdmin, async (req,res) => {
  const existing = await db("SELECT * FROM events WHERE id=$1",[req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({error:"ไม่พบ Event"});
  const cur = existing.rows[0];
  const {name, description, points, prize, startsAt, endsAt, active} = req.body;
  const newName = name !== undefined ? String(name).trim().slice(0,180) : cur.name;
  const newPoints = points !== undefined ? Math.trunc(Number(points)) : cur.points;
  if (!newName || !Number.isFinite(newPoints) || newPoints < 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  const r = await db(
    `UPDATE events SET name=$1, description=$2, points=$3, prize=$4,
     starts_at=$5, ends_at=$6, active=$7 WHERE id=$8 RETURNING *`,
    [newName,
     description !== undefined ? description : cur.description,
     newPoints,
     prize !== undefined ? prize : cur.prize,
     startsAt !== undefined ? startsAt : cur.starts_at,
     endsAt !== undefined ? endsAt : cur.ends_at,
     active !== undefined ? !!active : cur.active,
     req.params.id]
  );
  res.json(r.rows[0]);
});

app.delete("/api/admin/events/:id", requireAdmin, async (req,res) => {
  try {
    const r = await db("DELETE FROM events WHERE id=$1 RETURNING id",[req.params.id]);
    if (!r.rows[0]) return res.status(404).json({error:"ไม่พบ Event"});
    res.json({ok:true});
  } catch(e) {
    if (e.code === "23503") {
      await db("UPDATE events SET active=false WHERE id=$1",[req.params.id]);
      return res.json({ok:true, deactivated:true, message:"Event นี้มีคนเข้าร่วมแล้ว จึงปิดการใช้งานแทนการลบ"});
    }
    res.status(500).json({error:"เกิดข้อผิดพลาด"});
  }
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

// ===== Products API =====

app.get("/api/products", async (req,res) => {
  const r = await db("SELECT * FROM products WHERE active=true ORDER BY category, name");
  res.json(r.rows);
});

// ค้นหาสินค้าด้วยบาร์โค้ด (POS)
app.get("/api/products/barcode/:code", async (req,res) => {
  const r = await db("SELECT * FROM products WHERE barcode=$1 AND active=true",[req.params.code]);
  if (!r.rows[0]) return res.status(404).json({error:"ไม่พบสินค้า"});
  res.json(r.rows[0]);
});

app.get("/api/admin/products", requireAdmin, async (req,res) => {
  const q = String(req.query.search || "").trim();
  if (!q) {
    const r = await db("SELECT * FROM products ORDER BY category, name");
    return res.json(r.rows);
  }
  const like = `%${q}%`;
  const r = await db(
    `SELECT * FROM products WHERE name ILIKE $1 OR category ILIKE $1 ORDER BY category, name`,
    [like]
  );
  res.json(r.rows);
});

app.post("/api/admin/products", requireAdmin, async (req,res) => {
  const {barcode, name, price, category, stock} = req.body;
  const numPrice = Number(price);
  const numStock = Math.trunc(Number(stock));
  if (!name || !Number.isFinite(numPrice) || numPrice <= 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  if (!Number.isFinite(numStock) || numStock < 0) return res.status(400).json({error:"จำนวนสต็อกไม่ถูกต้อง"});
  try {
    const r = await db(
      `INSERT INTO products (barcode,name,price,category,stock) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [barcode||null, String(name).trim().slice(0,200), numPrice, category||'ทั่วไป', numStock]
    );
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === "23505") return res.status(409).json({error:"บาร์โค้ดนี้มีในระบบแล้ว"});
    res.status(500).json({error:"เกิดข้อผิดพลาด"});
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req,res) => {
  const existing = await db("SELECT * FROM products WHERE id=$1",[req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({error:"ไม่พบสินค้า"});
  const cur = existing.rows[0];
  const {barcode, name, price, category, stock, active} = req.body;
  const newName = name !== undefined ? String(name).trim().slice(0,200) : cur.name;
  const newBarcode = barcode !== undefined ? (barcode || null) : cur.barcode;
  const newPrice = price !== undefined ? Number(price) : Number(cur.price);
  const newCategory = category !== undefined ? category : cur.category;
  const newStock = stock !== undefined ? Math.trunc(Number(stock)) : cur.stock;
  const newActive = active !== undefined ? !!active : cur.active;
  if (!newName || !Number.isFinite(newPrice) || newPrice <= 0) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  if (!Number.isFinite(newStock) || newStock < 0) return res.status(400).json({error:"จำนวนสต็อกไม่ถูกต้อง"});
  const r = await db(
    `UPDATE products SET barcode=$1, name=$2, price=$3, category=$4, stock=$5, active=$6 WHERE id=$7 RETURNING *`,
    [newBarcode, newName, newPrice, newCategory, newStock, newActive, req.params.id]
  );
  res.json(r.rows[0]);
});

app.delete("/api/admin/products/:id", requireAdmin, async (req,res) => {
  const r = await db("DELETE FROM products WHERE id=$1 RETURNING id",[req.params.id]);
  if (!r.rows[0]) return res.status(404).json({error:"ไม่พบสินค้า"});
  res.json({ok:true});
});

// ขายสินค้า — เลือกสินค้า + จำนวน → คำนวณยอด → เพิ่มแต้มให้สมาชิก
app.post("/api/admin/sell", requireAdmin, async (req,res) => {
  const {memberCode, items} = req.body;
  // items = [{productId, qty}, ...]
  if (!memberCode || !items || !items.length) return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const m = await client.query("SELECT * FROM members WHERE member_code=$1 FOR UPDATE",[memberCode]);
    if (!m.rows[0]) throw new Error("ไม่พบสมาชิก");

    let totalAmount = 0;
    const soldItems = [];
    for (const item of items) {
      let p;
      if (item.barcode) {
        p = await client.query("SELECT * FROM products WHERE barcode=$1 AND active=true FOR UPDATE",[item.barcode]);
      } else {
        p = await client.query("SELECT * FROM products WHERE id=$1 AND active=true FOR UPDATE",[item.productId]);
      }
      if (!p.rows[0]) throw new Error(`ไม่พบสินค้า ${item.barcode || item.productId}`);
      const product = p.rows[0];
      const qty = Math.trunc(Number(item.qty));
      if (!qty || qty <= 0) throw new Error(`จำนวนสินค้าไม่ถูกต้อง`);
      if (product.stock < qty) throw new Error(`สินค้า "${product.name}" คงเหลือ ${product.stock} ไม่พอ`);
      const subtotal = Number(product.price) * qty;
      totalAmount += subtotal;
      await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[qty, product.id]);
      soldItems.push({name:product.name, price:Number(product.price), qty, subtotal});
    }

    const points = Math.floor(totalAmount / 20);
    await client.query("UPDATE members SET points=points+$1 WHERE id=$2",[points,m.rows[0].id]);

    const desc = soldItems.map(x => `${x.name} x${x.qty}`).join(', ');
    await client.query(
      `INSERT INTO transactions (member_id,type,points,amount,description) VALUES ($1,'earn',$2,$3,$4)`,
      [m.rows[0].id, points, totalAmount, `ขาย: ${desc}`]
    );

    await client.query("COMMIT");
    res.json({ok:true, totalAmount, points, items:soldItems});
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(400).json({error:e.message});
  } finally { client.release(); }
});

app.get("/admin", (req,res) => {
  res.sendFile(path.join(__dirname,"public","admin.html"));
});

app.get("/{*splat}", (req,res) => {
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const port = process.env.PORT || 10000;
initDb()
  .then(() => app.listen(port, () => console.log(`Running on ${port}`)))
  .catch(err => { console.error(err); process.exit(1); });
