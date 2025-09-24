/**
 * oper-davomat.js — Operator Davomat (fixed, no "Fanlar" column in absent list)
 * - Mark attendance per class (+subject)
 * - Show school-wide "kelmagan" list for a date
 */
(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/,'');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/login/'); return; }

  const HEADERS = { 'Authorization': 'Bearer ' + access, 'Content-Type':'application/json' };

  // ---- JWT refresh
  async function tryRefresh(){
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return false;
    const res = await fetch(API + '/auth/refresh/', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ refresh })
    });
    if (!res.ok) return false;
    const data = await res.json().catch(()=>({}));
    if (data && data.access) {
      localStorage.setItem('access', data.access);
      HEADERS.Authorization = 'Bearer ' + data.access;
      return true;
    }
    return false;
  }

  async function getJSON(url){
    let res = await fetch(url, { headers: HEADERS });
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (ok) res = await fetch(url, { headers: HEADERS });
      else { localStorage.clear(); window.location.replace('/login/'); return; }
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function postJSON(url, body){
    let res = await fetch(url, { method:'POST', headers: HEADERS, body: JSON.stringify(body) });
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (ok) res = await fetch(url, { method:'POST', headers: HEADERS, body: JSON.stringify(body) });
      else { localStorage.clear(); window.location.replace('/login/'); return; }
    }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok) throw new Error(data.detail || text || ('HTTP ' + res.status));
    return data;
  }

  // DOM — Mark
  const classSelect    = document.getElementById('classSelect');
  const dateInp        = document.getElementById('dateInp');
  const subjectSelect  = document.getElementById('subjectSelect');
  const btnLoadClass   = document.getElementById('btnLoadClass');
  const btnAllPresent  = document.getElementById('btnAllPresent');
  const btnAllAbsent   = document.getElementById('btnAllAbsent');
  const btnSave        = document.getElementById('btnSave');
  const tblMarkBody    = document.querySelector('#tblMark tbody');
  const markInfo       = document.getElementById('markInfo');

  // DOM — Absent
  const absDate       = document.getElementById('absDate');
  const absClass      = document.getElementById('absClass');
  const btnLoadAbsent = document.getElementById('btnLoadAbsent');
  const tblAbsBody    = document.querySelector('#tblAbsent tbody');
  const absInfo       = document.getElementById('absInfo');
  const btnCSV        = document.getElementById('btnCSV');

  // Helpers
  function todayISO(){
    const d = new Date();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }
  function weekdayFromISO(iso){
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    const js = d.getDay(); // 0..6 (Sun..Sat)
    return js === 0 ? 7 : js; // 1..7 (Mon..Sun)
  }
  function subjIdFrom(item){
    if (item == null) return null;
    if (typeof item.subject_id !== 'undefined' && item.subject_id !== null) return Number(item.subject_id);
    const s = item.subject;
    if (s == null) return null;
    if (typeof s === 'number') return s;
    if (typeof s === 'object') {
      if (typeof s.id !== 'undefined') return Number(s.id);
      if (typeof s.pk !== 'undefined') return Number(s.pk);
    }
    return null;
  }
  function subjNameFrom(item){
    if (!item) return 'Fan';
    const objName = (typeof item.subject === 'object') ? (item.subject.name || item.subject.title) : '';
    return item.subject_name || item.subject_label || item.subject_title || objName || 'Fan';
  }

  // ===== Schedule → subject list (by weekday)
  let CLASS_SCHEDULE = [];
  async function ensureSchedule(classId){
    if (!classId) { CLASS_SCHEDULE = []; return; }
    CLASS_SCHEDULE = await getJSON(API + `/schedule/class/${classId}/`);
    CLASS_SCHEDULE.sort((a,b)=>
      String(a.weekday).localeCompare(String(b.weekday)) ||
      String(a.start_time).localeCompare(String(b.start_time))
    );
  }
  function fillSubjectsForDate(){
    if (!subjectSelect) return;
    subjectSelect.innerHTML = '<option value="">— tanlang —</option>';
    const wd = weekdayFromISO(dateInp.value);
    const items = CLASS_SCHEDULE.filter(x => Number(x.weekday) === wd);
    items.forEach(item => {
      const id = subjIdFrom(item);
      const st = (item.start_time || '').slice(0,5);
      const et = (item.end_time || '').slice(0,5);
      subjectSelect.append(new Option(`${st || '--:--'}–${et || '--:--'} — ${subjNameFrom(item)}`, id ?? ''));
    });
  }

  // Load classes into both selects
  async function loadClasses(){
    const list = await getJSON(API + '/dir/classes/');
    classSelect.innerHTML = '<option value="">— tanlang —</option>';
    absClass.innerHTML    = '<option value="">— hammasi —</option>';
    (list || []).forEach(c=>{
      classSelect.append(new Option(c.name, c.id));
      absClass.append(new Option(c.name, c.id));
    });
  }

  // Load students by class and render mark table
  async function loadClassStudents(){
    const cid = classSelect.value;
    const when = dateInp.value;
    if (!cid) { tblMarkBody.innerHTML = '<tr><td colspan="3">Avval guruhni tanlang</td></tr>'; return; }
    tblMarkBody.innerHTML = '<tr><td colspan="3">Yuklanmoqda…</td></tr>';

    try {
      await ensureSchedule(cid);
      fillSubjectsForDate();

      const studs = await getJSON(API + `/classes/${cid}/students_az/`);
      tblMarkBody.innerHTML = '';
      (studs || []).forEach((s, i) => {
        const tr = document.createElement('tr');
        const fio = `${s.last_name || ''} ${s.first_name || ''}`.trim() || (s.full_name || s.name || ('#' + s.id));
        tr.innerHTML = `
          <td>${i+1}</td>
          <td>${fio}</td>
          <td><input type="checkbox" class="att-present" data-id="${s.id}" checked></td>
        `;
        tblMarkBody.appendChild(tr);
      });
      markInfo.textContent = `Sana: ${when}, jami: ${(studs||[]).length} ta o‘quvchi.`;

      await prefillExisting();
    } catch (e) {
      console.error(e);
      tblMarkBody.innerHTML = '<tr><td colspan="3">Yuklashda xatolik</td></tr>';
    }
  }

  async function prefillExisting(){
    const cid  = classSelect.value;
    const when = dateInp.value;
    if (!cid || !when) return;
    const subj = parseInt(subjectSelect?.value || '', 10);
    const qs = new URLSearchParams({ 'class': String(cid), 'date': when });
    if (Number.isFinite(subj)) qs.set('subject', String(subj));
    try {
      const rows = await getJSON(API + '/attendance/by-class-day/?' + qs.toString());
      (rows || []).forEach(r => {
        const chk = tblMarkBody.querySelector(`.att-present[data-id="${r.student_id}"]`);
        if (chk) chk.checked = (r.status === 'present');
      });
    } catch (_) {}
  }

  function setAllPresent(flag){
    document.querySelectorAll('.att-present').forEach(chk => chk.checked = !!flag);
  }

  // Save attendance (includes subject)
  async function saveAttendance(){
    const cid = classSelect.value;
    const when = dateInp.value;
    const subjVal = parseInt(subjectSelect?.value || '', 10);
    const subjectId = Number.isFinite(subjVal) ? subjVal : null;

    if (!cid) return alert('Avval guruhni tanlang');
    if (!when) return alert('Sana tanlanmadi');

    const items = Array.from(document.querySelectorAll('.att-present'))
      .map(chk => ({ student: Number(chk.dataset.id), present: !!chk.checked }));

    try {
      await postJSON(API + '/attendance/mark/', {
        class_id: Number(cid),
        date: when,
        subject: subjectId,
        items
      });
      alert('Davomat saqlandi');
    } catch (e) {
      console.error(e);
      alert('Saqlashda xatolik: ' + e.message);
    }
  }

  // Load absent list (no subject column)
  async function loadAbsent(){
    const when = absDate.value;
    const cid  = absClass.value;
    if (!when) { tblAbsBody.innerHTML = '<tr><td colspan="5">Sana tanlang</td></tr>'; return; }
    tblAbsBody.innerHTML = '<tr><td colspan="5">Yuklanmoqda…</td></tr>';
    try {
      const qs = new URLSearchParams({ date: when });
      if (cid) qs.set('class', cid);
      const rows = await getJSON(API + '/attendance/absent/?' + qs.toString());
      renderAbsent(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error(e);
      tblAbsBody.innerHTML = '<tr><td colspan="5">Yuklashda xatolik</td></tr>';
      absInfo.textContent = '—';
    }
  }

  function renderAbsent(rows){
    const mapped = rows.map((r) => ({
      id: r.student_id ?? r.id ?? r.student ?? 0,
      name: r.full_name ?? r.student_name ?? r.name ?? '',
      clazz: r.class_name ?? r.clazz ?? '',
      phone: r.parent_phone ?? r.phone ?? r.parent ?? ''
    }));

    tblAbsBody.innerHTML = '';
    if (!mapped.length) {
      tblAbsBody.innerHTML = '<tr><td colspan="5">Bugun barcha kelgan ko‘rinadi 🙂</td></tr>';
      absInfo.textContent = '0 nafar kelmagan';
      return;
    }

    mapped.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${r.name || ('#' + r.id)}</td>
        <td>${r.clazz || '-'}</td>
        <td>${r.phone || '-'}</td>
        <td><span class="pill">Kelmagan</span></td>
      `;
      tblAbsBody.appendChild(tr);
    });
    absInfo.textContent = `${mapped.length} nafar kelmagan`;
  }

  function exportAbsentCSV(){
    const lines = [];
    const head = ['#','F.I.O','Sinf','Telefon','Holat']; // 5 cols
    lines.push(head.join(','));
    const trs = Array.from(tblAbsBody.querySelectorAll('tr'));
    trs.forEach((tr) => {
      const cols = Array.from(tr.children).map(td => `"${String(td.textContent).replaceAll('"','""')}"`);
      lines.push(cols.join(','));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kelmaganlar_${absDate.value || todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Events
  btnLoadClass?.addEventListener('click', loadClassStudents);
  btnAllPresent?.addEventListener('click', () => setAllPresent(true));
  btnAllAbsent?.addEventListener('click',  () => setAllPresent(false));
  btnSave?.addEventListener('click', saveAttendance);

  // when date changes, rebuild subject list & prefill
  dateInp?.addEventListener('change', () => { fillSubjectsForDate(); prefillExisting(); });
  subjectSelect?.addEventListener('change', prefillExisting);

  btnLoadAbsent?.addEventListener('click', loadAbsent);
  btnCSV?.addEventListener('click', exportAbsentCSV);

  // Init
  (async function init(){
    dateInp.value = todayISO();
    absDate.value = todayISO();
    try {
      await loadClasses();
    } catch (e) {
      console.error('Classes load failed:', e);
    }
  })();
})();
