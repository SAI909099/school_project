/**
 * moliya-oylik.js
 * Handles the salaries checklist table.
 *
 * NOTE: Your backend doesn't expose a dedicated salaries endpoint yet.
 * This script:
 *  1) Tries to GET an optional list from /api/billing/salaries/?month=YYYY-MM (if you add it later).
 *  2) Falls back to the static rows already present in HTML.
 *  3) On "Saqlash", POSTs a compact payload to /api/billing/salaries/mark/
 *     -> You can implement this endpoint to persist paid status.
 *
 * Adjust endpoints if you decide to store salaries elsewhere (e.g., /api/hr/salaries/).
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, "");
  const token = localStorage.getItem("access");
  const JSON_HEADERS = token
    ? { Authorization: "Bearer " + token, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const table = document.querySelector(".table-container table");
  const saveBtn = document.querySelector(".btn-primary");

  function readTable() {
    const tbody = table?.querySelector("tbody");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr")).map((tr) => {
      const tds = tr.querySelectorAll("td");
      const fio = tds[0]?.textContent.trim() || "";
      const dateStr = tds[1]?.textContent.trim() || "";
      const chk = tds[2]?.querySelector('input[type="checkbox"]');
      return { fio, date: dateStr, paid: !!(chk && chk.checked) };
    });
  }

  function writeTable(items) {
    const tbody = table?.querySelector("tbody");
    if (!tbody || !Array.isArray(items)) return;
    tbody.innerHTML = "";
    items.forEach((it) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${it.fio || ""}</td>
        <td>${it.date || ""}</td>
        <td><input type="checkbox" ${it.paid ? "checked" : ""}></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function tryLoadMonth() {
    const now = new Date();
    const month = now.toISOString().slice(0, 7); // YYYY-MM
    try {
      const res = await fetch(API + `/salaries/?month=${month}`, {
        headers: JSON_HEADERS,
      });
      if (res.ok) {
        const data = await res.json();
        // Expecting [{fio, date, paid}, ...]
        if (Array.isArray(data) && data.length) writeTable(data);
      }
    } catch {
      // silently ignore if endpoint not ready
    }
  }

  async function save() {
    const items = readTable();
    if (!items.length) return alert("Saqlash uchun ma'lumot yo‘q.");
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    try {
      const res = await fetch(API + "/salaries/mark/", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ month, items }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      alert("Oyliklar saqlandi");
    } catch (e) {
      console.error("Salaries save failed:", e);
      alert("Saqlashda xatolik");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    tryLoadMonth(); // optional — only if you implement the endpoint
    if (saveBtn) saveBtn.addEventListener("click", save);
  });
})();
