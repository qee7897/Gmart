const $=s=>document.querySelector(s);
let adminKey="";

document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); $("#"+b.dataset.page).classList.add("active");
});

async function register(){
  const name=$("#regName").value, phone=$("#regPhone").value;
  const r=await fetch("/api/members",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,phone})});
  const d=await r.json();
  $("#regResult").innerHTML=r.ok
    ? `<div class="notice">สมัครสำเร็จ 🎉<br>Member ID: <b>${d.member_code}</b><br>คะแนนเริ่มต้น: <b>${d.points}</b></div>`
    : `<div class="notice error">${d.error}</div>`;
}

async function loadMember(){
  const code=$("#memberCode").value.trim();
  if(!code)return;
  const r=await fetch("/api/members/"+encodeURIComponent(code));
  const d=await r.json();
  if(!r.ok){$("#memberView").innerHTML=`<div class="notice error">${d.error}</div>`;return}
  const rewards=await (await fetch("/api/rewards")).json();
  const events=await (await fetch("/api/events")).json();
  $("#memberView").innerHTML=`
    <div class="card">
      <div class="member-head">
        <div><div class="small">สมาชิก</div><h2>${d.name}</h2><p>${d.member_code} · ${d.phone}</p></div>
        <div class="points">${d.points}<small> POINTS</small></div>
      </div>
    </div>
    <div class="grid">
      <div class="card"><h2>🎁 ของรางวัล</h2>${rewards.map(x=>`
        <div class="reward"><h3>${x.name}</h3><div class="price">${x.points} คะแนน · เหลือ ${x.stock}</div>
        <button onclick="redeem('${d.member_code}',${x.id})">แลกของรางวัล</button></div>`).join("")}</div>
      <div class="card"><h2>🎉 Event</h2>${events.map(x=>`
        <div class="event"><h3>${x.name}</h3><p>${x.description||""}</p><div class="price">${x.points} คะแนน</div>
        <p>รางวัล: ${x.prize||"-"}</p><button onclick="joinEvent('${d.member_code}',${x.id})">ใช้คะแนนเข้าร่วม</button></div>`).join("")}</div>
    </div>
    <div class="card history"><h2>ประวัติคะแนน</h2>${d.transactions.map(x=>`
      <div class="history-row"><span>${x.description||x.type}</span><b class="${x.points>0?'plus':'minus'}">${x.points>0?'+':''}${x.points}</b></div>`).join("")||"<p>ยังไม่มีรายการ</p>"}</div>`;
}

async function redeem(memberCode,rewardId){
  const r=await fetch("/api/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberCode,rewardId})});
  const d=await r.json(); alert(d.ok?d.message:d.error); if(d.ok)loadMember();
}
async function joinEvent(memberCode,eventId){
  const r=await fetch("/api/events/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberCode,eventId})});
  const d=await r.json(); alert(d.ok?`เข้าร่วมสำเร็จ 🎟️ ${d.ticket}`:d.error); if(d.ok)loadMember();
}
function saveAdmin(){adminKey=$("#adminKey").value;$("#adminArea").hidden=false;loadStats()}
async function loadStats(){
  const r=await fetch("/api/admin/stats",{headers:{"x-admin-key":adminKey}});
  if(!r.ok){$("#adminArea").hidden=true;alert("ADMIN_KEY ไม่ถูกต้อง");return}
  const d=await r.json();
  $("#stats").innerHTML=[
    ["สมาชิก",d.members],["คะแนนแจก",d.earned],["คะแนนใช้",d.used],["สิทธิ์ Event",d.eventEntries]
  ].map(x=>`<div class="stat"><span>${x[0]}</span><b>${x[1].toLocaleString()}</b></div>`).join("");
}
async function earnPoints(){
  const body={memberCode:$("#earnMember").value,amount:$("#earnAmount").value,description:$("#earnDesc").value||"ซื้อสินค้า"};
  const r=await fetch("/api/admin/earn",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":adminKey},body:JSON.stringify(body)});
  const d=await r.json();
  $("#adminResult").innerHTML=`<div class="notice ${r.ok?"":"error"}">${r.ok?`เพิ่ม ${d.points} คะแนนสำเร็จ 🎉`:d.error}</div>`;
  if(r.ok){loadStats();$("#earnAmount").value=""}
}
