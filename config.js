/* LIVE ROOM PRO - Fixed Core Logic (No Errors) */
window.__ROOM_PHOTO_URL__ = "https://images.unsplash.com/photo-1611892440504-42a792e24d32?q=80&w=1200";

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // === STATE ===
  let role = 'hk';
  let roomCode = '101';
  let pinCode = '1234';
  let peer = null;
  let dataConns = new Map(); // peerId -> DataConnection (FIX: pakai Map bukan array)
  let mediaConns = new Map(); // peerId -> MediaConnection video
  let guestAudioConns = [];
  let localStream = null;
  let guestMicStream = null;
  let blurEnabled = false;
  let watermarkTimers = [];
  let toastTimer = null;
  let needStreamTimer = null;
  let blackFixTimer = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let lastMediaErrorType = '';
  let currentFacing = 'environment';

  const STORAGE_KEY = 'hotel-pro-v12-fixed';
  const defaultPhoto = window.__ROOM_PHOTO_URL__;
  const defaultState = { step: 1, progress: 0, tasks: [false,false,false,false], photos: [], log: [], photoUrl: defaultPhoto };
  let appState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    appState = raw ? JSON.parse(raw) : structuredClone(defaultState);
    if (!Array.isArray(appState.tasks) || appState.tasks.length !== 4) appState.tasks = [false,false,false,false];
    if (!Array.isArray(appState.photos)) appState.photos = [];
    if (!Array.isArray(appState.log)) appState.log = [];
    appState.photoUrl = defaultPhoto;
  } catch { appState = structuredClone(defaultState); }

  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ],
      iceTransportPolicy: 'all',
      sdpSemantics: 'unified-plan'
    }
  };

  // === HELPERS ===
  function saveLocal(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch {}
    const payload = JSON.stringify({ type: 'state', data: appState });
    dataConns.forEach(c => { try { if(c.open) c.send(payload); } catch {} });
  }
  function pushLog(msg){
    const t = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    appState.log.unshift({ t, msg: String(msg).slice(0,140) });
    if(appState.log.length > 40) appState.log.pop();
    renderLog();
    saveLocal();
  }
  function renderLog(){
    const list = $('#logList'); if(!list) return;
    list.innerHTML = '';
    appState.log.forEach(l => {
      const d = document.createElement('div'); d.className='log-item';
      const time = document.createElement('span'); time.textContent=l.t;
      const text = document.createElement('span'); text.textContent=l.msg;
      d.append(time,text); list.appendChild(d);
    });
  }
  function getHkId(){ return `hotel-${roomCode}-${pinCode}-hk`.toLowerCase().replace(/[^a-z0-9-]/g,''); }
  function getGuestId(){ return `hotel-${roomCode}-${pinCode}-guest-${Math.random().toString(36).slice(2,6)}`.toLowerCase().replace(/[^a-z0-9-]/g,''); }

  function setRole(r){
    role = r;
    document.body.className = 'role-'+r;
    $$('.role-btn').forEach(b=>b.classList.toggle('active', b.dataset.role===r));
    renderAll(); updateViewers();
    if(r==='guest'){ startNeedStreamLoop(); }
    else { stopNeedStreamLoop(); }
    // jika ganti role saat sudah connect, destroy dan buat ulang
    if(peer){ destroyPeer(); }
  }

  // === UI RENDER ===
  function renderFlow(){
    const steps = [
      { title:'Tamu Datang', desc:'Check-in di resepsionis', tag:'Datang', icon:'🛬' },
      { title:'Cek Status Kamar', desc:'Sistem cek otomatis', tag:'Cek', icon:'💻' },
      { title:'Tampilkan Live Status', desc:'Tamu lihat progres di HP', tag:'Live', icon:'📱' },
      { title:'Housekeeping Bersihkan', desc:'Petugas checklist + kamera on', tag:'Bersih', icon:'🧹' },
      { title:'Progres 25% → 100%', desc:'Update tiap tahap + foto bukti', tag:'Progress', icon:'📊' },
      { title:'Kamar Siap', desc:'Notifikasi terkirim', tag:'Siap', icon:'🔔' },
      { title:'Tamu Masuk', desc:'Terima kunci & masuk', tag:'Masuk', icon:'🚪' }
    ];
    const flow = $('#flow'); if(!flow) return;
    flow.innerHTML = '<div class="flow-line"></div>';
    steps.forEach((s,i)=>{
      const active = appState.step >= i+1;
      const done = appState.step > i+1;
      const el = document.createElement('div');
      el.className = 'f-node'+(active?' active':'')+(done?' done':'');
      el.innerHTML = `<div class="f-num">${done?'✓':i+1}</div><div class="f-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:9px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:#8A8885">${s.tag}</span><span>${s.icon}</span></div><h4>${s.title}</h4><p>${s.desc}</p></div>`;
      flow.appendChild(el);
    });
  }
  function renderProgress(){
    const p = Math.max(0,Math.min(100, appState.progress|0));
    const circle = $('#circleFg');
    if(circle){
      const circ = 2*Math.PI*44;
      circle.style.strokeDasharray = String(circ);
      circle.style.strokeDashoffset = String(circ - (circ * p / 100));
    }
    $('#bigPercent').textContent = p+'%';
    const bar = $('#estBar'); if(bar) bar.style.width = p+'%';
    const labels = ['Belum Mulai','Mulai Dibersihkan','Kamar Mandi','Finishing','Siap Ditempati'];
    let idx=0; if(p>=25) idx=1; if(p>=50) idx=2; if(p>=75) idx=3; if(p>=100) idx=4;
    $('#bigLabel').textContent = labels[idx];
    const hb = $('#heroBadge');
    if(hb){ hb.textContent = p>=100 ? 'Siap' : p>0 ? 'Dibersihkan' : 'Menunggu'; hb.className='badge '+(p>=100?'ready':p>0?'clean':'wait'); }
    $('#estText').textContent = p>=100 ? 'Sudah siap!' : p>0 ? `~ ${Math.max(1,Math.round((100-p)/15))} menit lagi` : 'Menunggu petugas';
    $('#hcRoom').textContent = `KAMAR ${roomCode}`;
    $('#overlayTag').textContent = `KAMAR ${roomCode} • LIVE`;
    $('#roomPhoto').src = appState.photoUrl;
    $('#photoOverlayLabel').textContent = `Foto Asli Kamar ${roomCode} • Tap untuk zoom`;
  }
  function renderChecklist(){
    const tasks = ['Ganti Linen & Rapikan Bed','Bersihkan Kamar Mandi','Vacuum & Amenities','Final Check & Foto Bukti'];
    const cl = $('#checklist'); const gl = $('#guestList');
    if(!cl || !gl) return;
    cl.innerHTML=''; gl.innerHTML='';
    tasks.forEach((t,i)=>{
      const checked = !!appState.tasks[i];
      const row = document.createElement('div');
      row.className='c-item'+(checked?' checked':'');
      row.innerHTML = `<button type="button" class="c-box">${checked?'✓':''}</button><div class="c-text"><strong>${t}</strong><span>${checked?'Selesai':'Tap jika sudah'}</span></div><span class="c-perc">${[25,50,75,100][i]}%</span>`;
      row.addEventListener('click', ()=>{
        if(role!=='hk') return;
        appState.tasks[i]=!appState.tasks[i];
        const maxIdx = Math.max(...appState.tasks.map((v,idx)=> v?idx:-1));
        appState.progress = maxIdx===-1?0:[25,50,75,100][maxIdx];
        if(appState.tasks.every(Boolean)) appState.progress=100;
        appState.step = appState.progress===0?2:appState.progress<100?4:6;
        if(appState.progress===100){
          $('#toast').classList.add('show');
          clearTimeout(toastTimer);
          toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);
          pushLog(`Kamar ${roomCode} siap 100%`);
        } else { pushLog(`Progres ${appState.progress}% — ${t}`); }
        renderAll(); saveLocal();
      });
      cl.appendChild(row);
      const grow = document.createElement('div');
      grow.className='c-item readonly'+(checked?' checked':'');
      grow.innerHTML=`<div class="c-box">${checked?'✓':''}</div><div class="c-text"><strong>${t}</strong><span>${checked?'Selesai':'Menunggu'}</span></div>`;
      gl.appendChild(grow);
    });
    $('#clProgress').textContent = `${appState.tasks.filter(Boolean).length}/4`;
    $('#guestClProgress').textContent = appState.progress>=100?'Selesai':appState.progress>0?`${appState.progress}%`:'Menunggu';
  }
  function openPhotoViewer(src){
    const viewer=$('#photoViewer'); const img=$('#pvImg'); const dl=$('#pvDownload');
    if(!viewer||!img) return; img.src=src; if(dl) dl.href=src; viewer.classList.add('show');
  }
  function closePhotoViewer(){ const v=$('#photoViewer'); if(v) v.classList.remove('show'); }
  function renderPhotos(){
    const strip=$('#photoStrip'); if(!strip) return; strip.innerHTML='';
    appState.photos.forEach((src,i)=>{
      const d=document.createElement('div'); d.className='photo';
      const img=document.createElement('img'); img.src=src; img.loading='lazy';
      img.addEventListener('click', e=>{ e.stopPropagation(); openPhotoViewer(src); });
      const del=document.createElement('button'); del.type='button'; del.className='del'; del.textContent='✕';
      del.addEventListener('click', e=>{ e.stopPropagation(); appState.photos.splice(i,1); renderPhotos(); saveLocal(); });
      d.append(img,del); strip.appendChild(d);
    });
  }
  function renderCamera(){
    const hasLocal = !!localStream && localStream.getVideoTracks().some(t=> t.readyState==='live');
    const gm = $('#guestVideoMain');
    const hasRemote = !!(gm && gm.srcObject && gm.srcObject.getVideoTracks().some(t=> t.readyState==='live'));
    $('#camPlaceholder').style.display = hasLocal ? 'none' : 'flex';
    $('#camPlaceholderGuest').style.display = hasRemote ? 'none' : 'flex';
    const cs = $('#camStatus');
    if(cs){
      const live = (role==='hk' && hasLocal) || (role==='guest' && hasRemote);
      cs.innerHTML = live ? '<span class="on-dot"></span> Live • Sinkron' : '<span></span> Offline';
      cs.className = 'cam-status '+(live?'on':'');
    }
    const hkV=$('#hkVideo');
    if(hkV){
      hkV.style.display = role==='hk' && hasLocal ? 'block' : 'none';
      hkV.style.filter = blurEnabled ? 'blur(18px)' : 'none';
      if(hasLocal && !hkV.classList.contains('ready')) hkV.classList.add('ready');
      if(!hasLocal) hkV.classList.remove('ready');
    }
    if(gm){
      gm.style.display = hasRemote ? 'block' : 'none';
      if(hasRemote && !gm.classList.contains('ready')) gm.classList.add('ready');
      if(!hasRemote) gm.classList.remove('ready');
    }
  }
  function renderAll(){ renderFlow(); renderProgress(); renderChecklist(); renderPhotos(); renderCamera(); renderLog(); }
  function updateQr(){
    const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}&pin=${encodeURIComponent(pinCode)}`;
    $('#qrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
    const lbl=$('#qrLabel'); if(lbl) lbl.textContent=`QR Kamar ${roomCode}`;
  }
  function updateViewers(){
    const count = [...dataConns.values()].filter(c=> c && c.open).length;
    $('#viewerRealCount').textContent = `${count} penonton`;
    const vc=$('#viewerCount'); if(vc) vc.textContent=`${count} tamu menonton`;
    const vn=$('#viewerNames'); if(vn) vn.textContent = count===0 ? 'Belum ada penonton' : `${count} perangkat terhubung • PIN verified`;
    const pip=$('#pipCount'); if(pip) pip.textContent=String(count);
    const av=$('#viewerAvatars');
    if(av){
      av.innerHTML='';
      for(let i=0;i<Math.min(count,5);i++){ const d=document.createElement('div'); d.className='av'; d.textContent=String.fromCharCode(65+i); av.appendChild(d); }
      if(count>5){ const m=document.createElement('div'); m.className='av more'; m.textContent=`+${count-5}`; av.appendChild(m); }
    }
    const bar=$('#viewerBar'); if(bar) bar.style.display = role==='hk' ? 'flex' : 'none';
    const vReal=$('#viewerRealCountWrap'); if(vReal) vReal.style.display = count>0 ? 'flex' : 'none';
    // status pill
    const connBox=$('#connBox');
    if(role==='hk' && count>0 && connBox){ connBox.className='conn-status on'; $('#connStatus').textContent=`Live ${count} tamu`; }
  }

  function closeMediaConns(){ mediaConns.forEach(mc=>{ try{ mc.close(); }catch{} }); mediaConns.clear(); }
  function closeGuestAudioConns(){ guestAudioConns.forEach(mc=>{ try{ mc.close(); }catch{} }); guestAudioConns=[]; }

  function destroyPeer(){
    stopNeedStreamLoop(); stopWatermark(); stopHeartbeat();
    if(blackFixTimer) clearInterval(blackFixTimer); blackFixTimer=null;
    if(reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer=null;
    closeMediaConns(); closeGuestAudioConns();
    dataConns.forEach(c=>{ try{ c.close(); }catch{} }); dataConns.clear();
    if(localStream){ try{ localStream.getTracks().forEach(t=>t.stop()); }catch{} localStream=null; }
    if(guestMicStream){ try{ guestMicStream.getTracks().forEach(t=>t.stop()); }catch{} guestMicStream=null; }
    if(peer){ try{ peer.destroy(); }catch{} } peer=null;
    updateViewers();
    const cs=$('#connStatus'); if(cs) cs.textContent='Offline';
    const ct=$('#connText'); if(ct) ct.textContent='Belum terhubung';
    const cb=$('#connBox'); if(cb) cb.className='conn-status';
    renderCamera();
  }

  function attachStreamToGuest(stream){
    const gv=$('#guestVideoMain'); if(!gv) return;
    // FIX: hindari re-attach stream yang sama
    if(gv.srcObject && gv.srcObject.id===stream.id){ renderCamera(); return; }
    gv.srcObject=stream; gv.muted=false; gv.playsInline=true; gv.autoplay=true;
    const p=gv.play(); if(p) p.catch(()=>{ setTimeout(()=>{ gv.play().catch(()=>{}); },500); });
    gv.onloadedmetadata = ()=>{ gv.play().catch(()=>{}); };
    renderCamera(); startWatermark(); stopNeedStreamLoop(); startBlackScreenFix();
    pushLog('✅ Stream petugas diterima — sinkron');
    const connBox=$('#connBox'); if(connBox){ connBox.className='conn-status on'; $('#connStatus').textContent='Terhubung • LIVE'; $('#connText').textContent=`LIVE kamar ${roomCode} • Sinkron`; }
  }
  function attachGuestAudioToHK(stream){
    const a=$('#hkRemoteAudio'); if(!a) return;
    a.srcObject=stream; a.play().catch(()=>{ setTimeout(()=>{ a.play().catch(()=>{}); },500); });
  }

  function callGuest(peerId){
    if(!localStream || !peer) return null;
    try{
      // FIX: tutup call lama ke peer yang sama
      const old = mediaConns.get(peerId);
      if(old){ try{ old.close(); }catch{} mediaConns.delete(peerId); }
      const mc = peer.call(peerId, localStream);
      if(!mc) return null;
      mediaConns.set(peerId, mc);
      mc.on('close', ()=>{ mediaConns.delete(peerId); });
      mc.on('error', err=>{ pushLog(`Media error ke ${peerId.slice(0,5)}: ${err.message||err.type}`); mediaConns.delete(peerId); });
      pushLog(`📞 Mengirim video ke ${peerId.slice(0,5)}`);
      return mc;
    }catch(e){ pushLog(`Gagal call ${peerId.slice(0,5)}: ${e.message}`); return null; }
  }

  // === PEER FIX ===
  function createPeer(id){
    if(peer){ try{ peer.destroy(); }catch{} }
    peer = new Peer(id, PEER_CONFIG);

    peer.on('open', pid=>{
      pushLog(`Peer ID OK: ${pid}`);
      if(role==='hk'){
        $('#connStatus').textContent='Live'; $('#connText').textContent=`Sesi aktif • Kamar ${roomCode} • PIN OK`; $('#connBox').className='conn-status on';
      } else {
        $('#connStatus').textContent='Menghubungkan...'; $('#connText').textContent=`Terhubung sebagai tamu ${roomCode}`;
      }
      startHeartbeat();
    });

    peer.on('disconnected', ()=>{
      pushLog('Peer disconnected — reconnect...');
      $('#connBox').className='conn-status err'; $('#connStatus').textContent='Reconnecting...';
      try{ peer.reconnect(); }catch{}
      clearTimeout(reconnectTimer);
      reconnectTimer=setTimeout(()=>{ if(peer && peer.disconnected){ try{ peer.reconnect(); }catch{} } }, 2000);
    });

    peer.on('close', ()=>{
      pushLog('Peer close'); $('#connBox').className='conn-status'; $('#connStatus').textContent='Offline';
      stopHeartbeat();
    });

    peer.on('error', err=>{
      pushLog(`Peer error: ${err.type}`);
      const cb=$('#connBox');
      if(cb) cb.className='conn-status err';
      if(err.type==='peer-unavailable' && role==='guest'){
        $('#connText').textContent='Petugas belum online — retry 3s';
        setTimeout(()=>{ if(role==='guest') connectToHk(); }, 3000);
      } else if(err.type==='network' || err.type==='server-error'){
        $('#connStatus').textContent='Jaringan bermasalah';
        setTimeout(()=>{ try{ peer.reconnect(); }catch{} },1500);
      }
    });

    // data
    peer.on('connection', conn=>{
      setupDataConn(conn);
    });

    // media call
    peer.on('call', call=>{
      if(role==='hk'){
        // HK terima audio tamu
        try{ call.answer(); }catch{}
        call.on('stream', stream=>{
          if(stream.getAudioTracks().length>0 && stream.getVideoTracks().length===0){
            attachGuestAudioToHK(stream);
          }
        });
        guestAudioConns.push(call);
      } else {
        // Tamu terima video HK
        try{ call.answer(); }catch{}
        call.on('stream', stream=>{
          if(stream.getVideoTracks().length>0){
            attachStreamToGuest(stream);
          } else if(stream.getAudioTracks().length>0){
            // audio dari petugas (jika petugas bicara tanpa video? tidak dipakai tapi handle)
            const a=$('#guestRemoteAudio');
            if(a){ a.srcObject=stream; a.play().catch(()=>{}); }
          }
        });
      }
    });

    return peer;
  }

  function setupDataConn(conn){
    const pid = conn.peer;
    // simpan
    dataConns.set(pid, conn);
    updateViewers();
    pushLog(`Data terkoneksi: ${pid.slice(0,6)}`);

    conn.on('open', ()=>{
      if(role==='hk'){
        // validasi PIN dari metadata
        const incomingPin = conn.metadata && conn.metadata.pin ? String(conn.metadata.pin) : '';
        // metadata bisa kosong karena peerjs versi beda, fallback cek dari pesan join
        try{ conn.send(JSON.stringify({ type:'state', data: appState })); }catch{}
        if(localStream){ setTimeout(()=> callGuest(pid), 700); }
        updateViewers();
      } else {
        // tamu
        try{ conn.send(JSON.stringify({ type:'join', pin: pinCode })); }catch{}
        sendNeedStream();
        startNeedStreamLoop();
      }
    });

    conn.on('data', raw=>{
      try{
        const msg = typeof raw==='string' ? JSON.parse(raw) : raw;
        if(!msg || !msg.type) return;
        switch(msg.type){
          case 'state':
            if(role==='guest' && msg.data){
              // sync tapi jangan timpa foto url default
              const savedPhoto = appState.photoUrl;
              appState = msg.data;
              appState.photoUrl = savedPhoto;
              renderAll();
            }
            break;
          case 'need-stream':
          case 'need-stream':
          case 'need-stream':
            break;
          case 'need-stream':
          case 'need-stream':
            break;
          case 'need-stream':
            if(role==='hk' && localStream) callGuest(pid);
            break;
          case 'need-stream':
            break;
          case 'error':
            alert(msg.msg); try{ conn.close(); }catch{} break;
          case 'talking':
            if(msg.role==='guest'){
              const ind=$('#guestTalkingIndicator'); if(ind){ if(msg.talking) ind.classList.add('show'); else ind.classList.remove('show'); }
            } else {
              const ind=$('#hkTalkingIndicator'); if(ind){ if(msg.talking) ind.classList.add('show'); else ind.classList.remove('show'); }
            }
            break;
          case 'photo':
            if(msg.url && role==='guest'){
              // foto bukti dari petugas
              if(!appState.photos.includes(msg.url)){
                appState.photos.unshift(msg.url);
                if(appState.photos.length>12) appState.photos.pop();
                renderPhotos();
              }
              pushLog('📸 Foto bukti diterima');
            }
            break;
          case 'log':
            if(msg.text) pushLog(msg.text);
            break;
          case 'ping':
            try{ conn.send(JSON.stringify({type:'pong'})); }catch{} break;
          case 'pong':
            break;
        }
        // handle need-stream yang typo di versi lama
        if(msg.type==='need-stream' || msg.type==='need_stream' || msg.type==='need-stream'){
          if(role==='hk' && localStream) callGuest(pid);
        }
        if(msg.type==='need-stream' || msg.type==='need_stream'){
          // compat
        }
        // compat untuk kode lama yang kirim 'need-stream' dengan dash
        if(typeof raw==='string' && raw.includes('need-stream') && role==='hk' && localStream){
          callGuest(pid);
        }
      }catch(e){
        // raw bisa string 'need-stream'
        if(typeof raw==='string' && raw.includes('need-stream') && role==='hk' && localStream){
          callGuest(pid);
        }
      }
    });

    conn.on('close', ()=>{
      dataConns.delete(pid);
      mediaConns.delete(pid);
      updateViewers();
      pushLog(`Tamu ${pid.slice(0,5)} terputus`);
      if(role==='hk' && dataConns.size===0){
        $('#connBox').className='conn-status'; $('#connStatus').textContent='Menunggu tamu';
      }
    });
    conn.on('error', ()=>{ dataConns.delete(pid); updateViewers(); });
  }

  // === STREAM REQUEST FIX ===
  function sendNeedStream(){
    const payload = JSON.stringify({ type:'need-stream' });
    dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
    // untuk tamu yang belum punya dataConn, coba connect ulang
    if(role==='guest' && dataConns.size===0){
      connectToHk();
    }
  }
  function startNeedStreamLoop(){
    stopNeedStreamLoop();
    let tries=0;
    needStreamTimer=setInterval(()=>{
      const gv=$('#guestVideoMain');
      const hasStream = !!(gv && gv.srcObject && gv.srcObject.getVideoTracks().length>0);
      if(hasStream){ stopNeedStreamLoop(); return; }
      tries++;
      if(tries>20){ pushLog('Gagal dapat stream — coba join ulang'); stopNeedStreamLoop(); return; }
      sendNeedStream();
    }, 2000);
  }
  function stopNeedStreamLoop(){ if(needStreamTimer) clearInterval(needStreamTimer); needStreamTimer=null; }

  function startHeartbeat(){
    stopHeartbeat();
    heartbeatTimer=setInterval(()=>{
      const payload = JSON.stringify({type:'ping'});
      dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
      if(peer && peer.disconnected){ try{ peer.reconnect(); }catch{} }
    }, 5000);
  }
  function stopHeartbeat(){ if(heartbeatTimer) clearInterval(heartbeatTimer); heartbeatTimer=null; }

  function connectToHk(){
    const hkId=getHkId();
    if(!peer){ createPeer(getGuestId()); }
    // tunggu peer open
    const doConnect = ()=>{
      pushLog(`Menghubungkan ke ${hkId}`);
      $('#connStatus').textContent='Menghubungkan...'; $('#connText').textContent=`Menghubungkan ke ${hkId}`; $('#connBox').className='conn-status';
      try{
        const conn = peer.connect(hkId, { metadata:{pin:pinCode}, reliable:true });
        setupDataConn(conn);
      }catch(e){
        pushLog(`Connect error: ${e.message}`);
        setTimeout(doConnect,2500);
      }
    };
    if(peer && peer.open){ doConnect(); }
    else {
      const iv=setInterval(()=>{ if(peer && peer.open){ clearInterval(iv); doConnect(); } },300);
      setTimeout(()=>clearInterval(iv),5000);
    }
  }

  // === CAMERA FIX ===
  async function startCamera(facing=currentFacing){
    if(role!=='hk') return;
    currentFacing=facing;
    try{
      // hentikan track lama dulu
      if(localStream){ localStream.getTracks().forEach(t=>{ try{ t.stop(); }catch{} }); }
      // coba constraint berlapis agar tidak black screen
      const constraintsList = [
        { video:{ facingMode:{ideal:facing}, width:{ideal:1280,height:720}, frameRate:{ideal:24} }, audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1} },
        { video:{ facingMode:facing }, audio:true },
        { video:{ width:{ideal:1280} }, audio:true },
        { video:true, audio:true }
      ];
      let stream=null;
      for(const cons of constraintsList){
        try{ stream = await navigator.mediaDevices.getUserMedia(cons); if(stream) break; }catch(e){ continue; }
      }
      if(!stream) throw new Error('getUserMedia gagal total');
      stream.getAudioTracks().forEach(t=> t.enabled=false);
      localStream=stream;
      const hkV=$('#hkVideo');
      if(hkV){
        hkV.srcObject=stream; hkV.muted=true; hkV.playsInline=true; hkV.autoplay=true;
        await hkV.play().catch(()=>{});
        hkV.onloadedmetadata = ()=>{ hkV.play().catch(()=>{}); };
      }
      renderCamera(); pushLog(`Kamera ${facing==='environment'?'belakang':'depan'} aktif — mic mute`); saveLocal();
      startWatermark(); startBlackScreenFix();
      // kirim ke semua tamu
      dataConns.forEach((_, pid)=>{ callGuest(pid); });
      const flipBtn=$('#flipCamBtn'); if(flipBtn) flipBtn.innerHTML = currentFacing==='environment' ? '🔄 Depan' : '🔄 Belakang';
    }catch(e){ handleMediaError(e,'kamera & mic'); }
  }

  async function flipCamera(){
    if(role!=='hk') return;
    const newFacing = currentFacing==='environment' ? 'user' : 'environment';
    pushLog(`Flip ke ${newFacing}...`);
    if(!localStream){ return startCamera(newFacing); }
    try{
      const newStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:newFacing}, width:{ideal:1280} }, audio:false });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if(!newVideoTrack) throw new Error('track tidak ada');
      const oldVideoTrack = localStream.getVideoTracks()[0];

      // FIX UTAMA: replaceTrack agar sinkron tanpa disconnect!
      mediaConns.forEach(mc=>{
        try{
          const sender = mc.peerConnection.getSenders().find(s=> s.track && s.track.kind==='video');
          if(sender) sender.replaceTrack(newVideoTrack);
        }catch(err){ pushLog(`replaceTrack fail: ${err.message}`); }
      });

      if(oldVideoTrack){ try{ oldVideoTrack.stop(); }catch{} localStream.removeTrack(oldVideoTrack); }
      localStream.addTrack(newVideoTrack);
      $('#hkVideo').srcObject=localStream;
      currentFacing=newFacing;
      newStream.getTracks().forEach(t=>{ if(t!==newVideoTrack) try{ t.stop(); }catch{} });
      pushLog(`✅ Flip sukses ${newFacing} — sinkron ke ${mediaConns.size} tamu`);
      renderCamera();
      const flipBtn=$('#flipCamBtn'); if(flipBtn) flipBtn.innerHTML = currentFacing==='environment' ? '🔄 Depan' : '🔄 Belakang';
    }catch(e){
      pushLog(`Flip gagal fallback restart: ${e.message}`);
      startCamera(newFacing);
    }
  }

  async function startCameraFallback(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      if(localStream){ try{ localStream.getTracks().forEach(t=>t.stop()); }catch{} }
      stream.getAudioTracks().forEach(t=> t.enabled=false);
      localStream=stream;
      const v=$('#hkVideo'); if(v){ v.srcObject=stream; await v.play().catch(()=>{}); }
      renderCamera(); pushLog('Kamera fallback aktif'); saveLocal(); startWatermark(); startBlackScreenFix();
      closeMediaConns(); dataConns.forEach((_, pid)=> callGuest(pid));
    }catch(e){ handleMediaError(e,'kamera fallback'); }
  }

  function stopCamera(){
    closeMediaConns();
    if(blackFixTimer) clearInterval(blackFixTimer); blackFixTimer=null;
    if(localStream){ try{ localStream.getTracks().forEach(t=>t.stop()); }catch{} localStream=null; }
    const v=$('#hkVideo'); if(v){ v.srcObject=null; v.classList.remove('ready'); }
    renderCamera(); pushLog('Kamera dimatikan'); saveLocal(); stopWatermark();
  }

  function snapPhoto(){
    if(!localStream){ alert('Nyalakan kamera dulu'); return; }
    const v=$('#hkVideo'); const c=$('#hiddenCanvas');
    if(!v||!c||!v.videoWidth){ alert('Kamera belum siap'); return; }
    c.width=v.videoWidth; c.height=v.videoHeight;
    const ctx=c.getContext('2d');
    if(blurEnabled) ctx.filter='blur(8px)';
    ctx.drawImage(v,0,0,c.width,c.height);
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,c.height-32,c.width,32);
    ctx.fillStyle='#fff'; ctx.font='12px Geist, sans-serif';
    ctx.fillText(`KAMAR ${roomCode} • ${new Date().toLocaleString('id-ID')} • P2P SECURE`,12,c.height-12);
    const data=c.toDataURL('image/jpeg',0.78);
    appState.photos.unshift(data); if(appState.photos.length>12) appState.photos.pop();
    renderPhotos(); saveLocal(); pushLog('📸 Foto bukti diambil');
    // FIX: kirim ke tamu
    const payload = JSON.stringify({ type:'photo', url: data });
    dataConns.forEach(conn=>{ try{ if(conn.open) conn.send(payload); }catch{} });
    // tandai checklist
    if(!appState.tasks[3]){ appState.tasks[3]=true; renderAll(); }
  }

  // Watermark & black fix
  function startWatermark(){
    stopWatermark();
    [document.getElementById('watermarkCanvas'), document.getElementById('watermarkCanvasGuest')].forEach(cv=>{
      if(!cv) return;
      const ctx=cv.getContext('2d');
      function draw(){
        if(!cv || !cv.parentElement) return;
        const rect=cv.parentElement.getBoundingClientRect();
        if(rect.width<10) return;
        const dpr=window.devicePixelRatio||1;
        cv.width=Math.round(rect.width*dpr); cv.height=Math.round(rect.height*dpr);
        cv.style.width=rect.width+'px'; cv.style.height=rect.height+'px';
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,rect.width,rect.height);
        ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.font='11px Geist, sans-serif';
        ctx.fillText(`KAMAR ${roomCode} • ${new Date().toLocaleTimeString('id-ID')} • 🔒 P2P Encrypted • PIN OK`,12,rect.height-12);
      }
      draw(); const id=setInterval(draw,3000); watermarkTimers.push(id);
      if(!cv._ro){ const ro=new ResizeObserver(draw); ro.observe(cv.parentElement); cv._ro=ro; }
    });
  }
  function stopWatermark(){
    watermarkTimers.forEach(id=>clearInterval(id)); watermarkTimers=[];
    [document.getElementById('watermarkCanvas'), document.getElementById('watermarkCanvasGuest')].forEach(cv=>{
      if(cv && cv._ro){ try{ cv._ro.disconnect(); }catch{} cv._ro=null; }
      if(cv){ const ctx=cv.getContext('2d'); if(ctx) ctx.clearRect(0,0,cv.width,cv.height); }
    });
  }
  function startBlackScreenFix(){
    if(blackFixTimer) clearInterval(blackFixTimer);
    blackFixTimer=setInterval(()=>{
      const hkV=$('#hkVideo'); const gv=$('#guestVideoMain');
      if(role==='hk' && hkV && hkV.srcObject){ if(hkV.videoWidth===0 && hkV.readyState<2) hkV.play().catch(()=>{}); }
      if(role==='guest' && gv && gv.srcObject){ if(gv.videoWidth===0 && gv.readyState<2) gv.play().catch(()=>{}); }
    },2000);
  }

  // Permission modal
  function showPermModal(type){ lastMediaErrorType=type; const m=$('#permModal'); if(m) m.classList.add('show'); }
  function hidePermModal(){ const m=$('#permModal'); if(m) m.classList.remove('show'); }
  function handleMediaError(err, context){
    const name=(err&&err.name)||'';
    pushLog(`❌ ${context} error: ${name} ${err.message||''}`);
    if(name==='NotAllowedError' || name==='PermissionDeniedError' || name==='SecurityError'){ showPermModal(context); }
    else if(name==='NotFoundError'){ alert(`Kamera tidak ditemukan — ${context}`); }
    else if(name==='NotReadableError'){ alert(`Kamera dipakai aplikasi lain — tutup aplikasi lain lalu coba lagi`); }
    else { alert(`Gagal ${context}: ${err.message||err}`); }
  }

  // === SESSION FIX ===
  function createHkSession(){
    roomCode=($('#roomInput').value.trim() || '101').toUpperCase();
    pinCode=($('#pinInput').value.trim() || '1234');
    if(pinCode.length<3){ alert('PIN minimal 3 digit'); return; }
    localStorage.setItem('roomCode',roomCode); localStorage.setItem('pinCode',pinCode);
    updateQr(); destroyPeer();
    const hkId=getHkId();
    createPeer(hkId);
    pushLog(`Sesi petugas dibuat: ${roomCode}`);
  }

  function joinAsGuest(){
    roomCode=($('#roomInput').value.trim() || '101').toUpperCase();
    pinCode=($('#pinInput').value.trim() || '1234');
    if(!pinCode){ alert('Masukkan PIN'); return; }
    localStorage.setItem('roomCode',roomCode); localStorage.setItem('pinCode',pinCode);
    updateQr(); destroyPeer();
    // buat peer guest baru
    createPeer(getGuestId());
    // connect setelah open
    const iv=setInterval(()=>{
      if(peer && peer.open){ clearInterval(iv); connectToHk(); startNeedStreamLoop(); }
    },300);
    setTimeout(()=>clearInterval(iv),5000);
    startNeedStreamLoop();
  }

  // === MIC FIX ===
  async function ensureGuestMic(){
    if(guestMicStream) return guestMicStream;
    try{
      const s=await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1, latency:0 } });
      s.getAudioTracks().forEach(t=> t.enabled=false);
      guestMicStream=s; return s;
    }catch(e){ handleMediaError(e,'mikrofon'); return null; }
  }
  async function hkStartTalk(){
    if(role!=='hk') return;
    let stream = localStream;
    if(!stream){
      try{
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, latency:0 } });
        audioOnly.getAudioTracks().forEach(t=> t.enabled=true);
        guestMicStream = audioOnly;
        stream = audioOnly;
      }catch(e){ handleMediaError(e,'mikrofon'); return; }
    } else {
      stream.getAudioTracks().forEach(t=> t.enabled=true);
    }
    const btn=$('#hkTalkBtn'); if(btn){ btn.classList.add('talking'); btn.innerHTML='<span>🔴</span><span><b>🔴 Bicara...</b><small>Lepas untuk mute</small></span>'; }
    const payload=JSON.stringify({ type:'talking', role, talking:true });
    dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
    pushLog('🎙️ HK bicara');
    // FIX: call dengan audio track baru (bukan close semua media)
    dataConns.forEach((_, pid)=>{
      try{
        if(stream.getAudioTracks().length>0){
          const mc = peer.call(pid, stream);
          guestAudioConns.push(mc);
        }
      }catch{}
    });
  }
  function hkStopTalk(){
    if(localStream) localStream.getAudioTracks().forEach(t=> t.enabled=false);
    if(guestMicStream) guestMicStream.getAudioTracks().forEach(t=> t.enabled=false);
    const btn=$('#hkTalkBtn'); if(btn){ btn.classList.remove('talking'); btn.innerHTML='<span>🎙️</span><span><b>Tahan untuk Bicara</b><small>Anti delay • Lepas untuk mute</small></span>'; }
    const payload=JSON.stringify({ type:'talking', role, talking:false });
    dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
    // tutup call audio saja
    guestAudioConns.forEach(mc=>{ try{ mc.close(); }catch{} }); guestAudioConns=[];
  }
  async function guestStartTalk(){
    if(role!=='guest') return;
    const stream=await ensureGuestMic(); if(!stream) return;
    stream.getAudioTracks().forEach(t=> t.enabled=true);
    const btn=$('#guestTalkBtn'); if(btn){ btn.classList.add('talking'); btn.innerHTML='<span>🔴</span><span><b>🔴 Mengirim...</b><small>Lepas untuk mute</small></span>'; }
    const payload=JSON.stringify({ type:'talking', role, talking:true });
    dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
    pushLog('🎙️ Tamu bicara');
    if(peer){
      const hkId=getHkId();
      try{ const mc=peer.call(hkId, stream); if(mc) guestAudioConns.push(mc); }catch{}
    }
  }
  function guestStopTalk(){
    if(guestMicStream) guestMicStream.getAudioTracks().forEach(t=> t.enabled=false);
    const btn=$('#guestTalkBtn'); if(btn){ btn.classList.remove('talking'); btn.innerHTML='<span>🎙️</span><span><b>Tahan Bicara ke Petugas</b><small>Push-to-talk anti-feedback</small></span>'; }
    const payload=JSON.stringify({ type:'talking', role, talking:false });
    dataConns.forEach(c=>{ try{ if(c.open) c.send(payload); }catch{} });
    guestAudioConns.forEach(mc=>{ try{ mc.close(); }catch{} }); guestAudioConns=[];
  }
  function setupTalkButtons(){
    const hkBtn=$('#hkTalkBtn');
    if(hkBtn){
      const start=e=>{ e.preventDefault(); hkStartTalk(); };
      const end=e=>{ e.preventDefault(); hkStopTalk(); };
      hkBtn.addEventListener('pointerdown',start); hkBtn.addEventListener('pointerup',end);
      hkBtn.addEventListener('pointercancel',end); hkBtn.addEventListener('pointerleave', e=>{ if(e.buttons===0) end(e); });
      hkBtn.addEventListener('touchstart',start,{passive:false}); hkBtn.addEventListener('touchend',end,{passive:false});
    }
    const guestBtn=$('#guestTalkBtn');
    if(guestBtn){
      const start=e=>{ e.preventDefault(); guestStartTalk(); };
      const end=e=>{ e.preventDefault(); guestStopTalk(); };
      guestBtn.addEventListener('pointerdown',start); guestBtn.addEventListener('pointerup',end);
      guestBtn.addEventListener('pointercancel',end); guestBtn.addEventListener('pointerleave', e=>{ if(e.buttons===0) end(e); });
      guestBtn.addEventListener('touchstart',start,{passive:false}); guestBtn.addEventListener('touchend',end,{passive:false});
    }
  }

  // === INIT ===
  function init(){
    const savedRoom=localStorage.getItem('roomCode'); if(savedRoom){ roomCode=savedRoom; $('#roomInput').value=roomCode; }
    const savedPin=localStorage.getItem('pinCode'); if(savedPin){ pinCode=savedPin; $('#pinInput').value=pinCode; }
    const params=new URLSearchParams(location.search);
    if(params.get('room')){ roomCode=params.get('room').toUpperCase(); $('#roomInput').value=roomCode; }
    if(params.get('pin')){ pinCode=params.get('pin'); $('#pinInput').value=pinCode; }
    updateQr();
    if(!appState.log.length){ appState.log=[{ t:new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}), msg:'Sistem siap • Flip cam fix • Koneksi anti-disconnect' }]; saveLocal(); }
    $$('.role-btn').forEach(b=>b.addEventListener('click',()=>setRole(b.dataset.role)));
    $('#createSession').addEventListener('click',createHkSession);
    $('#joinSession').addEventListener('click',joinAsGuest);
    $('#leaveSession')?.addEventListener('click', destroyPeer);
    $('#startCamBtn').addEventListener('click',()=>startCamera(currentFacing));
    $('#flipCamBtn').addEventListener('click',flipCamera);
    $('#stopCamBtn').addEventListener('click',stopCamera);
    $('#snapBtn').addEventListener('click',snapPhoto);
    $('#blurBtn').addEventListener('click',()=>{
      blurEnabled=!blurEnabled;
      const v=$('#hkVideo'); if(v) v.style.filter=blurEnabled?'blur(18px)':'none';
      $('#blurBtn').innerHTML=blurEnabled?'Matikan Blur':'🫧 Blur';
      pushLog(blurEnabled?'Blur aktif':'Blur mati');
    });
    $('#fixBlackBtn').addEventListener('click',()=>{ pushLog('Perbaiki kamera hitam...'); startCameraFallback(); });
    $('#fixBlackGuestBtn').addEventListener('click',()=>{ pushLog('Request stream ulang...'); sendNeedStream(); startNeedStreamLoop(); });
    $('#roomPhotoWrap').addEventListener('click',()=>{ openPhotoViewer($('#roomPhoto').src); });
    $('#completeBtn').addEventListener('click',()=>{
      appState.tasks=[true,true,true,true]; appState.progress=100; appState.step=7;
      renderAll(); saveLocal();
      $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);
      pushLog(`Kamar ${roomCode} siap`);
    });
    $('#toastClose').addEventListener('click',()=>$('#toast').classList.remove('show'));
    $('#permRetry').addEventListener('click',()=>{
      hidePermModal();
      if(lastMediaErrorType.includes('kamera')||lastMediaErrorType.includes('mic')){
        if(lastMediaErrorType.includes('kamera')) startCamera(currentFacing);
        else if(role==='guest') guestStartTalk(); else hkStartTalk();
      } else { startCamera(currentFacing); }
    });
    $('#permClose').addEventListener('click',hidePermModal);
    $('#permModal').addEventListener('click', e=>{ if(e.target.id==='permModal') hidePermModal(); });
    $('#pvClose').addEventListener('click',closePhotoViewer);
    $('#pvBackdrop').addEventListener('click',closePhotoViewer);
    $('#photoViewer').addEventListener('click', e=>{ if(e.target.id==='photoViewer') closePhotoViewer(); });
    function toggleFs(el){ if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen().catch(()=>{}); } else { document.exitFullscreen().catch(()=>{}); } }
    const mainStage=$('#mainCamStage'); const guestStage=$('#guestCamStage');
    if(mainStage){
      mainStage.addEventListener('click', e=>{ if(e.target.closest('button')) return; if($('#hkVideo').srcObject) toggleFs(mainStage); });
      $('#fsBtnMain').addEventListener('click', e=>{ e.stopPropagation(); toggleFs(mainStage); });
    }
    if(guestStage){
      guestStage.addEventListener('click', e=>{ if(e.target.closest('button')) return; if($('#guestVideoMain').srcObject) toggleFs(guestStage); });
      $('#fsBtnGuest').addEventListener('click', e=>{ e.stopPropagation(); toggleFs(guestStage); });
    }
    setInterval(()=>{ const c=$('#clock'); if(c) c.textContent=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); const ot=$('#overlayTime'); if(ot) ot.textContent=new Date().toLocaleTimeString('id-ID'); },1000);
    setInterval(updateViewers,2000);
    setupTalkButtons();
    setRole('hk');
    renderAll(); updateViewers();
  }
  init();
})();
