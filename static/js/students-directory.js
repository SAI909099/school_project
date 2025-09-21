/**
 * Students Directory UI (fixed)
 * - Loads classes list with counts & teacher
 * - Clicking a class shows its students
 * - Global search over entire school
 */
(function () {
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const token = localStorage.getItem('access');
  const HEADERS = token ? { Authorization: 'Bearer ' + token } : {};

  const els = {
    classesList: document.getElementById('classes-list'),
    studentsBody: document.getElementById('students-body'),
    table: document.getElementById('students-table'),
    empty: document.getElementById('empty-state'),
    search: document.getElementById('student-search'),
    title: document.getElementById('panel-title'),
    clearBtn: document.getElementById('btn-clear'),
  };

  const state = {
    currentClass: null,
    currentClassName: null,
    searchTimer: null,
  };

  // ---- helpers
  function htmlesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function showEmpty(show) {
    if (els.empty) els.empty.style.display = show ? 'block' : 'none';
    if (els.table) els.table.style.visibility = show ? 'hidden' : 'visible';
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function unpack(data) {
    // Works with or without DRF pagination
    return Array.isArray(data) ? data : (data && data.results) ? data.results : [];
  }

  // ---- classes panel
  function renderClasses(classes) {
    if (!els.classesList) return;
    els.classesList.innerHTML = '';

    classes.forEach(c => {
      const li = document.createElement('li');
      li.className = 'class-item';
      li.dataset.id = c.id;

      li.innerHTML = `
        <div class="class-line">
          <span class="class-name">${htmlesc(c.name)}</span>
          <span class="count">${(c.students_count ?? c.student_count ?? 0)}</span>
        </div>
        <div class="class-teacher">${htmlesc(c.class_teacher_name || '')}</div>
      `;

      li.addEventListener('click', () => {
        state.currentClass = c.id;
        state.currentClassName = c.name;
        loadClassStudents(c.id, c.name);
        if (els.search) els.search.value = '';
      });

      els.classesList.appendChild(li);
    });
  }

  async function loadClasses() {
    try {
      const data = await getJSON(API + '/classes/');
      renderClasses(unpack(data));
    } catch (e) {
      console.error('Classes load failed:', e);
    }
  }

  // ---- students table
  function renderStudents(students) {
    if (!els.studentsBody) return;
    els.studentsBody.innerHTML = '';

    if (!students || students.length === 0) {
      showEmpty(true);
      return;
    }
    showEmpty(false);

    students.forEach((s, i) => {
      const tr = document.createElement('tr');
      const full = s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim();

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${htmlesc(full)}</td>
        <td>${htmlesc(s.class_name || '')}</td>
        <td>${htmlesc(s.class_teacher || '')}</td>
        <td>${htmlesc(s.parent_name || '')}</td>
        <td>${htmlesc(s.parent_phone || '')}</td>
      `;
      els.studentsBody.appendChild(tr);
    });
  }

  async function loadClassStudents(classId, className) {
    try {
      if (els.title) els.title.textContent = `Sinf: ${className}`;
      // Use the CRUD action you already have:
      const data = await getJSON(API + `/classes/${classId}/students_az/`);
      renderStudents(unpack(data));
    } catch (e) {
      console.error('Class students failed:', e);
      renderStudents([]);
    }
  }

  // ---- global search
  async function doSearch(q) {
    if (!q) {
      if (els.title) els.title.textContent = 'Barcha o‘quvchilar';
      renderStudents([]);
      return;
    }
    try {
      if (els.title) els.title.textContent = `Qidiruv: "${q}"`;
      const data = await getJSON(API + `/students/?q=${encodeURIComponent(q)}`);
      renderStudents(unpack(data));
      state.currentClass = null;
      state.currentClassName = null;
    } catch (e) {
      console.error('Search failed:', e);
      renderStudents([]);
    }
  }

  function onSearchInput() {
    const q = els.search.value.trim();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => doSearch(q), 300);
  }

  function clearAll() {
    state.currentClass = null;
    state.currentClassName = null;
    if (els.search) els.search.value = '';
    if (els.title) els.title.textContent = 'Barcha o‘quvchilar';
    renderStudents([]);
  }

  // ---- init
  document.addEventListener('DOMContentLoaded', () => {
    if (els.search) els.search.addEventListener('input', onSearchInput);
    if (els.clearBtn) els.clearBtn.addEventListener('click', clearAll);
    loadClasses();
  });
})();
