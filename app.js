/* مجمع العدل السكني - تطبيق إدارة (Static/PWA) - حفظ محلي + تصدير Excel/CSV */
(() => {
  const $ = (id) => document.getElementById(id);


  // -----------------------
  // Auth (online + multi users)
  // -----------------------
  const AUTH_OK_KEY = "majma_adl_auth_ok";
  const AUTH_USER_KEY = "majma_adl_auth_user";
  const AUTH_TOKEN_KEY = "majma_adl_auth_token";
  const DEFAULT_ADMIN_USER = "admin";
  const DEFAULT_ADMIN_PASS = "@1000@";

  function getToken(){ return localStorage.getItem(AUTH_TOKEN_KEY) || ""; }
  function setToken(t){ 
    if(t) localStorage.setItem(AUTH_TOKEN_KEY, t);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  function isAuthed(){ return sessionStorage.getItem(AUTH_OK_KEY) === "1" && !!getToken(); }
  function currentUser(){ return sessionStorage.getItem(AUTH_USER_KEY) || ""; }
  function lock(){
    sessionStorage.removeItem(AUTH_OK_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
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

  async function tryLogin(username, password){
    // Try online login first
    try{
      const res = await fetch("./api/auth/login", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({username, password})
      });
      if(res.ok){
        const data = await res.json();
        if(data && data.token){
          setToken(data.token);
          sessionStorage.setItem(AUTH_OK_KEY, "1");
          sessionStorage.setItem(AUTH_USER_KEY, data.username || username);
          return true;
        }
      }
    }catch{}
    // Fallback: local emergency admin (offline)
    if(username === DEFAULT_ADMIN_USER && password === DEFAULT_ADMIN_PASS){
      // Offline token (not accepted by server, but lets UI open offline)
      setToken("OFFLINE");
      sessionStorage.setItem(AUTH_OK_KEY, "1");
      sessionStorage.setItem(AUTH_USER_KEY, username);
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
    // Excel يفتح HTML كـ .xls
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
    // parser بسيط (يدعم Quotes)
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
  // UI Shell
  // -----------------------
  const nav = $("nav");
  const pageTitle = $("pageTitle");

  function showPage(key){
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

    inventory: {
      title: "المخزن",
      store: "inventory_items",
      help: "تعريف الأصناف (مواد إنشائية/كهرباء/ماء/صحية/سيراميك/أصباغ/زجاج/حديد/ألمنيوم...) + حركات دخول/خروج.",
      customRender: renderInventory,
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
        // تسجيل عملية بالحسابات تلقائياً إذا المدفوع > 0
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
      help:"إدارة مبيعات الوحدات (منجزة/غير منجزة/نسبة الإنجاز) + مبالغ.",
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

    reports: {
      title:"التقارير",
      store:null,
      help:"تقارير يومي/أسبوعي/شهري (مشتريات/حسابات/مبيعات/رواتب) مع فلترة بالتاريخ.",
      customRender: renderReports,
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
    $( `${key}Search`)?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") renderGenericTable(key); });

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
      // إذا يوجد id في الأعمدة نستخدمه للتحديث
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
  // Modal (Add/Edit/Delete)
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
    const db = loadDB();
    const arr = db[m.store] || [];
    const row = id ? arr.find(x=>x.id===id) : null;

    modalCtx = { key, id };
    modalTitle.textContent = (id ? "تعديل" : "إضافة") + " - " + m.title;
    modalSub.textContent = id ? ("ID: "+id) : "—";
    modalBack.classList.remove("hidden");

    // Build form
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

    // afterSave hook
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
  // Inventory (custom)
  // -----------------------
  function renderInventory(){
    const el = $("page-inventory");
    if(!el) return;

    el.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__left">
          <h2>المخزن</h2>
          <div class="small dim">أصناف + حركات (دخول/خروج) + المتبقي تلقائياً.</div>
        </div>
        <div class="toolbar__right tableActions">
          <button class="btn btn--primary" id="invAddItem">+ إضافة صنف</button>
          <button class="btn" id="invAddMoveIn">+ دخول</button>
          <button class="btn" id="invAddMoveOut">+ خروج</button>
          <button class="btn" id="invExportItemsXls">تصدير الأصناف Excel</button>
          <button class="btn" id="invExportMovesXls">تصدير الحركات Excel</button>
        </div>
      </div>

      <div class="grid2">
        <div class="card inner">
          <h3>الأصناف</h3>
          <input class="input" id="invSearch" placeholder="بحث..." style="width:100%; margin-bottom:10px" />
          <div class="tableWrap">
            <table class="table" style="min-width:720px">
              <thead><tr><th>إجراء</th><th>الصنف</th><th>الفئة</th><th>الوحدة</th><th>المتبقي</th></tr></thead>
              <tbody id="invItemsTbody"></tbody>
            </table>
          </div>
        </div>

        <div class="card inner">
          <h3>حركات المخزن</h3>
          <div class="row" style="margin-bottom:10px">
            <input class="input" id="invMovesFrom" type="date" />
            <input class="input" id="invMovesTo" type="date" />
            <button class="btn" id="invMovesFilter">فلترة</button>
          </div>
          <div class="tableWrap">
            <table class="table" style="min-width:820px">
              <thead><tr><th>إجراء</th><th>التاريخ</th><th>النوع</th><th>الصنف</th><th>الكمية</th><th>ملاحظة</th></tr></thead>
              <tbody id="invMovesTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="hint">الفئات المقترحة: مواد إنشائية / كهرباء / ماء / صحية / سيراميك / أصباغ / زجاج / حديد / ألمنيوم / أبواب / أخرى.</div>
    `;

    $("invAddItem")?.addEventListener("click", ()=> openInventoryItemModal(null));
    $("invAddMoveIn")?.addEventListener("click", ()=> openInventoryMoveModal(null, "دخول"));
    $("invAddMoveOut")?.addEventListener("click", ()=> openInventoryMoveModal(null, "خروج"));
    $("invExportItemsXls")?.addEventListener("click", ()=> exportInventory("items"));
    $("invExportMovesXls")?.addEventListener("click", ()=> exportInventory("moves"));

    $("invMovesFilter")?.addEventListener("click", ()=> renderInventoryTables());
    $("invSearch")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") renderInventoryTables(); });

    renderInventoryTables();
  }

  function stockForItem(db, itemId){
    let stock = 0;
    (db.inventory_moves||[]).forEach(m=>{
      if(Number(m.معرف_الصنف) !== Number(itemId)) return;
      const q = Number(m.الكمية||0);
      stock += (m.النوع === "دخول") ? q : -q;
    });
    return stock;
  }

  function renderInventoryTables(){
    const db = loadDB();
    const q = ($("invSearch")?.value || "").trim().toLowerCase();
    const items = (db.inventory_items||[]).map(it => ({
      ...it,
      المتبقي: stockForItem(db, it.id)
    })).filter(it => q ? JSON.stringify(it).toLowerCase().includes(q) : true);

    const itBody = $("invItemsTbody");
    if(itBody){
      itBody.innerHTML = items.map(it=>`
        <tr>
          <td><button class="btn" data-it="${it.id}">عرض</button></td>
          <td>${it.اسم_الصنف||""}</td>
          <td>${it.الفئة||""}</td>
          <td>${it.الوحدة||""}</td>
          <td>${fmt.format(Number(it.المتبقي||0))}</td>
        </tr>
      `).join("") || `<tr><td colspan="5" class="small">لا توجد أصناف.</td></tr>`;
      itBody.onclick = (e)=>{
        const b = e.target.closest("[data-it]");
        if(!b) return;
        openInventoryItemModal(Number(b.dataset.it));
      };
    }

    // Moves
    const from = $("invMovesFrom")?.value || "";
    const to = $("invMovesTo")?.value || "";
    const moves = (db.inventory_moves||[]).filter(m=>{
      const d = m.التاريخ || "";
      if(from && d < from) return false;
      if(to && d > to) return false;
      return true;
    }).sort((a,b)=>(b.التاريخ||"").localeCompare(a.التاريخ||""));

    const mvBody = $("invMovesTbody");
    if(mvBody){
      mvBody.innerHTML = moves.map(m=>{
        const item = (db.inventory_items||[]).find(it=>it.id===Number(m.معرف_الصنف));
        return `<tr>
          <td><button class="btn" data-mv="${m.id}">عرض</button></td>
          <td>${m.التاريخ||""}</td>
          <td>${m.النوع||""}</td>
          <td>${item?.اسم_الصنف || "-"}</td>
          <td>${fmt.format(Number(m.الكمية||0))}</td>
          <td>${m.ملاحظة||""}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="6" class="small">لا توجد حركات.</td></tr>`;
      mvBody.onclick = (e)=>{
        const b = e.target.closest("[data-mv]");
        if(!b) return;
        openInventoryMoveModal(Number(b.dataset.mv), null);
      };
    }

    refreshKPIs(db);
  }

  function openInventoryItemModal(id){
    const db = loadDB();
    const arr = db.inventory_items || [];
    const row = id ? arr.find(x=>x.id===id) : null;

    modalCtx = { key:"inventory_item", id };
    modalTitle.textContent = (id?"تعديل":"إضافة") + " - صنف مخزن";
    modalSub.textContent = id ? ("ID: "+id) : "—";
    modalBack.classList.remove("hidden");

    const val = (k, def="") => row ? (row[k] ?? def) : def;

    modalForm.innerHTML = `
      <div><label>اسم الصنف *</label><input class="input" data-k="اسم_الصنف" value="${String(val("اسم_الصنف",""))}" /></div>
      <div><label>الفئة</label>
        <select class="input" data-k="الفئة">
          ${["مواد إنشائية","كهرباء","ماء","صحية","سيراميك","أصباغ","زجاج","حديد","ألمنيوم","أبواب","أخرى"].map(o=>{
            const sel = o===val("الفئة","مواد إنشائية") ? "selected" : "";
            return `<option ${sel} value="${o}">${o}</option>`;
          }).join("")}
        </select>
      </div>
      <div><label>الوحدة (طن/صنف/م/كيس...)</label><input class="input" data-k="الوحدة" value="${String(val("الوحدة",""))}" /></div>
      <div><label>ملاحظات</label><textarea class="input" data-k="ملاحظات" rows="3" style="min-height:90px">${String(val("ملاحظات",""))}</textarea></div>
      <div class="hint">المتبقي يُحسب تلقائياً من الحركات (دخول/خروج).</div>
    `;
    modalDelete.style.display = id ? "inline-block" : "none";
  }

  function openInventoryMoveModal(id, forcedType){
    const db = loadDB();
    const moves = db.inventory_moves || [];
    const items = db.inventory_items || [];
    const row = id ? moves.find(x=>x.id===id) : null;

    if(!items.length){
      alert("أضف صنف أولاً.");
      return;
    }

    modalCtx = { key:"inventory_move", id };
    modalTitle.textContent = (id?"تعديل":"إضافة") + " - حركة مخزن";
    modalSub.textContent = id ? ("ID: "+id) : "—";
    modalBack.classList.remove("hidden");

    const val = (k, def="") => row ? (row[k] ?? def) : def;
    const defType = forcedType || val("النوع","دخول");
    const defItem = Number(val("معرف_الصنف", items[0]?.id || 0));

    modalForm.innerHTML = `
      <div><label>التاريخ *</label><input class="input" data-k="التاريخ" type="date" value="${String(val("التاريخ", todayISO()))}" /></div>
      <div><label>النوع *</label>
        <select class="input" data-k="النوع">
          <option value="دخول" ${defType==="دخول"?"selected":""}>دخول</option>
          <option value="خروج" ${defType==="خروج"?"selected":""}>خروج</option>
        </select>
      </div>
      <div><label>الصنف *</label>
        <select class="input" data-k="معرف_الصنف">
          ${items.map(it=>`<option value="${it.id}" ${it.id===defItem?"selected":""}>${it.اسم_الصنف}</option>`).join("")}
        </select>
      </div>
      <div><label>الكمية *</label><input class="input" data-k="الكمية" type="number" step="0.01" value="${String(val("الكمية", 0))}" /></div>
      <div><label>ملاحظة</label><input class="input" data-k="ملاحظة" value="${String(val("ملاحظة",""))}" /></div>
      <div class="hint">لـ (خروج) يمكنك كتابة: اسم الوحدة/المقاول/سبب الصرف داخل الملاحظة.</div>
    `;
    modalDelete.style.display = id ? "inline-block" : "none";
  }

  function saveInventoryFromModal(){
    const db = loadDB();
    if(modalCtx.key==="inventory_item"){
      const arr = db.inventory_items || [];
      const id = modalCtx.id || uid();
      const name = (modalForm.querySelector(`[data-k="اسم_الصنف"]`)?.value || "").trim();
      if(!name) return alert("اكتب اسم الصنف.");
      const obj = {
        id,
        اسم_الصنف: name,
        الفئة: modalForm.querySelector(`[data-k="الفئة"]`)?.value || "مواد إنشائية",
        الوحدة: (modalForm.querySelector(`[data-k="الوحدة"]`)?.value || "").trim(),
        ملاحظات: (modalForm.querySelector(`[data-k="ملاحظات"]`)?.value || "").trim(),
      };
      const idx = arr.findIndex(x=>x.id===id);
      if(idx>=0) arr[idx] = Object.assign(arr[idx], obj);
      else arr.push(obj);
      db.inventory_items = arr;
      saveDB(db);
      closeModal();
      renderAll();
      return;
    }
    if(modalCtx.key==="inventory_move"){
      const arr = db.inventory_moves || [];
      const id = modalCtx.id || uid();
      const dt = modalForm.querySelector(`[data-k="التاريخ"]`)?.value || "";
      const type = modalForm.querySelector(`[data-k="النوع"]`)?.value || "دخول";
      const itemId = Number(modalForm.querySelector(`[data-k="معرف_الصنف"]`)?.value || 0);
      const qty = Number(modalForm.querySelector(`[data-k="الكمية"]`)?.value || 0);
      if(!dt || !itemId || qty<=0) return alert("أكمل (التاريخ/الصنف/الكمية).");
      const obj = {
        id,
        التاريخ: dt,
        النوع: type,
        معرف_الصنف: itemId,
        الكمية: qty,
        ملاحظة: (modalForm.querySelector(`[data-k="ملاحظة"]`)?.value || "").trim(),
      };
      const idx = arr.findIndex(x=>x.id===id);
      if(idx>=0) arr[idx] = Object.assign(arr[idx], obj);
      else arr.push(obj);
      db.inventory_moves = arr;
      saveDB(db);
      closeModal();
      renderAll();
      return;
    }
  }

  function deleteInventoryFromModal(){
    const db = loadDB();
    if(modalCtx.key==="inventory_item"){
      const id = modalCtx.id;
      if(!id) return;
      // منع الحذف إذا يوجد حركات
      const hasMoves = (db.inventory_moves||[]).some(m=>Number(m.معرف_الصنف)===Number(id));
      if(hasMoves && !confirm("هذا الصنف لديه حركات. حذف الصنف سيحذف الحركات أيضاً. متابعة؟")) return;
      db.inventory_moves = (db.inventory_moves||[]).filter(m=>Number(m.معرف_الصنف)!==Number(id));
      db.inventory_items = (db.inventory_items||[]).filter(x=>x.id!==id);
      saveDB(db);
      closeModal();
      renderAll();
      return;
    }
    if(modalCtx.key==="inventory_move"){
      const id = modalCtx.id;
      if(!id) return;
      db.inventory_moves = (db.inventory_moves||[]).filter(x=>x.id!==id);
      saveDB(db);
      closeModal();
      renderAll();
      return;
    }
  }

  function exportInventory(which){
    const db = loadDB();
    if(which==="items"){
      const headers = [
        {key:"id", label:"id"},
        {key:"اسم_الصنف", label:"اسم_الصنف"},
        {key:"الفئة", label:"الفئة"},
        {key:"الوحدة", label:"الوحدة"},
        {key:"ملاحظات", label:"ملاحظات"},
        {key:"المتبقي", label:"المتبقي"},
      ];
      const rows = (db.inventory_items||[]).map(it=>({
        id: it.id,
        اسم_الصنف: it.اسم_الصنف,
        الفئة: it.الفئة,
        الوحدة: it.الوحدة,
        ملاحظات: it.ملاحظات,
        المتبقي: stockForItem(db, it.id),
      }));
      downloadExcelHtml(`majma_adl_inventory_items_${todayISO()}.xls`, "أصناف المخزن", headers, rows);
    }else{
      const headers = [
        {key:"id", label:"id"},
        {key:"التاريخ", label:"التاريخ"},
        {key:"النوع", label:"النوع"},
        {key:"معرف_الصنف", label:"معرف_الصنف"},
        {key:"اسم_الصنف", label:"اسم_الصنف"},
        {key:"الكمية", label:"الكمية"},
        {key:"ملاحظة", label:"ملاحظة"},
      ];
      const rows = (db.inventory_moves||[]).map(m=>{
        const it = (db.inventory_items||[]).find(x=>x.id===Number(m.معرف_الصنف));
        return { ...m, اسم_الصنف: it?.اسم_الصنف || "" };
      });
      downloadExcelHtml(`majma_adl_inventory_moves_${todayISO()}.xls`, "حركات المخزن", headers, rows);
    }
  }

  // -----------------------
  // Reports (custom)
  // -----------------------
  function sumByPeriod(arr, dateKey, amountKey, from, to){
    const within = arr.filter(x=>{
      const d = x[dateKey] || "";
      if(from && d < from) return false;
      if(to && d > to) return false;
      return true;
    });
    const total = within.reduce((s,x)=>s + Number(x[amountKey]||0), 0);
    return {count: within.length, total};
  }

  function renderReports(){
    const el = $("page-reports");
    if(!el) return;
    const db = loadDB();
    el.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__left">
          <h2>التقارير</h2>
          <div class="small dim">فلترة بالتاريخ ثم عرض المجاميع (يومي/أسبوعي/شهري).</div>
        </div>
        <div class="toolbar__right tableActions">
          <input class="input" id="repFrom" type="date" />
          <input class="input" id="repTo" type="date" />
          <button class="btn btn--primary" id="repRun">تحديث التقرير</button>
          <button class="btn" id="repExportXls">تصدير Excel</button>
        </div>
      </div>

      <div class="grid2" id="repBox"></div>
      <hr class="sep">
      <div class="card inner">
        <h3>تفاصيل الحسابات (Ledger)</h3>
        <div class="tableWrap">
          <table class="table" style="min-width:900px">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الفئة</th><th>الوصف</th><th>المبلغ</th></tr></thead>
            <tbody id="repLedger"></tbody>
          </table>
        </div>
      </div>
    `;

    $("repRun")?.addEventListener("click", ()=> runReport());
    $("repExportXls")?.addEventListener("click", ()=> exportReportXls());
    runReport();

    function runReport(){
      const from = $("repFrom")?.value || "";
      const to = $("repTo")?.value || "";
      const purchasesPaid = sumByPeriod(db.purchases||[], "التاريخ", "المدفوع", from, to);
      const accountsExp = sumByPeriod((db.accounts||[]).filter(x=>x.النوع==="مصروف"), "التاريخ", "المبلغ", from, to);
      const accountsDep = sumByPeriod((db.accounts||[]).filter(x=>x.النوع==="إيداع"), "التاريخ", "المبلغ", from, to);
      const salesPaid = sumByPeriod(db.sales||[], "التاريخ", "المدفوع", from, to);

      const box = $("repBox");
      box.innerHTML = `
        ${card("المشتريات (المدفوع)", purchasesPaid.count, purchasesPaid.total)}
        ${card("المصروفات", accountsExp.count, accountsExp.total)}
        ${card("الإيداعات", accountsDep.count, accountsDep.total)}
        ${card("مبيعات (المدفوع)", salesPaid.count, salesPaid.total)}
      `;

      const ledger = (db.accounts||[]).filter(x=>{
        const d = x.التاريخ||"";
        if(from && d<from) return false;
        if(to && d>to) return false;
        return true;
      }).sort((a,b)=>(b.التاريخ||"").localeCompare(a.التاريخ||""));
      $("repLedger").innerHTML = ledger.map(x=>`
        <tr>
          <td>${x.التاريخ||""}</td>
          <td>${x.النوع||""}</td>
          <td>${x.الفئة||""}</td>
          <td>${x.الوصف||""}</td>
          <td>${fmt.format(Number(x.المبلغ||0))}</td>
        </tr>
      `).join("") || `<tr><td colspan="5" class="small">لا توجد بيانات ضمن الفترة.</td></tr>`;
    }

    function card(title, count, total){
      return `<div class="card inner">
        <div class="small dim">${title}</div>
        <div style="font-size:26px; font-weight:800; margin-top:6px">${fmt.format(Number(total||0))}</div>
        <div class="small dim">عدد العمليات: ${fmt.format(Number(count||0))}</div>
      </div>`;
    }

    function exportReportXls(){
      const from = $("repFrom")?.value || "";
      const to = $("repTo")?.value || "";
      const rows = (db.accounts||[]).filter(x=>{
        const d = x.التاريخ||"";
        if(from && d<from) return false;
        if(to && d>to) return false;
        return true;
      });
      const headers = [
        {key:"التاريخ", label:"التاريخ"},
        {key:"النوع", label:"النوع"},
        {key:"الفئة", label:"الفئة"},
        {key:"الوصف", label:"الوصف"},
        {key:"المبلغ", label:"المبلغ"},
        {key:"ملاحظات", label:"ملاحظات"},
      ];
      downloadExcelHtml(`majma_adl_report_ledger_${todayISO()}.xls`, "تقرير الحسابات", headers, rows);
    }
  }

  // -----------------------
  // Render routing
  // -----------------------
  function renderPage(key){
    if(key==="dashboard"){ renderDashboard(); return; }
    const m = Modules[key];
    if(!m) return;
    if(typeof m.customRender==="function"){ m.customRender(); return; }
    buildGenericPage(key);
  }

  function renderDashboard(){
    // dashboard already in HTML, just refresh KPIs
    const db = loadDB();
    refreshKPIs(db);
  }

  function refreshKPIs(db){
    // Units KPIs
    const units = db.units || [];
    const totalUnits = units.length;
    const inProg = units.filter(u=>u.الحالة==="قيد التنفيذ").length;
    const done = units.filter(u=>u.الحالة==="مكتملة").length;

    $("kpiUnits") && ($("kpiUnits").textContent = fmt.format(totalUnits));
    $("kpiInProgress") && ($("kpiInProgress").textContent = fmt.format(inProg));
    $("kpiDone") && ($("kpiDone").textContent = fmt.format(done));

    // Accounts balance
    let balance = 0;
    (db.accounts||[]).forEach(x=>{
      const amt = Number(x.المبلغ||0);
      if(x.النوع==="إيداع") balance += amt;
      else balance -= amt; // سحب/مصروف
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
    const active = document.querySelector(".nav__item.active")?.dataset.page || "dashboard";
    renderPage(active);
  }

  // -----------------------
  // Global export/import
  // -----------------------
  function exportAll(){
    const db = loadDB();
    // JSON كامل
    downloadText(`majma_adl_backup_${todayISO()}.json`, JSON.stringify(db, null, 2), "application/json;charset=utf-8");
    // Excel (xls) لكل جدول مهم
    // (يعرض للمستخدم: يفتحهم واحد واحد، لأن إنشاء ملف واحد متعدد الشيت يحتاج مكتبة)
    alert("تم تنزيل نسخة JSON كاملة. ولتصدير Excel لكل قسم استخدم أزرار التصدير داخل الأقسام.");
  }

  async function importAll(file){
    const text = await readFileText(file);
    if(file.name.toLowerCase().endsWith(".json")){
      try{
        const obj = JSON.parse(text);
        localStorage.setItem(DB_KEY, JSON.stringify(Object.assign(emptyDB(), obj||{})));
        alert("تم الاستيراد بنجاح.");
        renderAll();
      }catch{
        alert("ملف JSON غير صالح.");
      }
      return;
    }
    alert("الاستيراد العام يدعم JSON فقط. للاستيراد من CSV استخدم زر الاستيراد داخل كل قسم.");
  }

  // -----------------------
  // Settings / Buttons
  // -----------------------
  $("exportAllBtn")?.addEventListener("click", exportAll);
  $("exportJsonBtn")?.addEventListener("click", ()=>{
    const db = loadDB();
    downloadText(`majma_adl_backup_${todayISO()}.json`, JSON.stringify(db, null, 2), "application/json;charset=utf-8");
  });

  $("importAllFile")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    e.target.value = "";
    if(!f) return;
    await importAll(f);
  });

  $("importJsonFile")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    e.target.value = "";
    if(!f) return;
    await importAll(f);
  });

  $("lockBtn")?.addEventListener("click", lock);

  $("wipeBtn")?.addEventListener("click", ()=>{
    if(!confirm("سيتم حذف كل البيانات المحفوظة محلياً. هل أنت متأكد؟")) return;
    localStorage.removeItem(DB_KEY);
    alert("تم حذف البيانات.");
    renderAll();
  });

  $("savePassBtn")?.addEventListener("click", ()=>{
    const v = ($("newPass")?.value || "").trim();
    if(!v) return alert("اكتب كلمة المرور.");
    localStorage.setItem(PASS_KEY, v);
    alert("تم حفظ كلمة المرور.");
    $("newPass").value = "";
  });

  // Intercept modal buttons for inventory custom
  modalSave?.addEventListener("click", ()=>{
    if(modalCtx.key==="inventory_item" || modalCtx.key==="inventory_move") saveInventoryFromModal();
  }, true);

  modalDelete?.addEventListener("click", ()=>{
    if(modalCtx.key==="inventory_item" || modalCtx.key==="inventory_move") deleteInventoryFromModal();
  }, true);

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
    // Auth gate
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
          // حاول مزامنة من السيرفر
          await syncFromServer();
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

    // Sync from server on load (if online)
    await syncFromServer();

    // Ensure 500 units first time
    const db = loadDB();
    Modules.units.seed(db);
    saveDB(db);

    registerSW();
    showPage("dashboard");
    renderAll();
  }

  boot();
})();