/* مجمع العدل السكني - تطبيق إدارة (Static/PWA) - حفظ محلي + تصدير Excel/CSV */
(() => {
  const $ = (id) => document.getElementById(id);

  // -----------------------
  // Auth (online + roles)
  // -----------------------
  const AUTH_OK_KEY    = "majma_adl_auth_ok";
  const AUTH_USER_KEY  = "majma_adl_auth_user";
  const AUTH_TOKEN_KEY = "majma_adl_auth_token";
  const AUTH_ROLE_KEY  = "majma_adl_auth_role"; // admin | engineer

  // Local fallback users (offline)
  const DEFAULT_ADMIN_USER = "admin";
  const DEFAULT_ADMIN_PASS = "@1000@";

  const ENGINEER_USER = "eng";
  const ENGINEER_PASS = "11335577";

  function getToken(){ return localStorage.getItem(AUTH_TOKEN_KEY) || ""; }
  function setToken(t){
    if(t) localStorage.setItem(AUTH_TOKEN_KEY, t);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  function setRole(role){
    sessionStorage.setItem(AUTH_ROLE_KEY, role || "admin");
  }
  function getRole(){
    return sessionStorage.getItem(AUTH_ROLE_KEY) || "admin";
  }

  function isAuthed(){
    return sessionStorage.getItem(AUTH_OK_KEY) === "1" && !!getToken();
  }
  function currentUser(){ return sessionStorage.getItem(AUTH_USER_KEY) || ""; }

  function lock(){
    sessionStorage.removeItem(AUTH_OK_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_ROLE_KEY);
    setToken("");
    location.reload();
  }

  function showLogin(show){
    const back = $("loginBack");
    if(!back) return;
    back.classList.toggle("hidden", !show);
  }

  async function apiFetch(path, opts={}){
    const headers = Object.assign({"Content-Type":"application/json"}, opts.headers||{});
    const t = getToken();
    if(t) headers["Authorization"] = "Bearer " + t;
    const res = await fetch(path, Object.assign({}, opts, {headers}));
    return res;
  }

  function roleFromUsername(u){
    if(String(u).toLowerCase() === ENGINEER_USER.toLowerCase()) return "engineer";
    return "admin";
  }

  async function tryLogin(username, password){
    const uNorm = String(username||"").trim();
    const pNorm = String(password||"");

    // Try online login first
    try{
      const res = await fetch("./api/auth/login", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({username: uNorm, password: pNorm})
      });

      if(res.ok){
        const data = await res.json();
        if(data && data.token){
          setToken(data.token);
          sessionStorage.setItem(AUTH_OK_KEY, "1");
          sessionStorage.setItem(AUTH_USER_KEY, data.username || uNorm);
          // role from server if provided, else infer from username
          setRole(data.role || roleFromUsername(data.username || uNorm));
          return true;
        }
      }
    }catch{}

    // Offline fallback
    if(uNorm === DEFAULT_ADMIN_USER && pNorm === DEFAULT_ADMIN_PASS){
      setToken("OFFLINE");
      sessionStorage.setItem(AUTH_OK_KEY, "1");
      sessionStorage.setItem(AUTH_USER_KEY, uNorm);
      setRole("admin");
      return true;
    }

    if(uNorm === ENGINEER_USER && pNorm === ENGINEER_PASS){
      setToken("OFFLINE");
      sessionStorage.setItem(AUTH_OK_KEY, "1");
      sessionStorage.setItem(AUTH_USER_KEY, uNorm);
      setRole("engineer");
      return true;
    }

    return false;
  }

  // -----------------------
  // Storage
  // -----------------------
  const DB_KEY = "majma_adl_db_v1";
  const todayISO = () => new Date().toISOString().slice(0,10);
  const fmt = new Intl.NumberFormat("ar-IQ");

  function emptyDB(){
    return {
      meta: { project: "مجمع العدل السكني", updatedAt: new Date().toISOString() },
      units: [],
      inventory_items: [],
      inventory_moves: [],
      purchases: [],
      contractors: [],
      engineers: [],
      workers: [],
      equipment: [],
      accounts: [],
      sales: [],
    };
  }

  let DB_MEM = null;
  let pushTimer = null;

  function loadDB(){
    if(DB_MEM) return DB_MEM;
    try{
      const raw = localStorage.getItem(DB_KEY);
      if(!raw){ DB_MEM = emptyDB(); return DB_MEM; }
      const d = JSON.parse(raw);
      DB_MEM = Object.assign(emptyDB(), d || {});
      return DB_MEM;
    }catch{
      DB_MEM = emptyDB();
      return DB_MEM;
    }
  }

  async function syncFromServer(){
    const t = getToken();
    if(!t || t==="OFFLINE") return false;
    try{
      const res = await apiFetch("./api/db", {method:"GET"});
      if(res.status===401){ lock(); return false; }
      if(!res.ok) return false;
      const data = await res.json();
      if(data && typeof data==="object"){
        DB_MEM = Object.assign(emptyDB(), data);
        localStorage.setItem(DB_KEY, JSON.stringify(DB_MEM));
        return true;
      }
    }catch{}
    return false;
  }

  function schedulePush(){
    const t = getToken();
    if(!t || t==="OFFLINE") return;
    if(pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async ()=>{
      try{
        const db = loadDB();
        await apiFetch("./api/db", {method:"PUT", body: JSON.stringify(db)});
      }catch{}
    }, 700);
  }

  function saveDB(db){
    db.meta.updatedAt = new Date().toISOString();
    DB_MEM = db;
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    schedulePush();
  }

  function uid(){
    return Math.floor(Date.now() + Math.random()*1000000);
  }

  // CSV helpers
  const esc = (v) => {
    const s = (v===null || v===undefined) ? "" : String(v);
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  function toCSV(rows, headers){
    const head = headers.map(h=>esc(h.label)).join(",");
    const body = rows.map(r => headers.map(h=>esc(r[h.key])).join(",")).join("\n");
    return head + "\n" + body;
  }
  function downloadText(filename, text, mime="text/plain;charset=utf-8"){
    const blob = new Blob([text], {type:mime});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function downloadExcelHtml(filename, title, headers, rows){
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <table border="1">
        <tr><th colspan="${headers.length}" style="font-size:16px">${title}</th></tr>
        <tr>${headers.map(h=>`<th>${String(h.label)}</th>`).join("")}</tr>
        ${rows.map(r=>`<tr>${headers.map(h=>`<td>${String(r[h.key] ?? "")}</td>`).join("")}</tr>`).join("")}
      </table>
    </body></html>`;
    downloadText(filename, html, "application/vnd.ms-excel;charset=utf-8");
  }

  function parseCSV(text){
    const rows = [];
    let i=0, cur="", inQ=false, row=[];
    while(i<text.length){
      const ch = text[i];
      if(inQ){
        if(ch === '"'){
          if(text[i+1] === '"'){ cur+='"'; i+=2; continue; }
          inQ=false; i++; continue;
        }
        cur+=ch; i++; continue;
      }else{
        if(ch === '"'){ inQ=true; i++; continue; }
        if(ch === ','){ row.push(cur); cur=""; i++; continue; }
        if(ch === '\n'){ row.push(cur); rows.push(row); row=[]; cur=""; i++; continue; }
        if(ch === '\r'){ i++; continue; }
        cur+=ch; i++; continue;
      }
    }
    row.push(cur);
    rows.push(row);
    return rows;
  }

  async function readFileText(file){
    return await new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result||""));
      fr.onerror = rej;
      fr.readAsText(file, "utf-8");
    });
  }

  // -----------------------
  // Backup / Restore (JSON)
  // -----------------------
  function exportBackupJSON(){
    const db = loadDB();
    const fname = `majma_adl_backup_${todayISO()}.json`;
    downloadText(fname, JSON.stringify(db, null, 2), "application/json;charset=utf-8");
  }

  async function importBackupJSON(file){
    const text = await readFileText(file);
    try{
      const obj = JSON.parse(text);
      const merged = Object.assign(emptyDB(), obj || {});
      localStorage.setItem(DB_KEY, JSON.stringify(merged));
      DB_MEM = merged;
      alert("✅ تم الاستيراد بنجاح.");
      renderAll();
    }catch{
      alert("❌ ملف JSON غير صالح.");
    }
  }

  // -----------------------
  // UI Shell + Role Guard
  // -----------------------
  const nav = $("nav");
  const pageTitle = $("pageTitle");

  function canAccess(pageKey){
    const role = getRole();
    if(role === "engineer"){
      return pageKey === "engineers"; // ✅ المهندس يشوف المهندسون فقط
    }
    return true; // admin يشوف الكل
  }

  function applyRoleUI(){
    const role = getRole();

    // اخفي عناصر القائمة حسب الصلاحية
    document.querySelectorAll(".nav__item").forEach(btn=>{
      const k = btn.dataset.page;
      btn.style.display = canAccess(k) ? "" : "none";
    });

    // زر seed فقط للادمن
    if($("seedBtn")){
      $("seedBtn").style.display = (role === "admin") ? "" : "none";
    }
  }

  function showPage(key){
    // Guard
    if(!canAccess(key)){
      key = "engineers";
    }

    document.querySelectorAll(".nav__item").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));

    document.querySelector(`[data-page="${key}"]`)?.classList.add("active");
    $("page-"+key)?.classList.remove("hidden");

    const titles={
      dashboard:"الرئيسية",
      units:"الوحدات السكنية",
      inventory:"المخزن",
      purchases:"المشتريات",
      contractors:"المقاولون",
      engineers:"المهندسون",
      workers:"العمال",
      equipment:"المعدات",
      accounts:"الحسابات",
      sales:"المبيعات",
      reports:"التقارير",
      settings:"الإعدادات",
    };
    pageTitle.textContent = titles[key] || "الرئيسية";
    renderPage(key);
  }

  nav?.addEventListener("click",(e)=>{
    const btn = e.target.closest(".nav__item");
    if(!btn) return;
    showPage(btn.dataset.page);
  });

  // -----------------------
  // Modules (generic CRUD)
  // -----------------------
  const Modules = {
    units: {
      title: "الوحدات السكنية",
      store: "units",
      help: "إدارة الوحدات (منجزة/قيد التنفيذ/غير بادئة) + نسبة الإنجاز + ملاحظات.",
      fields: [
        {key:"رقم_الوحدة", label:"رقم الوحدة", type:"text", required:true},
        {key:"البلوك", label:"البلوك", type:"text"},
        {key:"الحالة", label:"الحالة", type:"select", options:["غير بادئة","قيد التنفيذ","مكتملة","موقوف"]},
        {key:"نسبة_الانجاز", label:"نسبة الإنجاز %", type:"number", min:0, max:100, step:0.1},
        {key:"المقاول", label:"المقاول", type:"text"},
        {key:"المهندس", label:"المهندس", type:"text"},
        {key:"تاريخ_البدء", label:"تاريخ البدء", type:"date"},
        {key:"تاريخ_الانجاز", label:"تاريخ الإنجاز", type:"date"},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({الحالة:"غير بادئة", نسبة_الانجاز:0}),
      seed: (db) => {
        if(db.units.length) return;
        for(let i=1;i<=500;i++){
          db.units.push({id:uid(), رقم_الوحدة:String(i).padStart(3,"0"), البلوك:"A", الحالة:"غير بادئة", نسبة_الانجاز:0});
        }
      }
    },

    purchases: {
      title: "المشتريات",
      store: "purchases",
      help: "شراء مواد: نقد/آجل + مبالغ مدفوعة/متبقية + تفاصيل.",
      fields: [
        {key:"التاريخ", label:"التاريخ", type:"date", required:true},
        {key:"المورد", label:"المورد", type:"text"},
        {key:"الفئة", label:"الفئة", type:"select", options:["مواد إنشائية","حصى","طابوق","رمل","سمنت","جص","بورك","أخرى"]},
        {key:"نوع_الدفع", label:"نوع الدفع", type:"select", options:["نقد","آجل"]},
        {key:"الإجمالي", label:"الإجمالي", type:"number", step:1},
        {key:"المدفوع", label:"المدفوع", type:"number", step:1},
        {key:"المتبقي", label:"المتبقي", type:"number", step:1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({التاريخ: todayISO(), نوع_الدفع:"نقد", الإجمالي:0, المدفوع:0, المتبقي:0}),
      afterSave: (db, row) => {
        const paid = Number(row.المدفوع || 0);
        if(paid > 0){
          db.accounts.push({id:uid(), التاريخ: row.التاريخ || todayISO(), النوع:"مصروف", الفئة:"مشتريات", الوصف:`مشتريات - ${row.المورد||""}`.trim(), المبلغ: paid});
        }
      }
    },

    contractors: {
      title:"المقاولون",
      store:"contractors",
      help:"بيانات المقاولين + سلف/دفعات/تسديد.",
      fields:[
        {key:"اسم_المقاول", label:"اسم المقاول", type:"text", required:true},
        {key:"الهاتف", label:"الهاتف", type:"text"},
        {key:"نسبة_الانجاز", label:"نسبة الإنجاز %", type:"number", min:0, max:100, step:0.1},
        {key:"سلفة", label:"سلفة", type:"number", step:1},
        {key:"مبلغ_متفق", label:"المبلغ المتفق", type:"number", step:1},
        {key:"المدفوع", label:"المدفوع", type:"number", step:1},
        {key:"المتبقي", label:"المتبقي", type:"number", step:1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({نسبة_الانجاز:0, سلفة:0, مبلغ_متفق:0, المدفوع:0, المتبقي:0})
    },

    engineers: {
      title:"المهندسون",
      store:"engineers",
      help:"رواتب يومية/أسبوعية/شهرية + مراحل العمل + نسبة الإنجاز.",
      fields:[
        {key:"الاسم", label:"الاسم", type:"text", required:true},
        {key:"الهاتف", label:"الهاتف", type:"text"},
        {key:"نوع_الراتب", label:"نوع الراتب", type:"select", options:["يومي","أسبوعي","شهري"]},
        {key:"المبلغ", label:"المبلغ", type:"number", step:1},
        {key:"نسبة_الانجاز", label:"نسبة الإنجاز %", type:"number", min:0, max:100, step:0.1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({نوع_الراتب:"شهري", المبلغ:0, نسبة_الانجاز:0})
    },

    workers: {
      title:"العمال",
      store:"workers",
      help:"إدارة العمال + رواتب يومية/أسبوعية/شهرية + خصم.",
      fields:[
        {key:"الاسم", label:"الاسم", type:"text", required:true},
        {key:"الهاتف", label:"الهاتف", type:"text"},
        {key:"نوع_الراتب", label:"نوع الراتب", type:"select", options:["يومي","أسبوعي","شهري"]},
        {key:"المبلغ", label:"المبلغ", type:"number", step:1},
        {key:"خصم", label:"خصم", type:"number", step:1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({نوع_الراتب:"يومي", المبلغ:0, خصم:0})
    },

    equipment: {
      title:"المعدات",
      store:"equipment",
      help:"الآليات/المعدات + السائق + رواتب + أعطال وتصليح وخصم.",
      fields:[
        {key:"اسم_المعدة", label:"اسم المعدة", type:"text", required:true},
        {key:"النوع", label:"النوع", type:"select", options:["حفارة","قلابة","لودر","رافعة","مولدة","مضخة","أخرى"]},
        {key:"السائق", label:"السائق", type:"text"},
        {key:"نوع_الراتب", label:"نوع الراتب", type:"select", options:["يومي","أسبوعي","شهري"]},
        {key:"راتب_السائق", label:"راتب السائق", type:"number", step:1},
        {key:"اعطال_وتصليح", label:"أعطال/تصليح", type:"number", step:1},
        {key:"خصم", label:"خصم", type:"number", step:1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({نوع_الراتب:"شهري", راتب_السائق:0, اعطال_وتصليح:0, خصم:0})
    },

    accounts: {
      title:"الحسابات",
      store:"accounts",
      help:"الرصيد (إيداع/سحب) + صرف رواتب + تسديد فواتير + نثرية/ضيافة/تعامل خارجي...",
      fields:[
        {key:"التاريخ", label:"التاريخ", type:"date", required:true},
        {key:"النوع", label:"النوع", type:"select", options:["إيداع","سحب","مصروف"]},
        {key:"الفئة", label:"الفئة", type:"select", options:["رواتب","مقاولين","مشتريات","فواتير","نثرية","ضيافة","تعامل خارجي","أخرى"]},
        {key:"الوصف", label:"الوصف", type:"text"},
        {key:"المبلغ", label:"المبلغ", type:"number", step:1},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({التاريخ: todayISO(), النوع:"مصروف", الفئة:"أخرى", المبلغ:0})
    },

    sales: {
      title:"المبيعات",
      store:"sales",
      help:"إدارة مبيعات الوحدات (محجوزة/مباعة/متاحة) + مبالغ.",
      fields:[
        {key:"رقم_الوحدة", label:"رقم الوحدة", type:"text", required:true},
        {key:"التاريخ", label:"التاريخ", type:"date"},
        {key:"الحالة", label:"الحالة", type:"select", options:["محجوزة","مباعة","متاحة"]},
        {key:"السعر", label:"السعر", type:"number", step:1},
        {key:"المدفوع", label:"المدفوع", type:"number", step:1},
        {key:"المتبقي", label:"المتبقي", type:"number", step:1},
        {key:"المشتري", label:"المشتري", type:"text"},
        {key:"ملاحظات", label:"ملاحظات", type:"textarea"},
      ],
      defaultRow: () => ({التاريخ: todayISO(), الحالة:"متاحة", السعر:0, المدفوع:0, المتبقي:0}),
      afterSave: (db, row) => {
        const paid = Number(row.المدفوع||0);
        if(paid>0){
          db.accounts.push({id:uid(), التاريخ: row.التاريخ || todayISO(), النوع:"إيداع", الفئة:"أخرى", الوصف:`دفعة بيع وحدة ${row.رقم_الوحدة}`, المبلغ: paid});
        }
      }
    },
  };

  function normalizeRow(fields, row){
    const out = {};
    fields.forEach(f=>{
      let v = row[f.key];
      if(f.type==="number"){
        v = (v===""||v===null||v===undefined) ? 0 : Number(v);
        if(Number.isNaN(v)) v = 0;
      }
      out[f.key]=v;
    });
    return out;
  }

  function buildGenericPage(key){
    const m = Modules[key];
    const el = $("page-"+key);
    if(!el) return;

    const cols = (m.fields || []).map(f=>`<th>${f.label}</th>`).join("");
    el.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__left">
          <h2>${m.title}</h2>
          <div class="small dim">${m.help || ""}</div>
        </div>
        <div class="toolbar__right tableActions">
          ${m.seed ? `<button class="btn" id="${key}SeedBtn">توليد 500 وحدة</button>` : ``}
          <input class="input" id="${key}Search" placeholder="بحث..." />
          <button class="btn" id="${key}Refresh">تحديث</button>
          <button class="btn btn--primary" id="${key}Create">+ إضافة</button>
          <button class="btn" id="${key}ExportCsv">تصدير CSV</button>
          <button class="btn" id="${key}ExportXls">تصدير Excel</button>
          <label class="btn" for="${key}ImportFile" style="cursor:pointer">استيراد CSV</label>
          <input id="${key}ImportFile" type="file" accept=".csv" style="display:none" />
        </div>
      </div>
      <div class="tableWrap">
        <table class="table">
          <thead><tr><th>إجراء</th>${cols}</tr></thead>
          <tbody id="${key}Tbody"></tbody>
        </table>
      </div>
      <div class="hint">ملاحظة: يمكنك تصدير Excel/CSV ثم فتحه على أي جهاز. (الاستيراد من CSV يدعم نفس الأعمدة).</div>
    `;

    const hook = (id, fn) => $(id)?.addEventListener("click", fn);

    hook(`${key}Refresh`, ()=> renderGenericTable(key));
    $(`${key}Search`)?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") renderGenericTable(key); });

    hook(`${key}Create`, ()=> openModalFor(key, null));

    if(m.seed){
      hook(`${key}SeedBtn`, ()=>{
        const db = loadDB();
        m.seed(db);
        saveDB(db);
        renderAll();
      });
    }

    hook(`${key}ExportCsv`, ()=> exportModule(key, "csv"));
    hook(`${key}ExportXls`, ()=> exportModule(key, "xls"));
    $(`${key}ImportFile`)?.addEventListener("change", async (e)=>{
      const file = e.target.files?.[0];
      e.target.value = "";
      if(!file) return;
      const text = await readFileText(file);
      importModuleCSV(key, text);
    });

    renderGenericTable(key);
  }

  function renderGenericTable(key){
    const m = Modules[key];
    const db = loadDB();
    const arr = db[m.store] || [];
    const q = ($(`${key}Search`)?.value || "").trim().toLowerCase();
    const rows = q ? arr.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : arr;

    const tbody = $(`${key}Tbody`);
    if(!tbody) return;

    tbody.innerHTML = rows.map(r => {
      const cells = (m.fields||[]).map(f=>{
        const v = r[f.key];
        const s = f.type==="number" ? fmt.format(Number(v||0)) : (v ?? "");
        return `<td>${String(s)}</td>`;
      }).join("");
      return `<tr>
        <td><button class="btn" data-edit="${key}:${r.id}">عرض</button></td>
        ${cells}
      </tr>`;
    }).join("") || `<tr><td colspan="${(m.fields||[]).length+1}" class="small">لا توجد بيانات.</td></tr>`;

    tbody.onclick = (e)=>{
      const btn = e.target.closest("[data-edit]");
      if(!btn) return;
      const [k, id] = btn.dataset.edit.split(":");
      openModalFor(k, Number(id));
    };

    refreshKPIs(db);
  }

  function exportModule(key, mode){
    const m = Modules[key];
    const db = loadDB();
    const rows = (db[m.store] || []).map(r=>{
      const out={};
      (m.fields||[]).forEach(f=> out[f.key]=r[f.key] ?? "");
      return out;
    });
    const headers = (m.fields||[]).map(f=>({key:f.key, label:f.label}));
    const fnameBase = `majma_adl_${key}_${todayISO()}`;
    if(mode==="csv"){
      downloadText(`${fnameBase}.csv`, toCSV(rows, headers), "text/csv;charset=utf-8");
    }else{
      downloadExcelHtml(`${fnameBase}.xls`, m.title, headers, rows);
    }
  }

  function importModuleCSV(key, csvText){
    const m = Modules[key];
    const parsed = parseCSV(csvText);
    if(!parsed.length) return alert("ملف CSV فارغ.");
    const head = parsed[0];
    const map = {};
    head.forEach((h, i)=>{ map[h.trim()] = i; });

    const missing = (m.fields||[]).filter(f=> map[f.key]===undefined && map[f.label]===undefined);
    if(missing.length){
      alert("أعمدة ناقصة في CSV: " + missing.map(x=>x.key).join(", "));
      return;
    }

    const db = loadDB();
    const arr = db[m.store] || [];
    const byId = new Map(arr.map(x=>[String(x.id), x]));
    let added=0, updated=0;

    for(let r=1; r<parsed.length; r++){
      const row = parsed[r];
      if(row.length===1 && row[0]==="") continue;
      const obj = { id: uid() };
      (m.fields||[]).forEach(f=>{
        const idx = (map[f.key]!==undefined) ? map[f.key] : map[f.label];
        obj[f.key] = row[idx] ?? "";
      });

      const idIdx = map["id"];
      if(idIdx!==undefined && row[idIdx]){
        const sid = String(row[idIdx]);
        const existing = byId.get(sid);
        if(existing){
          Object.assign(existing, normalizeRow(m.fields, obj));
          existing.id = Number(sid);
          updated++;
          continue;
        }else{
          obj.id = Number(sid);
        }
      }
      arr.push(Object.assign({}, m.defaultRow ? m.defaultRow() : {}, normalizeRow(m.fields, obj)));
      added++;
    }
    db[m.store] = arr;
    saveDB(db);
    renderAll();
    alert(`تم الاستيراد: إضافة ${added} | تحديث ${updated}`);
  }

  // -----------------------
  // Modal (Add/Edit/Delete) - يعتمد على #modalBack
  // -----------------------
  const modalBack = $("modalBack");
  const modalTitle = $("modalTitle");
  const modalSub = $("modalSub");
  const modalForm = $("modalForm");
  const modalClose = $("modalClose");
  const modalSave = $("modalSave");
  const modalDelete = $("modalDelete");
  let modalCtx = { key:null, id:null };

  function openModalFor(key, id){
    const m = Modules[key];
    if(!m || !m.fields) return;

    // Guard للمهندس: فقط engineers
    if(!canAccess(key)) return showPage("engineers");

    const db = loadDB();
    const arr = db[m.store] || [];
    const row = id ? arr.find(x=>x.id===id) : null;

    modalCtx = { key, id };
    modalTitle.textContent = (id ? "تعديل" : "إضافة") + " - " + m.title;
    modalSub.textContent = id ? ("ID: "+id) : "—";
    modalBack.classList.remove("hidden");

    modalForm.innerHTML = m.fields.map(f=>{
      const v = row ? (row[f.key] ?? "") : (m.defaultRow ? (m.defaultRow()[f.key] ?? "") : "");
      const req = f.required ? "required" : "";
      if(f.type==="select"){
        const opts = (f.options||[]).map(o=>{
          const sel = String(o)===String(v) ? "selected" : "";
          return `<option value="${String(o)}" ${sel}>${String(o)}</option>`;
        }).join("");
        return `<div>
          <label>${f.label}${f.required? " *":""}</label>
          <select class="input" data-k="${f.key}" ${req}>${opts}</select>
        </div>`;
      }
      if(f.type==="textarea"){
        return `<div>
          <label>${f.label}</label>
          <textarea class="input" data-k="${f.key}" rows="3" style="min-height:90px">${String(v)}</textarea>
        </div>`;
      }
      const attrs = [];
      if(f.min!==undefined) attrs.push(`min="${f.min}"`);
      if(f.max!==undefined) attrs.push(`max="${f.max}"`);
      if(f.step!==undefined) attrs.push(`step="${f.step}"`);
      return `<div>
        <label>${f.label}${f.required? " *":""}</label>
        <input class="input" data-k="${f.key}" type="${f.type||"text"}" value="${String(v)}" ${req} ${attrs.join(" ")} />
      </div>`;
    }).join("");

    modalDelete.style.display = id ? "inline-block" : "none";
  }

  function closeModal(){ modalBack.classList.add("hidden"); }
  modalClose?.addEventListener("click", closeModal);
  modalBack?.addEventListener("click",(e)=>{ if(e.target===modalBack) closeModal(); });

  modalSave?.addEventListener("click", ()=>{
    const {key, id} = modalCtx;
    const m = Modules[key];
    if(!m) return;

    // Guard للمهندس
    if(!canAccess(key)) return showPage("engineers");

    const db = loadDB();
    const arr = db[m.store] || [];

    const obj = { id: id || uid() };
    let ok = true;

    (m.fields||[]).forEach(f=>{
      const el = modalForm.querySelector(`[data-k="${CSS.escape(f.key)}"]`);
      if(!el) return;
      let v = el.value;
      if(f.required && !String(v||"").trim()) ok=false;
      if(f.type==="number") v = Number(v||0);
      obj[f.key] = v;
    });

    if(!ok) return alert("أكمل الحقول المطلوبة (*)");

    const normalized = Object.assign({}, m.defaultRow? m.defaultRow():{}, normalizeRow(m.fields, obj));
    if(id){
      const idx = arr.findIndex(x=>x.id===id);
      if(idx>=0) arr[idx] = Object.assign(arr[idx], normalized);
    }else{
      arr.push(normalized);
    }
    db[m.store] = arr;

    if(typeof m.afterSave === "function"){
      try{ m.afterSave(db, normalized); }catch{}
    }

    saveDB(db);
    closeModal();
    renderAll();
  });

  modalDelete?.addEventListener("click", ()=>{
    const {key, id} = modalCtx;
    if(!id) return;

    // Guard للمهندس
    if(!canAccess(key)) return showPage("engineers");

    if(!confirm("تأكيد الحذف؟")) return;
    const m = Modules[key];
    const db = loadDB();
    const arr = db[m.store] || [];
    db[m.store] = arr.filter(x=>x.id!==id);
    saveDB(db);
    closeModal();
    renderAll();
  });

  // -----------------------
  // Render routing
  // -----------------------
  function renderPage(key){
    if(key==="dashboard"){ renderDashboard(); return; }
    const m = Modules[key];
    if(!m) return;
    buildGenericPage(key);
  }

  function renderDashboard(){
    const db = loadDB();
    refreshKPIs(db);
  }

  function refreshKPIs(db){
    const units = db.units || [];
    const totalUnits = units.length;
    const inProg = units.filter(u=>u.الحالة==="قيد التنفيذ").length;
    const done = units.filter(u=>u.الحالة==="مكتملة").length;

    $("kpiUnits") && ($("kpiUnits").textContent = fmt.format(totalUnits));
    $("kpiInProgress") && ($("kpiInProgress").textContent = fmt.format(inProg));
    $("kpiDone") && ($("kpiDone").textContent = fmt.format(done));

    let balance = 0;
    (db.accounts||[]).forEach(x=>{
      const amt = Number(x.المبلغ||0);
      if(x.النوع==="إيداع") balance += amt;
      else balance -= amt;
    });
    $("kpiBalance") && ($("kpiBalance").textContent = fmt.format(balance));

    $("statItems") && ($("statItems").textContent = fmt.format((db.inventory_items||[]).length));
    const purTotal = (db.purchases||[]).reduce((s,p)=>s+Number(p.الإجمالي||0),0);
    $("statPurchases") && ($("statPurchases").textContent = fmt.format(purTotal));
    const expTotal = (db.accounts||[]).filter(x=>x.النوع==="مصروف").reduce((s,x)=>s+Number(x.المبلغ||0),0);
    $("statExpenses") && ($("statExpenses").textContent = fmt.format(expTotal));
  }

  function renderAll(){
    const db = loadDB();
    refreshKPIs(db);
    const active = document.querySelector(".nav__item.active")?.dataset.page || (getRole()==="engineer" ? "engineers" : "dashboard");
    renderPage(active);
  }

  // -----------------------
  // Settings buttons (if موجودة بالـ HTML)
  // -----------------------
  $("exportJsonBtn")?.addEventListener("click", exportBackupJSON);

  $("importJsonFile")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    e.target.value = "";
    if(!f) return;
    await importBackupJSON(f);
  });

  $("wipeBtn")?.addEventListener("click", ()=>{
    if(!confirm("سيتم حذف كل البيانات المحفوظة محلياً. هل أنت متأكد؟")) return;
    localStorage.removeItem(DB_KEY);
    DB_MEM = null;
    alert("✅ تم حذف البيانات.");
    renderAll();
  });

  // زر توليد 500 وحدة (الهيدر) - admin فقط
  $("seedBtn")?.addEventListener("click", ()=>{
    if(getRole() !== "admin") return; // حماية إضافية
    const db = loadDB();
    Modules.units.seed(db);
    saveDB(db);
    renderAll();
    alert("✅ تم توليد/تثبيت 500 وحدة (إذا كانت موجودة مسبقاً لن تتكرر).");
  });

  // -----------------------
  // PWA
  // -----------------------
  async function registerSW(){
    if(!("serviceWorker" in navigator)) return;
    try{ await navigator.serviceWorker.register("./sw.js"); }catch{}
  }

  // -----------------------
  // Boot
  // -----------------------
  async function boot(){
    if(!isAuthed()){
      showLogin(true);
      const btn = $("loginBtn");
      const inpUser = $("loginUser");
      const inpPass = $("loginPass");

      const doLogin = async ()=>{
        const u = (inpUser?.value || "").trim();
        const p = (inpPass?.value || "");
        if(!u || !p) return alert("اكتب اسم المستخدم وكلمة المرور.");
        const ok = await tryLogin(u, p);
        if(ok){
          showLogin(false);
          if(inpPass) inpPass.value = "";
          await syncFromServer();

          applyRoleUI();

          // ✅ توجيه حسب الدور
          if(getRole() === "engineer"){
            showPage("engineers");
          }else{
            showPage("dashboard");
          }
          renderAll();
        }else{
          alert("بيانات الدخول غير صحيحة.");
        }
      };

      btn?.addEventListener("click", doLogin);
      inpPass?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doLogin(); });
      return;
    }

    showLogin(false);
    await syncFromServer();

    applyRoleUI();

    const db = loadDB();
    // seed للادمن فقط
    if(getRole() === "admin"){
      Modules.units.seed(db);
      saveDB(db);
    }

    registerSW();

    // ✅ توجيه حسب الدور
    if(getRole() === "engineer"){
      showPage("engineers");
    }else{
      showPage("dashboard");
    }
    renderAll();
  }

  boot();
})();
