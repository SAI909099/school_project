/**
 * operator-add.js
 * - Role guard (operator/admin/registrar)
 * - Populates classes from /api/dir/classes/
 * - Submits to /api/operator/enroll/
 * - Handles token refresh + nice errors
 */
(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/,'');
  const msg = document.getElementById('msg');

  function showOk(t){ if(!msg) return; msg.className='ok'; msg.textContent=t; msg.classList.remove('hidden'); }
  function showErr(t){ if(!msg) return; msg.className='err'; msg.textContent=t; msg.classList.remove('hidden'); }
  function hideMsg(){ if(!msg) return; msg.classList.add('hidden'); }

  // ---- auth headers + refresh
  let access = localStorage.getItem('access');
  const HEADERS = { 'Content-Type':'application/json' };
  if(access) HEADERS.Authorization = 'Bearer ' + access;

  async function tryRefresh(){
    const refresh = localStorage.getItem('refresh');
    if(!refresh) return false;
    const r = await fetch(API + '/auth/refresh/', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ refresh })
    });
    if(!r.ok) return false;
    const data = await r.json().catch(()=>({}));
    if(data.access){
      access = data.access;
      localStorage.setItem('access', access);
      HEADERS.Authorization = 'Bearer ' + access;
      return true;
    }
    return false;
  }

  async function api(url, opts={}){
    const u = url.startsWith('http') ? url : API + (url.startsWith('/')?url:'/'+url);
    const r = await fetch(u, { headers: HEADERS, ...opts });
    if(r.status === 401){
      const ok = await tryRefresh();
      if(ok) return api(url, opts);
      localStorage.clear();
      window.location.href = '/login/';
      return Promise.reject(new Error('Auth required'));
    }
    const text = await r.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : {}; }catch{ data = { detail: text || `HTTP ${r.status}` }; }
    if(!r.ok) throw new Error(data?.detail || text || `HTTP ${r.status}`);
    return data;
  }

  // ---- role guard
  async function guardRole(){
    const me = await api('/auth/me/');
    const role = me?.role;
    if(!['operator','admin','registrar'].includes(role)){
      // send them to their role dashboard
      if(role === 'teacher') window.location.href = '/teachers/';
      else if(role === 'parent') window.location.href = '/otaona/';
      else window.location.href = '/';
      throw new Error('Not allowed');
    }
  }

  // ---- page elements
  const form   = document.querySelector('.student-form');
  const sinfSel= document.getElementById('sinf');
  const btn    = document.getElementById('btnSave');

  // ---- helpers
  function buildDOB(form){
    const y = (form.yil.value||'').trim();
    const m = (form.oy.value||'').trim().padStart(2,'0');
    const d = (form.kun.value||'').trim().padStart(2,'0');
    return (y && m && d) ? `${y}-${m}-${d}` : null;
  }

  async function loadClasses(){
    const classes = await api('/dir/classes/');
    sinfSel.innerHTML = '<option value="">Sinfni tanlang</option>';
    classes
      .slice()
      .sort((a,b)=> String(a.name).localeCompare(String(b.name)))
      .forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c.id;          // IMPORTANT: numeric ID for backend
        opt.textContent = c.name;
        sinfSel.appendChild(opt);
      });
  }

  function disableForm(d){
    if(btn) btn.disabled = d;
    form?.querySelectorAll('input,select,button').forEach(el => el.disabled = d);
  }

  async function onSubmit(e){
    e.preventDefault();
    hideMsg();

    const first_name = (form.ism.value||'').trim();
    const last_name  = (form.familiya.value||'').trim();
    const parent_name= (form.otaona.value||'').trim();
    const phone1     = (form.phone1.value||'').trim();
    const phone2     = (form.phone2.value||'').trim();
    const class_id   = Number(form.sinf.value||0) || null;
    const dob        = buildDOB(form);

    if(!first_name || !last_name){ showErr('Ism va familiya shart.'); return; }
    if(!class_id){ showErr('Sinfni tanlang.'); return; }
    if(!phone1){ showErr('Telefon 1 (login) shart.'); return; }

    const payload = { first_name, last_name, parent_name, phone1, phone2, class_id, dob };

    try{
      disableForm(true);
      const res = await api('/operator/enroll/', { method:'POST', body: JSON.stringify(payload) });
      const pw = res.temp_password ? `\nParol: ${res.temp_password}` : '\nParol: (mavjud hisob)';
      showOk(`O‘quvchi qo‘shildi ✅\nSinf: ${res.class_name}\nLogin: ${res.parent_username}${pw}`);
      form.reset();
    }catch(err){
      console.error(err);
      showErr('Xatolik: ' + err.message);
    }finally{
      disableForm(false);
    }
  }

  // ---- init
  (async function init(){
    try{
      await guardRole();
      await loadClasses();
      form?.addEventListener('submit', onSubmit);
      hideMsg();
    }catch(e){
      // already redirected if not allowed
      if(e && e.message !== 'Not allowed') showErr('Yuklashda xatolik: ' + e.message);
    }
  })();
})();
