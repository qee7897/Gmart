# 🛒 GroceryClub

ระบบสมาชิกสะสมคะแนนสำหรับร้านขายของชำ — เว็บแอปเต็มรูปแบบ พร้อมใช้งานบน Render

---

## ✨ ฟีเจอร์

### ฝั่งลูกค้า
- 📝 **สมัครสมาชิก** — กรอกชื่อ + เบอร์โทร รับรหัสสมาชิก 6 หลัก (เริ่ม 100001)
- 📱 **บัตรสมาชิกดิจิทัล** — แสดงชื่อ รหัส เบอร์โทร คะแนนคงเหลือ
- 📷 **QR Code ส่วนตัว** — สแกนแล้วเช็คแต้มอัตโนมัติ
- 🔍 **ค้นหาคะแนน** — ค้นด้วยรหัสสมาชิก หรือ เบอร์โทร (exact match)
- 🎁 **แลกของรางวัล** — ใช้แต้มแลกน้ำดื่ม ขนม คูปองส่วนลด
- 🎉 **เข้าร่วมอีเวนต์** — ใช้แต้มแลกสิทธิ์ลุ้นรางวัล รับ ticket code

### ฝั่งแอดมิน
- 📊 **แดชบอร์ด** — สถิติสมาชิก, คะแนนแจก/ใช้, สิทธิ์อีเวนต์
- 👤 **จัดการสมาชิก** — ค้นหา (รหัส/เบอร์/ชื่อ), ดูรายละเอียด, เพิ่ม/ปรับคะแนน, ลบสมาชิก
- 🎁 **จัดการของรางวัล** — เพิ่ม/แก้ไข/ปิดใช้งาน/ลบ
- 🎉 **จัดการอีเวนต์** — เพิ่ม/แก้ไข/ปิดใช้งาน/ลบ
- 🔐 **ระบบ Login** — ADMIN_KEY + จำ session ใน localStorage

---

## 🏗️ เทคโนโลยี

| ส่วน | เทคโนโลยี |
|------|-----------|
| Backend | Node.js + Express 5 |
| Database | PostgreSQL |
| Frontend | Vanilla HTML/CSS/JS |
| QR Code | qrcode.js |
| Deploy | Render (Web Service + PostgreSQL) |

---

## 📂 โครงสร้างโปรเจกต์

```
Gmart/
├── server.js              # API + Static file serving
├── package.json
├── render.yaml            # Render deploy config
├── .env.example
└── public/
    ├── index.html         # หน้าลูกค้า (สมาชิก + สมัคร)
    ├── app.js             # JS ฝั่งลูกค้า
    ├── style.css          # CSS หลัก
    ├── admin.html         # หน้าแอดมิน (แยก)
    ├── admin.js           # JS ฝั่งแอดมิน
    └── admin.css          # CSS ฝั่งแอดมิน
```

---

## 🚀 Deploy บน Render

### 1. Fork repo นี้

### 2. สร้าง Web Service บน Render
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### 3. สร้าง PostgreSQL Database
- Render Dashboard → New → PostgreSQL
- เลือก Free Plan

### 4. ตั้งค่า Environment Variables
| Key | Value |
|-----|-------|
| `DATABASE_URL` | คัดลอกจาก PostgreSQL Internal Database URL |
| `ADMIN_KEY` | ตั้งรหัสผ่านแอดมินของคุณ |

### 5. Deploy
Render จะ deploy อัตโนมัติเมื่อ push โค้ด

---

## 💻 รันในเครื่อง

```bash
# 1. Clone
git clone https://github.com/qee7897/Gmart.git
cd Gmart

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment variables
cp .env.example .env
# แก้ DATABASE_URL และ ADMIN_KEY ใน .env

# 4. รัน
npm start
```

เปิด http://localhost:10000 — หน้าลูกค้า
เปิด http://localhost:10000/admin — หน้าแอดมิน

---

## 📡 API Endpoints

### สาธารณะ
| Method | Endpoint | คำอธิบาย |
|--------|----------|----------|
| POST | `/api/members` | สมัครสมาชิก |
| GET | `/api/members/lookup/find?q=` | ค้นหาสมาชิก (exact match) |
| GET | `/api/members/:code` | ดูรายละเอียดสมาชิก |
| GET | `/api/rewards` | ดูของรางวัล (active) |
| POST | `/api/redeem` | แลกของรางวัล |
| GET | `/api/events` | ดูอีเวนต์ (active) |
| POST | `/api/events/join` | เข้าร่วมอีเวนต์ |

### แอดมิน (ต้องมี header `x-admin-key`)
| Method | Endpoint | คำอธิบาย |
|--------|----------|----------|
| GET | `/api/admin/stats` | สถิติ |
| GET | `/api/admin/members?search=` | ค้นหาสมาชิก (partial match) |
| DELETE | `/api/admin/members/:code` | ลบสมาชิก |
| POST | `/api/admin/earn` | เพิ่มคะแนนจากยอดซื้อ |
| POST | `/api/admin/adjust` | ปรับคะแนนด้วยตนเอง |
| GET | `/api/admin/rewards` | ดูของรางวัลทั้งหมด |
| POST | `/api/admin/rewards` | เพิ่มของรางวัล |
| PUT | `/api/admin/rewards/:id` | แก้ไขของรางวัล |
| DELETE | `/api/admin/rewards/:id` | ลบของรางวัล |
| GET | `/api/admin/events` | ดูอีเวนต์ทั้งหมด |
| POST | `/api/admin/events` | สร้างอีเวนต์ |
| PUT | `/api/admin/events/:id` | แก้ไขอีเวนต์ |
| DELETE | `/api/admin/events/:id` | ลบอีเวนต์ |

---

## ⚙️ การสะสมคะแนน

- ทุก **20 บาท** = **1 แต้ม** (`Math.floor(amount / 20)`)
- แอดมินสามารถปรับคะแนน (+/-) ด้วยตนเองได้
- แลกของรางวัล: หักแต้ม + หักสต็อกอัตโนมัติ
- เข้าร่วมอีเวนต์: หักแต้ม + สร้าง ticket code

---

## 📄 License

MIT
