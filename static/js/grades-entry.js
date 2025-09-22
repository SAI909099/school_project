/* static/js/grades-entry.js */
(function () {
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/'); return; }
  const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access };

  // ---------- tiny helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, a = {}, ...kids) => {
    const e = document.createElement(t);
    for (const [k, v] of Object.entries(a)) {
      if (k === 'class') e.className = v;
      else if (v != null) e.setAttribute(k, v);
    }
    kids.forEach(k => e.append(k instanceof Node ? k : document.createTextNode(k)));
    return e;
  };
  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }
  function msg(ok, text) {
    const box = $('#msg');
    box.classList.remove('hidden');
    box.className = ok ? 'ok' : 'err';
    box.textContent = text;
    setTimeout(() => { box.classList.add('hidden'); }, ok ? 2500 : 5000);
  }

  // ---------- DOM refs ----------
  const classSel = $('#classSel');
  const subjectSel = $('#subjectSel');
  const typeSel = $('#typeSel');
  const dateInp = $('#dateInp');
  const termInp = $('#termInp');
  const tbl = $('#tbl tbody');
  const btnLoad = $('#btnLoad');
  const btnFill3 = $('#btnFill3');
  const btnFill4 = $('#btnFill4');
  const btnFill5 = $('#btnFill5');
  const btnClear = $('#btnClear');
  const btnSave = $('#btnSave');
  const whoBadge = $('#whoBadge');

  // ---------- state ----------
  let students = [];  // [{id, first_name, last_name}]
  let role = '—';

  // ---------- boot defaults ----------
  dateInp.value = todayISO();
  if (!termInp.value) {
    const d = new Date();
    const half = (d.getMonth() + 1) <= 6 ? 1 : 2;
    termInp.value = `${d.getFullYear()}-${half}`;
  }

  // ---------- fetch helpers ----------
  async function apiGET(path) {
    const r = await fetch(API + path, { headers: HEADERS });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  async function apiPOST(path, data) {
    const r = await fetch(API + path, { method: 'POST', headers: HEADERS, body: JSON.stringify(data) });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { /* leave as text */ }
    if (!r.ok) {
      throw new Error(json && json.detail ? json.detail : (text || `HTTP ${r.status}`));
    }
    return json;
  }

  // User role (best-effort)
  async function loadRole() {
    try {
      const me = await apiGET('/auth/me/');
      role = me.role || me.user?.role || '—';
    } catch (_) { role = '—'; }
    whoBadge.textContent = `Rol: ${role}`;
  }

  async function loadClasses() {
    const data = await apiGET('/dir/classes/');
    (data || []).forEach(c => classSel.append(el('option', { value: c.id }, c.name)));
  }

  async function loadTeacherDefaultClass() {
    try {
      const mine = await apiGET('/teacher/classes/me/');
      if (Array.isArray(mine) && mine.length) {
        const firstId = String(mine[0].id);
        if (![...classSel.options].some(o => o.value === firstId)) {
          classSel.append(el('option', { value: firstId }, mine[0].name || `Sinf #${firstId}`));
        }
        classSel.value = firstId;
      }
    } catch (_) {/* ignore */}
  }

  async function loadSubjects() {
    const data = await apiGET('/subjects/');
    subjectSel.innerHTML = '';
    subjectSel.append(el('option', { value: '' }, '— tanlang —'));
    (data || []).forEach(s => subjectSel.append(el('option', { value: s.id }, `${s.name} (${s.code})`)));
  }

  async function loadStudentsByClass(classId) {
    const data = await apiGET(`/classes/${classId}/students_az/`);
    students = (data || []).map(s => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }));
  }

  // ---------- table render ----------
  function renderTable() {
    tbl.innerHTML = '';
    if (!students.length) {
      tbl.append(el('tr', {}, el('td', { colspan: 4 }, 'O‘quvchilar topilmadi.')));
      return;
    }
    students.forEach((s, idx) => {
      const row = el('tr', { 'data-student': s.id },
        el('td', {}, String(idx + 1)),
        el('td', {}, `${s.last_name || ''} ${s.first_name || ''}`.trim()),
        el('td', {}, el('input', { type: 'number', min: '2', max: '5', step: '1', class: 'score-inp', style: 'width:80px' })),
        el('td', {}, el('input', { type: 'text', class: 'comment-inp', placeholder: 'Izoh (ixtiyoriy)' }))
      );
      tbl.append(row);
    });
  }

  // ---------- bulk helpers ----------
  function fillAll(val) { tbl.querySelectorAll('.score-inp').forEach(inp => { inp.value = String(val); }); }
  function clearAll() {
    tbl.querySelectorAll('.score-inp').forEach(inp => inp.value = '');
    tbl.querySelectorAll('.comment-inp').forEach(inp => inp.value = '');
  }

  // ---------- save ----------
  async function saveGrades() {
    const classId = classSel.value;
    const subjectId = subjectSel.value;
    let gtype = typeSel.value;
    const dt = dateInp.value;
    const term = termInp.value.trim();

    if (!classId) { msg(false, 'Sinf tanlanmadi'); return; }
    if (!subjectId) { msg(false, 'Fan tanlanmadi'); return; }
    if (!dt) { msg(false, 'Sana tanlanmadi'); return; }

    // Only allow exam|final; ignore/deny daily on the client side.
    if (!['exam', 'final'].includes(gtype)) {
      // If someone injects "daily" via DevTools, block it.
      msg(false, 'Kundalik baholar kiritilmaydi. Faqat Imtihon yoki Yakuniy.');
      // Optionally auto-correct to exam:
      gtype = 'exam';
      // return; // or stop completely if you prefer
    }

    const entries = [];
    tbl.querySelectorAll('tr').forEach(tr => {
      const sid = tr.getAttribute('data-student');
      const score = tr.querySelector('.score-inp').value;
      const comment = tr.querySelector('.comment-inp').value.trim();
      if (sid && score) {
        const n = Number(score);
        if (Number.isFinite(n) && n >= 2 && n <= 5) {
          entries.push({ student: Number(sid), score: n, comment });
        }
      }
    });

    if (!entries.length) { msg(false, 'Hech bo‘lmaganda bitta bahoni kiriting.'); return; }

    const payload = {
      "class": Number(classId),
      "date": dt,
      "subject": Number(subjectId),
      "type": gtype,            // exam | final  (daily intentionally not used)
      "term": term,             // e.g., 2025-1 (may be empty)
      "entries": entries
    };

    try {
      const res = await apiPOST('/grades/bulk-set/', payload);
      if (res && res.ok) {
        msg(true, `Saqlanib bo‘ldi. ${res.ids?.length || entries.length} ta yozuv.`);
      } else {
        msg(true, 'Saqlanib bo‘ldi.');
      }
    } catch (e) {
      msg(false, 'Xatolik: ' + e.message);
    }
  }

  // ---------- events ----------
  btnFill3.addEventListener('click', () => fillAll(3));
  btnFill4.addEventListener('click', () => fillAll(4));
  btnFill5.addEventListener('click', () => fillAll(5));
  btnClear.addEventListener('click', clearAll);
  btnSave.addEventListener('click', saveGrades);

  btnLoad.addEventListener('click', async () => {
    const classId = classSel.value;
    if (!classId) { msg(false, 'Avval sinfni tanlang.'); return; }
    try {
      await loadStudentsByClass(classId);
      renderTable();
      msg(true, 'O‘quvchilar yuklandi.');
    } catch (e) {
      msg(false, 'Yuklashda xatolik: ' + e.message);
    }
  });

  // ---------- init ----------
  (async function init() {
    try {
      // Defensive: if template cache accidentally still has "daily", remove it.
      const dailyOpt = typeSel.querySelector('option[value="daily"]');
      if (dailyOpt) dailyOpt.remove();

      await Promise.all([loadRole(), loadClasses(), loadSubjects()]);
      await loadTeacherDefaultClass();
    } catch (e) {
      console.error(e);
    }
  })();
})();
