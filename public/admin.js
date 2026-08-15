// ===== GroceryClub Admin JS =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let adminKey = '';
let currentMemberCode = null;

// ===== Utils =====
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' }) + ' ' +
         d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
}

function fmtNum(n) {
  return Number(n).toLocaleString('th-TH');
}

function headers(extra = {}) {
  return { 'x-admin-key': adminKey, ...extra };
}

// ===== Toast =====
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toastContainer').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ===== Modal =====
function openModal(title, bodyHtml, footerHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml || '';
  $('#modalOverlay').classList.remove('hidden');
  requestAnimationFrame(() => $('#modalOverlay').classList.add('show'));
}

function closeModal() {
  $('#modalOverlay').classList.remove('show');
  setTimeout(() => $('#modalOverlay').classList.add('hidden'), 200);
}

// ===== Login / Logout =====
async function doLogin() {
  adminKey = $('#adminKeyInput').value.trim();
  if (!adminKey) { $('#loginError').textContent = 'กรุณาใส่ ADMIN_KEY'; return; }
  try {
    const r = await fetch('/api/admin/stats', { headers: headers() });
    if (!r.ok) throw new Error();
    $('#loginOverlay').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    localStorage.setItem('gmart_admin_key', adminKey);
    loadAll();
  } catch {
    $('#loginError').textContent = 'ADMIN_KEY ไม่ถูกต้อง';
    adminKey = '';
  }
}

function doLogout() {
  adminKey = '';
  localStorage.removeItem('gmart_admin_key');
  $('#appShell').classList.add('hidden');
  $('#loginOverlay').classList.remove('hidden');
  $('#adminKeyInput').value = '';
  $('#loginError').textContent = '';
}

// Auto-login from localStorage
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('gmart_admin_key');
  if (saved) {
    adminKey = saved;
    $('#adminKeyInput').value = saved;
    doLogin();
  }
  // Enter key on login
  $('#adminKeyInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  // Enter key on member search
  $('#memberSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchMembers(); });
});

// ===== Tab Navigation =====
const tabTitles = {
  dashboard: 'แดชบอร์ด',
  members: 'จัดการสมาชิก',
  rewards: 'จัดการของรางวัล',
  products: 'จัดการสินค้า',
  sell: 'ขายสินค้า (POS)',
  events: 'จัดการอีเวนต์'
};

function switchTab(name) {
  $$('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $('#pageTitle').textContent = tabTitles[name] || name;
  // Close sidebar on mobile
  $('.sidebar').classList.remove('open');
  // Close detail panel
  closeDetailPanel();
}

function toggleSidebar() {
  $('.sidebar').classList.toggle('open');
}

// ===== Load All Data =====
async function loadAll() {
  await Promise.all([loadStats(), searchMembers(), loadRewards(), loadEvents(), loadProducts()]);
}

// ===== Stats =====
async function loadStats() {
  try {
    const r = await fetch('/api/admin/stats', { headers: headers() });
    if (!r.ok) throw new Error();
    const d = await r.json();
    $('#statMembers').textContent = fmtNum(d.members);
    $('#statEarned').textContent = fmtNum(d.earned);
    $('#statUsed').textContent = fmtNum(d.used);
    $('#statEntries').textContent = fmtNum(d.eventEntries);
    $('#memberCountBadge').textContent = fmtNum(d.members) + ' สมาชิก';
  } catch { /* ignore */ }
}

// ===== Members =====
async function searchMembers() {
  const q = $('#memberSearch').value.trim();
  try {
    const r = await fetch('/api/admin/members?search=' + encodeURIComponent(q), { headers: headers() });
    if (!r.ok) throw new Error();
    const list = await r.json();
    renderMemberList(list);
    // Also update dashboard mini-lists
    loadDashRewards();
    loadDashEvents();
  } catch {
    $('#memberList').innerHTML = '<div class="dash-empty">ค้นหาไม่สำเร็จ</div>';
  }
}

function renderMemberList(list) {
  if (!list.length) {
    $('#memberList').innerHTML = '<div class="dash-empty">ไม่พบสมาชิก</div>';
    return;
  }
  $('#memberList').innerHTML = list.map(m => `
    <div class="member-row" onclick="openMemberDetail('${esc(m.member_code)}')">
      <div class="member-row-info">
        <div class="member-row-name">${esc(m.name)}</div>
        <div class="member-row-meta">รหัส ${esc(m.member_code)} · ${esc(m.phone)} · สมัคร ${fmtDate(m.created_at)}</div>
      </div>
      <div class="member-row-points">${fmtNum(m.points)} <small>pts</small></div>
    </div>
  `).join('');
}

async function openMemberDetail(code) {
  currentMemberCode = code;
  try {
    const r = await fetch('/api/members/' + encodeURIComponent(code));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);

    const qrText = `${location.origin}/?code=${encodeURIComponent(d.member_code)}`;

    const html = `
      <div class="dcard">
        <div class="dcard-label">บัตรสมาชิก</div>
        <div class="dcard-name">${esc(d.name)}</div>
        <div class="dcard-meta">รหัส ${esc(d.member_code)} · ${esc(d.phone)}</div>
        <div class="dcard-points">${fmtNum(d.points)}<small> POINTS</small></div>
        <div class="dcard-qr"><canvas id="qrDetail"></canvas></div>
      </div>

      <div class="detail-section">
        <h4>💰 เพิ่มคะแนนจากยอดซื้อ</h4>
        <div class="action-box">
          <input id="earnAmount" type="number" placeholder="ยอดซื้อ (บาท)">
          <input id="earnDesc" placeholder="รายละเอียด (เช่น ซื้อสินค้า)">
          <button class="btn-primary" onclick="doEarn('${esc(d.member_code)}')">เพิ่มคะแนน</button>
          <div id="earnMsg" class="action-msg"></div>
        </div>
      </div>

      <div class="detail-section">
        <h4>✏️ ปรับคะแนนด้วยตนเอง</h4>
        <div class="action-box">
          <input id="adjustDelta" type="number" placeholder="จำนวน (เช่น 50 หรือ -20)">
          <input id="adjustReason" placeholder="เหตุผล">
          <button class="btn-primary" onclick="doAdjust('${esc(d.member_code)}')">ปรับคะแนน</button>
          <div id="adjustMsg" class="action-msg"></div>
        </div>
      </div>

      <div class="detail-section">
        <h4>🗑️ จัดการสมาชิก</h4>
        <div class="action-box">
          <button class="btn-danger" style="width:100%" onclick="deleteMember('${esc(d.member_code)}','${esc(d.name)}')">🗑️ ลบสมาชิกนี้</button>
          <div class="action-msg" style="font-size:12px;color:#94a3b8;margin-top:8px">ลบแล้วไม่สามารถกู้คืนได้ — ประวัติทั้งหมดจะถูกลบ</div>
        </div>
      </div>

      <div class="tx-list">
        <h4>📋 ประวัติคะแนน</h4>
        ${d.transactions.length ? d.transactions.map(x => `
          <div class="tx-row">
            <div>
              <div class="tx-desc">${esc(x.description || x.type)}</div>
              <div class="tx-date">${fmtDate(x.created_at)}</div>
            </div>
            <div class="tx-pts ${x.points > 0 ? 'plus' : 'minus'}">${x.points > 0 ? '+' : ''}${fmtNum(x.points)}</div>
          </div>
        `).join('') : '<div class="dash-empty">ยังไม่มีรายการ</div>'}
      </div>
    `;

    $('#memberDetailContent').innerHTML = html;
    $('#memberDetailPanel').classList.remove('hidden');
    requestAnimationFrame(() => $('#memberDetailPanel').classList.add('show'));

    // Render QR
    const canvas = document.getElementById('qrDetail');
    if (window.QRCode && canvas) {
      QRCode.toCanvas(canvas, qrText, { width: 80, margin: 1, color: { dark:'#14663a', light:'#ffffff' } }, e => { if(e) console.error(e); });
    }
  } catch (e) {
    toast(e.message || 'ไม่พบสมาชิก', 'error');
  }
}

function closeDetailPanel() {
  $('#memberDetailPanel').classList.remove('show');
  setTimeout(() => $('#memberDetailPanel').classList.add('hidden'), 300);
  currentMemberCode = null;
}

async function doEarn(code) {
  const amount = $('#earnAmount').value;
  const desc = $('#earnDesc').value || 'ซื้อสินค้า';
  const msgEl = $('#earnMsg');
  try {
    const r = await fetch('/api/admin/earn', {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ memberCode: code, amount, description: desc })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    msgEl.className = 'action-msg show ok';
    msgEl.textContent = `เพิ่ม ${d.points} คะแนนสำเร็จ ✓`;
    toast(`เพิ่ม ${d.points} คะแนนให้ ${code}`);
    $('#earnAmount').value = '';
    $('#earnDesc').value = '';
    openMemberDetail(code);
    loadStats();
    searchMembers();
  } catch (e) {
    msgEl.className = 'action-msg show err';
    msgEl.textContent = e.message;
  }
}

async function doAdjust(code) {
  const delta = $('#adjustDelta').value;
  const reason = $('#adjustReason').value;
  const msgEl = $('#adjustMsg');
  try {
    const r = await fetch('/api/admin/adjust', {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ memberCode: code, delta, reason })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const sign = d.points > 0 ? '+' : '';
    msgEl.className = 'action-msg show ok';
    msgEl.textContent = `ปรับคะแนนสำเร็จ (${sign}${d.points}) ✓`;
    toast(`ปรับคะแนน ${sign}${d.points} ให้ ${code}`);
    $('#adjustDelta').value = '';
    $('#adjustReason').value = '';
    openMemberDetail(code);
    loadStats();
    searchMembers();
  } catch (e) {
    msgEl.className = 'action-msg show err';
    msgEl.textContent = e.message;
  }
}

function deleteMember(code, name) {
  openModal('ยืนยันการลบสมาชิก', `
    <p style="color:#475569">ต้องการลบสมาชิก "<b>${esc(name)}</b>" (รหัส ${esc(code)}) ใช่ไหม?</p>
    <p style="color:#dc2626;font-size:13px">⚠️ ลบแล้วไม่สามารถกู้คืนได้ — ประวัติคะแนนและข้อมูลทั้งหมดจะถูกลบ</p>
  `, `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-danger" onclick="confirmDeleteMember('${esc(code)}')">🗑️ ยืนยันลบ</button>
  `);
}

async function confirmDeleteMember(code) {
  try {
    const r = await fetch(`/api/admin/members/${encodeURIComponent(code)}`, { method: 'DELETE', headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    closeDetailPanel();
    toast(`ลบสมาชิก ${esc(d.name)} สำเร็จ`);
    loadStats();
    searchMembers();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ===== Rewards =====
let allRewards = [];

async function loadRewards() {
  try {
    const r = await fetch('/api/admin/rewards', { headers: headers() });
    if (!r.ok) throw new Error();
    allRewards = await r.json();
    renderRewards();
  } catch { /* ignore */ }
}

function renderRewards() {
  if (!allRewards.length) {
    $('#rewardsList').innerHTML = '<div class="dash-empty">ยังไม่มีของรางวัล</div>';
    return;
  }
  $('#rewardsList').innerHTML = allRewards.map(x => `
    <div class="card-item">
      <div class="card-item-body">
        <div class="card-item-title">${esc(x.name)} ${x.active ? '<span class="badge-active">เปิดใช้งาน</span>' : '<span class="badge-off">ปิดใช้งาน</span>'}</div>
        <div class="card-item-meta">${fmtNum(x.points)} คะแนน · คงเหลือ ${fmtNum(x.stock)} ชิ้น</div>
      </div>
      <div class="card-item-actions">
        <button class="btn-sm btn-outline" onclick='openRewardModal(${JSON.stringify(x).replace(/'/g,"&#39;")})'>✏️ แก้ไข</button>
        <button class="btn-sm btn-ghost" onclick="toggleReward(${x.id},${!x.active})">${x.active ? '⏸ ปิด' : '▶ เปิด'}</button>
        <button class="btn-sm btn-danger" onclick="deleteReward(${x.id},'${esc(x.name)}')">🗑 ลบ</button>
      </div>
    </div>
  `).join('');
}

function openRewardModal(existing) {
  const isEdit = !!existing;
  const title = isEdit ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัลใหม่';
  const body = `
    <div class="form-group">
      <label>ชื่อของรางวัล</label>
      <input id="mRwName" value="${isEdit ? esc(existing.name) : ''}" placeholder="เช่น น้ำดื่ม 1 แพ็ก">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>คะแนนที่ใช้แลก</label>
        <input id="mRwPoints" type="number" value="${isEdit ? existing.points : ''}" placeholder="100">
      </div>
      <div class="form-group">
        <label>จำนวนคงเหลือ</label>
        <input id="mRwStock" type="number" value="${isEdit ? existing.stock : ''}" placeholder="20">
      </div>
    </div>
  `;
  const footer = `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-primary" onclick="saveReward(${isEdit ? existing.id : 'null'})">${isEdit ? 'บันทึก' : 'เพิ่ม'}</button>
  `;
  openModal(title, body, footer);
}

async function saveReward(id) {
  const name = $('#mRwName').value.trim();
  const points = $('#mRwPoints').value;
  const stock = $('#mRwStock').value;
  try {
    const url = id ? `/api/admin/rewards/${id}` : '/api/admin/rewards';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method, headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, points, stock })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    toast(id ? 'แก้ไขของรางวัลสำเร็จ' : 'เพิ่มของรางวัลสำเร็จ ✓');
    loadRewards();
    loadDashRewards();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleReward(id, active) {
  try {
    const r = await fetch(`/api/admin/rewards/${id}`, {
      method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active })
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
    toast(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'info');
    loadRewards();
    loadDashRewards();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteReward(id, name) {
  openModal('ยืนยันการลบ', `
    <p style="color:#475569">ต้องการลบ "<b>${esc(name)}</b>" ใช่ไหม?<br>ถ้าของรางวัลนี้เคยถูกแลก ระบบจะปิดใช้งานแทนการลบ</p>
  `, `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-danger" onclick="confirmDeleteReward(${id})">🗑 ยืนยันลบ</button>
  `);
}

async function confirmDeleteReward(id) {
  try {
    const r = await fetch(`/api/admin/rewards/${id}`, { method: 'DELETE', headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    toast(d.message || 'ลบสำเร็จ', d.deactivated ? 'info' : 'success');
    loadRewards();
    loadDashRewards();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ===== Events =====
let allEvents = [];

async function loadEvents() {
  try {
    const r = await fetch('/api/admin/events', { headers: headers() });
    if (!r.ok) throw new Error();
    allEvents = await r.json();
    renderEvents();
  } catch { /* ignore */ }
}

function renderEvents() {
  if (!allEvents.length) {
    $('#eventsList').innerHTML = '<div class="dash-empty">ยังไม่มีอีเวนต์</div>';
    return;
  }
  $('#eventsList').innerHTML = allEvents.map(x => `
    <div class="card-item">
      <div class="card-item-body">
        <div class="card-item-title">${esc(x.name)} ${x.active ? '<span class="badge-active">เปิดใช้งาน</span>' : '<span class="badge-off">ปิดใช้งาน</span>'}</div>
        <div class="card-item-meta">${fmtNum(x.points)} คะแนน · รางวัล: ${esc(x.prize || '-')}</div>
        <div class="card-item-meta">${esc(x.description || '')}</div>
      </div>
      <div class="card-item-actions">
        <button class="btn-sm btn-outline" onclick='openEventModal(${JSON.stringify(x).replace(/'/g,"&#39;")})'>✏️ แก้ไข</button>
        <button class="btn-sm btn-ghost" onclick="toggleEvent(${x.id},${!x.active})">${x.active ? '⏸ ปิด' : '▶ เปิด'}</button>
        <button class="btn-sm btn-danger" onclick="deleteEvent(${x.id},'${esc(x.name)}')">🗑 ลบ</button>
      </div>
    </div>
  `).join('');
}

function toLocalDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEventModal(existing) {
  const isEdit = !!existing;
  const title = isEdit ? 'แก้ไขอีเวนต์' : 'สร้างอีเวนต์ใหม่';
  const body = `
    <div class="form-group">
      <label>ชื่ออีเวนต์</label>
      <input id="mEvName" value="${isEdit ? esc(existing.name) : ''}" placeholder="เช่น ลุ้นโชคประจำเดือน">
    </div>
    <div class="form-group">
      <label>รายละเอียด</label>
      <textarea id="mEvDesc" placeholder="รายละเอียดอีเวนต์">${isEdit ? esc(existing.description || '') : ''}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>คะแนนเข้าร่วม</label>
        <input id="mEvPoints" type="number" value="${isEdit ? existing.points : ''}" placeholder="50">
      </div>
      <div class="form-group">
        <label>รางวัล</label>
        <input id="mEvPrize" value="${isEdit ? esc(existing.prize || '') : ''}" placeholder="เงินสด 1,000 บาท">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>วันเริ่ม</label>
        <input id="mEvStart" type="datetime-local" value="${isEdit ? toLocalDatetime(existing.starts_at) : ''}">
      </div>
      <div class="form-group">
        <label>วันสิ้นสุด</label>
        <input id="mEvEnd" type="datetime-local" value="${isEdit ? toLocalDatetime(existing.ends_at) : ''}">
      </div>
    </div>
  `;
  const footer = `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-primary" onclick="saveEvent(${isEdit ? existing.id : 'null'})">${isEdit ? 'บันทึก' : 'สร้าง'}</button>
  `;
  openModal(title, body, footer);
}

async function saveEvent(id) {
  const name = $('#mEvName').value.trim();
  const description = $('#mEvDesc').value.trim();
  const points = $('#mEvPoints').value;
  const prize = $('#mEvPrize').value.trim();
  const startsAt = $('#mEvStart').value || null;
  const endsAt = $('#mEvEnd').value || null;
  try {
    const url = id ? `/api/admin/events/${id}` : '/api/admin/events';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method, headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, description, points, prize, startsAt, endsAt })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    toast(id ? 'แก้ไขอีเวนต์สำเร็จ' : 'สร้างอีเวนต์สำเร็จ ✓');
    loadEvents();
    loadDashEvents();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleEvent(id, active) {
  try {
    const r = await fetch(`/api/admin/events/${id}`, {
      method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active })
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
    toast(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'info');
    loadEvents();
    loadDashEvents();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteEvent(id, name) {
  openModal('ยืนยันการลบ', `
    <p style="color:#475569">ต้องการลบอีเวนต์ "<b>${esc(name)}</b>" ใช่ไหม?<br>ถ้ามีคนเข้าร่วมแล้ว ระบบจะปิดใช้งานแทนการลบ</p>
  `, `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-danger" onclick="confirmDeleteEvent(${id})">🗑 ยืนยันลบ</button>
  `);
}

async function confirmDeleteEvent(id) {
  try {
    const r = await fetch(`/api/admin/events/${id}`, { method: 'DELETE', headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    toast(d.message || 'ลบสำเร็จ', d.deactivated ? 'info' : 'success');
    loadEvents();
    loadDashEvents();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ===== Dashboard Mini Lists =====
async function loadDashRewards() {
  try {
    const r = await fetch('/api/admin/rewards', { headers: headers() });
    if (!r.ok) return;
    const list = await r.json();
    const active = list.filter(x => x.active).slice(0, 5);
    $('#dashRewards').innerHTML = active.length ? active.map(x => `
      <div class="dash-item">
        <div>
          <div class="dash-item-name">${esc(x.name)}</div>
          <div class="dash-item-meta">${fmtNum(x.points)} คะแนน · เหลือ ${x.stock}</div>
        </div>
        <span class="badge-active">เปิด</span>
      </div>
    `).join('') : '<div class="dash-empty">ไม่มีของรางวัลที่เปิดใช้งาน</div>';
  } catch { /* ignore */ }
}

async function loadDashEvents() {
  try {
    const r = await fetch('/api/admin/events', { headers: headers() });
    if (!r.ok) return;
    const list = await r.json();
    const active = list.filter(x => x.active).slice(0, 5);
    $('#dashEvents').innerHTML = active.length ? active.map(x => `
      <div class="dash-item">
        <div>
          <div class="dash-item-name">${esc(x.name)}</div>
          <div class="dash-item-meta">${fmtNum(x.points)} คะแนน · ${esc(x.prize || '-')}</div>
        </div>
        <span class="badge-active">เปิด</span>
      </div>
    `).join('') : '<div class="dash-empty">ไม่มีอีเวนต์ที่เปิดใช้งาน</div>';
  } catch { /* ignore */ }
}

// ===== Products =====
let allProducts = [];

async function loadProducts() {
  const q = $('#productSearch') ? $('#productSearch').value.trim() : '';
  try {
    const r = await fetch('/api/admin/products?search=' + encodeURIComponent(q), { headers: headers() });
    if (!r.ok) throw new Error();
    allProducts = await r.json();
    renderProducts();
  } catch { /* ignore */ }
}

function renderProducts() {
  if (!allProducts.length) {
    $('#productsList').innerHTML = '<div class="dash-empty">ยังไม่มีสินค้า</div>';
    return;
  }
  const groups = {};
  allProducts.forEach(p => {
    const cat = p.category || 'ทั่วไป';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  let html = '';
  for (const [cat, items] of Object.entries(groups)) {
    html += `<div class="cat-header">${esc(cat)} (${items.length})</div>`;
    html += items.map(x => `
      <div class="card-item">
        <div class="card-item-body">
          <div class="card-item-title">${esc(x.name)} ${x.active ? '' : '<span class="badge-off">ปิดใช้งาน</span>'}</div>
          <div class="card-item-meta">${x.barcode ? '📊 ' + esc(x.barcode) + ' · ' : ''}฿${Number(x.price).toLocaleString()} · สต็อก ${x.stock} ${x.stock <= 5 ? '<span style="color:#dc2626">⚠️ ใกล้หมด</span>' : ''}</div>
        </div>
        <div class="card-item-actions">
          <button class="btn-sm btn-outline" onclick='openProductModal(${JSON.stringify(x).replace(/'/g, "&#39;")})'>✏️</button>
          <button class="btn-sm btn-ghost" onclick="toggleProduct(${x.id},${!x.active})">${x.active ? '⏸' : '▶'}</button>
          <button class="btn-sm btn-danger" onclick="deleteProduct(${x.id},'${esc(x.name)}')">🗑</button>
        </div>
      </div>
    `).join('');
  }
  $('#productsList').innerHTML = html;
}

function openProductModal(existing) {
  const isEdit = !!existing;
  const title = isEdit ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่';
  const body = `
    <div class="form-group">
      <label>บาร์โค้ด</label>
      <input id="mPrBarcode" value="${isEdit ? esc(existing.barcode || '') : ''}" placeholder="ยิงบาร์โค้ด หรือกรอกเอง">
    </div>
    <div class="form-group">
      <label>ชื่อสินค้า</label>
      <input id="mPrName" value="${isEdit ? esc(existing.name) : ''}" placeholder="เช่น น้ำดื่มคริสตัล 600ml">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>ราคา (บาท)</label>
        <input id="mPrPrice" type="number" step="0.01" value="${isEdit ? existing.price : ''}" placeholder="25">
      </div>
      <div class="form-group">
        <label>สต็อก</label>
        <input id="mPrStock" type="number" value="${isEdit ? existing.stock : ''}" placeholder="100">
      </div>
    </div>
    <div class="form-group">
      <label>หมวดหมู่</label>
      <input id="mPrCategory" value="${isEdit ? esc(existing.category || '') : ''}" placeholder="เช่น เครื่องดื่ม, ขนม, ของใช้">
    </div>
  `;
  const footer = `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-primary" onclick="saveProduct(${isEdit ? existing.id : 'null'})">${isEdit ? 'บันทึก' : 'เพิ่ม'}</button>
  `;
  openModal(title, body, footer);
}

async function saveProduct(id) {
  const barcode = $('#mPrBarcode').value.trim();
  const name = $('#mPrName').value.trim();
  const price = $('#mPrPrice').value;
  const stock = $('#mPrStock').value;
  const category = $('#mPrCategory').value.trim() || 'ทั่วไป';
  try {
    const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method, headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ barcode, name, price, stock, category })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    closeModal();
    toast(id ? 'แก้ไขสินค้าสำเร็จ' : 'เพิ่มสินค้าสำเร็จ ✓');
    loadProducts();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleProduct(id, active) {
  try {
    const r = await fetch(`/api/admin/products/${id}`, {
      method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active })
    });
    if (!r.ok) throw new Error();
    toast(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'info');
    loadProducts();
  } catch { toast('เกิดข้อผิดพลาด', 'error'); }
}

function deleteProduct(id, name) {
  openModal('ยืนยันการลบ', `
    <p style="color:#475569">ต้องการลบสินค้า "<b>${esc(name)}</b>" ใช่ไหม?</p>
  `, `
    <button class="btn-sm btn-ghost" onclick="closeModal()">ยกเลิก</button>
    <button class="btn-danger" onclick="confirmDeleteProduct(${id})">🗑 ยืนยันลบ</button>
  `);
}

async function confirmDeleteProduct(id) {
  try {
    const r = await fetch(`/api/admin/products/${id}`, { method: 'DELETE', headers: headers() });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
    closeModal();
    toast('ลบสินค้าสำเร็จ');
    loadProducts();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Sell (POS) =====
let sellCart = [];
let sellMember = null;

async function sellLookupMember() {
  const code = $('#sellMemberCode').value.trim();
  if (!code) return;
  try {
    const r = await fetch('/api/members/' + encodeURIComponent(code));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    sellMember = d;
    $('#sellMemberInfo').innerHTML = `<div class="sell-member-card">👤 ${esc(d.name)} · รหัส ${esc(d.member_code)} · ${fmtNum(d.points)} แต้ม</div>`;
    loadSellProducts();
  } catch (e) {
    sellMember = null;
    $('#sellMemberInfo').innerHTML = `<div class="action-msg show err">${e.message}</div>`;
  }
}

async function loadSellProducts() {
  try {
    const r = await fetch('/api/admin/products', { headers: headers() });
    if (!r.ok) return;
    const list = await r.json();
    const active = list.filter(x => x.active && x.stock > 0);
    if (!active.length) {
      $('#sellProductList').innerHTML = '<div class="dash-empty">ไม่มีสินค้าพร้อมขาย</div>';
      return;
    }
    const groups = {};
    active.forEach(p => {
      const cat = p.category || 'ทั่วไป';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="sell-cat">${esc(cat)}</div>`;
      html += items.map(x => `
        <div class="sell-item" onclick="addToCart(${x.id})">
          <div class="sell-item-name">${esc(x.name)}</div>
          <div class="sell-item-meta">฿${Number(x.price).toLocaleString()} · เหลือ ${x.stock}</div>
        </div>
      `).join('');
    }
    $('#sellProductList').innerHTML = html;
  } catch { /* ignore */ }
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) {
    // reload products
    fetch('/api/admin/products', { headers: headers() })
      .then(r => r.json())
      .then(list => { allProducts = list; addToCart(productId); });
    return;
  }
  const existing = sellCart.find(c => c.productId === productId);
  if (existing) {
    if (existing.qty >= product.stock) { toast('สินค้าในสต็อกไม่พอ', 'error'); return; }
    existing.qty++;
  } else {
    sellCart.push({ productId, name: product.name, price: Number(product.price), qty: 1, maxStock: product.stock });
  }
  renderCart();
}

function removeFromCart(productId) {
  sellCart = sellCart.filter(c => c.productId !== productId);
  renderCart();
}

function updateCartQty(productId, delta) {
  const item = sellCart.find(c => c.productId === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(productId); return; }
  if (item.qty > item.maxStock) { item.qty = item.maxStock; toast('สินค้าในสต็อกไม่พอ', 'error'); }
  renderCart();
}

function renderCart() {
  if (!sellCart.length) {
    $('#sellCart').innerHTML = '<div class="dash-empty">ยังไม่มีสินค้าในตะกร้า</div>';
    $('#sellTotal').innerHTML = '';
    return;
  }
  const total = sellCart.reduce((s, c) => s + c.price * c.qty, 0);
  const points = Math.floor(total / 20);
  $('#sellCart').innerHTML = sellCart.map(c => `
    <div class="cart-row">
      <div class="cart-info">
        <div class="cart-name">${esc(c.name)}</div>
        <div class="cart-price">฿${c.price.toLocaleString()} × ${c.qty} = ฿${(c.price * c.qty).toLocaleString()}</div>
      </div>
      <div class="cart-qty">
        <button onclick="updateCartQty(${c.productId},-1)">−</button>
        <span>${c.qty}</span>
        <button onclick="updateCartQty(${c.productId},1)">+</button>
        <button class="cart-del" onclick="removeFromCart(${c.productId})">✕</button>
      </div>
    </div>
  `).join('');
  $('#sellTotal').innerHTML = `
    <div class="total-row"><span>รวม</span><b>฿${total.toLocaleString()}</b></div>
    <div class="total-row"><span>แต้มที่ได้</span><b class="plus">+${points}</b></div>
  `;
}

async function doSell() {
  if (!sellMember) { toast('กรุณาเลือกสมาชิกก่อน', 'error'); return; }
  if (!sellCart.length) { toast('กรุณาเลือกสินค้า', 'error'); return; }
  try {
    const r = await fetch('/api/admin/sell', {
      method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        memberCode: sellMember.member_code,
        items: sellCart.map(c => ({ productId: c.productId, qty: c.qty }))
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const msg = `ขายสำเร็จ ✓ รวม ฿${d.totalAmount.toLocaleString()} · +${d.points} แต้ม`;
    $('#sellResult').innerHTML = `<div class="action-msg show ok">${msg}</div>`;
    toast(msg);
    sellCart = [];
    sellMember = null;
    $('#sellMemberCode').value = '';
    $('#sellMemberInfo').innerHTML = '';
    renderCart();
    loadSellProducts();
    loadStats();
    searchMembers();
  } catch (e) { toast(e.message, 'error'); }
}

// Product search enter key
window.addEventListener('DOMContentLoaded', () => {
  const ps = $('#productSearch');
  if (ps) ps.addEventListener('keydown', e => { if (e.key === 'Enter') loadProducts(); });
});

// ===== Barcode Scanner =====

// USB barcode scanner: auto-detect rapid input + Enter
window.addEventListener('DOMContentLoaded', () => {
  const barcodeInput = $('#sellBarcode');
  if (barcodeInput) {
    barcodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleBarcodeInput(barcodeInput.value.trim());
      }
    });
  }
});

async function handleBarcodeInput(code) {
  if (!code) return;
  const resultEl = $('#barcodeResult');
  // Try lookup by barcode first
  try {
    const r = await fetch('/api/products/barcode/' + encodeURIComponent(code));
    if (r.ok) {
      const product = await r.json();
      addToCart(product.id);
      resultEl.innerHTML = `<div class="action-msg show ok">✓ เพิ่ม ${esc(product.name)} ในตะกร้า</div>`;
      setTimeout(() => resultEl.innerHTML = '', 2000);
      $('#sellBarcode').value = '';
      return;
    }
  } catch { /* ignore */ }

  // If not found by barcode, search by name
  try {
    const r = await fetch('/api/admin/products?search=' + encodeURIComponent(code), { headers: headers() });
    if (r.ok) {
      const list = await r.json();
      if (list.length === 1) {
        addToCart(list[0].id);
        resultEl.innerHTML = `<div class="action-msg show ok">✓ เพิ่ม ${esc(list[0].name)} ในตะกร้า</div>`;
        setTimeout(() => resultEl.innerHTML = '', 2000);
        $('#sellBarcode').value = '';
        return;
      } else if (list.length > 1) {
        resultEl.innerHTML = `<div class="action-msg show err">พบ ${list.length} รายการ — คลิกเลือกด้านล่าง</div>`;
        return;
      }
    }
  } catch { /* ignore */ }

  resultEl.innerHTML = `<div class="action-msg show err">ไม่พบสินค้า: ${esc(code)}</div>`;
}

// Camera scanner (html5-qrcode)
let cameraScanner = null;
let cameraRunning = false;

function toggleCameraScanner() {
  if (cameraRunning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

async function startCameraScanner() {
  const container = $('#cameraScanner');
  const preview = $('#scannerPreview');
  container.classList.remove('hidden');
  cameraRunning = true;

  if (!window.Html5Qrcode) {
    preview.innerHTML = '<div class="action-msg show err">ไม่สามารถโหลด library สแกนกล้องได้</div>';
    return;
  }

  cameraScanner = new Html5Qrcode('scannerPreview');
  try {
    await cameraScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
      (decodedText) => {
        // Found barcode
        handleBarcodeInput(decodedText);
        // Brief pause after scan
        setTimeout(() => {}, 500);
      },
      () => {} // ignore errors during scanning
    );
  } catch (e) {
    preview.innerHTML = `<div class="action-msg show err">ไม่สามารถเปิดกล้องได้: ${e.message || 'กรุณาอนุญาตกล้อง'}</div>`;
    cameraRunning = false;
  }
}

async function stopCameraScanner() {
  if (cameraScanner && cameraRunning) {
    try {
      await cameraScanner.stop();
      cameraScanner.clear();
    } catch { /* ignore */ }
  }
  cameraRunning = false;
  $('#cameraScanner').classList.add('hidden');
}
