/**
 * moliya-sozlamalar.js
 * Saves finance profile/settings via multipart PATCH to /api/auth/me/
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, ""); // You can also use '/api' if your /auth/me/ lives there
  const token = localStorage.getItem("access");
  const HEADERS = token ? { Authorization: "Bearer " + token } : {};

  const form = document.getElementById("settings-form");

  async function patchFormData(url, fd) {
    const res = await fetch(url, { method: "PATCH", headers: HEADERS, body: fd });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  function bindFileName() {
    const inp = document.getElementById("fileUpload");
    const out = document.getElementById("file-name");
    if (inp && out) {
      inp.addEventListener("change", () => {
        out.textContent = inp.files && inp.files[0] ? inp.files[0].name : "";
      });
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      // If your /auth/me/ endpoint is under /api/ (not /api/billing/), change the base to '/api'
      await patchFormData("/api/auth/me/", fd);
      alert("Sozlamalar saqlandi");
    } catch (err) {
      console.error("Settings save failed:", err);
      alert("Saqlashda xatolik");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindFileName();
    if (form) form.addEventListener("submit", onSubmit);
  });
})();

