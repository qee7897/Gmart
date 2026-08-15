// ===== GroceryClub — Customer JS =====
const $ = s => document.querySelector(s);

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' }) + ' ' +
         d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
}

// ===== Nav =====
document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#' + btn.dataset.page).classList.add('active');
    // close mobile nav
    $('#mainNav').classList.remove('open');
  };
});

function toggleMobileNav() {
  $('#mainNav').classList.toggle('open');
}

// ===== Register =====
async function register() {
  const name = $('#regName').value.trim();
  const phone = $('#regPhone').value.trim();
  if (!name || !phone) {
    $('#regResult').innerHTML = '<div class="notice error">กรุณากรอกชื่อและเบอร์โทร</div>';
    return;
  }
  try {
    const r = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });
    const d = await r.json();
    if (r.ok) {
      $('#regResult').innerHTML = `
        <div class="notice">
          <strong>สมัครสำเร็จ 🎉</strong><br>
          รหัสสมาชิกของคุณคือ: <strong style="font-size:20px;color:var(--accent)">${esc(d.member_code)}</strong><br>
          กรุณาจดจำรหัสนี้ไว้เช็คคะแนน<br>
          คะแนนเริ่มต้น: <strong>${d.points}</strong> แต้ม
        </div>`;
      $('#regName').value = '';
      $('#regPhone').value = '';
    } else {
      $('#regResult').innerHTML = `<div class="notice error">${esc(d.error)}</div>`;
    }
  } catch {
    $('#regResult').innerHTML = '<div class="notice error">เกิดข้อผิดพลาด กรุณาลองใหม่</div>';
  }
}

// ===== Member Card =====
function renderMemberCard(d) {
  const qrText = `${location.origin}/?code=${encodeURIComponent(d.member_code)}`;
  return `
    <div class="mcard">
      <div class="mcard-info">
        <div class="mcard-label">บัตรสมาชิก</div>
        <div class="mcard-name">${esc(d.name)}</div>
        <div class="mcard-meta">รหัส ${esc(d.member_code)} · ${esc(d.phone)}</div>
        <div class="mcard-points">${Number(d.points).toLocaleString()}<small>POINTS</small></div>
      </div>
      <div class="mcard-qr">
        <canvas id="qrCanvas"></canvas>
        <div class="qr-label">สแกนเช็คแต้ม</div>
      </div>
    </div>`;
}

async function loadMember() {
  const q = $('#memberCode').value.trim();
  if (!q) return;
  $('#memberView').innerHTML = '<div class="loading">กำลังค้นหา</div>';
  try {
    const r = await fetch('/api/members/lookup/find?q=' + encodeURIComponent(q));
    const d = await r.json();
    if (!r.ok) {
      $('#memberView').innerHTML = `<div class="notice error">${esc(d.error)}</div>`;
      return;
    }
    const [rewards, events] = await Promise.all([
      fetch('/api/rewards').then(r => r.json()),
      fetch('/api/events').then(r => r.json())
    ]);
    $('#memberView').innerHTML = `
      ${renderMemberCard(d)}
      <div class="grid-2">
        <div class="card">
          <h2>🎁 ของรางวัล</h2>
          ${rewards.length ? rewards.map(x => `
            <div class="reward-item">
              <h3>${esc(x.name)}</h3>
              <div class="ri-meta">${x.points} คะแนน · เหลือ ${x.stock} ชิ้น</div>
              <button class="btn-sm" onclick="redeem('${esc(d.member_code)}',${x.id})">แลกของรางวัล</button>
            </div>
          `).join('') : '<div class="empty">ยังไม่มีของรางวัล</div>'}
        </div>
        <div class="card">
          <h2>🎉 อีเวนต์</h2>
          ${events.length ? events.map(x => `
            <div class="event-item">
              <h3>${esc(x.name)}</h3>
              <div class="ri-meta">${esc(x.description || '')}</div>
              <div class="ri-price">${x.points} คะแนน · รางวัล: ${esc(x.prize || '-')}</div>
              <button class="btn-sm" onclick="joinEvent('${esc(d.member_code)}',${x.id})">ใช้คะแนนเข้าร่วม</button>
            </div>
          `).join('') : '<div class="empty">ยังไม่มีอีเวนต์</div>'}
        </div>
      </div>
      <div class="card history">
        <h2>📋 ประวัติคะแนน</h2>
        ${d.transactions.length ? d.transactions.map(x => `
          <div class="tx-row">
            <div>
              <div class="tx-desc">${esc(x.description || x.type)}</div>
              <div class="tx-date">${fmtDate(x.created_at)}</div>
            </div>
            <div class="tx-pts ${x.points > 0 ? 'plus' : 'minus'}">${x.points > 0 ? '+' : ''}${Number(x.points).toLocaleString()}</div>
          </div>
        `).join('') : '<div class="empty">ยังไม่มีรายการ</div>'}
      </div>`;
    // QR
    const canvas = document.getElementById('qrCanvas');
    if (window.QRCode && canvas) {
      QRCode.toCanvas(canvas, qrText, { width: 100, margin: 1, color: { dark:'#166534', light:'#ffffff' } }, e => { if(e) console.error(e); });
    }
  } catch {
    $('#memberView').innerHTML = '<div class="notice error">เกิดข้อผิดพลาด กรุณาลองใหม่</div>';
  }
}

async function redeem(memberCode, rewardId) {
  try {
    const r = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, rewardId })
    });
    const d = await r.json();
    alert(d.ok ? d.message : d.error);
    if (d.ok) loadMember();
  } catch { alert('เกิดข้อผิดพลาด'); }
}

async function joinEvent(memberCode, eventId) {
  try {
    const r = await fetch('/api/events/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberCode, eventId })
    });
    const d = await r.json();
    alert(d.ok ? `เข้าร่วมสำเร็จ 🎟️ ${d.ticket}` : d.error);
    if (d.ok) loadMember();
  } catch { alert('เกิดข้อผิดพลาด'); }
}

// ===== QR Auto-load =====
window.addEventListener('DOMContentLoaded', () => {
  const code = new URLSearchParams(location.search).get('code');
  if (code) {
    $('#memberCode').value = code;
    loadMember();
  }
});
