/**
 * moliya-chiqim.js
 * Renders expenses table from /api/billing/payments/?type=expense
 * Expected fields (mock or real): id, date, amount/amount_uzs, method, reason/note
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, "");
  const token = localStorage.getItem("access");
  const HEADERS = token ? { Authorization: "Bearer " + token } : {};

  function som(n) {
    return (Number(n || 0)).toLocaleString("uz-UZ") + " so'm";
  }
  function fmtDate(d) {
    const dt = new Date(d);
    return isNaN(dt) ? (d || "") : dt.toISOString().slice(0, 10);
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  function render(rows) {
    const table = document.querySelector(".table-container table");
    if (!table) return;

    // Ensure THEAD / TBODY exist
    let thead = table.querySelector("thead");
    if (!thead) {
      thead = document.createElement("thead");
      thead.innerHTML = `
        <tr><th>#</th><th>Sana</th><th>Summa</th><th>Usul</th><th>Izoh</th></tr>
      `;
      table.prepend(thead);
    }
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }
    tbody.innerHTML = "";

    rows.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${fmtDate(p.date || p.paid_at)}</td>
        <td>${som(p.amount_uzs ?? p.amount)}</td>
        <td>${p.method || "-"}</td>
        <td>${p.reason || p.note || ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function init() {
    try {
      const data = await getJSON(API + "/payments/?type=expense");
      render(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Expenses load failed:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
