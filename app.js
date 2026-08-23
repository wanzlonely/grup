window.__ROOM_PHOTO_URL__="https://images.unsplash.com/photo-1611892440504-42a792e24d32?q=80&w=1200";
(()=> {
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let role="hk";
let roomCode="101";
let pinCode="1234";
let peer=null;
let dataConns=new Map();
let mediaConns=new Map();
let guestAudioConns=[];
let localStream=null;
let guestMicStream=null;
let blurEnabled=false;
let watermarkTimers=[];
let toastTimer=null;
let needStreamTimer=null;
let blackFixTimer=null;
let heartbeatTimer=null;
let reconnectTimer=null;
let lastMediaErrorType="";
let currentFacing="environment";
let qrScanner=null;
let audioCtx=null;
const STORAGE_KEY="hotel-pro-v14-final";
const defaultPhoto=window.__ROOM_PHOTO_URL__;
const defaultState={step:1,progress:0,tasks:[false,false,false,false],photos:[],log:[],photoUrl:defaultPhoto};
let appState;
try{
const raw=localStorage.getItem(STORAGE_KEY);
appState=raw?JSON.parse(raw):structuredClone(defaultState);
if(!Array.isArray(appState.tasks)||appState.tasks.length!==4) appState.tasks=[false,false,false,false];
if(!Array.isArray(appState.photos)) appState.photos=[];
if(!Array.isArray(appState.log)) appState.log=[];
appState.photoUrl=defaultPhoto;
}catch{appState=structuredClone(defaultState);}
const PEER_CONFIG={
config:{
iceServers:[
{urls:"stun:stun.l.google.com:19302"},
{urls:"stun:stun1.l.google.com:19302"},
{urls:"stun:stun2.l.google.com:19302"},
{urls:"turn:openrelay.metered.ca:80",username:"openrelayproject",credential:"openrelayproject"},
{urls:"turn:openrelay.metered.ca:443",username:"openrelayproject",credential:"openrelayproject"},
{urls:"turn:openrelay.metered.ca:443?transport=tcp",username:"openrelayproject",credential:"openrelayproject"}
],
iceTransportPolicy:"all",
sdpSemantics:"unified-plan"
}
};
function saveLocal(){
try{localStorage.setItem(STORAGE_KEY,JSON.stringify(appState));}catch{}
const payload=JSON.stringify({type:"state",data:appState});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
}
function pushLog(msg){
const t=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
appState.log.unshift({t,msg:String(msg).slice(0,140)});
if(appState.log.length>40) appState.log.pop();
renderLog();
saveLocal();
}
function renderLog(){
const list=$("#logList");if(!list) return;
list.innerHTML="";
appState.log.forEach(l=>{
const d=document.createElement("div");d.className="li";
const time=document.createElement("span");time.textContent=l.t;
const text=document.createElement("span");text.textContent=l.msg;
d.append(time,text);list.appendChild(d);
});
}
function getHkId(){return `hotel-${roomCode}-${pinCode}-hk`.toLowerCase().replace(/[^a-z0-9-]/g,"");}
function getGuestId(){return `hotel-${roomCode}-${pinCode}-guest-${Math.random().toString(36).slice(2,6)}`.toLowerCase().replace(/[^a-z0-9-]/g,"");}
function setRole(r){
role=r;
document.body.className="role-"+r;
$$(".rb").forEach(b=>b.classList.toggle("active",b.dataset.role===r));
const label=$("#navRole");if(label) label.textContent=r==="hk"?"PETUGAS MODE • TRUE FULLSCREEN":"TAMU MODE • SCAN QR";
renderAll();updateViewers();
if(r==="guest"){startNeedStreamLoop();}else{stopNeedStreamLoop();}
if(peer){destroyPeer();}
}
function renderFlow(){
const steps=[
{title:"Tamu Datang",desc:"Check-in di resepsionis",tag:"Datang",icon:"🛬"},
{title:"Cek Status Kamar",desc:"Sistem cek otomatis",tag:"Cek",icon:"💻"},
{title:"Tampilkan Live Status",desc:"Tamu lihat progres di HP",tag:"Live",icon:"📱"},
{title:"Housekeeping Bersihkan",desc:"Petugas checklist + kamera on",tag:"Bersih",icon:"🧹"},
{title:"Progres 25% → 100%",desc:"Update tiap tahap + foto bukti",tag:"Progress",icon:"📊"},
{title:"Kamar Siap",desc:"Notifikasi + animasi",tag:"Siap",icon:"🔔"},
{title:"Tamu Masuk",desc:"Terima kunci & masuk",tag:"Masuk",icon:"🚪"}
];
const flow=$("#flow");if(!flow) return;
flow.innerHTML="";
steps.forEach((s,i)=>{
const active=appState.step>=i+1;
const done=appState.step>i+1;
const el=document.createElement("div");
el.className="fn"+(active?" active":"")+(done?" done":"");
el.innerHTML=`<div class="num">${done?"✓":i+1}</div><div class="fc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:9px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:#8A8885">${s.tag}</span><span>${s.icon}</span></div><h4>${s.title}</h4><p>${s.desc}</p></div>`;
flow.appendChild(el);
});
}
function renderProgress(){
const p=Math.max(0,Math.min(100,appState.progress|0));
const upd=(fg,pct,lab,est,bar)=>{
const c=$(fg);
if(c){
const circ=2*Math.PI*44;
c.style.strokeDasharray=String(circ);
c.style.strokeDashoffset=String(circ-(circ*p/100));
}
const pc=$(pct);if(pc) pc.textContent=p+"%";
const labels=["Belum Mulai","Mulai Dibersihkan","Kamar Mandi","Finishing","Siap Ditempati"];
let idx=0;if(p>=25) idx=1;if(p>=50) idx=2;if(p>=75) idx=3;if(p>=100) idx=4;
const lb=$(lab);if(lb) lb.textContent=labels[idx];
const et=$(est);if(et) et.textContent=p>=100?"Sudah siap!":p>0?`~ ${Math.max(1,Math.round((100-p)/15))} menit lagi`:"Menunggu petugas";
const b=$(bar);if(b) b.style.width=p+"%";
};
upd("#circleFg","#bigPercent","#bigLabel","#estText","#estBar");
upd("#circleFgG","#bigPercentG","#bigLabelG","#estTextG","#estBarG");
const hb=$("#heroBadge");if(hb){hb.textContent=p>=100?"Siap":p>0?"Dibersihkan":"Menunggu";hb.className="badge "+(p>=100?"ready":p>0?"clean":"wait");}
const hbG=$("#heroBadgeG");if(hbG){hbG.textContent=p>=100?"Siap":p>0?"Dibersihkan":"Menunggu";hbG.className="badge "+(p>=100?"ready":p>0?"clean":"wait");}
const hr=$("#hcRoom");if(hr) hr.textContent=`KAMAR ${roomCode}`;
const hrG=$("#hcRoomG");if(hrG) hrG.textContent=`KAMAR ${roomCode}`;
const ot=$("#overlayTag");if(ot) ot.textContent=`KAMAR ${roomCode} • LIVE`;
const otG=$("#overlayTagGuest");if(otG) otG.textContent=`LIVE KAMAR ${roomCode}`;
$("#roomPhoto").src=appState.photoUrl;
};
function renderChecklist(){
const tasks=["Ganti Linen & Rapikan Bed","Bersihkan Kamar Mandi","Vacuum & Amenities","Final Check & Foto Bukti"];
const cl=$("#checklist");const gl=$("#guestList");
if(cl) cl.innerHTML="";
if(gl) gl.innerHTML="";
tasks.forEach((t,i)=>{
const checked=!!appState.tasks[i];
if(cl){
const row=document.createElement("div");
row.className="it"+(checked?" checked":"");
row.innerHTML=`<button type="button" class="bx">${checked?"✓":""}</button><div class="tx"><strong>${t}</strong><span>${checked?"Selesai":"Tap jika sudah"}</span></div><span class="pr">${[25,50,75,100][i]}%</span>`;
row.addEventListener("click",()=>{
if(role!=="hk") return;
appState.tasks[i]=!appState.tasks[i];
const maxIdx=Math.max(...appState.tasks.map((v,idx)=>v?idx:-1));
appState.progress=maxIdx===-1?0:[25,50,75,100][maxIdx];
if(appState.tasks.every(Boolean)) appState.progress=100;
appState.step=appState.progress===0?2:appState.progress<100?4:6;
if(appState.progress===100){triggerCelebration();}else{pushLog(`Progres ${appState.progress}% — ${t}`);}
renderAll();saveLocal();
});
cl.appendChild(row);
}
if(gl){
const grow=document.createElement("div");
grow.className="it ro"+(checked?" checked":"");
grow.innerHTML=`<div class="bx">${checked?"✓":""}</div><div class="tx"><strong>${t}</strong><span>${checked?"Selesai":"Menunggu"}</span></div>`;
gl.appendChild(grow);
}
});
const prog=$("#clProgress");if(prog) prog.textContent=`${appState.tasks.filter(Boolean).length}/4`;
}
function openPhotoViewer(src){
const viewer=$("#photoViewer");const img=$("#pvImg");const dl=$("#pvDownload");
if(!viewer||!img) return;img.src=src;if(dl) dl.href=src;viewer.classList.add("show");
}
function closePhotoViewer(){const v=$("#photoViewer");if(v) v.classList.remove("show");}
function renderPhotos(){
const strip=$("#photoStrip");if(!strip) return;strip.innerHTML="";
appState.photos.forEach((src,i)=>{
const d=document.createElement("div");d.className="photo";
const img=document.createElement("img");img.src=src;img.loading="lazy";
img.addEventListener("click",e=>{e.stopPropagation();openPhotoViewer(src);});
const del=document.createElement("button");del.type="button";del.className="del";del.textContent="✕";
del.addEventListener("click",e=>{
e.stopPropagation();
if(role!=="hk"){alert("Hanya petugas bisa hapus");return;}
appState.photos.splice(i,1);renderPhotos();saveLocal();
});
d.append(img,del);strip.appendChild(d);
});
}
function renderCamera(){
const hasLocal=!!localStream&&localStream.getVideoTracks().some(t=>t.readyState==="live");
const gm=$("#guestVideoMain");
const hasRemote=!!(gm&&gm.srcObject&&gm.srcObject.getVideoTracks().some(t=>t.readyState==="live"));
const ph=$("#camPlaceholder");if(ph) ph.style.display=hasLocal?"none":"flex";
const phG=$("#camPlaceholderGuest");if(phG) phG.style.display=hasRemote?"none":"flex";
const cs=$("#camStatus");if(cs){
const live=role==="hk"&&hasLocal;
cs.innerHTML=live?'<span class="on-dot"></span> Live • Fullscreen Ready':'<span></span> Offline';
cs.className="st "+(live?"on":"");
}
const hkV=$("#hkVideo");
if(hkV){
hkV.style.display=role==="hk"&&hasLocal?"block":"none";
hkV.style.filter=blurEnabled?"blur(18px)":"none";
if(hasLocal&&!hkV.classList.contains("ready")) hkV.classList.add("ready");
if(!hasLocal) hkV.classList.remove("ready");
}
if(gm){
gm.style.display=hasRemote?"block":"none";
if(hasRemote&&!gm.classList.contains("ready")) gm.classList.add("ready");
if(!hasRemote) gm.classList.remove("ready");
}
}
function renderAll(){renderFlow();renderProgress();renderChecklist();renderPhotos();renderCamera();renderLog();}
function updateQr(){
const link=`${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}&pin=${encodeURIComponent(pinCode)}`;
const img=$("#qrImg");if(img) img.src=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
const lbl=$("#qrLabel");if(lbl) lbl.textContent=`QR ${roomCode}`;
}
function updateViewers(){
const count=[...dataConns.values()].filter(c=>c&&c.open).length;
const real=$("#viewerRealCount");if(real) real.textContent=`${count}`;
const wrap=$("#viewerWrap");if(wrap) wrap.style.display=count>0?"flex":"none";
const vc=$("#viewerCount");if(vc) vc.textContent=`${count} tamu`;
const vn=$("#viewerNames");if(vn) vn.textContent=count===0?"Belum ada penonton":`${count} perangkat • PIN OK`;
const av=$("#viewerAvatars");if(av){
av.innerHTML="";
for(let i=0;i<Math.min(count,5);i++){const d=document.createElement("div");d.className="av";d.textContent=String.fromCharCode(65+i);av.appendChild(d);}
if(count>5){const m=document.createElement("div");m.className="av";m.textContent=`+${count-5}`;av.appendChild(m);}
}
const live=$("#liveCount");if(live) live.textContent=count>0?`LIVE • ${count}`:"LIVE";
const celeV=$("#celeView");if(celeV) celeV.textContent=`${count}`;
}
function closeMediaConns(){mediaConns.forEach(mc=>{try{mc.close();}catch{}});mediaConns.clear();}
function closeGuestAudioConns(){guestAudioConns.forEach(mc=>{try{mc.close();}catch{}});guestAudioConns=[];}
function destroyPeer(){
stopNeedStreamLoop();stopWatermark();stopHeartbeat();
if(blackFixTimer) clearInterval(blackFixTimer);blackFixTimer=null;
if(reconnectTimer) clearTimeout(reconnectTimer);reconnectTimer=null;
closeMediaConns();closeGuestAudioConns();
dataConns.forEach(c=>{try{c.close();}catch{}});dataConns.clear();
if(localStream){try{localStream.getTracks().forEach(t=>t.stop());}catch{} localStream=null;}
if(guestMicStream){try{guestMicStream.getTracks().forEach(t=>t.stop());}catch{} guestMicStream=null;}
if(peer){try{peer.destroy();}catch{}} peer=null;
updateViewers();
const cs=$("#connStatus");if(cs) cs.textContent="Offline";
const csG=$("#connStatusG");if(csG) csG.textContent="Offline";
const ct=$("#connText");if(ct) ct.textContent="Offline";
const cb=$("#connBox");if(cb) cb.className="cs";
const cbG=$("#connBoxG");if(cbG) cbG.className="cs";
renderCamera();
}
function attachStreamToGuest(stream){
const gv=$("#guestVideoMain");if(!gv) return;
if(gv.srcObject&&gv.srcObject.id===stream.id){renderCamera();return;}
gv.srcObject=stream;gv.muted=false;gv.playsInline=true;gv.autoplay=true;
const p=gv.play();if(p) p.catch(()=>{setTimeout(()=>{gv.play().catch(()=>{});},500);});
gv.onloadedmetadata=()=>{gv.play().catch(()=>{});};
renderCamera();startWatermark();stopNeedStreamLoop();startBlackScreenFix();
pushLog("✅ Stream diterima");
const cb=$("#connBoxG");if(cb){cb.className="cs on";$("#connStatusG").textContent="LIVE • Fullscreen Ready";}
$("#connText").textContent=`LIVE ${roomCode}`;
}
function attachGuestAudioToHK(stream){
const a=$("#hkRemoteAudio");if(!a) return;
a.srcObject=stream;a.play().catch(()=>{setTimeout(()=>{a.play().catch(()=>{});},500);});
}
function callGuest(peerId){
if(!localStream||!peer) return null;
try{
const old=mediaConns.get(peerId);
if(old){try{old.close();}catch{} mediaConns.delete(peerId);}
const mc=peer.call(peerId,localStream);
if(!mc) return null;
mediaConns.set(peerId,mc);
mc.on("close",()=>{mediaConns.delete(peerId);});
mc.on("error",()=>{mediaConns.delete(peerId);});
return mc;
}catch{return null;}
}
function createPeer(id){
if(peer){try{peer.destroy();}catch{}}
peer=new Peer(id,PEER_CONFIG);
peer.on("open",pid=>{
pushLog(`Peer OK ${pid}`);
if(role==="hk"){
$("#connStatus").textContent="Live";$("#connText").textContent=`Sesi ${roomCode} aktif`;$("#connBox").className="cs on";
}else{
$("#connStatusG").textContent="Live";$("#connText").textContent=`Tamu ${roomCode}`;$("#connBoxG").className="cs on";
}
startHeartbeat();
});
peer.on("disconnected",()=>{
const cb=$("#connBox");if(cb) cb.className="cs err";
const cbG=$("#connBoxG");if(cbG) cbG.className="cs err";
try{peer.reconnect();}catch{}
clearTimeout(reconnectTimer);
reconnectTimer=setTimeout(()=>{if(peer&&peer.disconnected){try{peer.reconnect();}catch{}}},2000);
});
peer.on("close",()=>{stopHeartbeat();});
peer.on("error",err=>{
const cb=$("#connBox");if(cb) cb.className="cs err";
const cbG=$("#connBoxG");if(cbG) cbG.className="cs err";
if(err.type==="peer-unavailable"&&role==="guest"){
$("#connStatusG").textContent="Petugas offline — retry";
setTimeout(()=>{if(role==="guest") connectToHk();},3000);
}
});
peer.on("connection",conn=>{setupDataConn(conn);});
peer.on("call",call=>{
if(role==="hk"){
try{call.answer();}catch{}
call.on("stream",stream=>{
if(stream.getAudioTracks().length>0&&stream.getVideoTracks().length===0){attachGuestAudioToHK(stream);}
});
guestAudioConns.push(call);
}else{
try{call.answer();}catch{}
call.on("stream",stream=>{
if(stream.getVideoTracks().length>0){attachStreamToGuest(stream);}
});
}
});
return peer;
}
function setupDataConn(conn){
const pid=conn.peer;
dataConns.set(pid,conn);
updateViewers();
conn.on("open",()=>{
try{conn.send(JSON.stringify({type:"state",data:appState}));}catch{}
if(role==="hk"&&localStream){setTimeout(()=>callGuest(pid),700);}
});
conn.on("data",raw=>{
try{
const msg=typeof raw==="string"?JSON.parse(raw):raw;
if(!msg||!msg.type){
if(typeof raw==="string"&&raw.includes("need-stream")&&role==="hk"&&localStream) callGuest(pid);
return;
}
if(msg.type==="state"&&role==="guest"&&msg.data){
const keep=appState.photoUrl;
appState=msg.data;
appState.photoUrl=keep;
renderAll();
if(appState.progress>=100){triggerCelebration();}
}
if((msg.type==="need-stream"||msg.type==="need_stream")&&role==="hk"&&localStream){callGuest(pid);}
if(msg.type==="talking"){
if(msg.role==="guest"){
const ind=$("#guestTalkingIndicator");if(ind){if(msg.talking) ind.classList.add("show");else ind.classList.remove("show");}
}else{
const ind=$("#hkTalkingIndicator");if(ind){if(msg.talking) ind.classList.add("show");else ind.classList.remove("show");}
}
}
if(msg.type==="photo"&&msg.url&&role==="guest"){
if(!appState.photos.includes(msg.url)){
appState.photos.unshift(msg.url);
if(appState.photos.length>12) appState.photos.pop();
renderPhotos();
}
}
if(msg.type==="celebrate"&&role==="guest"){triggerCelebration();}
if(msg.type==="ping"){try{conn.send(JSON.stringify({type:"pong"}));}catch{}}
}catch{
if(typeof raw==="string"&&raw.includes("need-stream")&&role==="hk"&&localStream) callGuest(pid);
}
});
conn.on("close",()=>{dataConns.delete(pid);mediaConns.delete(pid);updateViewers();});
}
function sendNeedStream(){
const p=JSON.stringify({type:"need-stream"});
dataConns.forEach(c=>{try{if(c.open) c.send(p);}catch{}});
if(role==="guest"&&dataConns.size===0){connectToHk();}
}
function startNeedStreamLoop(){
stopNeedStreamLoop();
let tries=0;
needStreamTimer=setInterval(()=>{
const gv=$("#guestVideoMain");
const has=!!(gv&&gv.srcObject&&gv.srcObject.getVideoTracks().length>0);
if(has){stopNeedStreamLoop();return;}
tries++;if(tries>20){stopNeedStreamLoop();return;}
sendNeedStream();
},2000);
}
function stopNeedStreamLoop(){if(needStreamTimer) clearInterval(needStreamTimer);needStreamTimer=null;}
function startHeartbeat(){
stopHeartbeat();
heartbeatTimer=setInterval(()=>{
const p=JSON.stringify({type:"ping"});
dataConns.forEach(c=>{try{if(c.open) c.send(p);}catch{}});
if(peer&&peer.disconnected){try{peer.reconnect();}catch{}}
},5000);
}
function stopHeartbeat(){if(heartbeatTimer) clearInterval(heartbeatTimer);heartbeatTimer=null;}
function connectToHk(){
const hkId=getHkId();
if(!peer) createPeer(getGuestId());
const doConnect=()=>{
try{
const conn=peer.connect(hkId,{metadata:{pin:pinCode},reliable:true});
setupDataConn(conn);
}catch{setTimeout(doConnect,2500);}
};
if(peer&&peer.open) doConnect();
else{
const iv=setInterval(()=>{if(peer&&peer.open){clearInterval(iv);doConnect();}},300);
setTimeout(()=>clearInterval(iv),5000);
}
}
async function startCamera(facing=currentFacing){
if(role!=="hk") return;
currentFacing=facing;
try{
if(localStream){localStream.getTracks().forEach(t=>{try{t.stop();}catch{}});}
const list=[
{video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}},
{video:{facingMode:facing},audio:true},
{video:{width:{ideal:1280}},audio:true},
{video:true,audio:true}
];
let stream=null;
for(const cons of list){try{stream=await navigator.mediaDevices.getUserMedia(cons);if(stream) break;}catch{continue;}}
if(!stream) throw new Error("fail");
stream.getAudioTracks().forEach(t=>t.enabled=false);
localStream=stream;
const hkV=$("#hkVideo");
if(hkV){hkV.srcObject=stream;hkV.muted=true;hkV.playsInline=true;hkV.autoplay=true;await hkV.play().catch(()=>{});hkV.onloadedmetadata=()=>{hkV.play().catch(()=>{});};}
renderCamera();pushLog(`Kamera ${facing==="environment"?"belakang":"depan"} ON`);saveLocal();
startWatermark();startBlackScreenFix();
dataConns.forEach((_,pid)=>{callGuest(pid);});
const flip=$("#flipCamBtn");if(flip) flip.textContent=currentFacing==="environment"?"🔄 Depan":"🔄 Belakang";
}catch(e){handleMediaError(e,"kamera");}
}
async function flipCamera(){
if(role!=="hk") return;
const newFacing=currentFacing==="environment"?"user":"environment";
if(!localStream){return startCamera(newFacing);}
try{
const ns=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:newFacing},width:{ideal:1280}},audio:false});
const newTrack=ns.getVideoTracks()[0];
if(!newTrack) throw new Error("no track");
const oldTrack=localStream.getVideoTracks()[0];
mediaConns.forEach(mc=>{
try{
const sender=mc.peerConnection.getSenders().find(s=>s.track&&s.track.kind==="video");
if(sender) sender.replaceTrack(newTrack);
}catch{}
});
if(oldTrack){try{oldTrack.stop();}catch{} localStream.removeTrack(oldTrack);}
localStream.addTrack(newTrack);
$("#hkVideo").srcObject=localStream;
currentFacing=newFacing;
ns.getTracks().forEach(t=>{if(t!==newTrack) try{t.stop();}catch{}});
renderCamera();
}catch(e){startCamera(newFacing);}
}
async function startCameraFallback(){
try{
const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
if(localStream){try{localStream.getTracks().forEach(t=>t.stop());}catch{}}
stream.getAudioTracks().forEach(t=>t.enabled=false);
localStream=stream;
const v=$("#hkVideo");if(v){v.srcObject=stream;await v.play().catch(()=>{});}
renderCamera();saveLocal();startWatermark();startBlackScreenFix();
closeMediaConns();dataConns.forEach((_,pid)=>callGuest(pid));
}catch(e){handleMediaError(e,"fallback");}
}
function stopCamera(){
closeMediaConns();
if(blackFixTimer) clearInterval(blackFixTimer);blackFixTimer=null;
if(localStream){try{localStream.getTracks().forEach(t=>t.stop());}catch{} localStream=null;}
const v=$("#hkVideo");if(v){v.srcObject=null;v.classList.remove("ready");}
renderCamera();saveLocal();stopWatermark();
}
function snapPhoto(){
if(!localStream){alert("Nyalakan kamera");return;}
const v=$("#hkVideo");const c=$("#hiddenCanvas");
if(!v||!c||!v.videoWidth){alert("Kamera belum siap");return;}
c.width=v.videoWidth;c.height=v.videoHeight;
const ctx=c.getContext("2d");
if(blurEnabled) ctx.filter="blur(8px)";
ctx.drawImage(v,0,0,c.width,c.height);
ctx.fillStyle="rgba(0,0,0,0.6)";ctx.fillRect(0,c.height-32,c.width,32);
ctx.fillStyle="#fff";ctx.font="12px Geist, sans-serif";
ctx.fillText(`KAMAR ${roomCode} • ${new Date().toLocaleString("id-ID")} • P2P`,12,c.height-12);
const data=c.toDataURL("image/jpeg",0.78);
appState.photos.unshift(data);if(appState.photos.length>12) appState.photos.pop();
renderPhotos();saveLocal();
const payload=JSON.stringify({type:"photo",url:data});
dataConns.forEach(conn=>{try{if(conn.open) conn.send(payload);}catch{}});
if(!appState.tasks[3]){appState.tasks[3]=true;renderAll();}
}
function startWatermark(){
stopWatermark();
[document.getElementById("watermarkCanvas"),document.getElementById("watermarkCanvasGuest")].forEach(cv=>{
if(!cv) return;
const ctx=cv.getContext("2d");
function draw(){
if(!cv||!cv.parentElement) return;
const rect=cv.parentElement.getBoundingClientRect();
if(rect.width<10) return;
const dpr=window.devicePixelRatio||1;
cv.width=Math.round(rect.width*dpr);cv.height=Math.round(rect.height*dpr);
cv.style.width=rect.width+"px";cv.style.height=rect.height+"px";
ctx.setTransform(dpr,0,0,dpr,0,0);
ctx.clearRect(0,0,rect.width,rect.height);
ctx.fillStyle="rgba(255,255,255,0.82)";ctx.font="11px Geist, sans-serif";
ctx.fillText(`KAMAR ${roomCode} • ${new Date().toLocaleTimeString("id-ID")} • 🔒 P2P`,12,rect.height-12);
}
draw();const id=setInterval(draw,3000);watermarkTimers.push(id);
if(!cv._ro){const ro=new ResizeObserver(draw);ro.observe(cv.parentElement);cv._ro=ro;}
});
}
function stopWatermark(){
watermarkTimers.forEach(id=>clearInterval(id));watermarkTimers=[];
[document.getElementById("watermarkCanvas"),document.getElementById("watermarkCanvasGuest")].forEach(cv=>{
if(cv&&cv._ro){try{cv._ro.disconnect();}catch{} cv._ro=null;}
if(cv){const ctx=cv.getContext("2d");if(ctx) ctx.clearRect(0,0,cv.width,cv.height);}
});
}
function startBlackScreenFix(){
if(blackFixTimer) clearInterval(blackFixTimer);
blackFixTimer=setInterval(()=>{
const hkV=$("#hkVideo");const gv=$("#guestVideoMain");
if(role==="hk"&&hkV&&hkV.srcObject){if(hkV.videoWidth===0&&hkV.readyState<2) hkV.play().catch(()=>{});}
if(role==="guest"&&gv&&gv.srcObject){if(gv.videoWidth===0&&gv.readyState<2) gv.play().catch(()=>{});}
},2000);
}
function showPermModal(type){lastMediaErrorType=type;const m=$("#permModal");if(m) m.classList.add("show");}
function hidePermModal(){const m=$("#permModal");if(m) m.classList.remove("show");}
function handleMediaError(err,context){
const name=(err&&err.name)||"";
pushLog(`${context} ${name}`);
if(name==="NotAllowedError"||name==="PermissionDeniedError"||name==="SecurityError"){showPermModal(context);}
else if(name==="NotFoundError"){alert("Kamera tidak ditemukan");}
else if(name==="NotReadableError"){alert("Kamera dipakai aplikasi lain");}
else{alert(`Gagal ${context}: ${err.message||err}`);}
}
function createHkSession(){
roomCode=($("#roomInput").value.trim()||"101").toUpperCase();
pinCode=($("#pinInput").value.trim()||"1234");
if(pinCode.length<3){alert("PIN minimal 3");return;}
localStorage.setItem("roomCode",roomCode);localStorage.setItem("pinCode",pinCode);
updateQr();destroyPeer();
const hkId=getHkId();
createPeer(hkId);
pushLog(`Sesi ${roomCode}`);
}
function joinAsGuest(){
const inputR=$("#roomInputG")||$("#roomInput");
const inputP=$("#pinInputG")||$("#pinInput");
roomCode=(inputR.value.trim()||"101").toUpperCase();
pinCode=(inputP.value.trim()||"1234");
if(!pinCode){alert("PIN");return;}
localStorage.setItem("roomCode",roomCode);localStorage.setItem("pinCode",pinCode);
updateQr();destroyPeer();
createPeer(getGuestId());
const iv=setInterval(()=>{if(peer&&peer.open){clearInterval(iv);connectToHk();startNeedStreamLoop();}},300);
setTimeout(()=>clearInterval(iv),5000);
startNeedStreamLoop();
}
async function ensureGuestMic(){
if(guestMicStream) return guestMicStream;
try{
const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,latency:0}});
s.getAudioTracks().forEach(t=>t.enabled=false);
guestMicStream=s;return s;
}catch(e){handleMediaError(e,"mic");return null;}
}
async function hkStartTalk(){
if(role!=="hk") return;
let stream=localStream;
if(!stream){
try{
const audioOnly=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,latency:0}});
audioOnly.getAudioTracks().forEach(t=>t.enabled=true);
guestMicStream=audioOnly;
stream=audioOnly;
}catch(e){handleMediaError(e,"mic");return;}
}else{stream.getAudioTracks().forEach(t=>t.enabled=true);}
const btn=$("#hkTalkBtn");if(btn){btn.classList.add("talking");}
const payload=JSON.stringify({type:"talking",role,talking:true});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
dataConns.forEach((_,pid)=>{
try{
if(stream.getAudioTracks().length>0){
const mc=peer.call(pid,stream);
guestAudioConns.push(mc);
}
}catch{}
});
}
function hkStopTalk(){
if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled=false);
if(guestMicStream) guestMicStream.getAudioTracks().forEach(t=>t.enabled=false);
const btn=$("#hkTalkBtn");if(btn){btn.classList.remove("talking");}
const payload=JSON.stringify({type:"talking",role,talking:false});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
guestAudioConns.forEach(mc=>{try{mc.close();}catch{}});guestAudioConns=[];
}
async function guestStartTalk(){
if(role!=="guest") return;
const stream=await ensureGuestMic();if(!stream) return;
stream.getAudioTracks().forEach(t=>t.enabled=true);
const btn=$("#guestTalkBtn");if(btn){btn.classList.add("talking");}
const payload=JSON.stringify({type:"talking",role,talking:true});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
if(peer){
const hkId=getHkId();
try{const mc=peer.call(hkId,stream);if(mc) guestAudioConns.push(mc);}catch{}
}
}
function guestStopTalk(){
if(guestMicStream) guestMicStream.getAudioTracks().forEach(t=>t.enabled=false);
const btn=$("#guestTalkBtn");if(btn){btn.classList.remove("talking");}
const payload=JSON.stringify({type:"talking",role,talking:false});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
guestAudioConns.forEach(mc=>{try{mc.close();}catch{}});guestAudioConns=[];
}
function setupTalkButtons(){
const hkBtn=$("#hkTalkBtn");
if(hkBtn){
const s=e=>{e.preventDefault();hkStartTalk();};
const e=e=>{e.preventDefault();hkStopTalk();};
hkBtn.addEventListener("pointerdown",s);hkBtn.addEventListener("pointerup",e);
hkBtn.addEventListener("pointercancel",e);hkBtn.addEventListener("pointerleave",ev=>{if(ev.buttons===0) e(ev);});
hkBtn.addEventListener("touchstart",s,{passive:false});hkBtn.addEventListener("touchend",e,{passive:false});
}
const guestBtn=$("#guestTalkBtn");
if(guestBtn){
const s=e=>{e.preventDefault();guestStartTalk();};
const e=e=>{e.preventDefault();guestStopTalk();};
guestBtn.addEventListener("pointerdown",s);guestBtn.addEventListener("pointerup",e);
guestBtn.addEventListener("pointercancel",e);guestBtn.addEventListener("pointerleave",ev=>{if(ev.buttons===0) e(ev);});
guestBtn.addEventListener("touchstart",s,{passive:false});guestBtn.addEventListener("touchend",e,{passive:false});
}
}
function playSuccessSound(){
try{
if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
const now=audioCtx.currentTime;
[0,4,7,12].forEach((semi,i)=>{
const o=audioCtx.createOscillator();
const g=audioCtx.createGain();
o.type="sine";
o.frequency.value=440*Math.pow(2,semi/12);
o.connect(g);g.connect(audioCtx.destination);
g.gain.setValueAtTime(0,now+i*0.08);
g.gain.linearRampToValueAtTime(0.18,now+i*0.08+0.02);
g.gain.exponentialRampToValueAtTime(0.001,now+i*0.08+0.6);
o.start(now+i*0.08);o.stop(now+i*0.08+0.6);
});
}catch{}
}
function startConfetti(){
const canvas=$("#confetti");if(!canvas) return;
const ctx=canvas.getContext("2d");
const W=canvas.width=window.innerWidth;
const H=canvas.height=window.innerHeight;
const pieces=[];
for(let i=0;i<120;i++){
pieces.push({
x:Math.random()*W,
y:Math.random()*-H,
r:Math.random()*8+4,
c:`hsl(${Math.random()*60+80},100%,50%)`,
vx:Math.random()*4-2,
vy:Math.random()*3+2,
rot:Math.random()*360,
vr:Math.random()*6-3
});
}
let raf;
function draw(){
ctx.clearRect(0,0,W,H);
pieces.forEach(p=>{
p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;
p.vy+=0.08;
if(p.y>H) p.y=-10;
ctx.save();
ctx.translate(p.x,p.y);
ctx.rotate(p.rot*Math.PI/180);
ctx.fillStyle=p.c;
ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r);
ctx.restore();
});
raf=requestAnimationFrame(draw);
}
draw();
setTimeout(()=>{cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);},6000);
}
function triggerCelebration(){
if(appState.progress<100) return;
const cele=$("#celebration");
if(cele&&cele.classList.contains("show")) return;
const timeEl=$("#celeTime");if(timeEl) timeEl.textContent=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
const roomEl=$("#celeRoom");if(roomEl) roomEl.textContent=`KAMAR ${roomCode} telah selesai dibersihkan 100% — siap dihuni tamu`;
if(cele) cele.classList.add("show");
playSuccessSound();
startConfetti();
if(navigator.vibrate) navigator.vibrate([120,60,120,60,200]);
pushLog(`🎉 Kamar ${roomCode} SELESAI 100% — celebration!`);
$("#toast").classList.add("show");
clearTimeout(toastTimer);
toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),4000);
const payload=JSON.stringify({type:"celebrate"});
dataConns.forEach(c=>{try{if(c.open) c.send(payload);}catch{}});
if(role==="guest"&&"speechSynthesis" in window){
const u=new SpeechSynthesisUtterance(`Kamar ${roomCode} sudah siap, silakan masuk`);
u.lang="id-ID";speechSynthesis.speak(u);
}
}
function initQrScanner(){
const scanBtn=$("#scanQrBtn");
const modal=$("#qrScannerModal");
const closeBtn=$("#qrClose");
if(!scanBtn||!modal) return;
scanBtn.addEventListener("click",()=>{
modal.classList.add("show");
if(!qrScanner){qrScanner=new Html5Qrcode("qrReader");}
qrScanner.start({facingMode:"environment"},{fps:10,qrbox:250},(decoded)=>{
try{
let room=roomCode;let pin=pinCode;
if(decoded.includes("room=")){
const u=new URL(decoded);
room=(u.searchParams.get("room")||room).toUpperCase();
pin=u.searchParams.get("pin")||pin;
}else{
const parts=decoded.split(/[-|]/);
if(parts.length>=2){room=parts[0].toUpperCase();pin=parts[1];}
}
$("#roomInputG").value=room;$("#pinInputG").value=pin;
$("#roomInput").value=room;$("#pinInput").value=pin;
roomCode=room;pinCode=pin;
localStorage.setItem("roomCode",room);localStorage.setItem("pinCode",pin);
updateQr();
qrScanner.stop().then(()=>{modal.classList.remove("show");joinAsGuest();}).catch(()=>{modal.classList.remove("show");});
}catch{
qrScanner.stop().then(()=>{modal.classList.remove("show");}).catch(()=>{});
}
},()=>{}).catch(()=>{alert("Gagal buka scanner");modal.classList.remove("show");});
});
if(closeBtn){
closeBtn.addEventListener("click",()=>{
if(qrScanner){try{qrScanner.stop().then(()=>{modal.classList.remove("show");});}catch{modal.classList.remove("show");}}else modal.classList.remove("show");
});
}
modal.addEventListener("click",e=>{if(e.target.id==="qrScannerModal"){if(qrScanner){try{qrScanner.stop();}catch{}} modal.classList.remove("show");}});
}
function initFullscreen(){
const btnMain=$("#fsBtnMain");
const btnGuest=$("#fsBtnGuest");
const stageHk=$("#stageHk");
const stageGuest=$("#stageGuest");
function toggleFs(el){
if(!el) return;
if(!document.fullscreenElement){
if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});
else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}else{
if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
}
}
if(btnMain&&stageHk){btnMain.addEventListener("click",e=>{e.stopPropagation();toggleFs(stageHk);});}
if(btnGuest&&stageGuest){btnGuest.addEventListener("click",e=>{e.stopPropagation();toggleFs(stageGuest);});}
document.addEventListener("fullscreenchange",()=>{
const isFs=!!document.fullscreenElement;
document.body.classList.toggle("is-fullscreen",isFs);
});
}
function init(){
const savedRoom=localStorage.getItem("roomCode");if(savedRoom){roomCode=savedRoom;$("#roomInput").value=roomCode;const g=$("#roomInputG");if(g) g.value=roomCode;}
const savedPin=localStorage.getItem("pinCode");if(savedPin){pinCode=savedPin;$("#pinInput").value=pinCode;const gp=$("#pinInputG");if(gp) gp.value=pinCode;}
const params=new URLSearchParams(location.search);
if(params.get("room")){roomCode=params.get("room").toUpperCase();$("#roomInput").value=roomCode;const g=$("#roomInputG");if(g) g.value=roomCode;}
if(params.get("pin")){pinCode=params.get("pin");$("#pinInput").value=pinCode;const gp=$("#pinInputG");if(gp) gp.value=pinCode;}
updateQr();
if(!appState.log.length){appState.log=[{t:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),msg:"Sistem siap • True fullscreen • Celebration ready"}];saveLocal();}
$$(".rb").forEach(b=>b.addEventListener("click",()=>setRole(b.dataset.role)));
$("#createSession").addEventListener("click",createHkSession);
$("#joinSession").addEventListener("click",joinAsGuest);
$("#leaveSession").addEventListener("click",destroyPeer);
$("#startCamBtn").addEventListener("click",()=>startCamera(currentFacing));
$("#flipCamBtn").addEventListener("click",flipCamera);
$("#stopCamBtn").addEventListener("click",stopCamera);
$("#snapBtn").addEventListener("click",snapPhoto);
$("#blurBtn").addEventListener("click",()=>{
blurEnabled=!blurEnabled;
const v=$("#hkVideo");if(v) v.style.filter=blurEnabled?"blur(18px)":"none";
$("#blurBtn").textContent=blurEnabled?"Matikan Blur":"🫧 Blur";
});
$("#fixBlackBtn").addEventListener("click",()=>{pushLog("Fix hitam...");startCameraFallback();});
$("#fixBlackGuestBtn").addEventListener("click",()=>{pushLog("Request...");sendNeedStream();startNeedStreamLoop();});
const reqG=$("#reqBtnG");if(reqG) reqG.addEventListener("click",()=>{sendNeedStream();startNeedStreamLoop();});
$("#roomPhotoWrap").addEventListener("click",()=>{openPhotoViewer($("#roomPhoto").src);});
$("#completeBtn").addEventListener("click",()=>{
appState.tasks=[true,true,true,true];appState.progress=100;appState.step=7;
renderAll();saveLocal();
triggerCelebration();
});
$("#toastClose").addEventListener("click",()=>$("#toast").classList.remove("show"));
$("#permRetry").addEventListener("click",()=>{
hidePermModal();
if(lastMediaErrorType.includes("kamera")||lastMediaErrorType.includes("mic")){
if(lastMediaErrorType.includes("kamera")) startCamera(currentFacing);
else if(role==="guest") guestStartTalk();else hkStartTalk();
}else{startCamera(currentFacing);}
});
$("#permClose").addEventListener("click",hidePermModal);
$("#permModal").addEventListener("click",e=>{if(e.target.id==="permModal") hidePermModal();});
$("#pvClose").addEventListener("click",closePhotoViewer);
$("#pvBackdrop").addEventListener("click",closePhotoViewer);
$("#photoViewer").addEventListener("click",e=>{if(e.target.id==="photoViewer") closePhotoViewer();});
const celeClose=$("#celeClose");if(celeClose) celeClose.addEventListener("click",()=>{$("#celebration").classList.remove("show");});
const celeShare=$("#celeShare");if(celeShare) celeShare.addEventListener("click",()=>{
if(navigator.share){navigator.share({title:`Kamar ${roomCode} Siap`,text:`Kamar ${roomCode} sudah 100% siap dihuni!`,url:location.href}).catch(()=>{});}
else{alert(`Kamar ${roomCode} 100% siap!`);}
});
setInterval(()=>{const c=$("#clock");if(c) c.textContent=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});},1000);
setInterval(updateViewers,2000);
setupTalkButtons();
initQrScanner();
initFullscreen();
setRole("hk");
renderAll();updateViewers();
}
init();
})();
