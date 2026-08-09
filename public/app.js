const $=s=>document.querySelector(s);
let adminKey="";

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function fmtDate(iso){
  if(!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'})+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}

document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); $("#"+b.dataset.page).classList.add("active");
});

document.querySelectorAll(".subnav-btn").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".subnav-btn").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".subtab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); $("#tab-"+b.dataset.tab).classList.add("active");
});

// ===== สมัครสมาชิก =====
async function register(){
  const name=$("#regName").value, phone=$("#regPhone").value;
  const r=await fetch("/api/members",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,phone})});
  const d=await r.json();
  $("#regResult").innerHTML=r.ok
    ? `<div class="notice">สมัครสำเร็จ 🎉<br>รหัสสมาชิกของคุณคือ: <b style="font-size:22px">${escapeHtml(d.member_code)}</b><br>กรุณาจดจำรหัสนี้ไว้เช็คคะแนน<br>คะแนนเริ่มต้น: <b>${d.points}</b></div>`
    : `<div class="notice error">${escapeHtml(d.error)}</div>`;
  if(r.ok){ $("#regName").value=""; $("#regPhone").value=""; }
}

// ===== เช็คคะแนนสมาชิก (ค้นด้วยรหัส หรือ เบอร์โทร) =====
function renderMemberCard(d){
  const qrText = `${location.origin}/?code=${encodeURIComponent(d.member_code)}`;
  const html = `
    <div class="mcard">
      <div class="mcard-info">
        <div class="small">บัตรสมาชิก</div>
        <h2>${escapeHtml(d.name)}</h2>
        <div class="code">รหัสสมาชิก ${escapeHtml(d.member_code)} · ${escapeHtml(d.phone)}</div>
        <div class="points">${d.points}<small> POINTS</small></div>
      </div>
      <div class="mcard-qr">
        <canvas id="qrCanvas"></canvas>
        <div class="qr-label">สแกนเช็คแต้ม</div>
      </div>
    </div>`;
  return { html, qrText };
}

async function loadMember(){
  const q=$("#memberCode").value.trim();
  if(!q)return;
  $("#memberView").innerHTML = '<div class="card"><p>กำลังค้นหา...</p></div>';
  const r=await fetch("/api/members/lookup/find?q="+encodeURIComponent(q));
  const d=await r.json();
  if(!r.ok){$("#memberView").innerHTML=`<div class="notice error">${escapeHtml(d.error)}</div>`;return}
  const rewards=await (await fetch("/api/rewards")).json();
  const events=await (await fetch("/api/events")).json();
  const {html:cardHtml, qrText} = renderMemberCard(d);
  $("#memberView").innerHTML=`
    ${cardHtml}
    <div class="grid">
      <div class="card"><h2>🎁 ของรางวัล</h2>${rewards.map(x=>`
        <div class="reward"><h3>${escapeHtml(x.name)}</h3><div class="price">${x.points} คะแนน · เหลือ ${x.stock}</div>
        <button onclick="redeem('${escapeHtml(d.member_code)}',${x.id})">แลกของรางวัล</button></div>`).join("")||"<p>ยังไม่มีของรางวัล</p>"}</div>
      <div class="card"><h2>🎉 Event</h2>${events.map(x=>`
        <div class="event"><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description||"")}</p><div class="price">${x.points} คะแนน</div>
        <p>รางวัล: ${escapeHtml(x.prize||"-")}</p><button onclick="joinEvent('${escapeHtml(d.member_code)}',${x.id})">ใช้คะแนนเข้าร่วม</button></div>`).join("")||"<p>ยังไม่มี Event</p>"}</div>
    </div>
    <div class="card history"><h2>ประวัติคะแนน</h2>${d.transactions.map(x=>`
      <div class="history-row"><span>${escapeHtml(x.description||x.type)} · ${fmtDate(x.created_at)}</span><b class="${x.points>0?'plus':'minus'}">${x.points>0?'+':''}${x.points}</b></div>`).join("")||"<p>ยังไม่มีรายการ</p>"}</div>`;
  const canvas = document.getElementById('qrCanvas');
  if (window.QRCode && canvas) {
    QRCode.toCanvas(canvas, qrText, { width: 96, margin: 1, color: { dark:'#14663a', light:'#ffffff' } }, err => { if(err) console.error(err); });
  }
}

async function redeem(memberCode,rewardId){
  const r=await fetch("/api/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberCode,rewardId})});
  const d=await r.json(); alert(d.ok?d.message:d.error); if(d.ok)loadMember();
}
async function joinEvent(memberCode,eventId){
  const r=await fetch("/api/events/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberCode,eventId})});
  const d=await r.json(); alert(d.ok?`เข้าร่วมสำเร็จ 🎟️ ${d.ticket}`:d.error); if(d.ok)loadMember();
}

// เปิดผ่านลิงก์ QR ที่มี ?code=xxxxxx จะเช็คคะแนนให้อัตโนมัติ
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    $("#memberCode").value = code;
    loadMember();
  }
  const searchInput = $("#adminSearch");
  if (searchInput) searchInput.addEventListener('keydown', e => { if(e.key==='Enter') adminSearchMembers(); });
});

// ===== ADMIN =====
function saveAdmin(){
  adminKey=$("#adminKey").value;
  $("#adminArea").hidden=false;
  loadStats();
  adminSearchMembers();
  loadRewardsAdmin();
  loadEventsAdmin();
}

function adminHeaders(extra={}){
  return {"x-admin-key":adminKey, ...extra};
}

async function loadStats(){
  const r=await fetch("/api/admin/stats",{headers:adminHeaders()});
  if(!r.ok){$("#adminArea").hidden=true;alert("ADMIN_KEY ไม่ถูกต้อง");return}
  const d=await r.json();
  $("#stats").innerHTML=[
    ["สมาชิก",d.members],["คะแนนแจก",d.earned],["คะแนนใช้",d.used],["สิทธิ์ Event",d.eventEntries]
  ].map(x=>`<div class="stat"><span>${x[0]}</span><b>${x[1].toLocaleString()}</b></div>`).join("");
}

// ---- จัดการสมาชิก ----
async function adminSearchMembers(){
  const q = $("#adminSearch").value.trim();
  const r = await fetch("/api/admin/members?search="+encodeURIComponent(q),{headers:adminHeaders()});
  if(!r.ok){ $("#adminSearchResults").innerHTML = '<div class="notice error">ค้นหาไม่สำเร็จ</div>'; return; }
  const list = await r.json();
  $("#adminSearchResults").innerHTML = list.length ? list.map(m=>`
    <div class="mrow" onclick="openMemberDetail('${escapeHtml(m.member_code)}')">
      <div>
        <div class="mrow-name">${escapeHtml(m.name)}</div>
        <div class="mrow-meta">รหัส ${escapeHtml(m.member_code)} · ${escapeHtml(m.phone)} · สมัคร ${fmtDate(m.created_at)}</div>
      </div>
      <div class="mrow-pts">${m.points} pts</div>
    </div>`).join("") : '<p style="color:var(--muted);margin-top:10px">ไม่พบสมาชิกที่ค้นหา</p>';
}

async function openMemberDetail(code){
  const r = await fetch("/api/members/"+encodeURIComponent(code));
  const d = await r.json();
  if(!r.ok){ $("#memberDetail").innerHTML = `<div class="notice error">${escapeHtml(d.error)}</div>`; return; }
  const {html:cardHtml, qrText} = renderMemberCard(d);
  $("#memberDetail").innerHTML = `
    ${cardHtml}
    <div class="detail-actions">
      <div class="box">
        <h4>💰 เพิ่มคะแนนจากยอดซื้อ</h4>
        <input id="earnAmount" type="number" placeholder="ยอดซื้อ (บาท)">
        <input id="earnDesc" placeholder="รายละเอียด เช่น ซื้อสินค้า">
        <button onclick="earnPointsFor('${escapeHtml(d.member_code)}')">เพิ่มคะแนน</button>
        <div id="earnResult"></div>
      </div>
      <div class="box">
        <h4>✏️ ปรับคะแนนด้วยตนเอง</h4>
        <input id="adjustDelta" type="number" placeholder="เช่น 50 หรือ -20">
        <input id="adjustReason" placeholder="เหตุผล เช่น แก้ไขข้อผิดพลาด">
        <button onclick="adjustPointsFor('${escapeHtml(d.member_code)}')">ปรับคะแนน</button>
        <div id="adjustResult"></div>
      </div>
    </div>
    <div class="card history"><h2>ประวัติคะแนน</h2>${d.transactions.map(x=>`
      <div class="history-row"><span>${escapeHtml(x.description||x.type)} · ${fmtDate(x.created_at)}</span><b class="${x.points>0?'plus':'minus'}">${x.points>0?'+':''}${x.points}</b></div>`).join("")||"<p>ยังไม่มีรายการ</p>"}</div>`;
  const canvas = document.getElementById('qrCanvas');
  if (window.QRCode && canvas) {
    QRCode.toCanvas(canvas, qrText, { width: 96, margin: 1, color: { dark:'#14663a', light:'#ffffff' } }, err => { if(err) console.error(err); });
  }
}

async function earnPointsFor(memberCode){
  const body={memberCode, amount:$("#earnAmount").value, description:$("#earnDesc").value||"ซื้อสินค้า"};
  const r=await fetch("/api/admin/earn",{method:"POST",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify(body)});
  const d=await r.json();
  $("#earnResult").innerHTML=`<div class="notice ${r.ok?"":"error"}">${r.ok?`เพิ่ม ${d.points} คะแนนสำเร็จ 🎉`:escapeHtml(d.error)}</div>`;
  if(r.ok){ $("#earnAmount").value=""; $("#earnDesc").value=""; openMemberDetail(memberCode); loadStats(); adminSearchMembers(); }
}

async function adjustPointsFor(memberCode){
  const body={memberCode, delta:$("#adjustDelta").value, reason:$("#adjustReason").value};
  const r=await fetch("/api/admin/adjust",{method:"POST",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify(body)});
  const d=await r.json();
  $("#adjustResult").innerHTML=`<div class="notice ${r.ok?"":"error"}">${r.ok?`ปรับคะแนนสำเร็จ (${d.points>0?'+':''}${d.points})`:escapeHtml(d.error)}</div>`;
  if(r.ok){ $("#adjustDelta").value=""; $("#adjustReason").value=""; openMemberDetail(memberCode); loadStats(); adminSearchMembers(); }
}

// ---- จัดการของรางวัล ----
async function loadRewardsAdmin(){
  const r = await fetch("/api/admin/rewards",{headers:adminHeaders()});
  if(!r.ok) return;
  const list = await r.json();
  $("#rewardsList").innerHTML = list.length ? list.map(x=>`
    <div class="item-row">
      <div class="item-main">
        <h4>${escapeHtml(x.name)} ${x.active?'':'<span class="badge-off">ปิดใช้งาน</span>'}</h4>
        <div class="item-meta">${x.points} คะแนน · คงเหลือ ${x.stock} ชิ้น</div>
      </div>
      <div class="item-actions">
        <button class="btn-outline" onclick='editReward(${x.id},${escapeHtml(JSON.stringify(x.name))},${x.points},${x.stock})'>แก้ไข</button>
        <button class="btn-outline" onclick="toggleReward(${x.id},${!x.active})">${x.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button class="btn-danger" onclick="deleteReward(${x.id})">ลบ</button>
      </div>
    </div>`).join("") : '<p style="color:var(--muted);margin-top:10px">ยังไม่มีของรางวัล</p>';
}

async function createReward(){
  const body={name:$("#rwName").value, points:$("#rwPoints").value, stock:$("#rwStock").value};
  const r=await fetch("/api/admin/rewards",{method:"POST",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify(body)});
  const d=await r.json();
  $("#rwResult").innerHTML=`<div class="notice ${r.ok?"":"error"}">${r.ok?"เพิ่มของรางวัลสำเร็จ 🎉":escapeHtml(d.error)}</div>`;
  if(r.ok){ $("#rwName").value=""; $("#rwPoints").value=""; $("#rwStock").value=""; loadRewardsAdmin(); }
}

async function editReward(id, curName, curPoints, curStock){
  const name = prompt("ชื่อของรางวัล", curName);
  if(name===null) return;
  const points = prompt("ใช้กี่คะแนนแลก", curPoints);
  if(points===null) return;
  const stock = prompt("จำนวนคงเหลือ", curStock);
  if(stock===null) return;
  const r = await fetch("/api/admin/rewards/"+id,{method:"PUT",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify({name,points,stock})});
  const d = await r.json();
  if(!r.ok){ alert(d.error); return; }
  loadRewardsAdmin();
}

async function toggleReward(id, active){
  const r = await fetch("/api/admin/rewards/"+id,{method:"PUT",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify({active})});
  if(!r.ok){ const d=await r.json(); alert(d.error); return; }
  loadRewardsAdmin();
}

async function deleteReward(id){
  if(!confirm("ต้องการลบของรางวัลนี้ใช่ไหม?")) return;
  const r = await fetch("/api/admin/rewards/"+id,{method:"DELETE",headers:adminHeaders()});
  const d = await r.json();
  if(!r.ok){ alert(d.error); return; }
  if(d.message) alert(d.message);
  loadRewardsAdmin();
}

// ---- จัดการ Event ----
async function loadEventsAdmin(){
  const r = await fetch("/api/admin/events",{headers:adminHeaders()});
  if(!r.ok) return;
  const list = await r.json();
  $("#eventsList").innerHTML = list.length ? list.map(x=>`
    <div class="item-row">
      <div class="item-main">
        <h4>${escapeHtml(x.name)} ${x.active?'':'<span class="badge-off">ปิดใช้งาน</span>'}</h4>
        <div class="item-meta">${x.points} คะแนน · รางวัล: ${escapeHtml(x.prize||"-")}</div>
        <div class="item-meta">${escapeHtml(x.description||"")}</div>
      </div>
      <div class="item-actions">
        <button class="btn-outline" onclick='editEvent(${x.id},${escapeHtml(JSON.stringify(x.name))},${x.points},${escapeHtml(JSON.stringify(x.description||""))},${escapeHtml(JSON.stringify(x.prize||""))})'>แก้ไข</button>
        <button class="btn-outline" onclick="toggleEvent(${x.id},${!x.active})">${x.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button class="btn-danger" onclick="deleteEvent(${x.id})">ลบ</button>
      </div>
    </div>`).join("") : '<p style="color:var(--muted);margin-top:10px">ยังไม่มี Event</p>';
}

async function createEvent(){
  const body={
    name:$("#evName").value, points:$("#evPoints").value,
    description:$("#evDesc").value, prize:$("#evPrize").value,
    startsAt: $("#evStart").value || null, endsAt: $("#evEnd").value || null
  };
  const r=await fetch("/api/admin/events",{method:"POST",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify(body)});
  const d=await r.json();
  $("#evResult").innerHTML=`<div class="notice ${r.ok?"":"error"}">${r.ok?"สร้าง Event สำเร็จ 🎉":escapeHtml(d.error)}</div>`;
  if(r.ok){ $("#evName").value=""; $("#evPoints").value=""; $("#evDesc").value=""; $("#evPrize").value=""; $("#evStart").value=""; $("#evEnd").value=""; loadEventsAdmin(); }
}

async function editEvent(id, curName, curPoints, curDesc, curPrize){
  const name = prompt("ชื่อ Event", curName);
  if(name===null) return;
  const points = prompt("ใช้กี่คะแนนเข้าร่วม", curPoints);
  if(points===null) return;
  const description = prompt("รายละเอียด", curDesc);
  if(description===null) return;
  const prize = prompt("รางวัล", curPrize);
  if(prize===null) return;
  const r = await fetch("/api/admin/events/"+id,{method:"PUT",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify({name,points,description,prize})});
  const d = await r.json();
  if(!r.ok){ alert(d.error); return; }
  loadEventsAdmin();
}

async function toggleEvent(id, active){
  const r = await fetch("/api/admin/events/"+id,{method:"PUT",headers:adminHeaders({"Content-Type":"application/json"}),body:JSON.stringify({active})});
  if(!r.ok){ const d=await r.json(); alert(d.error); return; }
  loadEventsAdmin();
}

async function deleteEvent(id){
  if(!confirm("ต้องการลบ Event นี้ใช่ไหม?")) return;
  const r = await fetch("/api/admin/events/"+id,{method:"DELETE",headers:adminHeaders()});
  const d = await r.json();
  if(!r.ok){ alert(d.error); return; }
  if(d.message) alert(d.message);
  loadEventsAdmin();
}
