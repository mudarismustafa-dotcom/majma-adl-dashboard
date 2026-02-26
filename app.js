/* مجمع العدل السكني - نسخة مستقرة نهائية */
(() => {

const $ = id => document.getElementById(id);

/* ================= AUTH ================= */

const AUTH_KEY="majma_auth";
const PASS_KEY="majma_pass";
const DEFAULT_PASS="@1000@";

function isAuthed(){return sessionStorage.getItem(AUTH_KEY)==="1";}
function getPass(){return localStorage.getItem(PASS_KEY)||DEFAULT_PASS;}
function lock(){sessionStorage.removeItem(AUTH_KEY);location.reload();}
function showLogin(v){$("loginBack")?.classList.toggle("hidden",!v);}

/* ================= STORAGE ================= */

const DB_KEY="majma_db_v2";
const today=()=>new Date().toISOString().slice(0,10);

function emptyDB(){
return{
units:[],
contractors:[],
engineers:[],
workers:[],
accounts:[]
};
}

function loadDB(){
try{
const raw=localStorage.getItem(DB_KEY);
return raw?JSON.parse(raw):emptyDB();
}catch{return emptyDB();}
}

function saveDB(db){localStorage.setItem(DB_KEY,JSON.stringify(db));}

function uid(){return Date.now()+Math.floor(Math.random()*9999);}

/* ================= NAVIGATION ================= */

function showPage(key){
document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
$("page-"+key)?.classList.remove("hidden");
}

/* ================= GENERIC TABLE ================= */

function renderTable(key,fields){
const db=loadDB();
const arr=db[key]||[];
const tbody=$(key+"Tbody");
if(!tbody)return;

tbody.innerHTML=arr.map(r=>{
const tds=fields.map(f=>`<td>${r[f]??""}</td>`).join("");
return `<tr>
<td><button data-edit="${r.id}" class="btn">عرض</button></td>
${tds}
</tr>`;
}).join("");

tbody.onclick=e=>{
const id=e.target.dataset.edit;
if(!id)return;
openModal(key,Number(id),fields);
};
}

/* ================= MODAL ================= */

let modalCtx={key:null,id:null,fields:[]};

function openModal(key,id,fields){
modalCtx={key,id,fields};

const db=loadDB();
const arr=db[key]||[];
const row=id?arr.find(x=>x.id===id):null;

$("modalTitle").textContent=(id?"تعديل":"إضافة");
$("modalBack").classList.remove("hidden");

$("modalForm").innerHTML=fields.map(f=>{
const val=row?row[f]||"":"";
return `
<div>
<label>${f}</label>
<input class="input" data-k="${f}" value="${val}">
</div>`;
}).join("");
}

function closeModal(){$("modalBack").classList.add("hidden");}

$("modalClose")?.addEventListener("click",closeModal);
$("modalBack")?.addEventListener("click",e=>{if(e.target.id==="modalBack")closeModal();});

$("modalSave")?.addEventListener("click",()=>{
const {key,id,fields}=modalCtx;
if(!key)return;

const db=loadDB();
const arr=db[key]||[];

const obj={id:id||uid()};
fields.forEach(f=>{
obj[f]=$(`[data-k="${f}"]`).value;
});

if(id){
const i=arr.findIndex(x=>x.id===id);
arr[i]=obj;
}else{
arr.push(obj);
}

db[key]=arr;
saveDB(db);
closeModal();
renderAll();
});

$("modalDelete")?.addEventListener("click",()=>{
const {key,id}=modalCtx;
if(!id)return;
const db=loadDB();
db[key]=db[key].filter(x=>x.id!==id);
saveDB(db);
closeModal();
renderAll();
});

/* ================= RENDER ALL ================= */

function renderAll(){
renderTable("units",["رقم_الوحدة","الحالة"]);
renderTable("contractors",["اسم_المقاول","الهاتف"]);
renderTable("engineers",["الاسم","الهاتف"]);
renderTable("workers",["الاسم","الهاتف"]);
}

/* ================= BOOT ================= */

function boot(){
if(!isAuthed()){
showLogin(true);
$("loginBtn")?.addEventListener("click",()=>{
if($("loginPass").value===getPass()){
sessionStorage.setItem(AUTH_KEY,"1");
showLogin(false);
renderAll();
}else alert("كلمة المرور غير صحيحة");
});
return;
}

showLogin(false);
renderAll();
}

boot();

})();
