const $=s=>document.querySelector(s);

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

document.querySelectorAll(".nav").forEach(b=>{
  if(b.tagName==='BUTTON') b.onclick=()=>{
    document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); $("#"+b.dataset.page).classList.add("active");
  };
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
});
