(function () {
  const API = (window.API_BASE || "/api").replace(/\/+$/, "");
  const access = localStorage.getItem("access");
  if (!access) { window.location.replace("/"); return; }

  const HEADERS = {
    "Authorization": "Bearer " + access,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  // ---- DOM ----
  const $ = (s, r = document) => r.querySelector(s);
  const tbody = $("#parents-tbody");
  const searchInput = $("#search");
  const classFilter = $("#class-filter");
  const btnRefresh = $("#btn-refresh");
  const listMeta = $("#list-meta");

  // Modal elements
  const modalEl = document.getElementById("setPasswordModal");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const formSetPass = $("#set-password-form");
  const gidInput = $("#guardian-id");
  const passInput = $("#new-password");

  // ---- State ----
  let parents = [];      // raw list from API
  let filtered = [];     // after search/filter
  let classes = [];      // for dropdown

  // ---- Helpers ----
  function toast(msg) { alert(msg); }

  function normalize(s) {
    return (s || "").toString().toLowerCase().trim();
  }

  function matchParent(p, q) {
    const qn = normalize(q);
    if (!qn) return true;

    const fields = [
      `${p.first_name || ""} ${p.last_name || ""}`,
      p.phone || "",
    ];

    // also search in children names and classes
    (p.children || []).forEach(c => {
      fields.push(`${c.first_name || ""} ${c.last_name || ""}`);
      fields.push(c.class || "");
    });

    return fields.some(f => normalize(f).includes(qn));
  }

  function matchClass(p, className) {
    if (!className) return true;
    // If any child is in the selected class, include parent
    return (p.children || []).some(c => (c.class || "") === className);
  }

  function setLoading(on) {
    if (on) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Yuklanmoqda…</td></tr>`;
    }
  }

  // ---- API calls ----
  async function apiGET(path) {
    try {
      const res = await fetch(API + path, { headers: HEADERS });
      return res;
    } catch (e) {
      console.error("GET failed:", path, e);
      // Mimic fetch Response shape for error handling
      return { ok: false, status: 0, text: async () => String(e) };
    }
  }

  async function apiPOST(path, body) {
    try {
      const res = await fetch(API + path, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body || {})
      });
      return res;
    } catch (e) {
      console.error("POST failed:", path, e);
      return { ok: false, status: 0, json: async () => ({ error: String(e) }) };
    }
  }

  async function loadClasses() {
    try {
      const res = await apiGET("/dir/classes/");
      if (!res.ok) throw new Error(`classes load failed (HTTP ${res.status})`);
      classes = await res.json();
      fillClassFilter(classes);
    } catch (e) {
      console.warn(e);
    }
  }

  function fillClassFilter(items) {
    // Keep "Barchasi"
    const frag = document.createDocumentFragment();
    (items || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = `${c.name} ${typeof c.students_count === "number" ? `(${c.students_count})` : ""}`;
      frag.appendChild(opt);
    });
    classFilter.appendChild(frag);
  }

  async function loadParents() {
    setLoading(true);
    const res = await apiGET("/parents/");
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const t = await res.text();
        if (t) msg += ` — ${t}`;
      } catch {}
      console.error("Parents API error:", msg);
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Ota-onalar ro‘yxatini yuklab bo‘lmadi (${msg}).</td></tr>`;
      listMeta.textContent = "0 ta natija";
      return;
    }
    try {
      parents = await res.json();
    } catch (e) {
      console.error("Invalid JSON from /parents/:", e);
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Server noto‘g‘ri javob qaytardi.</td></tr>`;
      listMeta.textContent = "0 ta natija";
      return;
    }
    applyFilters();
  }

  // ---- Render ----
  function applyFilters() {
    const q = searchInput.value || "";
    const cls = classFilter.value || "";
    filtered = (parents || []).filter(p => matchParent(p, q) && matchClass(p, cls));
    render(filtered);
  }

  function render(rows) {
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Ma’lumot topilmadi.</td></tr>`;
      listMeta.textContent = "0 ta natija";
      return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach(p => {
      const tr = document.createElement("tr");
      const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();

      tr.innerHTML = `
        <td>${fullName || "-"}</td>
        <td>${p.phone || "-"}</td>
        <td>
          ${
            (p.children || []).length
              ? p.children.map(c => `
                <div>
                  ${c.first_name || ""} ${c.last_name || ""}
                  <span class="badge text-bg-light badge-class">${c.class || "-"}</span>
                </div>`).join("")
              : `<span class="text-muted">—</span>`
          }
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary btn-reset" data-id="${p.id}">
            Parolni o‘rnatish
          </button>
        </td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    listMeta.textContent = `${rows.length} ta ota-ona`;

    // Wire modal openers
    tbody.querySelectorAll(".btn-reset").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!modal) {
          // fallback to prompt if Bootstrap modal isn't present
          const newPass = prompt("Yangi parolni kiriting (kamida 6 belgi):");
          if (!newPass) return;
          if (newPass.length < 6) { toast("Parol uzunligi kamida 6 belgi bo‘lishi kerak"); return; }
          doSetPassword(btn.dataset.id, newPass);
          return;
        }
        gidInput.value = btn.dataset.id;
        passInput.value = "";
        modal.show();
        passInput.focus();
      });
    });
  }

  // ---- Actions ----
  async function doSetPassword(parentId, newPassword) {
    try {
      const res = await apiPOST(`/parents/${parentId}/set-password/`, { password: newPassword });
      if (!res.ok) {
        const t = await safeJson(res);
        const msg = (t && (t.detail || t.error)) || `Xatolik (HTTP ${res.status})`;
        toast("Parolni o‘zgartirib bo‘lmadi: " + msg);
        return;
      }
      toast("Parol yangilandi ✅");
    } catch (e) {
      console.error(e);
      toast("Tarmoq xatosi.");
    }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  // ---- Events ----
  if (formSetPass) {
    formSetPass.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = gidInput.value;
      const pw = passInput.value.trim();
      if (!pw || pw.length < 6) {
        passInput.classList.add("is-invalid");
        toast("Parol uzunligi kamida 6 belgi bo‘lishi kerak");
        return;
      }
      passInput.classList.remove("is-invalid");
      formSetPass.querySelector("button[type=submit]").disabled = true;
      await doSetPassword(id, pw);
      formSetPass.querySelector("button[type=submit]").disabled = false;
      if (modal) modal.hide();
    });
  }

  searchInput.addEventListener("input", applyFilters);
  classFilter.addEventListener("change", applyFilters);
  btnRefresh.addEventListener("click", () => loadParents());

  // ---- init ----
  (async function init() {
    await loadClasses();
    await loadParents();
  })();
})();
