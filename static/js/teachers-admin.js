/* static/js/teachers-admin.js */
(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/,'');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/login/'); return; }
  const HEADERS = { 'Authorization':'Bearer '+access, 'Content-Type':'application/json' };

  async function tryRefresh(){
    const refresh = localStorage.getItem('refresh'); if (!refresh) return false;
    const r = await fetch(API+'/auth/refresh/', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({refresh})});
    if (!r.ok) return false;
    const d = await r.json().catch(()=>({})); if (!d.access) return false;
    localStorage.setItem('access', d.access); HEADERS.Authorization='Bearer '+d.access; return true;
  }
  async function getJSON(path){
    const url = path.startsWith('http') ? path : API + (path.startsWith('/')?path:'/'+path);
    let res = await fetch(url, {headers: HEADERS});
    if (res.status === 401){ const ok = await tryRefresh(); if (ok) res = await fetch(url, {headers: HEADERS}); else {localStorage.clear(); window.location='/login/'; return;}}
    if (!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }
  async function postJSON(path, body){
    const url = path.startsWith('http') ? path : API + (path.startsWith('/')?path:'/'+path);
    let res = await fetch(url, {method:'POST', headers: HEADERS, body: JSON.stringify(body||{})});
    if (res.status === 401){ const ok = await tryRefresh(); if (ok) res = await fetch(url, {method:'POST', headers: HEADERS, body: JSON.stringify(body||{})}); else {localStorage.clear(); window.location='/login/'; return;}}
    const txt = await res.text(); let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch {}
    if (!res.ok) throw new Error(data.detail || txt || ('HTTP '+res.status));
    return data;
  }

  // DOM
  const tblBody = document.querySelector('#tblTeachers tbody');
  const searchInp = document.getElementById('searchInp');
  const roleFilter = document.getElementById('roleFilter');

  // Modal elements
  const pwModalWrap = document.getElementById('pwModalWrap');
  const pwTeacher   = document.getElementById('pwTeacher');
  const pwInp       = document.getElementById('pwInp');
  const togglePwBtn = document.getElementById('togglePw');
  const genPwBtn    = document.getElementById('genPw');
  const genPwVal    = document.getElementById('genPwVal');
  const pwCancel    = document.getElementById('pwCancel');
  const pwSave      = document.getElementById('pwSave');

  // State
  let ALL_USERS = [];        // full staff directory (non-parents)
  let FILTERED  = [];
  let CURRENT_USER_ID = null;

  // Helpers
  function openModal(){ pwModalWrap.style.display='flex'; pwInp.value=''; genPwVal.classList.add('hidden'); genPwVal.textContent=''; }
  function closeModal(){ pwModalWrap.style.display='none'; }
  function genPassword(len=10){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let p=''; for (let i=0;i<len;i++){ p += chars[Math.floor(Math.random()*chars.length)]; }
    return p;
  }

  function applyFilters(){
    const q = (searchInp.value || '').trim().toLowerCase();
    const rf = (roleFilter.value || '').trim().toLowerCase();
    FILTERED = (ALL_USERS || []).filter(u=>{
      const fn = (u.first_name || '').toLowerCase();
      const ln = (u.last_name  || '').toLowerCase();
      const ph = (u.phone      || '').toLowerCase();
      const ro = (u.role       || '').toLowerCase();
      const sp = (u.specialty  || '').toLowerCase();
      const matchesQ = !q || fn.includes(q) || ln.includes(q) || ph.includes(q) || ro.includes(q) || sp.includes(q);
      const matchesR = !rf || ro === rf;
      return matchesQ && matchesR;
    });
    renderTable(FILTERED);
  }

  // Render
  function renderTable(list){
    tblBody.innerHTML = '';
    (list || []).forEach((u, i)=>{
      const fn = u.first_name || '';
      const ln = u.last_name  || '';
      const ph = u.phone      || '';
      const role = u.role || '';
      const spec = (role === 'teacher') ? (u.specialty || '') : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${(ln+' '+fn).trim() || '—'}</td>
        <td>${role || '—'}</td>
        <td>${ph || '—'}</td>
        <td>${spec || '—'}</td>
        <td>${u.user_id ?? '—'}</td>
        <td>
          <button class="btn" data-setpw="${u.user_id}">Parol o‘rnatish</button>
        </td>
      `;
      tblBody.appendChild(tr);
    });

    // bind buttons
    tblBody.querySelectorAll('button[data-setpw]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = Number(btn.getAttribute('data-setpw'));
        const row = (FILTERED || []).find(x=> Number(x.user_id) === id) ||
                    (ALL_USERS || []).find(x=> Number(x.user_id) === id);
        CURRENT_USER_ID = id;
        pwTeacher.textContent = `Foydalanuvchi: ${(row?.last_name || '')} ${(row?.first_name || '')} — ${row?.phone || ''} (${row?.role || ''})`;
        openModal();
      });
    });
  }

  // Search & filter
  searchInp?.addEventListener('input', applyFilters);
  roleFilter?.addEventListener('change', applyFilters);

  // Modal interactions
  togglePwBtn.addEventListener('click', ()=>{
    pwInp.type = (pwInp.type === 'password') ? 'text' : 'password';
    togglePwBtn.textContent = (pwInp.type === 'password') ? 'Ko‘rsatish' : 'Yashirish';
  });
  genPwBtn.addEventListener('click', ()=>{
    const p = genPassword(10);
    genPwVal.textContent = p;
    genPwVal.classList.remove('hidden');
    pwInp.value = p;
  });
  pwCancel.addEventListener('click', closeModal);
  pwModalWrap.addEventListener('click', (e)=>{ if (e.target === pwModalWrap) closeModal(); });

  pwSave.addEventListener('click', async ()=>{
    const pw = (pwInp.value || '').trim();
    if (pw.length < 6) { alert('Parol uzunligi kamida 6 bo‘lishi kerak'); return; }
    if (!CURRENT_USER_ID) { alert('Xatolik: foydalanuvchi tanlanmadi'); return; }
    try {
      await postJSON(`/staff/set-password/`, { user_id: CURRENT_USER_ID, password: pw });
      alert('Parol saqlandi ✅');
      closeModal();
    } catch (e) {
      console.error(e);
      alert('Parolni saqlashda xatolik ❌');
    }
  });

  // Init
  (async function init(){
    try {
      ALL_USERS = await getJSON('/staff/directory/');
      applyFilters();
    } catch (e) {
      console.error(e);
      alert('Xodimlar ro‘yxatini yuklashda xatolik.');
    }
  })();
})();
