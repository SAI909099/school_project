/* static/js/teacher-classes.js */
(function () {
  const API_BASE = (window.API_BASE || '/api').replace(/\/+$/, '');

  // ===== Auth guard =====
  const access = localStorage.getItem('access');
  if (!access) { window.location.href = '/login/'; return; }
  const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access };

  // ===== Utilities =====
  async function api(path, opts = {}) {
    const url = path.startsWith('http') ? path : API_BASE + (path.startsWith('/') ? path : '/' + path);
    const res = await fetch(url, { headers: HEADERS, ...opts });
    if (res.status === 401) {
      const ok = await tryRefresh();
      if (ok) return api(path, opts);
      localStorage.clear(); window.location.href = '/login/'; return;
    }
    if (!res.ok) throw new Error((await res.text().catch(()=>'')).trim() || `HTTP ${res.status}`);
    return res.json();
  }
  async function tryRefresh() {
    const refresh = localStorage.getItem('refresh'); if (!refresh) return false;
    const r = await fetch(API_BASE + '/auth/refresh/', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ refresh })
    });
    if (!r.ok) return false;
    const data = await r.json().catch(()=>({}));
    if (data.access) { localStorage.setItem('access', data.access); HEADERS.Authorization = 'Bearer ' + data.access; return true; }
    return false;
  }

  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (v != null) e.setAttribute(k,v);
    }
    for (const k of kids) e.append(k instanceof Node ? k : document.createTextNode(k));
    return e;
  };
  const todayISO = () => {
    const d = new Date(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${day}`;
  };
  const weekdayFromDate = (d) => (d.getDay() === 0 ? 7 : d.getDay());
  const weekdayFromISO = (iso) => weekdayFromDate(iso ? new Date(iso+'T00:00:00') : new Date());

  // ===== Role enforcement & store current teacher id =====
  let CURRENT_TEACHER_ID = null;

  async function loadMe() {
    const me = await api('/auth/me/');
    const role = me?.role;
    if (role === 'teacher') {
      CURRENT_TEACHER_ID = me?.teacher?.id || null;
      return;
    }
    if (role === 'admin' || role === 'registrar') window.location.href = '/dashboard/';
    else if (role === 'parent') window.location.href = '/otaona/';
    else window.location.href = '/';
    throw new Error('Wrong role for page');
  }

  // ===== light styles =====
  (function injectStyles(){
    const css = `
    .status-pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:1;border:1px solid transparent}
    .status-present{background:#e7f6ed;color:#0a7a33;border-color:#bfe6cf}
    .status-absent{background:#fde7ea;color:#c01a1a;border-color:#f3b8c0}
    .status-late{background:#fff4e5;color:#a15e00;border-color:#f8d7a6}
    .status-excused{background:#e8f1ff;color:#1a4fbf;border-color:#b9d1ff}
    .stat-group{display:flex;gap:6px;flex-wrap:wrap}
    .stat-btn{padding:6px 10px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;font-size:12px}
    .stat-btn.active{border-color:#4f46e5;box-shadow:0 0 0 2px rgba(79,70,229,.12)}
    .stat-btn[data-val="present"].active{background:#e7f6ed;color:#0a7a33;border-color:#bfe6cf}
    .stat-btn[data-val="absent"].active{background:#fde7ea;color:#c01a1a;border-color:#f3b8c0}
    .stat-btn[data-val="late"].active{background:#fff4e5;color:#a15e00;border-color:#f8d7a6}
    .stat-btn[data-val="excused"].active{background:#e8f1ff;color:#1a4fbf;border-color:#b9d1ff}
    .badge-my-class{position:absolute; top:10px; right:10px; background:#4f46e5; color:#fff; padding:2px 8px; border-radius:999px; font-size:12px;}
    `;
    if (!document.getElementById('att-status-styles')) {
      const s = document.createElement('style');
      s.id = 'att-status-styles';
      s.textContent = css;
      document.head.appendChild(s);
    }
  })();

  // ===== DOM =====
  const cardsWrap = document.querySelector('.cards');
  const main = document.querySelector('main.content') || document.body;
  const searchInput = document.querySelector('.topbar input[type="text"]');

  // Attendance panel container
  const panel = el('section', { class: 'attendance-panel', style: 'margin-top:16px; display:none;' });
  main.appendChild(panel);

  // ===== Render classes =====
  let ALL_CLASSES = [];

  function renderCards(list) {
    if (!cardsWrap) return;
    cardsWrap.innerHTML = '';
    if (!list || !list.length) {
      cardsWrap.append(el('div', {class:'card'}, 'Sinf topilmadi'));
      return;
    }
    list.forEach(c => {
      const teacherId = c.class_teacher?.id ?? c.class_teacher ?? c.class_teacher_id ?? null;
      const isMyClass = (teacherId === CURRENT_TEACHER_ID);

      const card = el('div', {class:'card', style:'cursor:pointer; position:relative;'});
      if (isMyClass) card.appendChild(el('div', {class:'badge-my-class'}, 'Mening sinfim'));
      card.append(
        el('h3', {}, c.name || ('Sinf #' + c.id)),
        el('p', {}, `O‘quvchilar soni : ${c.students_count ?? c.student_count ?? '—'} ta`),
        el('p', {}, el('b', {}, 'Kurator : '), (c.class_teacher_name || c.teacher_name || '—'))
      );
      card.addEventListener('click', () => openAttendance(c));
      cardsWrap.append(card);
    });
  }

  async function loadClasses() {
    // directory endpoint -> cheaper payload
    ALL_CLASSES = await api('/dir/classes/');
    ALL_CLASSES.sort((a, b) => {
      const aMine = ((a.class_teacher?.id ?? a.class_teacher ?? a.class_teacher_id) === CURRENT_TEACHER_ID) ? 1 : 0;
      const bMine = ((b.class_teacher?.id ?? b.class_teacher ?? b.class_teacher_id) === CURRENT_TEACHER_ID) ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    renderCards(ALL_CLASSES);
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = !q ? ALL_CLASSES :
        ALL_CLASSES.filter(c => String(c.name || '').toLowerCase().includes(q));
      renderCards(filtered);
    });
  }

  // ===== Attendance panel =====
  async function openAttendance(clazz) {
    panel.style.display = '';
    panel.innerHTML = '';

    const header = el('div', {class:'panel-header'}, el('h3', {}, `Davomat — ${clazz.name}`));

    const controls = el('div', {class:'controls', style:'display:flex; gap:12px; align-items:center; flex-wrap:wrap;'});
    const dateInp = el('input', {type:'date', value: todayISO()});
    const lessonSel = el('select', {});
    const btnReload = el('button', {class:'btn'}, 'Yuklash');
    const btnAllPresent = el('button', {class:'btn'}, 'Barchasi: Kelgan');
    const btnAllAbsent = el('button', {class:'btn'}, 'Barchasi: Kelmagan');
    const btnSave = el('button', {class:'btn btn-primary'}, 'Saqlash');

    controls.append(
      el('label', {}, 'Sana: '), dateInp,
      el('label', {style:'margin-left:8px;'}, 'Dars (shu kun): '), lessonSel,
      btnReload, btnAllPresent, btnAllAbsent, btnSave
    );

    const tableWrap = el('div', {class:'table-wrap'});
    const table = el('table', {class:'att-table'});
    const thead = el('thead', {}, el('tr', {},
      el('th', {}, '№'), el('th', {}, 'F.I.O'), el('th', {}, 'Holat'), el('th', {}, 'Izoh')
    ));
    const tbody = el('tbody', {});
    table.append(thead, tbody);
    tableWrap.append(table);
    panel.append(header, controls, tableWrap);

    // cache full schedule once
    let CLASS_SCHEDULE = [];
    async function ensureSchedule() {
      if (CLASS_SCHEDULE.length) return;
      CLASS_SCHEDULE = await api(`/schedule/class/${clazz.id}/`);
      CLASS_SCHEDULE.sort((a,b)=> String(a.weekday).localeCompare(String(b.weekday)) ||
                                   String(a.start_time).localeCompare(String(b.start_time)));
    }

    function refillLessonsForDate() {
      lessonSel.innerHTML = '';
      const wd = weekdayFromISO(dateInp.value);
      const filtered = (wd >= 1 && wd <= 6)
        ? CLASS_SCHEDULE.filter(x => Number(x.weekday) === wd)
        : [];
      filtered.forEach(item => {
        const st = (item.start_time || '').slice(0,5);
        const et = (item.end_time || '').slice(0,5);
        const name = (item.subject_name || item.subject_label || item.subject_title || 'Fan');
        lessonSel.append(el('option', { value: item.subject }, `${st || '--:--'}–${et || '--:--'} — ${name}`));
      });
      if (!lessonSel.options.length) {
        lessonSel.append(el('option', {value:''}, 'Bu kunda dars yo‘q'));
      }
    }

    async function loadLessons() {
      await ensureSchedule();
      refillLessonsForDate();
    }

    function makeStatusGroup(studentId) {
      const g = el('div', { class:'stat-group', 'data-student': String(studentId) });
      [['present','Kelgan'], ['absent','Kelmagan'], ['late','Kechikkan'], ['excused','Sababli']]
        .forEach(([val,label], idx) => {
          const b = el('button', { type:'button', class:'stat-btn', 'data-val':val }, label);
          if (idx===0) b.classList.add('active'); // default: present
          b.addEventListener('click', ()=>{
            g.querySelectorAll('.stat-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
          });
          g.appendChild(b);
        });
      return g;
    }

    function getStatusFor(studentId) {
      const g = tbody.querySelector(`.stat-group[data-student="${studentId}"]`);
      const active = g?.querySelector('.stat-btn.active');
      return active ? active.getAttribute('data-val') : 'present';
    }

    function setStatusForAll(val) {
      tbody.querySelectorAll('.stat-group').forEach(g=>{
        g.querySelectorAll('.stat-btn').forEach(x=>x.classList.toggle('active', x.getAttribute('data-val')===val));
      });
    }

    function setStatusFor(studentId, status) {
      const g = tbody.querySelector(`.stat-group[data-student="${studentId}"]`);
      if (!g) return;
      g.querySelectorAll('.stat-btn').forEach(x=>{
        x.classList.toggle('active', x.getAttribute('data-val')===status);
      });
    }

    function setNoteFor(studentId, note) {
      const inp = tbody.querySelector(`input[data-note="${studentId}"]`);
      if (inp) inp.value = note || '';
    }

    async function loadStudents() {
      tbody.innerHTML = '';
      const students = await api(`/classes/${clazz.id}/students_az/`);
      students.forEach((s, idx) => {
        const tr = el('tr', {});
        const group = makeStatusGroup(s.id);
        const noteInp = el('input', {type:'text', placeholder:'Izoh (ixtiyoriy)', 'data-note': String(s.id)});
        tr.append(
          el('td', {}, String(idx+1)),
          el('td', {}, `${s.last_name || ''} ${s.first_name || ''}`.trim()),
          el('td', {'data-col':'status'}, group),
          el('td', {}, noteInp),
        );
        tbody.append(tr);
      });
    }

    // === NEW: prefill saved marks for the chosen class/date/subject ===
    async function prefillSaved() {
      const dt = (dateInp.value || todayISO());
      const subj = lessonSel.value ? Number(lessonSel.value) : null;
      const qs = new URLSearchParams({ 'class': String(clazz.id), 'date': dt });
      if (subj) qs.set('subject', String(subj));
      try {
        const rows = await api('/attendance/by-class-day/?' + qs.toString());
        // rows: [{student_id, status, note}]
        (rows || []).forEach(r => {
          setStatusFor(r.student_id, r.status);
          setNoteFor(r.student_id, r.note || '');
        });
      } catch (e) {
        // silent (no saved data yet)
      }
    }

    await loadLessons();
    await loadStudents();
    await prefillSaved(); // <— first prefill

    dateInp.addEventListener('change', async () => { refillLessonsForDate(); await prefillSaved(); });
    lessonSel.addEventListener('change', prefillSaved);

    btnReload.addEventListener('click', async () => {
      // full refresh: schedule, students, then prefill
      CLASS_SCHEDULE = [];
      await loadLessons();
      await loadStudents();
      await prefillSaved();
    });
    btnAllPresent.addEventListener('click', () => setStatusForAll('present'));
    btnAllAbsent.addEventListener('click', () => setStatusForAll('absent'));

    btnSave.addEventListener('click', async () => {
      const dateVal = dateInp.value || todayISO();
      const subjectId = lessonSel.value ? Number(lessonSel.value) : null;

      const entries = [];
      tbody.querySelectorAll('.stat-group[data-student]').forEach(g => {
        const student = Number(g.getAttribute('data-student'));
        const active = g.querySelector('.stat-btn.active')?.getAttribute('data-val') || 'present';
        const note = (tbody.querySelector(`input[data-note="${student}"]`)?.value || '').trim();
        entries.push({ student, status: active, note });
      });

      try {
        const payload = { "class": clazz.id, "date": dateVal, "subject": subjectId, "entries": entries };
        await api('/attendance/bulk-mark/', { method:'POST', body: JSON.stringify(payload) });
        alert('Davomat saqlandi ✅');
        // no freeze; keep interactive so teacher can update
      } catch (e) {
        console.error(e);
        alert('Saqlashda xatolik ❌');
      }
    });
  }

  // ===== Start =====
  (async function init() {
    await loadMe();
    await loadClasses();
  })();
})();
