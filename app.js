/* app.js — Majma Al-Adl Dashboard (Pages) + Cloudflare Workers API + D1 */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -------------------------
  // Config / Auth (simple)
  // -------------------------
  const AUTH_OK = "majma_adl_auth_ok";
  const AUTH_USER = "majma_adl_user";
  const AUTH_PASS = "majma_adl_pass";
  const DEFAULT_USER = "admin";
  const DEFAULT_PASS = "@1000@";

  function getSavedUser() { return localStorage.getItem(AUTH_USER) || DEFAULT_USER; }
  function getSavedPass() { return localStorage.getItem(AUTH_PASS) || DEFAULT_PASS; }
  function isAuthed() { return sessionStorage.getItem(AUTH_OK) === "1"; }
  function setAuthed() { sessionStorage.setItem(AUTH_OK, "1"); }
  function lock() { sessionStorage.removeItem(AUTH_OK); location.reload(); }

  // -------------------------
  // API base + helpers
  // -------------------------
  const API_OVERRIDE_KEY = "majma_adl_api_override";
  const DEFAULT_API = ""; // إذا خليته فارغ => يحاول يتوقع /api من نفس الدومين (إذا عندك بروكسي). وإلا استخدم override.
  function apiBase() {
    const o = (localStorage.getItem(API_OVERRIDE_KEY) || "").trim();
    return o || DEFAULT_API;
  }
  function setApiBase(url) {
    localStorage.setItem(API_OVERRIDE_KEY, (url || "").trim());
  }

  async function apiFetch(path, opt = {}) {
    const base = apiBase();
    const url = base ? (base.replace(/\/+$/, "") + path) : path; // يسمح بوضع /api لو عندك proxy
    const headers = Object.assign({ "Content-Type": "application/json" }, opt.headers || {});
    const res = await fetch(url, { ...opt, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `API Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  const api = {
    ping: () => apiFetch("/ping"),
    // Units
    units_list: (q = {}) => {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.block) params.set("block", q.block);
      return apiFetch("/units?" + params.toString());
    },
    unit_get: (id) => apiFetch(`/units/${encodeURIComponent(id)}`),
    unit_create: (payload) => apiFetch("/units", { method: "POST", body: JSON.stringify(payload) }),
    unit_update: (id, payload) => apiFetch(`/units/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
    unit_delete: (id) => apiFetch(`/units/${encodeURIComponent(id)}`, { method: "DELETE" }),
    units_seed: (count = 500) => apiFetch("/seed", { method: "POST", body: JSON.stringify({ count }) }),

    // Contractors / Engineers / Workers
    contractors_list: () => apiFetch("/contractors"),
    contractor_create: (p) => apiFetch("/contractors", { method: "POST", body: JSON.stringify(p) }),
    contractor_update: (id, p) => apiFetch(`/contractors/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
    contractor_delete: (id) => apiFetch(`/contractors/${encodeURIComponent(id)}`, { method: "DELETE" }),

    engineers_list: () => apiFetch("/engineers"),
    engineer_create: (p) => apiFetch("/engineers", { method: "POST", body: JSON.stringify(p) }),
    engineer_update: (id, p) => apiFetch(`/engineers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
    engineer_delete: (id) => apiFetch(`/engineers/${encodeURIComponent(id)}`, { method: "DELETE" }),

    workers_list: () => apiFetch("/workers"),
    worker_create: (p) => apiFetch("/workers", { method: "POST", body: JSON.stringify(p) }),
    worker_update: (id, p) => apiFetch(`/workers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
    worker_delete: (id) => apiFetch(`/workers/${encodeURIComponent(id)}`, { method: "DELETE" }),

    // Unit Workers
    unit_workers_list: (unitId) => apiFetch(`/units/${encodeURIComponent(unitId)}/workers`),
    unit_worker_add: (unitId, p) => apiFetch(`/units/${encodeURIComponent(unitId)}/workers`, { method: "POST", body: JSON.stringify(p) }),
    unit_worker_update: (unitId, id, p) => apiFetch(`/units/${encodeURIComponent(unitId)}/workers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
    unit_worker_delete: (unitId, id) => apiFetch(`/units/${encodeURIComponent(unitId)}/workers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  // -------------------------
  // UI state
  // -------------------------
  let cache = {
    units: [],
    contractors: [],
    engineers: [],
    workers: [],
  };

  let selectedUnit = null;

  // -------------------------
  // DOM refs
  // -------------------------
  const els = {
    loginBack: $("#loginBack"),
    loginUser: $("#loginUser"),
    loginPass: $("#loginPass"),
    loginBtn: $("#loginBtn"),

    nav: $("#nav"),
    pageTitle: $("#pageTitle"),

    apiStatus: $("#apiStatus"),
    apiBase: $("#apiBase"),

    seedBtn: $("#seedBtn"),

    // KPI
    kpiUnits: $("#kpiUnits"),
    kpiProgress: $("#kpiProgress"),
    kpiContractors: $("#kpiContractors"),
    statInProgress: $("#statInProgress"),
    statDone: $("#statDone"),
    statNotStarted: $("#statNotStarted"),

    // Units page
    unitsSearch: $("#unitsSearch"),
    unitsBlock: $("#unitsBlock"),
    unitsRefresh: $("#unitsRefresh"),
    unitCreate: $("#unitCreate"),
    unitsTbody: $("#unitsTbody"),

    // Contractors
    contractorCreate: $("#contractorCreate"),
    contractorsTbody: $("#contractorsTbody"),

    // Engineers
    engineerCreate: $("#engineerCreate"),
    engineersTbody: $("#engineersTbody"),

    // Workers
    workerCreate: $("#workerCreate"),
    workersTbody: $("#workersTbody"),

    // Settings
    apiOverride: $("#apiOverride"),
    saveApi: $("#saveApi"),
    resetApi: $("#resetApi"),

    // Unit modal
    unitModalBack: $("#unitModalBack"),
    unitModalTitle: $("#unitModalTitle"),
    unitModalSub: $("#unitModalSub"),
    unitModalClose: $("#unitModalClose"),

    assignContractor: $("#assignContractor"),
    assignEngineer: $("#assignEngineer"),
    assignStart: $("#assignStart"),
    assignEnd: $("#assignEnd"),
    assignSave: $("#assignSave"),

    stagesBox: $("#stagesBox"),
    stagesSave: $("#stagesSave"),

    workerSelect: $("#workerSelect"),
    workerType: $("#workerType"),
    workerAdd: $("#workerAdd"),
    unitWorkersTbody: $("#unitWorkersTbody"),
  };

  // -------------------------
  // Pages routing
  // -------------------------
  const pages = ["dashboard", "units", "contractors", "engineers", "workers", "settings"];

  function showPage(id) {
    pages.forEach(p => {
      const sec = $(`#page-${p}`);
      if (!sec) return;
      sec.classList.toggle("hidden", p !== id);
    });

    $$(".nav__item", els.nav).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === id);
    });

    const titleMap = {
      dashboard: "الرئيسية",
      units: "الوحدات السكنية",
      contractors: "المقاولون",
      engineers: "المهندسون",
      workers: "العمال",
      settings: "الإعدادات"
    };
    els.pageTitle.textContent = titleMap[id] || "—";
  }

  // -------------------------
  // Status / ping
  // -------------------------
  async function refreshApiStatus() {
    els.apiBase.textContent = apiBase() ? apiBase() : "(لم يتم تعيين API)";
    try {
      await api.ping();
      els.apiStatus.textContent = "متصل";
      els.apiStatus.className = "pill pill--ok";
    } catch (e) {
      els.apiStatus.textContent = "غير متصل";
      els.apiStatus.className = "pill pill--bad";
    }
  }

  // -------------------------
  // Data loading
  // -------------------------
  async function loadAll() {
    // Load reference lists first
    const [contractors, engineers, workers] = await Promise.all([
      api.contractors_list(),
      api.engineers_list(),
      api.workers_list(),
    ]);

    cache.contractors = contractors.items || contractors || [];
    cache.engineers = engineers.items || engineers || [];
    cache.workers = workers.items || workers || [];

    // Load units (default view)
    const units = await api.units_list({ search: (els.unitsSearch?.value || "").trim(), block: (els.unitsBlock?.value || "") });
    cache.units = units.items || units || [];

    renderAll();
  }

  // -------------------------
  // Render helpers
  // -------------------------
  const stageDefs = [
    { key: "ground", label: "أرض", weight: 33 },
    { key: "structure", label: "هيكل", weight: 33 },
    { key: "finish", label: "كامل", weight: 34 },
  ];

  function unitProgress(u) {
    const stages = safeJson(u.stages) || {};
    let p = 0;
    for (const s of stageDefs) if (stages[s.key]) p += s.weight;
    return Math.min(100, Math.max(0, p));
  }

  function unitStatus(u) {
    const p = unitProgress(u);
    if (p >= 100) return "منجزة";
    if (p <= 0) return "غير بادئة";
    return "قيد التنفيذ";
  }

  function pillStatus(text) {
    if (text === "منجزة") return `<span class="pill pill--ok">${text}</span>`;
    if (text === "غير بادئة") return `<span class="pill pill--dim">${text}</span>`;
    return `<span class="pill pill--warn">${text}</span>`;
  }

  function safeJson(v) {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  }

  function byId(list, id) {
    return list.find(x => String(x.id) === String(id));
  }

  function renderDashboard() {
    const units = cache.units || [];
    const total = units.length;

    let sumProgress = 0;
    let done = 0, notStarted = 0, inProg = 0;

    for (const u of units) {
      const p = unitProgress(u);
      sumProgress += p;
      const st = unitStatus(u);
      if (st === "منجزة") done++;
      else if (st === "غير بادئة") notStarted++;
      else inProg++;
    }

    const avg = total ? Math.round(sumProgress / total) : 0;

    els.kpiUnits.textContent = total ? String(total) : "--";
    els.kpiProgress.textContent = total ? `${avg}%` : "--";
    els.kpiContractors.textContent = cache.contractors.length ? String(cache.contractors.length) : "--";

    els.statDone.textContent = total ? String(done) : "--";
    els.statNotStarted.textContent = total ? String(notStarted) : "--";
    els.statInProgress.textContent = total ? String(inProg) : "--";
  }

  function renderBlocksDropdown() {
    if (!els.unitsBlock) return;
    const blocks = Array.from(new Set((cache.units || []).map(u => (u.block || "").trim()).filter(Boolean))).sort();
    const current = els.unitsBlock.value || "";
    els.unitsBlock.innerHTML = `<option value="">كل البلوكات</option>` + blocks.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
    els.unitsBlock.value = current;
  }

  function renderUnitsTable() {
    if (!els.unitsTbody) return;

    const units = cache.units || [];
    els.unitsTbody.innerHTML = units.map(u => {
      const p = unitProgress(u);
      const st = unitStatus(u);
      return `
        <tr>
          <td>${escapeHtml(u.number ?? "")}</td>
          <td>${escapeHtml(u.block ?? "")}</td>
          <td>${pillStatus(st)}</td>
          <td><b>${p}%</b></td>
          <td><button class="btn btn--small" data-open-unit="${escapeAttr(u.id)}">تفاصيل</button></td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="5" class="dim small">لا توجد وحدات.</td></tr>`;

    // bind open buttons
    $$(`[data-open-unit]`, els.unitsTbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-open-unit");
        await openUnitModal(id);
      });
    });
  }

  function renderContractorsTable() {
    if (!els.contractorsTbody) return;
    const list = cache.contractors || [];
    els.contractorsTbody.innerHTML = list.map(c => `
      <tr>
        <td>${escapeHtml(c.name || "")}</td>
        <td>${escapeHtml(c.phone || "")}</td>
        <td>${c.active === 0 ? `<span class="pill pill--dim">متوقف</span>` : `<span class="pill pill--ok">نشط</span>`}</td>
        <td class="tdActions">
          <button class="btn btn--small" data-edit-con="${escapeAttr(c.id)}">تعديل</button>
          <button class="btn btn--small btn--danger" data-del-con="${escapeAttr(c.id)}">حذف</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="dim small">لا يوجد مقاولون.</td></tr>`;

    $$(`[data-edit-con]`, els.contractorsTbody).forEach(b => b.addEventListener("click", () => editContractor(b.getAttribute("data-edit-con"))));
    $$(`[data-del-con]`, els.contractorsTbody).forEach(b => b.addEventListener("click", () => delContractor(b.getAttribute("data-del-con"))));
  }

  function renderEngineersTable() {
    if (!els.engineersTbody) return;
    const list = cache.engineers || [];
    els.engineersTbody.innerHTML = list.map(e => `
      <tr>
        <td>${escapeHtml(e.name || "")}</td>
        <td>${escapeHtml(e.salary_type || "شهري")}</td>
        <td>${escapeHtml(String(e.amount ?? 0))}</td>
        <td class="tdActions">
          <button class="btn btn--small" data-edit-eng="${escapeAttr(e.id)}">تعديل</button>
          <button class="btn btn--small btn--danger" data-del-eng="${escapeAttr(e.id)}">حذف</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="dim small">لا يوجد مهندسون.</td></tr>`;

    $$(`[data-edit-eng]`, els.engineersTbody).forEach(b => b.addEventListener("click", () => editEngineer(b.getAttribute("data-edit-eng"))));
    $$(`[data-del-eng]`, els.engineersTbody).forEach(b => b.addEventListener("click", () => delEngineer(b.getAttribute("data-del-eng"))));
  }

  function renderWorkersTable() {
    if (!els.workersTbody) return;
    const list = cache.workers || [];
    els.workersTbody.innerHTML = list.map(w => `
      <tr>
        <td>${escapeHtml(w.name || "")}</td>
        <td>${escapeHtml(w.salary_type || "يومي")}</td>
        <td>${escapeHtml(String(w.amount ?? 0))}</td>
        <td class="tdActions">
          <button class="btn btn--small" data-edit-wrk="${escapeAttr(w.id)}">تعديل</button>
          <button class="btn btn--small btn--danger" data-del-wrk="${escapeAttr(w.id)}">حذف</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="dim small">لا يوجد عمال.</td></tr>`;

    $$(`[data-edit-wrk]`, els.workersTbody).forEach(b => b.addEventListener("click", () => editWorker(b.getAttribute("data-edit-wrk"))));
    $$(`[data-del-wrk]`, els.workersTbody).forEach(b => b.addEventListener("click", () => delWorker(b.getAttribute("data-del-wrk"))));
  }

  function renderSettings() {
    if (!els.apiOverride) return;
    els.apiOverride.value = apiBase() || "";
  }

  function renderAll() {
    renderDashboard();
    renderBlocksDropdown();
    renderUnitsTable();
    renderContractorsTable();
    renderEngineersTable();
    renderWorkersTable();
    renderSettings();
  }

  // -------------------------
  // Modal: unit details
  // -------------------------
  function openModal() { els.unitModalBack.classList.remove("hidden"); }
  function closeModal() { els.unitModalBack.classList.add("hidden"); selectedUnit = null; }

  async function openUnitModal(unitId) {
    const u = await api.unit_get(unitId);
    selectedUnit = u;

    els.unitModalTitle.textContent = `تفاصيل الوحدة رقم ${u.number}`;
    els.unitModalSub.textContent = `بلوك: ${u.block || "—"} • الحالة: ${unitStatus(u)} • الإنجاز: ${unitProgress(u)}%`;

    // Fill assignment selects
    els.assignContractor.innerHTML = `<option value="">— بدون —</option>` + (cache.contractors || []).map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join("");
    els.assignEngineer.innerHTML = `<option value="">— بدون —</option>` + (cache.engineers || []).map(e => `<option value="${escapeAttr(e.id)}">${escapeHtml(e.name)}</option>`).join("");

    els.assignContractor.value = u.contractor_id ? String(u.contractor_id) : "";
    els.assignEngineer.value = u.engineer_id ? String(u.engineer_id) : "";
    els.assignStart.value = u.start_date || "";
    els.assignEnd.value = u.end_date || "";

    // stages
    const st = safeJson(u.stages) || {};
    els.stagesBox.innerHTML = stageDefs.map(s => {
      const checked = !!st[s.key];
      return `
        <label class="stage">
          <input type="checkbox" data-stage="${escapeAttr(s.key)}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(s.label)}</span>
        </label>
      `;
    }).join("");

    // workers select
    els.workerSelect.innerHTML = `<option value="">اختر عامل...</option>` + (cache.workers || []).map(w => `<option value="${escapeAttr(w.id)}">${escapeHtml(w.name)}</option>`).join("");
    els.workerType.value = "";

    // unit workers table
    await refreshUnitWorkersTable(u.id);

    openModal();
  }

  async function refreshUnitWorkersTable(unitId) {
    const data = await api.unit_workers_list(unitId);
    const rows = data.items || data || [];
    els.unitWorkersTbody.innerHTML = rows.map(r => {
      const w = byId(cache.workers, r.worker_id);
      return `
        <tr>
          <td>${escapeHtml(w ? w.name : "—")}</td>
          <td>${escapeHtml(r.work_type || "")}</td>
          <td>${escapeHtml(r.from_date || "")}</td>
          <td>${escapeHtml(r.to_date || "")}</td>
          <td class="tdActions">
            <button class="btn btn--small" data-edit-uw="${escapeAttr(r.id)}">تعديل</button>
            <button class="btn btn--small btn--danger" data-del-uw="${escapeAttr(r.id)}">حذف</button>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="5" class="dim small">لا يوجد عمال لهذه الوحدة.</td></tr>`;

    $$(`[data-del-uw]`, els.unitWorkersTbody).forEach(b => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del-uw");
      if (!selectedUnit) return;
      if (!confirm("حذف هذا السطر؟")) return;
      await api.unit_worker_delete(selectedUnit.id, id);
      await refreshUnitWorkersTable(selectedUnit.id);
    }));

    $$(`[data-edit-uw]`, els.unitWorkersTbody).forEach(b => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-edit-uw");
      if (!selectedUnit) return;
      const list = await api.unit_workers_list(selectedUnit.id);
      const rows = list.items || list || [];
      const row = rows.find(x => String(x.id) === String(id));
      if (!row) return;

      const newType = prompt("نوع العمل:", row.work_type || "");
      if (newType === null) return;
      const from = prompt("من (YYYY-MM-DD):", row.from_date || "");
      if (from === null) return;
      const to = prompt("إلى (YYYY-MM-DD):", row.to_date || "");
      if (to === null) return;

      await api.unit_worker_update(selectedUnit.id, id, { work_type: newType, from_date: from, to_date: to });
      await refreshUnitWorkersTable(selectedUnit.id);
    }));
  }

  // -------------------------
  // CRUD dialogs (simple prompt)
  // -------------------------
  async function editContractor(id) {
    const c = byId(cache.contractors, id);
    if (!c) return;
    const name = prompt("اسم المقاول:", c.name || "");
    if (name === null) return;
    const phone = prompt("الهاتف:", c.phone || "");
    if (phone === null) return;
    const active = confirm("هل المقاول نشط؟ (OK = نشط، Cancel = متوقف)") ? 1 : 0;
    await api.contractor_update(id, { name, phone, active });
    await loadAll();
  }
  async function delContractor(id) {
    if (!confirm("حذف المقاول؟")) return;
    await api.contractor_delete(id);
    await loadAll();
  }

  async function editEngineer(id) {
    const e = byId(cache.engineers, id);
    if (!e) return;
    const name = prompt("اسم المهندس:", e.name || "");
    if (name === null) return;
    const salary_type = prompt("نوع الراتب (شهري/مقطوعة/نسبة):", e.salary_type || "شهري");
    if (salary_type === null) return;
    const amount = prompt("المبلغ:", String(e.amount ?? 0));
    if (amount === null) return;
    await api.engineer_update(id, { name, salary_type, amount: Number(amount || 0) });
    await loadAll();
  }
  async function delEngineer(id) {
    if (!confirm("حذف المهندس؟")) return;
    await api.engineer_delete(id);
    await loadAll();
  }

  async function editWorker(id) {
    const w = byId(cache.workers, id);
    if (!w) return;
    const name = prompt("اسم العامل:", w.name || "");
    if (name === null) return;
    const salary_type = prompt("نوع الراتب (يومي/شهري/مقطوعة):", w.salary_type || "يومي");
    if (salary_type === null) return;
    const amount = prompt("المبلغ:", String(w.amount ?? 0));
    if (amount === null) return;
    await api.worker_update(id, { name, salary_type, amount: Number(amount || 0) });
    await loadAll();
  }
  async function delWorker(id) {
    if (!confirm("حذف العامل؟")) return;
    await api.worker_delete(id);
    await loadAll();
  }

  // -------------------------
  // Events
  // -------------------------
  function bindEvents() {
    // Login
    els.loginUser.value = getSavedUser();
    els.loginPass.value = "";
    els.loginBtn.addEventListener("click", () => {
      const u = (els.loginUser.value || "").trim();
      const p = (els.loginPass.value || "").trim();
      if (u === getSavedUser() && p === getSavedPass()) {
        setAuthed();
        els.loginBack.classList.add("hidden");
        boot();
      } else {
        alert("بيانات الدخول غير صحيحة");
      }
    });

    // Sidebar nav
    $$(".nav__item", els.nav).forEach(btn => {
      btn.addEventListener("click", () => {
        showPage(btn.dataset.page);
      });
    });

    // Seed 500
    els.seedBtn.addEventListener("click", async () => {
      if (!confirm("توليد 500 وحدة؟ (سيتم إنشاء وحدات في قاعدة البيانات)")) return;
      await api.units_seed(500);
      await loadAll();
      alert("تم توليد الوحدات");
    });

    // Units filters
    els.unitsRefresh.addEventListener("click", async () => {
      const units = await api.units_list({ search: (els.unitsSearch.value || "").trim(), block: (els.unitsBlock.value || "") });
      cache.units = units.items || units || [];
      renderAll();
    });
    els.unitsSearch.addEventListener("input", debounce(async () => {
      const units = await api.units_list({ search: (els.unitsSearch.value || "").trim(), block: (els.unitsBlock.value || "") });
      cache.units = units.items || units || [];
      renderAll();
    }, 300));
    els.unitsBlock.addEventListener("change", async () => {
      const units = await api.units_list({ search: (els.unitsSearch.value || "").trim(), block: (els.unitsBlock.value || "") });
      cache.units = units.items || units || [];
      renderAll();
    });

    // Create unit
    els.unitCreate.addEventListener("click", async () => {
      const number = prompt("رقم الوحدة (مثال 1 أو A-1):", "");
      if (number === null) return;
      const block = prompt("اسم/رقم البلوك:", "");
      if (block === null) return;
      await api.unit_create({ number, block, stages: JSON.stringify({}) });
      await loadAll();
    });

    // Create contractor/engineer/worker
    els.contractorCreate.addEventListener("click", async () => {
      const name = prompt("اسم المقاول:", "");
      if (!name) return;
      const phone = prompt("الهاتف:", "") || "";
      await api.contractor_create({ name, phone, active: 1 });
      await loadAll();
    });

    els.engineerCreate.addEventListener("click", async () => {
      const name = prompt("اسم المهندس:", "");
      if (!name) return;
      const salary_type = prompt("نوع الراتب (شهري/مقطوعة/نسبة):", "شهري") || "شهري";
      const amount = Number(prompt("المبلغ:", "0") || 0);
      await api.engineer_create({ name, salary_type, amount });
      await loadAll();
    });

    els.workerCreate.addEventListener("click", async () => {
      const name = prompt("اسم العامل:", "");
      if (!name) return;
      const salary_type = prompt("نوع الراتب (يومي/شهري/مقطوعة):", "يومي") || "يومي";
      const amount = Number(prompt("المبلغ:", "0") || 0);
      await api.worker_create({ name, salary_type, amount });
      await loadAll();
    });

    // Unit modal
    els.unitModalClose.addEventListener("click", closeModal);
    els.unitModalBack.addEventListener("click", (e) => {
      if (e.target === els.unitModalBack) closeModal();
    });

    // Save assignment
    els.assignSave.addEventListener("click", async () => {
      if (!selectedUnit) return;
      const payload = {
        contractor_id: els.assignContractor.value || null,
        engineer_id: els.assignEngineer.value || null,
        start_date: els.assignStart.value || null,
        end_date: els.assignEnd.value || null,
      };
      await api.unit_update(selectedUnit.id, payload);
      await loadAll();
      await openUnitModal(selectedUnit.id);
      alert("تم حفظ التعيين");
    });

    // Save stages
    els.stagesSave.addEventListener("click", async () => {
      if (!selectedUnit) return;
      const s = {};
      $$(`[data-stage]`, els.stagesBox).forEach(ch => {
        const key = ch.getAttribute("data-stage");
        s[key] = !!ch.checked;
      });
      await api.unit_update(selectedUnit.id, { stages: JSON.stringify(s) });
      await loadAll();
      await openUnitModal(selectedUnit.id);
      alert("تم حفظ مراحل البناء");
    });

    // Add unit worker
    els.workerAdd.addEventListener("click", async () => {
      if (!selectedUnit) return;
      const worker_id = els.workerSelect.value;
      if (!worker_id) return alert("اختر عامل");
      const work_type = (els.workerType.value || "").trim();
      if (!work_type) return alert("اكتب نوع العمل");
      await api.unit_worker_add(selectedUnit.id, {
        worker_id,
        work_type,
        from_date: null,
        to_date: null,
      });
      els.workerType.value = "";
      await refreshUnitWorkersTable(selectedUnit.id);
      await loadAll();
    });

    // Settings: API override
    els.saveApi.addEventListener("click", async () => {
      setApiBase(els.apiOverride.value);
      await refreshApiStatus();
      alert("تم حفظ رابط الـ API");
    });
    els.resetApi.addEventListener("click", async () => {
      setApiBase("");
      renderSettings();
      await refreshApiStatus();
      alert("تم الإرجاع");
    });
  }

  // -------------------------
  // Boot
  // -------------------------
  async function boot() {
    showPage("dashboard");
    await refreshApiStatus();

    try {
      await loadAll();
    } catch (e) {
      console.error(e);
      alert("تعذر تحميل البيانات. تأكد من رابط الـ API في الإعدادات.");
    }
  }

  // -------------------------
  // Utilities
  // -------------------------
  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

  // -------------------------
  // Init (Login gate)
  // -------------------------
  bindEvents();

  if (!isAuthed()) {
    els.loginBack.classList.remove("hidden");
  } else {
    els.loginBack.classList.add("hidden");
    boot();
  }

  // expose lock if you want later
  window.__lock = lock;
})();
