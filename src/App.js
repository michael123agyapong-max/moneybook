import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "./supabase";

/* ══════════════════════════════════════════════════════
   DESIGN TOKENS  — theme-aware (dark + light)
══════════════════════════════════════════════════════ */
const DARK = {
  bg:"#06080F", surface:"#0C1018", card:"#111820", cardHi:"#16202C",
  rim:"#1A2535", rimHi:"#243348", gold:"#D4A853", goldLt:"#F2C96A",
  goldDk:"#9A7530", emerald:"#1DB87A", rose:"#E8485A", sapphire:"#4A8CF5",
  amethyst:"#9B72F5", cream:"#F0E8D8", ash:"#8FA3BC", fog:"#4A607A", night:"#1A2535",
};
const LIGHT = {
  bg:"#F5F4F0", surface:"#FFFFFF", card:"#FAFAF8", cardHi:"#F0EFE9",
  rim:"#E2DDD6", rimHi:"#D0C9C0", gold:"#B8891F", goldLt:"#D4A853",
  goldDk:"#7A5C0E", emerald:"#0E9060", rose:"#C93040", sapphire:"#2563EB",
  amethyst:"#7C3AED", cream:"#1A1208", ash:"#5A5040", fog:"#9B9080", night:"#E8E4DE",
};
// T is mutated by the theme toggle — all components read live values
const T = { ...DARK };
const SERIES_COLORS = ["#D4A853","#1DB87A","#4A8CF5","#E8485A","#9B72F5","#F97316","#06B6D4"];
const CATEGORY_ICONS = {
  Food:"🍛",Transport:"🚕",Business:"💼",Bills:"⚡",Shopping:"🛍",
  Healthcare:"💊",Entertainment:"🎬",Education:"📚",Other:"📦",
  Salary:"💵",Freelance:"🖥","Food Sales":"🍽",Investment:"📈","Business Revenue":"🏢",
};

/* ── Shared style constants (Code Quality: reuse repeated patterns) ── */
const S = {
  card:   { background:T.card, border:`1px solid ${T.rim}`, borderRadius:18 },
  input:  { width:"100%", padding:"10px 13px", background:"#090D14", border:`1px solid ${T.rim}`, borderRadius:9, color:T.cream, fontSize:15, fontFamily:"'EB Garamond',serif" },
  label:  { display:"block", fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", textTransform:"uppercase", letterSpacing:1.1, marginBottom:6 },
  mono:   { fontFamily:"'Inter',sans-serif" },
  serif:  { fontFamily:"'EB Garamond',serif" },
  title:  { fontFamily:"'Cormorant Garamond',serif" },
  editBtn:{ background:`${T.sapphire}18`, border:`1px solid ${T.sapphire}40`, borderRadius:6, padding:"4px 10px", color:T.sapphire, fontSize:12, cursor:"pointer", fontFamily:"'Inter',sans-serif" },
  delBtn: { background:`${T.rose}18`, border:`1px solid ${T.rose}40`, borderRadius:6, padding:"4px 10px", color:T.rose, fontSize:12, cursor:"pointer", fontFamily:"'Inter',sans-serif" },
};

/* ── Rotating tips ── */
const TIPS = [
  "Record every sale, even small ones. Small sales add up to big profits over time.",
  "Review your expenses weekly — small leaks sink big ships.",
  "Your net profit margin tells you how healthy your business really is.",
  "Follow up on debts promptly — the older a debt, the harder to collect.",
  "Separate business and personal finances as early as possible.",
  "Consistent record-keeping takes 5 minutes a day and saves hours at tax time.",
  "A budget is telling your money where to go instead of wondering where it went.",
  "Track your top 3 income sources — focus on what's working.",
];

/* ── SEED ── */
const SEED = { budgets: [] };

/* ── Exchange rate helpers ── */
const RATE_CACHE_KEY = "mb_rates_v1";
async function fetchRates() {
  const cached = sessionStorage.getItem(RATE_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/GHS");
    const json = await res.json();
    if (json.result === "success") {
      const rates = {
        USD: +(1 / json.rates.USD).toFixed(4),
        GBP: +(1 / json.rates.GBP).toFixed(4),
        EUR: +(1 / json.rates.EUR).toFixed(4),
        updated: new Date().toLocaleTimeString(),
      };
      sessionStorage.setItem(RATE_CACHE_KEY, JSON.stringify(rates));
      return rates;
    }
  } catch(e) {}
  return null;
}

/* ── Business score helpers ── */
function calcScore(income, expenses, budgets, debts) {
  if (!income.length && !expenses.length) return null;
  let score = 50;
  const totalInc = income.reduce((s,i)=>s+(+i.amount),0);
  const totalExp = expenses.reduce((s,e)=>s+(+e.amount),0);
  if (totalInc > 0) {
    const margin = (totalInc - totalExp) / totalInc;
    score += Math.min(25, Math.round(margin * 50));
  }
  const thisMonth = todayS().slice(0,7);
  const activeThisMonth = income.some(i=>i.date?.startsWith(thisMonth)) || expenses.some(e=>e.date?.startsWith(thisMonth));
  if (activeThisMonth) score += 10;
  if (budgets.length > 0) {
    const b = budgets[0];
    const spent = b.categories.reduce((s,c)=>s+c.spent,0);
    if (spent <= b.totalCash) score += 10;
  }
  score -= Math.min(15, debts.length * 5);
  return Math.max(0, Math.min(100, score));
}
function scoreLabel(s) {
  if (s === null) return { label:"Not enough data", color:"#8FA3BC" };
  if (s >= 80) return { label:"Excellent ✦", color:"#1DB87A" };
  if (s >= 60) return { label:"Good", color:"#D4A853" };
  if (s >= 40) return { label:"Fair", color:"#F97316" };
  return { label:"Needs attention", color:"#E8485A" };
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
const fmt    = n => `GHS ${Number(n).toLocaleString("en-GH",{minimumFractionDigits:2})}`;
const todayS = () => new Date().toISOString().split("T")[0];
// Bug fix: use crypto.randomUUID for local budget IDs
const uid    = () => typeof crypto!=="undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// Bug fix: SSR-safe window width hook
const useW = () => {
  const [w,setW] = useState(typeof window!=="undefined" ? window.innerWidth : 1024);
  useEffect(()=>{
    const h = ()=>setW(window.innerWidth);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);
  return w;
};

/* ══════════════════════════════════════════════════════
   GLOBAL CSS
══════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=EB+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:var(--mb-bg,#06080F);font-family:'EB Garamond',serif;transition:background .3s;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#06080F;}
  ::-webkit-scrollbar-thumb{background:#1A2535;border-radius:4px;}
  ::-webkit-scrollbar-thumb:hover{background:#243348;}
  .fade{animation:fadeUp .4s cubic-bezier(.22,.68,0,1.2) both;}
  .fade-1{animation-delay:.05s;}.fade-2{animation-delay:.1s;}.fade-3{animation-delay:.15s;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
  .glow-btn{transition:all .2s;}
  .glow-btn:hover{box-shadow:0 0 28px #D4A85355;transform:translateY(-1px);}
  .nav-link{transition:all .18s;}
  .nav-link:hover{background:rgba(212,168,83,.08)!important;color:#D4A853!important;}
  .row-hover{transition:background .15s;}
  .row-hover:hover{background:#16202C;}
  .card-lift{transition:transform .2s,box-shadow .2s,border-color .2s;}
  .card-lift:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.5);border-color:#243348!important;}
  input:focus,select:focus,textarea:focus{outline:none;border-color:#D4A85370!important;box-shadow:0 0 0 3px #D4A85318;}
  input:-webkit-autofill{-webkit-box-shadow:0 0 0 100px #0C1018 inset!important;-webkit-text-fill-color:#F0E8D8!important;}
  input[type=range]{height:4px;border-radius:2px;}
  .pulse{animation:pulse 2s infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .toast{position:fixed;bottom:32px;right:24px;z-index:900;padding:12px 20px;border-radius:12px;font-family:'EB Garamond',serif;font-size:15px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:fadeUp .3s both;}
`;

/* ══════════════════════════════════════════════════════
   PRIMITIVES
══════════════════════════════════════════════════════ */
function Btn({children,onClick,variant="gold",full,sm,style:s={},disabled,loading:ld}){
  const base={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"none",borderRadius:10,cursor:disabled||ld?"not-allowed":"pointer",fontFamily:"'EB Garamond',serif",fontWeight:600,letterSpacing:.4,transition:"all .2s",width:full?"100%":undefined,opacity:disabled||ld?.6:1,padding:sm?"7px 16px":"11px 24px",fontSize:sm?14:15};
  const vs={
    gold:{background:`linear-gradient(135deg,${T.gold},${T.goldDk})`,color:"#06080F",...base},
    outline:{background:"transparent",color:T.ash,border:`1px solid ${T.rim}`,...base},
    danger:{background:`${T.rose}18`,color:T.rose,border:`1px solid ${T.rose}40`,...base},
    ghost:{background:T.card,color:T.ash,border:`1px solid ${T.rim}`,...base},
    emerald:{background:`linear-gradient(135deg,${T.emerald},#127A52)`,color:"#06080F",...base},
  };
  return <button onClick={disabled||ld?undefined:onClick} className={variant==="gold"?"glow-btn":""} style={{...(vs[variant]||vs.gold),...s}}>{ld?"Please wait…":children}</button>;
}

function Field({label,children,hint}){
  return(
    <div style={{marginBottom:16}}>
      {label&&<label style={S.label}>{label}</label>}
      {children}
      {hint&&<div style={{fontSize:12,color:T.fog,marginTop:4,...S.mono}}>{hint}</div>}
    </div>
  );
}
function FInput({label,hint,error,...p}){
  return(
    <Field label={label} hint={hint}>
      <input {...p} style={{...S.input,...p.style}}/>
      {error&&<div style={{fontSize:12,color:T.rose,marginTop:4,...S.mono}}>{error}</div>}
    </Field>
  );
}
function FSelect({label,options,...p}){
  return(
    <Field label={label}>
      <select {...p} style={{...S.input,cursor:"pointer"}}>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </Field>
  );
}
function FTextarea({label,...p}){
  return(
    <Field label={label}>
      <textarea {...p} style={{...S.input,resize:"vertical",minHeight:72,...p.style}}/>
    </Field>
  );
}

function Drawer({title,subtitle,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="fade" style={{background:T.surface,border:`1px solid ${T.rim}`,borderRadius:22,padding:32,width:"100%",maxWidth:wide?600:460,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,.7)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:26}}>
          <div>
            <div style={{...S.title,fontSize:24,color:T.cream,fontWeight:700,lineHeight:1}}>{title}</div>
            {subtitle&&<div style={{fontSize:13,color:T.fog,marginTop:4,...S.mono}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:`${T.fog}22`,border:"none",borderRadius:8,width:30,height:30,color:T.ash,fontSize:16,cursor:"pointer",lineHeight:1,flexShrink:0,marginLeft:12}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Badge({children,color=T.gold}){
  return <span style={{display:"inline-block",padding:"3px 9px",borderRadius:20,background:`${color}18`,color,fontSize:12,...S.mono,fontWeight:500,letterSpacing:.3}}>{children}</span>;
}

function StatCard({label,value,sub,color=T.gold,icon,glow,delay=""}){
  return(
    <div className={`card-lift fade ${delay}`} style={{...S.card,padding:"20px 22px",borderTop:`2px solid ${color}`,boxShadow:glow?`0 6px 32px ${color}22`:"0 2px 12px rgba(0,0,0,.3)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${color}12 0%,transparent 70%)`}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{fontSize:11,color:T.fog,textTransform:"uppercase",letterSpacing:1.3,...S.mono,fontWeight:500}}>{label}</div>
        {icon&&<span style={{fontSize:22,opacity:.85}}>{icon}</span>}
      </div>
      <div style={{fontSize:26,...S.title,color:T.cream,fontWeight:700,letterSpacing:-.5,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:13,color,marginTop:7,...S.mono}}>{sub}</div>}
    </div>
  );
}

const CTip=({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:T.cardHi,border:`1px solid ${T.rim}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
      {label&&<div style={{color:T.ash,marginBottom:5,fontSize:12,...S.mono}}>{label}</div>}
      {payload.map((p,i)=><div key={i} style={{color:p.color||T.cream,fontWeight:600,...S.serif,fontSize:15}}>{fmt(p.value)}</div>)}
    </div>
  );
};

/* ── Toast notification ── */
function Toast({msg,color=T.emerald,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2400);return()=>clearTimeout(t);},[onDone]);
  return <div className="toast" style={{background:color,color:"#06080F"}}>{msg}</div>;
}

/* ── Delete confirm drawer ── */
function DeleteConfirm({what,onConfirm,onCancel}){
  return(
    <Drawer title="Are you sure?" subtitle="This cannot be undone." onClose={onCancel}>
      <div style={{fontSize:15,color:T.ash,...S.serif,marginBottom:20,lineHeight:1.6}}>
        You are about to permanently delete <strong style={{color:T.cream}}>{what}</strong>. This record cannot be recovered.
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn variant="danger" full onClick={onConfirm}>Yes, Delete</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Drawer>
  );
}

/* ── Search & filter bar ── */
function SearchBar({value,onChange,placeholder="Search…"}){
  return(
    <div style={{position:"relative",marginBottom:16}}>
      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.fog,fontSize:14}}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{...S.input,paddingLeft:34,borderRadius:12}}/>
    </div>
  );
}

/* ── Filter row (date range + category) ── */
function FilterRow({dateFrom,dateTo,onDateFrom,onDateTo,cats,cat,onCat}){
  return(
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <input type="date" value={dateFrom} onChange={e=>onDateFrom(e.target.value)}
        style={{...S.input,width:"auto",flex:1,minWidth:130,fontSize:13}}/>
      <input type="date" value={dateTo} onChange={e=>onDateTo(e.target.value)}
        style={{...S.input,width:"auto",flex:1,minWidth:130,fontSize:13}}/>
      {cats&&(
        <select value={cat} onChange={e=>onCat(e.target.value)}
          style={{...S.input,width:"auto",flex:1,minWidth:130,fontSize:13,cursor:"pointer"}}>
          <option value="">All categories</option>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {(dateFrom||dateTo||cat)&&(
        <button onClick={()=>{onDateFrom("");onDateTo("");onCat&&onCat("");}}
          style={{background:`${T.rose}18`,border:`1px solid ${T.rose}40`,borderRadius:9,padding:"0 14px",color:T.rose,cursor:"pointer",fontSize:13,...S.mono}}>Clear</button>
      )}
    </div>
  );
}

const HERO_IMGS={
  auth:    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&auto=format&fit=crop&q=70",
  dashboard:"https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=60",
  budget:  "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=65",
  sales:   "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=65",
  customers:"https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&auto=format&fit=crop&q=65",
};

/* ══════════════════════════════════════════════════════
   AUTH PAGE  (Bug fix: removed fake stats)
══════════════════════════════════════════════════════ */
function AuthPage({onAuth}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [biz,setBiz]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const isM=useW()<768;

  const submit=async()=>{
    setErr("");
    if(mode==="login"){
      if(!email||!pass) return setErr("Please fill in all fields.");
      setLoading(true);
      const {data,error}=await supabase.auth.signInWithPassword({email,password:pass});
      setLoading(false);
      if(error) return setErr(error.message);
      onAuth({name:data.user.user_metadata?.name||email,business:data.user.user_metadata?.business||"My Business",avatar:(data.user.user_metadata?.name||email)[0].toUpperCase()});
    } else {
      if(!name||!email||!pass) return setErr("Please fill in all fields.");
      setLoading(true);
      const {data,error}=await supabase.auth.signUp({email,password:pass,options:{data:{name,business:biz||"My Business"}}});
      setLoading(false);
      if(error) return setErr(error.message);
      if(data.user) onAuth({name,business:biz||"My Business",avatar:name[0].toUpperCase()});
    }
  };

  return(
    <div style={{minHeight:"100vh",display:"flex",background:T.bg}}>
      {!isM&&(
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <img src={HERO_IMGS.auth} alt="" style={{width:"100%",height:"100%",objectFit:"cover",opacity:.55}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(6,8,15,.9) 0%,rgba(6,8,15,.4) 100%)"}}/>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:52}}>
            <div style={{...S.title,fontSize:48,color:T.cream,fontWeight:700,lineHeight:1.1,maxWidth:380}}>
              Your money,<br/><span style={{color:T.gold}}>finally clear.</span>
            </div>
            <div style={{fontSize:16,color:T.ash,marginTop:16,maxWidth:360,...S.serif,lineHeight:1.7}}>
              Track income, expenses, sales and budgets — built for Ghanaian entrepreneurs and everyday people.
            </div>
            {/* Bug fix: replaced fake stats with honest feature list */}
            <div style={{display:"flex",gap:20,marginTop:36,flexWrap:"wrap"}}>
              {[["₵","GHS native","Track in cedis"],["📊","Full reports","P&L at a glance"],["🔒","Private","Your data only"]].map(([icon,v,l])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.06)",borderRadius:12,padding:"10px 14px"}}>
                  <span style={{fontSize:22}}>{icon}</span>
                  <div>
                    <div style={{...S.title,fontSize:16,color:T.gold,fontWeight:700}}>{v}</div>
                    <div style={{fontSize:11,color:T.ash,...S.mono}}>{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{width:isM?"100%":440,display:"flex",flexDirection:"column",justifyContent:"center",padding:isM?"32px 24px":"48px 40px",background:T.surface,borderLeft:`1px solid ${T.rim}`}}>
        <div style={{marginBottom:36}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
            <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${T.gold},${T.goldDk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:T.bg,boxShadow:`0 6px 20px ${T.gold}40`}}>₵</div>
            <div>
              <div style={{...S.title,fontSize:22,color:T.cream,fontWeight:700,lineHeight:1}}>MoneyBook</div>
              <div style={{fontSize:11,color:T.fog,letterSpacing:2,textTransform:"uppercase",...S.mono}}>Ghana Edition</div>
            </div>
          </div>
          <div style={{...S.title,fontSize:30,color:T.cream,fontWeight:600,lineHeight:1.2}}>
            {mode==="login"?"Welcome back":"Create your account"}
          </div>
          <div style={{fontSize:14,color:T.fog,marginTop:5,...S.mono}}>
            {mode==="login"?"Sign in to your dashboard":"Start tracking your money today"}
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:24,background:T.card,borderRadius:12,padding:4}}>
          {["login","signup"].map(t=>(
            <button key={t} onClick={()=>{setMode(t);setErr("");}} style={{flex:1,padding:"9px",border:"none",borderRadius:9,cursor:"pointer",...S.serif,fontWeight:600,fontSize:15,transition:"all .2s",background:mode===t?`linear-gradient(135deg,${T.gold},${T.goldDk})`:"transparent",color:mode===t?T.bg:T.fog}}>
              {t==="login"?"Sign In":"Register"}
            </button>
          ))}
        </div>
        {mode==="signup"&&<>
          <FInput label="Full Name" placeholder="e.g. Michael Poku" value={name} onChange={e=>setName(e.target.value)}/>
          <FInput label="Business Name (optional)" placeholder="e.g. MP Web & Automations" value={biz} onChange={e=>setBiz(e.target.value)}/>
        </>}
        <FInput label="Email Address" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <FInput label="Password" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} error={err}/>
        {mode==="login"&&<div style={{textAlign:"right",marginTop:-8,marginBottom:16}}><span style={{fontSize:14,color:T.gold,cursor:"pointer",...S.mono}}>Forgot password?</span></div>}
        <Btn full onClick={submit} loading={loading}>{mode==="login"?"Sign In →":"Create Account →"}</Btn>
        <div style={{marginTop:20,textAlign:"center",fontSize:14,color:T.fog,...S.mono}}>
          {mode==="login"?"No account? ":"Have an account? "}
          <span onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");}} style={{color:T.gold,cursor:"pointer",fontWeight:600}}>
            {mode==="login"?"Register free":"Sign in"}
          </span>
        </div>
        <div style={{marginTop:24,borderTop:`1px solid ${T.rim}`,paddingTop:20}}>
          <button onClick={()=>onAuth({name:"Demo User",business:"My Business",avatar:"D"})} style={{width:"100%",padding:"11px",background:"transparent",border:`1px dashed ${T.rim}`,borderRadius:10,color:T.fog,fontSize:14,cursor:"pointer",...S.serif,transition:"all .2s"}}>
            ⚡ Enter Demo — no account needed
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════ */
const NAV=[
  {id:"dashboard",icon:"◈",label:"Dashboard"},
  {id:"income",   icon:"↑", label:"Income"},
  {id:"expenses", icon:"↓", label:"Expenses"},
  {id:"sales",    icon:"⊕", label:"Sales"},
  {id:"budget",   icon:"◎", label:"Budget"},
  {id:"customers",icon:"◉", label:"Customers"},
  {id:"debts",    icon:"⟳", label:"Debts"},
  {id:"goals",    icon:"🎯", label:"Goals"},
  {id:"reports",  icon:"≡", label:"Reports"},
  {id:"export",   icon:"⇩", label:"Export"},
];

function Sidebar({active,setActive,user,onLogout,isDark,onToggleTheme}){
  return(
    <aside style={{width:226,minHeight:"100vh",background:T.surface,borderRight:`1px solid ${T.rim}`,display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,zIndex:100}}>
      <div style={{padding:"22px 20px 18px",borderBottom:`1px solid ${T.rim}`}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${T.gold},${T.goldDk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:T.bg,flexShrink:0}}>₵</div>
          <div>
            <div style={{...S.title,fontSize:18,color:T.cream,fontWeight:700,lineHeight:1}}>MoneyBook</div>
            <div style={{fontSize:10,color:T.fog,letterSpacing:1.6,textTransform:"uppercase",...S.mono,marginTop:2}}>Ghana Edition</div>
          </div>
        </div>
      </div>
      <nav style={{flex:1,padding:"14px 10px",overflowY:"auto"}}>
        {NAV.map(({id,icon,label})=>(
          <button key={id} onClick={()=>setActive(id)} className="nav-link"
            style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"10px 13px",marginBottom:2,background:active===id?`${T.gold}15`:"transparent",border:active===id?`1px solid ${T.gold}30`:"1px solid transparent",borderRadius:10,cursor:"pointer",color:active===id?T.gold:T.ash,fontSize:14,...S.serif,textAlign:"left"}}>
            <span style={{fontSize:16,width:20,textAlign:"center",opacity:active===id?1:.65}}>{icon}</span>
            <span style={{fontWeight:active===id?600:400}}>{label}</span>
            {active===id&&<div style={{marginLeft:"auto",width:5,height:5,borderRadius:"50%",background:T.gold}}/>}
          </button>
        ))}
      </nav>
      <div style={{padding:"14px 16px",borderTop:`1px solid ${T.rim}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${T.sapphire},${T.amethyst})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",flexShrink:0}}>{user.avatar}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,color:T.cream,fontWeight:600,...S.serif,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
            <div style={{fontSize:11,color:T.fog,...S.mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.business}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={onToggleTheme} style={{flex:1,padding:"7px",background:`${T.gold}15`,border:`1px solid ${T.gold}30`,borderRadius:8,color:T.gold,fontSize:12,cursor:"pointer",...S.mono,textAlign:"center"}}>
            {isDark?"☀ Light":"◑ Dark"}
          </button>
        </div>
        <button onClick={onLogout} style={{width:"100%",padding:"8px",background:"transparent",border:`1px solid ${T.rim}`,borderRadius:8,color:T.fog,fontSize:13,cursor:"pointer",...S.mono}}>Sign Out</button>
      </div>
    </aside>
  );
}

function MobileHeader({active,user,menuOpen,setMenuOpen,setActive,onLogout}){
  const page=NAV.find(n=>n.id===active);
  return(
    <div style={{position:"sticky",top:0,zIndex:150,background:T.surface,borderBottom:`1px solid ${T.rim}`,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
      <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${T.gold},${T.goldDk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:T.bg}}>₵</div>
      <div style={{flex:1,...S.title,fontSize:19,color:T.cream,fontWeight:700}}>{page?.label||"MoneyBook"}</div>
      <button onClick={()=>setMenuOpen(v=>!v)} style={{background:T.night,border:"none",borderRadius:8,width:34,height:34,color:T.ash,fontSize:16,cursor:"pointer"}}>☰</button>
      {menuOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={()=>setMenuOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,right:0,bottom:0,width:260,background:T.surface,borderLeft:`1px solid ${T.rim}`,padding:"20px 10px",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 6px 14px",borderBottom:`1px solid ${T.rim}`,marginBottom:8}}>
              <div style={{...S.title,fontSize:18,color:T.cream,fontWeight:700}}>Menu</div>
              <button onClick={()=>setMenuOpen(false)} style={{background:"none",border:"none",color:T.fog,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {NAV.map(({id,icon,label})=>(
              <button key={id} onClick={()=>{setActive(id);setMenuOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"11px 12px",marginBottom:2,background:active===id?`${T.gold}15`:"transparent",border:active===id?`1px solid ${T.gold}30`:"1px solid transparent",borderRadius:10,cursor:"pointer",color:active===id?T.gold:T.ash,fontSize:15,...S.serif,textAlign:"left"}}>
                <span style={{fontSize:17,width:22,textAlign:"center"}}>{icon}</span>{label}
              </button>
            ))}
            <div style={{marginTop:"auto",paddingTop:16,borderTop:`1px solid ${T.rim}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 6px 12px"}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.sapphire},${T.amethyst})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff"}}>{user.avatar}</div>
                <div><div style={{fontSize:14,color:T.cream,fontWeight:600,...S.serif}}>{user.name}</div><div style={{fontSize:11,color:T.fog,...S.mono}}>{user.business}</div></div>
              </div>
              <button onClick={onLogout} style={{width:"100%",padding:"9px",background:"transparent",border:`1px solid ${T.rim}`,borderRadius:10,color:T.fog,fontSize:13,cursor:"pointer",...S.mono}}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNav({active,setActive}){
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:T.surface,borderTop:`1px solid ${T.rim}`,display:"flex",padding:"8px 0 env(safe-area-inset-bottom,10px)"}}>
      {NAV.slice(0,5).map(({id,icon,label})=>(
        <button key={id} onClick={()=>setActive(id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,border:"none",background:"none",cursor:"pointer",padding:"4px 0",color:active===id?T.gold:T.fog,fontSize:10,...S.mono,fontWeight:active===id?600:400,transition:"all .15s"}}>
          <span style={{fontSize:20}}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

function PageBanner({img,title,sub,children}){
  return(
    <div style={{position:"relative",borderRadius:20,overflow:"hidden",marginBottom:28,minHeight:140}}>
      <img src={img} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.35}}/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,rgba(6,8,15,.96) 40%,rgba(6,8,15,.6) 100%)"}}/>
      <div style={{position:"relative",padding:"28px 30px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
        <div>
          <div style={{...S.title,fontSize:34,color:T.cream,fontWeight:700,lineHeight:1}}>{title}</div>
          {sub&&<div style={{fontSize:14,color:T.ash,marginTop:5,...S.mono}}>{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
function Dashboard({isMobile,budgets}){
  const [income,  setIncome]  = useState([]);
  const [expenses,setExpenses]= useState([]);
  const [debts,   setDebts]   = useState([]);
  const [rates,   setRates]   = useState(null);
  const [rateLoading, setRateLoading] = useState(true);
  const tipIndex = useState(()=>Math.floor(Math.random()*TIPS.length))[0];

  useEffect(()=>{
    fetchRates().then(r=>{ setRates(r); setRateLoading(false); });
  },[]);

  useEffect(()=>{
    const load=async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user) return;
      const [inc,exp,dbt]=await Promise.all([
        supabase.from('income').select('*').eq('user_id',user.id),
        supabase.from('expenses').select('*').eq('user_id',user.id),
        supabase.from('debts').select('*').eq('user_id',user.id),
      ]);
      setIncome(inc.data||[]);
      setExpenses(exp.data||[]);
      setDebts(dbt.data||[]);
    };
    load();
  },[]);

  const D=todayS();
  const todayInc=income.filter(i=>i.date===D).reduce((s,i)=>s+(+i.amount),0);
  const todayExp=expenses.filter(e=>e.date===D).reduce((s,e)=>s+(+e.amount),0);
  const totalInc=income.reduce((s,i)=>s+(+i.amount),0);
  const totalExp=expenses.reduce((s,e)=>s+(+e.amount),0);
  const net=totalInc-totalExp;

  const activeBudget=budgets&&budgets[0];
  const budgetSpent=activeBudget?activeBudget.categories.reduce((s,c)=>s+c.spent,0):0;
  const budgetLeft=activeBudget?activeBudget.totalCash-budgetSpent:0;

  // Real monthly chart data
  const monthMap={};
  income.forEach(i=>{const m=i.date?.slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={m,i:0,e:0};monthMap[m].i+=(+i.amount);});
  expenses.forEach(e=>{const m=e.date?.slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={m,i:0,e:0};monthMap[m].e+=(+e.amount);});
  const monthly=Object.values(monthMap).sort((a,b)=>a.m.localeCompare(b.m)).map(x=>({...x,label:x.m.slice(5)}));

  const spendByCat=expenses.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+(+e.amount);return a;},{});
  const pieData=Object.entries(spendByCat).map(([n,v])=>({name:n,value:v}));
  const recent=[...income.slice(0,3).map(i=>({...i,type:"income"})),...expenses.slice(0,3).map(e=>({...e,type:"expense"}))]
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  return(
    <div className="fade">
      {/* Hero */}
      <div style={{position:"relative",borderRadius:22,overflow:"hidden",marginBottom:26,background:"linear-gradient(120deg,#0A1428,#0E1E10)"}}>
        <img src={HERO_IMGS.dashboard} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.18}}/>
        <div style={{position:"relative",padding:isMobile?"22px 20px":"32px 36px"}}>
          <div style={{fontSize:12,color:T.fog,textTransform:"uppercase",letterSpacing:1.5,...S.mono,marginBottom:6}}>{new Date().toDateString()}</div>
          <div style={{...S.title,fontSize:isMobile?28:42,color:T.cream,fontWeight:700,letterSpacing:-.5,lineHeight:1.1}}>
            Good day <span style={{color:T.gold}}>✦</span>
          </div>
          <div style={{fontSize:15,color:T.ash,marginTop:8,...S.serif}}>Your financial summary at a glance.</div>
          <div style={{display:"flex",gap:isMobile?20:40,marginTop:22,flexWrap:"wrap"}}>
            {[{l:"All-Time Income",v:fmt(totalInc),c:T.emerald},{l:"All-Time Expenses",v:fmt(totalExp),c:T.rose},{l:"Net Balance",v:fmt(net),c:T.gold}].map(({l,v,c})=>(
              <div key={l}><div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:3}}>{l}</div><div style={{...S.title,fontSize:isMobile?18:24,color:c,fontWeight:700}}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Income Today"     value={fmt(todayInc)} sub="↑ today"   color={T.emerald} icon="💰" glow delay="fade-1"/>
        <StatCard label="Expenses Today"   value={fmt(todayExp)} sub="↓ today"   color={T.rose}    icon="📤" delay="fade-2"/>
        <StatCard label="Budget Remaining" value={activeBudget?fmt(Math.max(budgetLeft,0)):"No budget"} sub={activeBudget?(budgetLeft<0?"⚠ Overspent!":"✓ On track"):"Create one →"} color={!activeBudget||budgetLeft>=0?T.gold:T.rose} icon="🎯" delay="fade-1"/>
        <StatCard label="Net Today" value={fmt(todayInc-todayExp)} sub={(todayInc-todayExp)>=0?"✓ In the green":"⚠ Net loss"} color={(todayInc-todayExp)>=0?T.emerald:T.rose} icon="📊" delay="fade-2"/>
      </div>

      {/* Charts */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 5fr",gap:16,marginBottom:16}}>
        <div style={{...S.card,padding:22}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>By Category</div>
          {pieData.length===0?(
            <div style={{color:T.fog,fontSize:13,...S.serif,textAlign:"center",padding:"20px 0"}}>No expenses yet</div>
          ):(
            <ResponsiveContainer width="100%" height={150}>
              <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} dataKey="value" paddingAngle={3}>
                {pieData.map((_,i)=><Cell key={i} fill={SERIES_COLORS[i%SERIES_COLORS.length]}/>)}
              </Pie><Tooltip content={<CTip/>}/></PieChart>
            </ResponsiveContainer>
          )}
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px 10px",marginTop:10}}>
            {pieData.map((d,i)=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.ash,...S.mono}}>
                <div style={{width:7,height:7,borderRadius:2,background:SERIES_COLORS[i%SERIES_COLORS.length]}}/>{d.name}
              </div>
            ))}
          </div>
        </div>

        <div style={{...S.card,padding:22}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>Monthly Income vs Expenses</div>
          {monthly.length===0?(
            <div style={{color:T.fog,fontSize:14,...S.serif,textAlign:"center",padding:"40px 0"}}>Add income or expenses to see your monthly chart.</div>
          ):(
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={monthly} margin={{top:4,right:4,bottom:0,left:-20}}>
                <defs>
                  <linearGradient id="dai" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.emerald} stopOpacity={.3}/><stop offset="95%" stopColor={T.emerald} stopOpacity={0}/></linearGradient>
                  <linearGradient id="dae" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.rose} stopOpacity={.25}/><stop offset="95%" stopColor={T.rose} stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{fill:T.fog,fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:T.fog,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`}/>
                <Tooltip content={<CTip/>}/>
                <Area type="monotone" dataKey="i" stroke={T.emerald} fill="url(#dai)" strokeWidth={2.5} name="Income"/>
                <Area type="monotone" dataKey="e" stroke={T.rose}    fill="url(#dae)" strokeWidth={2.5} name="Expenses"/>
              </AreaChart>
            </ResponsiveContainer>
          )}
          <div style={{display:"flex",gap:20,marginTop:8}}>
            {[{c:T.emerald,l:"Income"},{c:T.rose,l:"Expenses"}].map(({c,l})=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.ash,...S.mono}}>
                <div style={{width:18,height:3,borderRadius:2,background:c}}/>{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent + Debt + Tip */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:16}}>
        <div style={{...S.card,padding:22}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>Recent Transactions</div>
          {recent.length===0&&<div style={{color:T.fog,fontSize:14,...S.serif}}>No transactions yet. Start recording income or expenses.</div>}
          {recent.map((t,i)=>(
            <div key={i} className="row-hover" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 8px",borderBottom:i<recent.length-1?`1px solid ${T.rim}`:"none",borderRadius:8}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:38,height:38,borderRadius:10,background:t.type==="income"?`${T.emerald}20`:`${T.rose}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                  {CATEGORY_ICONS[t.category]||"💳"}
                </div>
                <div>
                  <div style={{fontSize:14,color:T.cream,...S.serif}}>{t.source||t.description}</div>
                  <div style={{fontSize:11,color:T.fog,...S.mono}}>{t.category} · {t.date}</div>
                </div>
              </div>
              <div style={{fontSize:15,fontWeight:600,color:t.type==="income"?T.emerald:T.rose,...S.serif,flexShrink:0,marginLeft:12}}>
                {t.type==="income"?"+":"-"}{fmt(t.amount)}
              </div>
            </div>
          ))}
        </div>

        <div style={{...S.card,padding:22}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>Debt Alerts</div>
          {debts.length===0&&<div style={{color:T.fog,fontSize:14,...S.serif}}>No debts recorded.</div>}
          {debts.map(d=>(
            <div key={d.id} style={{padding:"12px",background:d.type==="i_owe"?`${T.rose}10`:`${T.emerald}10`,border:`1px solid ${d.type==="i_owe"?T.rose:T.emerald}25`,borderRadius:10,marginBottom:10}}>
              <div style={{fontSize:14,color:T.cream,...S.serif,fontWeight:600}}>{d.name}</div>
              <div style={{fontSize:12,color:T.fog,...S.mono,marginTop:2}}>{d.type==="i_owe"?"You owe":"Owes you"} · Due {d.due}</div>
              <div style={{fontSize:16,fontWeight:700,color:d.type==="i_owe"?T.rose:T.emerald,...S.title,marginTop:4}}>{fmt(d.amount)}</div>
            </div>
          ))}
          {/* Feature: rotating tips */}
          <div style={{marginTop:14,padding:"14px",background:`${T.gold}10`,border:`1px solid ${T.gold}25`,borderRadius:10}}>
            <div style={{fontSize:13,color:T.gold,...S.serif,fontWeight:600,marginBottom:4}}>💡 Tip of the day</div>
            <div style={{fontSize:13,color:T.ash,...S.serif,lineHeight:1.6}}>{TIPS[tipIndex]}</div>
          </div>
        </div>
      </div>

      {/* Exchange Rates + Business Score row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16,marginTop:16}}>
        {/* Exchange Rates */}
        <div style={{...S.card,padding:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,...S.mono}}>Live Exchange Rates</div>
            {rates&&<div style={{fontSize:10,color:T.fog,...S.mono}}>Updated {rates.updated}</div>}
          </div>
          {rateLoading&&<div style={{color:T.fog,fontSize:13,...S.serif}}>Fetching rates...</div>}
          {!rateLoading&&!rates&&<div style={{color:T.fog,fontSize:13,...S.serif}}>Could not load rates. Check your connection.</div>}
          {rates&&(
            <>
              {[{flag:"🇺🇸",code:"USD",label:"US Dollar"},{flag:"🇬🇧",code:"GBP",label:"British Pound"},{flag:"🇪🇺",code:"EUR",label:"Euro"}].map(({flag,code,label})=>(
                <div key={code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.rim}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>{flag}</span>
                    <div>
                      <div style={{fontSize:14,color:T.cream,...S.serif,fontWeight:600}}>{code}</div>
                      <div style={{fontSize:11,color:T.fog,...S.mono}}>{label}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{...S.title,fontSize:18,color:T.gold,fontWeight:700}}>GHS {rates[code]?.toFixed(2)}</div>
                    <div style={{fontSize:10,color:T.fog,...S.mono}}>per 1 {code}</div>
                  </div>
                </div>
              ))}
              <div style={{marginTop:12,padding:"10px 12px",background:`${T.sapphire}10`,border:`1px solid ${T.sapphire}25`,borderRadius:10}}>
                <div style={{fontSize:12,color:T.ash,...S.serif}}>
                  Your net balance of <span style={{color:T.gold,fontWeight:600}}>{fmt(net)}</span> ≈{" "}
                  <span style={{color:T.sapphire,fontWeight:600}}>${(net/rates.USD).toFixed(2)} USD</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Business Score */}
        {(()=>{
          const score = calcScore(income, expenses, budgets||[], debts);
          const {label,color} = scoreLabel(score);
          const pct = score ?? 0;
          return(
            <div style={{...S.card,padding:22}}>
              <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>Business Health Score</div>
              <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:16}}>
                <div style={{position:"relative",width:80,height:80,flexShrink:0}}>
                  <svg width="80" height="80" style={{transform:"rotate(-90deg)"}}>
                    <circle cx="40" cy="40" r="32" fill="none" stroke={T.rim} strokeWidth="8"/>
                    <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
                      strokeDasharray={`${(pct/100)*201} 201`} strokeLinecap="round"/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",...S.title,fontSize:20,fontWeight:700,color}}>
                    {score!==null?score:"—"}
                  </div>
                </div>
                <div>
                  <div style={{...S.title,fontSize:22,color,fontWeight:700,marginBottom:4}}>{label}</div>
                  <div style={{fontSize:12,color:T.fog,...S.mono,lineHeight:1.6}}>
                    Based on profit margin,<br/>budget adherence & consistency
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {l:"Profit margin",v:totalInc>0?`${(((totalInc-totalExp)/totalInc)*100).toFixed(1)}%`:"—",c:T.emerald},
                  {l:"Debt entries",v:`${debts.length}`,c:debts.length>2?T.rose:T.ash},
                  {l:"Budget active",v:budgets?.length>0?"Yes":"No",c:budgets?.length>0?T.emerald:T.fog},
                  {l:"Active this month",v:income.some(i=>i.date?.startsWith(todayS().slice(0,7)))||expenses.some(e=>e.date?.startsWith(todayS().slice(0,7)))?"Yes":"No",c:T.sapphire},
                ].map(({l,v,c})=>(
                  <div key={l} style={{background:`${T.rim}50`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:T.fog,...S.mono,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:14,color:c,fontWeight:600,...S.serif}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   INCOME PAGE — search, filter, edit, delete confirm, error handling
══════════════════════════════════════════════════════ */
function IncomePage({isMobile}){
  const [income,  setIncome]  = useState([]);
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [delTarget,setDelTarget]=useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [search,  setSearch]  = useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,  setDateTo]  =useState("");
  const [catFilter,setCatFilter]=useState("");
  const blank={amount:"",date:todayS(),source:"",category:"Business Revenue"};
  const [form,setForm]=useState(blank);
  const cats=["Business Revenue","Salary","Freelance","Food Sales","Investment","Other"];

  const load=useCallback(async()=>{
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error}=await supabase.from('income').select('*').eq('user_id',user.id).order('date',{ascending:false});
    if(!error) setIncome(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const openAdd =()=>{setEditing(null);setForm(blank);setModal(true);};
  const openEdit=item=>{setEditing(item);setForm({amount:item.amount,date:item.date,source:item.source,category:item.category});setModal(true);};

  const save=async()=>{
    if(!form.amount||!form.source) return;
    setSaving(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setSaving(false);return;}
    let error;
    if(editing){
      ({error}=await supabase.from('income').update({amount:+form.amount,date:form.date,source:form.source,category:form.category}).eq('id',editing.id));
    } else {
      ({error}=await supabase.from('income').insert({user_id:user.id,amount:+form.amount,date:form.date,source:form.source,category:form.category}));
    }
    setSaving(false);
    if(error){setToast({msg:"❌ Failed to save: "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Income saved",color:T.emerald});
    setModal(false);setEditing(null);setForm(blank);load();
  };

  const del=async()=>{
    if(!delTarget) return;
    const {error}=await supabase.from('income').delete().eq('id',delTarget.id);
    if(error){setToast({msg:"❌ Delete failed",color:T.rose});}
    else{setToast({msg:"✓ Deleted",color:T.emerald});}
    setDelTarget(null);load();
  };

  // Filter logic
  const filtered=income.filter(item=>{
    if(search&&!item.source?.toLowerCase().includes(search.toLowerCase())&&!item.category?.toLowerCase().includes(search.toLowerCase())) return false;
    if(dateFrom&&item.date<dateFrom) return false;
    if(dateTo&&item.date>dateTo) return false;
    if(catFilter&&item.category!==catFilter) return false;
    return true;
  });

  const total=income.reduce((s,i)=>s+(+i.amount),0);
  const month=income.filter(i=>i.date?.slice(0,7)===todayS().slice(0,7)).reduce((s,i)=>s+(+i.amount),0);
  const today=income.filter(i=>i.date===todayS()).reduce((s,i)=>s+(+i.amount),0);

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.dashboard} title="Income" sub="All money received across your businesses">
        <Btn onClick={openAdd}>+ Record Income</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="All-Time" value={fmt(total)} color={T.emerald} glow/>
        <StatCard label="This Month" value={fmt(month)} color={T.gold}/>
        <StatCard label="Today" value={fmt(today)} color={T.sapphire}/>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by source or category…"/>
      <FilterRow dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo} cats={cats} cat={catFilter} onCat={setCatFilter}/>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading...</div>
      ):(
        <div style={{...S.card,overflow:"hidden"}}>
          {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>{income.length===0?"No income yet — click + Record Income to add your first entry.":"No results match your filters."}</div>}
          {isMobile?filtered.map((item,i,arr)=>(
            <div key={item.id} className="row-hover" style={{padding:"14px 16px",borderBottom:i<arr.length-1?`1px solid ${T.rim}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:11,alignItems:"center"}}>
                <span style={{fontSize:20}}>{CATEGORY_ICONS[item.category]||"💰"}</span>
                <div>
                  <div style={{fontSize:14,color:T.cream,...S.serif}}>{item.source}</div>
                  <div style={{fontSize:11,color:T.fog,...S.mono}}>{item.category} · {item.date}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:14,fontWeight:600,color:T.emerald,...S.serif}}>+{fmt(item.amount)}</div>
                <button onClick={()=>openEdit(item)} style={S.editBtn}>✎</button>
                <button onClick={()=>setDelTarget(item)} style={S.delBtn}>✕</button>
              </div>
            </div>
          )):(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#090D14"}}>
                {["","Date","Source","Category","Amount",""].map((h,i)=><th key={i} style={{padding:"12px 18px",textAlign:"left",fontSize:11,color:T.fog,textTransform:"uppercase",letterSpacing:1,...S.mono,fontWeight:500}}>{h}</th>)}
              </tr></thead>
              <tbody>{filtered.map(item=>(
                <tr key={item.id} className="row-hover" style={{borderTop:`1px solid ${T.rim}`}}>
                  <td style={{padding:"12px 18px",fontSize:20}}>{CATEGORY_ICONS[item.category]||"💰"}</td>
                  <td style={{padding:"12px 18px",fontSize:13,color:T.fog,...S.mono}}>{item.date}</td>
                  <td style={{padding:"12px 18px",fontSize:15,color:T.cream,...S.serif}}>{item.source}</td>
                  <td style={{padding:"12px 18px"}}><Badge color={T.emerald}>{item.category}</Badge></td>
                  <td style={{padding:"12px 18px",fontSize:16,fontWeight:600,color:T.emerald,...S.title}}>+{fmt(item.amount)}</td>
                  <td style={{padding:"12px 18px"}}><div style={{display:"flex",gap:8}}>
                    <button onClick={()=>openEdit(item)} style={S.editBtn}>Edit</button>
                    <button onClick={()=>setDelTarget(item)} style={S.delBtn}>Delete</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      {modal&&<Drawer title={editing?"Edit Income":"Record Income"} onClose={()=>{setModal(false);setEditing(null);}}>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Source / Description" value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Client payment…"/>
        <FSelect label="Category" options={cats} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save} loading={saving}>{editing?"Update":"Save Income"}</Btn>
          <Btn variant="ghost" onClick={()=>{setModal(false);setEditing(null);}}>Cancel</Btn>
        </div>
      </Drawer>}
      {delTarget&&<DeleteConfirm what={`"${delTarget.source}" — ${fmt(delTarget.amount)}`} onConfirm={del} onCancel={()=>setDelTarget(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EXPENSES PAGE — search, filter, edit, delete confirm, error handling
══════════════════════════════════════════════════════ */
function ExpensesPage({isMobile}){
  const [expenses, setExpenses]=useState([]);
  const [modal,    setModal]   =useState(false);
  const [editing,  setEditing] =useState(null);
  const [delTarget,setDelTarget]=useState(null);
  const [loading,  setLoading] =useState(true);
  const [saving,   setSaving]  =useState(false);
  const [toast,    setToast]   =useState(null);
  const [search,   setSearch]  =useState("");
  const [dateFrom, setDateFrom]=useState("");
  const [dateTo,   setDateTo]  =useState("");
  const [catFilter,setCatFilter]=useState("");
  const blank={amount:"",date:todayS(),description:"",category:"Food"};
  const [form,setForm]=useState(blank);
  const cats=["Food","Transport","Business","Bills","Shopping","Healthcare","Entertainment","Education","Other"];

  const load=useCallback(async()=>{
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error}=await supabase.from('expenses').select('*').eq('user_id',user.id).order('date',{ascending:false});
    if(!error) setExpenses(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const openAdd =()=>{setEditing(null);setForm(blank);setModal(true);};
  const openEdit=item=>{setEditing(item);setForm({amount:item.amount,date:item.date,description:item.description,category:item.category});setModal(true);};

  const save=async()=>{
    if(!form.amount||!form.description) return;
    setSaving(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setSaving(false);return;}
    let error;
    if(editing){
      ({error}=await supabase.from('expenses').update({amount:+form.amount,date:form.date,description:form.description,category:form.category}).eq('id',editing.id));
    } else {
      ({error}=await supabase.from('expenses').insert({user_id:user.id,amount:+form.amount,date:form.date,description:form.description,category:form.category}));
    }
    setSaving(false);
    if(error){setToast({msg:"❌ Failed to save: "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Expense saved",color:T.emerald});
    setModal(false);setEditing(null);setForm(blank);load();
  };

  const del=async()=>{
    if(!delTarget) return;
    const {error}=await supabase.from('expenses').delete().eq('id',delTarget.id);
    if(error) setToast({msg:"❌ Delete failed",color:T.rose});
    else setToast({msg:"✓ Deleted",color:T.emerald});
    setDelTarget(null);load();
  };

  const filtered=expenses.filter(item=>{
    if(search&&!item.description?.toLowerCase().includes(search.toLowerCase())&&!item.category?.toLowerCase().includes(search.toLowerCase())) return false;
    if(dateFrom&&item.date<dateFrom) return false;
    if(dateTo&&item.date>dateTo) return false;
    if(catFilter&&item.category!==catFilter) return false;
    return true;
  });

  const total=expenses.reduce((s,e)=>s+(+e.amount),0);

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.budget} title="Expenses" sub="Every cedi spent, tracked with precision">
        <Btn onClick={openAdd}>+ Add Expense</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Total" value={fmt(total)} color={T.rose} glow/>
        <StatCard label="This Month" value={fmt(expenses.filter(e=>e.date?.slice(0,7)===todayS().slice(0,7)).reduce((s,e)=>s+(+e.amount),0))} color={T.gold}/>
        <StatCard label="Today" value={fmt(expenses.filter(e=>e.date===todayS()).reduce((s,e)=>s+(+e.amount),0))} color={T.rose}/>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by description or category…"/>
      <FilterRow dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo} cats={cats} cat={catFilter} onCat={setCatFilter}/>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading...</div>
      ):(
        <div style={{...S.card,overflow:"hidden"}}>
          {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>{expenses.length===0?"No expenses yet.":"No results match your filters."}</div>}
          {isMobile?filtered.map((item,i,arr)=>(
            <div key={item.id} className="row-hover" style={{padding:"14px 16px",borderBottom:i<arr.length-1?`1px solid ${T.rim}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:11,alignItems:"center"}}>
                <span style={{fontSize:20}}>{CATEGORY_ICONS[item.category]||"📤"}</span>
                <div>
                  <div style={{fontSize:14,color:T.cream,...S.serif}}>{item.description}</div>
                  <div style={{fontSize:11,color:T.fog,...S.mono}}>{item.category} · {item.date}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:14,fontWeight:600,color:T.rose,...S.serif}}>-{fmt(item.amount)}</div>
                <button onClick={()=>openEdit(item)} style={S.editBtn}>✎</button>
                <button onClick={()=>setDelTarget(item)} style={S.delBtn}>✕</button>
              </div>
            </div>
          )):(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#090D14"}}>
                {["","Date","Description","Category","Amount",""].map((h,i)=><th key={i} style={{padding:"12px 18px",textAlign:"left",fontSize:11,color:T.fog,textTransform:"uppercase",letterSpacing:1,...S.mono,fontWeight:500}}>{h}</th>)}
              </tr></thead>
              <tbody>{filtered.map(item=>(
                <tr key={item.id} className="row-hover" style={{borderTop:`1px solid ${T.rim}`}}>
                  <td style={{padding:"12px 18px",fontSize:20}}>{CATEGORY_ICONS[item.category]||"📤"}</td>
                  <td style={{padding:"12px 18px",fontSize:13,color:T.fog,...S.mono}}>{item.date}</td>
                  <td style={{padding:"12px 18px",fontSize:15,color:T.cream,...S.serif}}>{item.description}</td>
                  <td style={{padding:"12px 18px"}}><Badge color={T.rose}>{item.category}</Badge></td>
                  <td style={{padding:"12px 18px",fontSize:16,fontWeight:600,color:T.rose,...S.title}}>-{fmt(item.amount)}</td>
                  <td style={{padding:"12px 18px"}}><div style={{display:"flex",gap:8}}>
                    <button onClick={()=>openEdit(item)} style={S.editBtn}>Edit</button>
                    <button onClick={()=>setDelTarget(item)} style={S.delBtn}>Delete</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      {modal&&<Drawer title={editing?"Edit Expense":"Add Expense"} onClose={()=>{setModal(false);setEditing(null);}}>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What was this for?"/>
        <FSelect label="Category" options={cats} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save} loading={saving}>{editing?"Update":"Save Expense"}</Btn>
          <Btn variant="ghost" onClick={()=>{setModal(false);setEditing(null);}}>Cancel</Btn>
        </div>
      </Drawer>}
      {delTarget&&<DeleteConfirm what={`"${delTarget.description}" — ${fmt(delTarget.amount)}`} onConfirm={del} onCancel={()=>setDelTarget(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SALES PAGE — search, edit, delete confirm, error handling
══════════════════════════════════════════════════════ */
function SalesPage({isMobile}){
  const [sales,    setSales]   =useState([]);
  const [modal,    setModal]   =useState(false);
  const [editing,  setEditing] =useState(null);
  const [delTarget,setDelTarget]=useState(null);
  const [loading,  setLoading] =useState(true);
  const [saving,   setSaving]  =useState(false);
  const [toast,    setToast]   =useState(null);
  const [receipt,  setReceipt] =useState(null);
  const [search,   setSearch]  =useState("");
  const [dateFrom, setDateFrom]=useState("");
  const [dateTo,   setDateTo]  =useState("");
  const blank={product:"",qty:1,price:"",cost:"",customer:"",date:todayS()};
  const [form,setForm]=useState(blank);

  const load=useCallback(async()=>{
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error}=await supabase.from('sales').select('*').eq('user_id',user.id).order('date',{ascending:false});
    if(!error) setSales(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const openAdd =()=>{setEditing(null);setForm(blank);setModal(true);};
  const openEdit=item=>{setEditing(item);setForm({product:item.product,qty:item.qty,price:item.price,cost:item.cost||"",customer:item.customer||"",date:item.date});setModal(true);};

  const save=async()=>{
    if(!form.product||!form.price) return;
    setSaving(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setSaving(false);return;}
    let error;
    if(editing){
      ({error}=await supabase.from('sales').update({product:form.product,qty:+form.qty,price:+form.price,cost:+form.cost||0,customer:form.customer,date:form.date}).eq('id',editing.id));
    } else {
      ({error}=await supabase.from('sales').insert({user_id:user.id,product:form.product,qty:+form.qty,price:+form.price,cost:+form.cost||0,customer:form.customer,date:form.date}));
    }
    setSaving(false);
    if(error){setToast({msg:"❌ Failed to save: "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Sale saved",color:T.emerald});
    setModal(false);setEditing(null);setForm(blank);load();
  };

  const del=async()=>{
    if(!delTarget) return;
    const {error}=await supabase.from('sales').delete().eq('id',delTarget.id);
    if(error) setToast({msg:"❌ Delete failed",color:T.rose});
    else setToast({msg:"✓ Deleted",color:T.emerald});
    setDelTarget(null);load();
  };

  const filtered=sales.filter(item=>{
    if(search&&!item.product?.toLowerCase().includes(search.toLowerCase())&&!item.customer?.toLowerCase().includes(search.toLowerCase())) return false;
    if(dateFrom&&item.date<dateFrom) return false;
    if(dateTo&&item.date>dateTo) return false;
    return true;
  });

  const totalRev=sales.reduce((s,s2)=>s+(+s2.qty * +s2.price),0);
  const totalOrders=sales.length;

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.sales} title="Sales" sub="Track every product and service sold">
        <Btn onClick={openAdd}>+ Record Sale</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Total Revenue" value={fmt(totalRev)} color={T.gold} glow/>
        <StatCard label="Total Orders"  value={`${totalOrders} orders`} color={T.sapphire}/>
        <StatCard label="Avg Order"     value={fmt(totalRev/Math.max(totalOrders,1))} color={T.emerald}/>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by product or customer…"/>
      <FilterRow dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo}/>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading...</div>
      ):(
        <div style={{display:"grid",gap:12}}>
          {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.fog,...S.card,borderRadius:18,...S.serif,fontSize:16}}>{sales.length===0?"No sales yet.":"No results match your filters."}</div>}
          {filtered.map(item=>(
            <div key={item.id} className="card-lift" style={{...S.card,borderRadius:16,padding:isMobile?"14px 16px":"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{display:"flex",gap:14,alignItems:"center",flex:1}}>
                <div style={{width:44,height:44,borderRadius:12,background:`${T.gold}18`,border:`1px solid ${T.gold}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🛒</div>
                <div>
                  <div style={{fontSize:16,color:T.cream,...S.serif,fontWeight:600}}>{item.product}</div>
                  <div style={{fontSize:12,color:T.fog,...S.mono,marginTop:2}}>Qty: {item.qty} × {fmt(item.price)} · {item.date}</div>
                  {item.customer&&<div style={{fontSize:12,color:T.sapphire,...S.mono,marginTop:1}}>👤 {item.customer}</div>}
                  {item.cost>0&&<div style={{fontSize:11,color:T.emerald,...S.mono,marginTop:2}}>Margin: {(((+item.price - +item.cost)/+item.price)*100).toFixed(1)}% · Profit/unit: {fmt(+item.price - +item.cost)}</div>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{...S.title,fontSize:isMobile?18:22,fontWeight:700,color:T.gold}}>{fmt(+item.qty * +item.price)}</div>
                <button onClick={()=>openEdit(item)} style={S.editBtn}>Edit</button>
                <button onClick={()=>setDelTarget(item)} style={S.delBtn}>Delete</button>
                <button onClick={()=>setReceipt(item)} style={{background:`${T.gold}18`,border:`1px solid ${T.gold}40`,borderRadius:6,padding:"4px 10px",color:T.gold,fontSize:12,cursor:"pointer",...S.mono}}>Receipt</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {receipt&&<ReceiptModal item={receipt} businessName={null} onClose={()=>setReceipt(null)}/>}
      {modal&&<Drawer title={editing?"Edit Sale":"Record Sale"} onClose={()=>{setModal(false);setEditing(null);}}>
        <FInput label="Product / Service" value={form.product} onChange={e=>setForm(f=>({...f,product:e.target.value}))} placeholder="e.g. Waakye large, n8n setup…"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <FInput label="Quantity" type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/>
          <FInput label="Unit Price (GHS)" type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
        </div>
        {form.qty&&form.price&&<div style={{background:`${T.gold}12`,border:`1px solid ${T.gold}35`,borderRadius:10,padding:"10px 14px",marginBottom:14,...S.title,fontSize:18,color:T.gold,fontWeight:700}}>Total: {fmt(+form.qty * +form.price)}</div>}
        <FInput label="Cost Price per Unit (GHS) — optional" type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))} placeholder="What did it cost you to make/buy this?"/>
        {form.cost&&form.price&&+form.price>0&&(
          <div style={{background:`${T.emerald}12`,border:`1px solid ${T.emerald}30`,borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:T.emerald,...S.mono}}>
            Margin: {(((+form.price - +form.cost) / +form.price)*100).toFixed(1)}%
            &nbsp;·&nbsp; Profit per unit: {fmt(+form.price - +form.cost)}
          </div>
        )}
        <FInput label="Customer (optional)" value={form.customer} onChange={e=>setForm(f=>({...f,customer:e.target.value}))} placeholder="Customer name"/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save} loading={saving}>{editing?"Update":"Save Sale"}</Btn>
          <Btn variant="ghost" onClick={()=>{setModal(false);setEditing(null);}}>Cancel</Btn>
        </div>
      </Drawer>}
      {delTarget&&<DeleteConfirm what={`"${delTarget.product}"`} onConfirm={del} onCancel={()=>setDelTarget(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BUDGET PAGE — local state, delete confirm
══════════════════════════════════════════════════════ */
function BudgetPage({data,setData,isMobile}){
  const [selected,  setSelected]  =useState(data.budgets[0]?.id||null);
  const [createModal,setCreateModal]=useState(false);
  const [addCatModal,setAddCat]   =useState(false);
  const [recordModal,setRecord]   =useState(null);
  const [deleteCfm,  setDeleteCfm]=useState(null);
  const [nbForm,     setNbForm]   =useState({name:"",date:todayS(),totalCash:""});
  const [newCat,     setNewCat]   =useState({name:"",budget:"",icon:"📦"});
  const [spendAmt,   setSpendAmt] =useState("");

  const budget   =data.budgets.find(b=>b.id===selected);
  const totAlloc =budget?budget.categories.reduce((s,c)=>s+c.budget,0):0;
  const totSpent =budget?budget.categories.reduce((s,c)=>s+c.spent,0):0;
  const free     =budget?budget.totalCash-totAlloc:0;

  const createBudget=()=>{
    if(!nbForm.name||!nbForm.totalCash) return;
    const nb={id:uid(),name:nbForm.name,date:nbForm.date,totalCash:+nbForm.totalCash,color:T.gold,categories:[]};
    setData(d=>({...d,budgets:[...d.budgets,nb]}));
    setSelected(nb.id);setCreateModal(false);setNbForm({name:"",date:todayS(),totalCash:""});
  };
  const deleteBudget=id=>{
    const remaining=data.budgets.filter(b=>b.id!==id);
    setData(d=>({...d,budgets:remaining}));
    setSelected(remaining[0]?.id||null);setDeleteCfm(null);
  };
  const addCategory=()=>{
    if(!newCat.name||!newCat.budget||!selected) return;
    setData(d=>({...d,budgets:d.budgets.map(b=>b.id!==selected?b:{...b,categories:[...b.categories,{id:uid(),name:newCat.name,icon:newCat.icon,budget:+newCat.budget,spent:0}]})}));
    setAddCat(false);setNewCat({name:"",budget:"",icon:"📦"});
  };
  const recordSpend=catId=>{
    if(!spendAmt||+spendAmt<=0) return;
    setData(d=>({...d,budgets:d.budgets.map(b=>b.id!==selected?b:{...b,categories:b.categories.map(c=>c.id!==catId?c:{...c,spent:c.spent+(+spendAmt)})})}));
    setRecord(null);setSpendAmt("");
  };
  const removeCategory=catId=>{
    setData(d=>({...d,budgets:d.budgets.map(b=>b.id!==selected?b:{...b,categories:b.categories.filter(c=>c.id!==catId)})}));
  };
  const catIcons=["🍛","🚕","🛍","📦","⚡","💊","🎬","📚","🏠","💼","🍺","✈️","🎮","📱"];

  return(
    <div className="fade">
      <PageBanner img={HERO_IMGS.budget} title="Daily Budget" sub="Create, manage and track your budgets">
        <div style={{display:"flex",gap:10}}>
          {budget&&<Btn variant="outline" sm onClick={()=>setAddCat(true)}>+ Category</Btn>}
          <Btn onClick={()=>setCreateModal(true)}>+ New Budget</Btn>
        </div>
      </PageBanner>

      {data.budgets.length>0?(
        <>
          <div style={{display:"flex",gap:10,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
            {data.budgets.map(b=>(
              <button key={b.id} onClick={()=>setSelected(b.id)} style={{padding:"8px 18px",borderRadius:24,border:`1px solid ${selected===b.id?T.gold:T.rim}`,background:selected===b.id?`${T.gold}18`:T.card,color:selected===b.id?T.gold:T.ash,...S.serif,fontSize:14,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .2s"}}>
                {b.name}
              </button>
            ))}
          </div>
          {budget&&(
            <>
              <div style={{background:"linear-gradient(135deg,#0D1E10,#081410)",border:`1px solid ${T.emerald}28`,borderRadius:18,padding:isMobile?"18px 20px":"22px 28px",marginBottom:20,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:-50,right:-50,width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle,${T.emerald}14 0%,transparent 70%)`}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:12,color:T.emerald,textTransform:"uppercase",letterSpacing:1.3,...S.mono,marginBottom:6,opacity:.8}}>Total Cash · {budget.date}</div>
                    <div style={{...S.title,fontSize:isMobile?36:48,color:T.cream,fontWeight:700,letterSpacing:-1.5,lineHeight:1}}>{fmt(budget.totalCash)}</div>
                    <div style={{display:"flex",gap:isMobile?14:28,marginTop:14,flexWrap:"wrap"}}>
                      {[{l:"Allocated",v:fmt(totAlloc),c:T.gold},{l:"Spent",v:fmt(totSpent),c:T.rose},{l:"Unallocated",v:fmt(free),c:T.emerald}].map(({l,v,c})=>(
                        <div key={l}><div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:3}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c,...S.serif}}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <button onClick={()=>setDeleteCfm(budget.id)} style={{background:`${T.rose}18`,border:`1px solid ${T.rose}40`,borderRadius:8,padding:"6px 14px",color:T.rose,fontSize:13,cursor:"pointer",...S.mono}}>Delete Budget</button>
                </div>
              </div>
              {budget.categories.length===0&&(
                <div style={{textAlign:"center",padding:"48px 24px",...S.card,borderRadius:18,color:T.fog,...S.serif,fontSize:16}}>
                  No categories yet. Click <strong style={{color:T.gold}}>+ Category</strong> to add one.
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                {budget.categories.map(cat=>{
                  const pct=cat.budget>0?Math.min((cat.spent/cat.budget)*100,100):0;
                  const over=cat.spent>cat.budget;
                  const bc=over?T.rose:pct>70?T.gold:T.emerald;
                  const rem=cat.budget-cat.spent;
                  return(
                    <div key={cat.id} className="card-lift" style={{...S.card,borderRadius:18,padding:20}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:26}}>{cat.icon}</span>
                          <span style={{fontSize:16,color:T.cream,...S.serif,fontWeight:600}}>{cat.name}</span>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {over&&<Badge color={T.rose}>⚠ Over</Badge>}
                          <button onClick={()=>removeCategory(cat.id)} style={{background:"none",border:"none",color:T.fog,cursor:"pointer",fontSize:14,opacity:.6}}>✕</button>
                        </div>
                      </div>
                      <div style={{height:8,background:T.night,borderRadius:4,marginBottom:14,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${bc}80,${bc})`,borderRadius:4,transition:"width .7s ease"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,...S.mono,marginBottom:12}}>
                        <span style={{color:T.fog}}>Budget <span style={{color:T.cream,fontWeight:500}}>{fmt(cat.budget)}</span></span>
                        <span style={{color:T.fog}}>Spent <span style={{color:T.rose,fontWeight:500}}>{fmt(cat.spent)}</span></span>
                      </div>
                      <div style={{fontSize:15,fontWeight:600,color:over?T.rose:T.emerald,...S.serif,marginBottom:14}}>
                        {over?`GHS ${Math.abs(rem).toFixed(2)} overspent`:`GHS ${rem.toFixed(2)} remaining`}
                      </div>
                      <Btn variant="outline" sm full onClick={()=>{setRecord(cat.id);setSpendAmt("");}}>Record Spend</Btn>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ):(
        <div style={{textAlign:"center",padding:"72px 24px",...S.card,borderRadius:22}}>
          <div style={{fontSize:52,marginBottom:16}}>📊</div>
          <div style={{...S.title,fontSize:26,color:T.cream,marginBottom:8}}>No budgets yet</div>
          <div style={{fontSize:15,color:T.fog,...S.serif,marginBottom:24}}>Create your first daily budget to start tracking your spending.</div>
          <Btn onClick={()=>setCreateModal(true)}>+ Create First Budget</Btn>
        </div>
      )}

      {createModal&&<Drawer title="Create New Budget" onClose={()=>setCreateModal(false)}>
        <FInput label="Budget Name" value={nbForm.name} onChange={e=>setNbForm(f=>({...f,name:e.target.value}))} placeholder="e.g. March Daily Budget"/>
        <FInput label="Total Cash Available (GHS)" type="number" value={nbForm.totalCash} onChange={e=>setNbForm(f=>({...f,totalCash:e.target.value}))} placeholder="e.g. 500"/>
        <FInput label="Date" type="date" value={nbForm.date} onChange={e=>setNbForm(f=>({...f,date:e.target.value}))}/>
        <div style={{display:"flex",gap:10}}>
          <Btn full onClick={createBudget}>Create Budget</Btn>
          <Btn variant="ghost" onClick={()=>setCreateModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}

      {addCatModal&&<Drawer title="Add Category" subtitle={`Adding to: ${budget?.name}`} onClose={()=>setAddCat(false)}>
        <FInput label="Category Name" value={newCat.name} onChange={e=>setNewCat(f=>({...f,name:e.target.value}))} placeholder="e.g. Food, Transport…"/>
        <FInput label="Budget Amount (GHS)" type="number" value={newCat.budget} onChange={e=>setNewCat(f=>({...f,budget:e.target.value}))} placeholder="e.g. 80"/>
        <Field label="Icon">
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
            {catIcons.map(ic=><button key={ic} onClick={()=>setNewCat(f=>({...f,icon:ic}))} style={{width:38,height:38,borderRadius:8,border:`1px solid ${newCat.icon===ic?T.gold:T.rim}`,background:newCat.icon===ic?`${T.gold}20`:T.card,fontSize:20,cursor:"pointer"}}>{ic}</button>)}
          </div>
        </Field>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={addCategory}>Add Category</Btn>
          <Btn variant="ghost" onClick={()=>setAddCat(false)}>Cancel</Btn>
        </div>
      </Drawer>}

      {recordModal&&<Drawer title="Record Spending" subtitle={`Category: ${budget?.categories.find(c=>c.id===recordModal)?.name}`} onClose={()=>setRecord(null)}>
        <FInput label="Amount Spent (GHS)" type="number" value={spendAmt} onChange={e=>setSpendAmt(e.target.value)} placeholder="0.00"/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={()=>recordSpend(recordModal)}>Record</Btn>
          <Btn variant="ghost" onClick={()=>setRecord(null)}>Cancel</Btn>
        </div>
      </Drawer>}

      {deleteCfm&&<DeleteConfirm what={`budget "${budget?.name}"`} onConfirm={()=>deleteBudget(deleteCfm)} onCancel={()=>setDeleteCfm(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CUSTOMERS PAGE
══════════════════════════════════════════════════════ */
function CustomersPage({isMobile}){
  const [customers,setCustomers]=useState([]);
  const [modal,    setModal]   =useState(false);
  const [loading,  setLoading] =useState(true);
  const [selected, setSel]     =useState(null);
  const [toast,    setToast]   =useState(null);
  const [search,   setSearch]  =useState("");
  const [form,     setForm]    =useState({name:"",phone:"",note:""});

  const load=useCallback(async()=>{
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error}=await supabase.from('customers').select('*').eq('user_id',user.id).order('total_spent',{ascending:false});
    if(!error) setCustomers(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.name) return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const {error}=await supabase.from('customers').insert({user_id:user.id,name:form.name,phone:form.phone,note:form.note,total_spent:0,purchases:0,last_seen:todayS()});
    if(error){setToast({msg:"❌ Failed: "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Customer added",color:T.emerald});
    setModal(false);setForm({name:"",phone:"",note:""});load();
  };

  const filtered=customers.filter(c=>!search||c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search));
  const totalRev=customers.reduce((s,c)=>s+(+c.total_spent||0),0);
  const topCust=customers[0];

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.customers} title="Customers" sub="Your mini CRM — know who drives your revenue">
        <Btn onClick={()=>setModal(true)}>+ Add Customer</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Total Customers" value={customers.length}   color={T.sapphire}/>
        <StatCard label="Total Revenue"   value={fmt(totalRev)}      color={T.gold} glow/>
        <StatCard label="Top Customer"    value={topCust?.name||"—"} color={T.emerald} sub={topCust?fmt(topCust.total_spent):""}/>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…"/>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading...</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
          {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:T.fog,...S.card,borderRadius:18,...S.serif,fontSize:16,gridColumn:"1/-1"}}>{customers.length===0?"No customers yet.":"No results match your search."}</div>}
          {filtered.map((c,i)=>(
            <div key={c.id} className="card-lift" onClick={()=>setSel(c)} style={{...S.card,borderRadius:18,padding:22,cursor:"pointer",position:"relative",overflow:"hidden",border:`1px solid ${i===0?T.gold+"45":T.rim}`}}>
              {i===0&&<div style={{position:"absolute",top:14,right:14,fontSize:10,background:`${T.gold}20`,color:T.gold,padding:"3px 9px",borderRadius:20,...S.mono,fontWeight:700}}>★ TOP</div>}
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                <div style={{width:50,height:50,borderRadius:14,background:`linear-gradient(135deg,${SERIES_COLORS[i%SERIES_COLORS.length]}50,${SERIES_COLORS[i%SERIES_COLORS.length]}20)`,border:`1px solid ${SERIES_COLORS[i%SERIES_COLORS.length]}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:SERIES_COLORS[i%SERIES_COLORS.length],flexShrink:0,...S.title}}>
                  {c.name[0]}
                </div>
                <div>
                  <div style={{fontSize:17,color:T.cream,...S.serif,fontWeight:600}}>{c.name}</div>
                  <div style={{fontSize:12,color:T.fog,...S.mono}}>{c.phone}</div>
                  {c.note&&<div style={{fontSize:12,color:T.ash,...S.serif,marginTop:2,fontStyle:"italic"}}>{c.note}</div>}
                </div>
              </div>
              <div style={{borderTop:`1px solid ${T.rim}`,paddingTop:12,display:"flex",justifyContent:"space-between"}}>
                <div><div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:3}}>Total Spent</div><div style={{...S.title,fontSize:20,color:T.gold,fontWeight:700}}>{fmt(c.total_spent||0)}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:3}}>Purchases</div><div style={{...S.title,fontSize:20,color:T.cream,fontWeight:700}}>{c.purchases||0}x</div></div>
              </div>
              <div style={{fontSize:11,color:T.fog,...S.mono,marginTop:8}}>Last seen {c.last_seen}</div>
            </div>
          ))}
        </div>
      )}
      {modal&&<Drawer title="Add Customer" onClose={()=>setModal(false)}>
        <FInput label="Customer Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Kofi Mensah"/>
        <FInput label="Phone Number"  value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. 0244 123 456"/>
        <FTextarea label="Note (optional)" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Any details about this customer…"/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save}>Save Customer</Btn>
          <Btn variant="ghost" onClick={()=>setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
      {selected&&<Drawer title={selected.name} subtitle={`Customer profile · ${selected.phone}`} onClose={()=>setSel(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
          {[{l:"Total Spent",v:fmt(selected.total_spent||0),c:T.gold},{l:"Purchases",v:`${selected.purchases||0}x`,c:T.sapphire}].map(({l,v,c})=>(
            <div key={l} style={{...S.card,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:5}}>{l}</div>
              <div style={{...S.title,fontSize:24,color:c,fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:14,color:T.ash,...S.serif,lineHeight:1.7,marginBottom:20}}>{selected.note||"No notes for this customer."}</div>
        <div style={{fontSize:12,color:T.fog,...S.mono}}>Last seen: {selected.last_seen}</div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DEBTS PAGE
══════════════════════════════════════════════════════ */
function DebtsPage({isMobile}){
  const [debts,   setDebts]  =useState([]);
  const [modal,   setModal]  =useState(false);
  const [loading, setLoading]=useState(true);
  const [toast,   setToast]  =useState(null);
  const [form,    setForm]   =useState({name:"",type:"owed_to_me",amount:"",due:"",note:""});

  const load=useCallback(async()=>{
    setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error}=await supabase.from('debts').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
    if(!error) setDebts(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.name||!form.amount) return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const {error}=await supabase.from('debts').insert({user_id:user.id,name:form.name,type:form.type,amount:+form.amount,due:form.due||null,note:form.note});
    if(error){setToast({msg:"❌ Failed: "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Saved",color:T.emerald});
    setModal(false);setForm({name:"",type:"owed_to_me",amount:"",due:"",note:""});load();
  };

  const settle=async id=>{
    const {error}=await supabase.from('debts').delete().eq('id',id);
    if(error) setToast({msg:"❌ Failed",color:T.rose});
    else setToast({msg:"✓ Settled",color:T.emerald});
    load();
  };

  const owedToMe=debts.filter(d=>d.type==="owed_to_me");
  const iOwe    =debts.filter(d=>d.type==="i_owe");
  const netDebt =owedToMe.reduce((s,d)=>s+(+d.amount),0)-iOwe.reduce((s,d)=>s+(+d.amount),0);

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.sales} title="Debts & Credits" sub="Track who owes you and what you owe">
        <Btn onClick={()=>setModal(true)}>+ Add Entry</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Owed to Me"   value={fmt(owedToMe.reduce((s,d)=>s+(+d.amount),0))} color={T.emerald} glow/>
        <StatCard label="I Owe"        value={fmt(iOwe.reduce((s,d)=>s+(+d.amount),0))}     color={T.rose}/>
        <StatCard label="Net Position" value={fmt(netDebt)} color={netDebt>=0?T.gold:T.rose} sub={netDebt>=0?"You're ahead":"You owe more"}/>
      </div>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading...</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20}}>
          <div>
            <div style={{fontSize:12,color:T.emerald,textTransform:"uppercase",letterSpacing:1.2,...S.mono,marginBottom:12,paddingLeft:4}}>💚 Owed to Me</div>
            {owedToMe.length===0&&<div style={{...S.card,borderRadius:14,padding:20,color:T.fog,...S.serif,textAlign:"center"}}>None recorded</div>}
            {owedToMe.map(d=>(
              <div key={d.id} className="card-lift" style={{...S.card,border:`1px solid ${T.emerald}30`,borderRadius:14,padding:18,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:16,color:T.cream,...S.serif,fontWeight:600}}>{d.name}</div>
                    {d.note&&<div style={{fontSize:12,color:T.fog,...S.mono,marginTop:2}}>{d.note}</div>}
                    {d.due&&<div style={{fontSize:12,color:T.gold,...S.mono,marginTop:4}}>Due: {d.due}</div>}
                  </div>
                  <div style={{...S.title,fontSize:20,color:T.emerald,fontWeight:700}}>{fmt(d.amount)}</div>
                </div>
                <Btn variant="emerald" sm style={{marginTop:12}} onClick={()=>settle(d.id)}>Mark Settled ✓</Btn>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:12,color:T.rose,textTransform:"uppercase",letterSpacing:1.2,...S.mono,marginBottom:12,paddingLeft:4}}>❤ I Owe</div>
            {iOwe.length===0&&<div style={{...S.card,borderRadius:14,padding:20,color:T.fog,...S.serif,textAlign:"center"}}>None recorded</div>}
            {iOwe.map(d=>(
              <div key={d.id} className="card-lift" style={{...S.card,border:`1px solid ${T.rose}30`,borderRadius:14,padding:18,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:16,color:T.cream,...S.serif,fontWeight:600}}>{d.name}</div>
                    {d.note&&<div style={{fontSize:12,color:T.fog,...S.mono,marginTop:2}}>{d.note}</div>}
                    {d.due&&<div style={{fontSize:12,color:T.rose,...S.mono,marginTop:4}}>Due: {d.due}</div>}
                  </div>
                  <div style={{...S.title,fontSize:20,color:T.rose,fontWeight:700}}>{fmt(d.amount)}</div>
                </div>
                <Btn variant="danger" sm style={{marginTop:12}} onClick={()=>settle(d.id)}>Mark Paid ✓</Btn>
              </div>
            ))}
          </div>
        </div>
      )}
      {modal&&<Drawer title="Add Debt / Credit" onClose={()=>setModal(false)}>
        <FInput label="Person / Company Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Kofi Mensah"/>
        <FSelect label="Type" options={[{value:"owed_to_me",label:"💚 Owed to Me"},{value:"i_owe",label:"❤ I Owe"}]} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Due Date (optional)" type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))}/>
        <FTextarea label="Note (optional)" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="What is this for?"/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save}>Save</Btn>
          <Btn variant="ghost" onClick={()=>setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GOALS PAGE — Supabase connected
   SQL to run in Supabase SQL Editor:
   create table goals (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users not null,
     title text not null,
     target numeric not null,
     saved numeric default 0,
     deadline text,
     icon text default '🎯',
     created_at timestamptz default now()
   );
   create policy "goals_policy" on goals for all
     using (auth.uid()=user_id) with check (auth.uid()=user_id);
   alter table goals enable row level security;
══════════════════════════════════════════════════════ */
function GoalsPage({isMobile}){
  const [goals,   setGoals]   = useState([]);
  const [modal,   setModal]   = useState(false);
  const [addModal,setAddModal]= useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [delTarget,setDelTarget] = useState(null);
  const [addAmt,  setAddAmt]  = useState("");
  const [activeGoal,setActiveGoal] = useState(null);
  const blank = {title:"",target:"",saved:"",deadline:"",icon:"🎯"};
  const [form,setForm] = useState(blank);
  const icons = ["🎯","🏠","🚗","✈️","📱","💼","🎓","💍","🏋","🌍","🛒","💰"];

  const load = useCallback(async()=>{
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    if(!user){setLoading(false);return;}
    const {data,error} = await supabase.from('goals').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
    if(!error) setGoals(data||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save = async()=>{
    if(!form.title||!form.target) return;
    setSaving(true);
    const {data:{user}} = await supabase.auth.getUser();
    if(!user){setSaving(false);return;}
    const {error} = await supabase.from('goals').insert({
      user_id:user.id, title:form.title, target:+form.target,
      saved:+form.saved||0, deadline:form.deadline||null, icon:form.icon
    });
    setSaving(false);
    if(error){setToast({msg:"❌ "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Goal created",color:T.emerald});
    setModal(false);setForm(blank);load();
  };

  const addToGoal = async()=>{
    if(!addAmt||!activeGoal) return;
    const newSaved = Math.min(+activeGoal.saved + +addAmt, +activeGoal.target);
    const {error} = await supabase.from('goals').update({saved:newSaved}).eq('id',activeGoal.id);
    if(error){setToast({msg:"❌ "+error.message,color:T.rose});return;}
    setToast({msg:"✓ Progress updated",color:T.emerald});
    setAddModal(false);setAddAmt("");setActiveGoal(null);load();
  };

  const del = async()=>{
    if(!delTarget) return;
    await supabase.from('goals').delete().eq('id',delTarget.id);
    setToast({msg:"✓ Goal deleted",color:T.emerald});
    setDelTarget(null);load();
  };

  const totalTarget = goals.reduce((s,g)=>s+(+g.target),0);
  const totalSaved  = goals.reduce((s,g)=>s+(+g.saved),0);

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.budget} title="Goals" sub="Set targets, track progress, stay motivated">
        <Btn onClick={()=>setModal(true)}>+ New Goal</Btn>
      </PageBanner>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Active Goals"  value={goals.length}      color={T.sapphire}/>
        <StatCard label="Total Target"  value={fmt(totalTarget)}  color={T.gold} glow/>
        <StatCard label="Total Saved"   value={fmt(totalSaved)}   color={T.emerald} sub={totalTarget>0?`${((totalSaved/totalTarget)*100).toFixed(0)}% of all targets`:""}/>
      </div>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading goals...</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>
          {goals.length===0&&(
            <div style={{...S.card,padding:48,textAlign:"center",gridColumn:"1/-1",borderRadius:18}}>
              <div style={{fontSize:48,marginBottom:12}}>🎯</div>
              <div style={{...S.title,fontSize:22,color:T.cream,marginBottom:8}}>No goals yet</div>
              <div style={{fontSize:14,color:T.fog,...S.serif,marginBottom:20}}>Set a savings goal — a container, a laptop, school fees. Track every cedi you save toward it.</div>
              <Btn onClick={()=>setModal(true)}>+ Create First Goal</Btn>
            </div>
          )}
          {goals.map(g=>{
            const pct = +g.target>0 ? Math.min(100,(+g.saved/+g.target)*100) : 0;
            const done = pct>=100;
            const remaining = +g.target - +g.saved;
            const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline)-new Date())/(1000*60*60*24)) : null;
            return(
              <div key={g.id} className="card-lift" style={{...S.card,borderRadius:18,padding:22,border:`1px solid ${done?T.emerald+"60":T.rim}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:46,height:46,borderRadius:12,background:`${done?T.emerald:T.gold}20`,border:`1px solid ${done?T.emerald:T.gold}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
                      {done?"✅":g.icon}
                    </div>
                    <div>
                      <div style={{fontSize:16,color:T.cream,...S.serif,fontWeight:600}}>{g.title}</div>
                      {g.deadline&&<div style={{fontSize:11,color:daysLeft<0?T.rose:daysLeft<14?T.gold:T.fog,...S.mono,marginTop:2}}>
                        {daysLeft<0?"Deadline passed":`${daysLeft} days left`} · {g.deadline}
                      </div>}
                    </div>
                  </div>
                  <button onClick={()=>setDelTarget(g)} style={{...S.delBtn,padding:"3px 8px"}}>✕</button>
                </div>
                {/* Progress bar */}
                <div style={{height:10,background:T.night,borderRadius:5,marginBottom:10,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${done?T.emerald:T.gold}80,${done?T.emerald:T.gold})`,borderRadius:5,transition:"width .8s ease"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,...S.mono,marginBottom:14}}>
                  <span style={{color:T.fog}}>Saved <span style={{color:T.emerald,fontWeight:600}}>{fmt(g.saved)}</span></span>
                  <span style={{color:T.fog}}>Target <span style={{color:T.gold,fontWeight:600}}>{fmt(g.target)}</span></span>
                </div>
                {!done&&<div style={{fontSize:14,color:T.ash,...S.serif,marginBottom:14}}>
                  <span style={{color:T.cream,fontWeight:600}}>{fmt(remaining)}</span> still needed · <span style={{color:T.gold,fontWeight:600}}>{pct.toFixed(0)}%</span> complete
                </div>}
                {done&&<div style={{fontSize:14,color:T.emerald,...S.serif,fontWeight:600,marginBottom:14}}>🎉 Goal reached!</div>}
                {!done&&<Btn variant="outline" sm full onClick={()=>{setActiveGoal(g);setAddAmt("");setAddModal(true);}}>+ Add Savings</Btn>}
              </div>
            );
          })}
        </div>
      )}

      {/* New Goal Modal */}
      {modal&&<Drawer title="New Goal" subtitle="Set a savings target" onClose={()=>{setModal(false);setForm(blank);}}>
        <FInput label="Goal Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Buy a laptop, Save for container…"/>
        <FInput label="Target Amount (GHS)" type="number" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} placeholder="e.g. 5000"/>
        <FInput label="Already Saved (GHS) — optional" type="number" value={form.saved} onChange={e=>setForm(f=>({...f,saved:e.target.value}))} placeholder="0"/>
        <FInput label="Deadline — optional" type="date" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/>
        <Field label="Icon">
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
            {icons.map(ic=><button key={ic} onClick={()=>setForm(f=>({...f,icon:ic}))} style={{width:38,height:38,borderRadius:8,border:`1px solid ${form.icon===ic?T.gold:T.rim}`,background:form.icon===ic?`${T.gold}20`:T.card,fontSize:20,cursor:"pointer"}}>{ic}</button>)}
          </div>
        </Field>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={save} loading={saving}>Create Goal</Btn>
          <Btn variant="ghost" onClick={()=>{setModal(false);setForm(blank);}}>Cancel</Btn>
        </div>
      </Drawer>}

      {/* Add Savings Modal */}
      {addModal&&activeGoal&&<Drawer title={`Add to: ${activeGoal.title}`} subtitle={`Current: ${fmt(activeGoal.saved)} / ${fmt(activeGoal.target)}`} onClose={()=>{setAddModal(false);setActiveGoal(null);}}>
        <FInput label="Amount to Add (GHS)" type="number" value={addAmt} onChange={e=>setAddAmt(e.target.value)} placeholder="e.g. 200"/>
        {addAmt&&<div style={{background:`${T.emerald}12`,border:`1px solid ${T.emerald}30`,borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:T.emerald,...S.mono}}>
          New total: {fmt(Math.min(+activeGoal.saved + +addAmt, +activeGoal.target))} / {fmt(activeGoal.target)}
          &nbsp;({Math.min(100,((+activeGoal.saved + +addAmt)/+activeGoal.target)*100).toFixed(0)}%)
        </div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn full onClick={addToGoal}>Save</Btn>
          <Btn variant="ghost" onClick={()=>{setAddModal(false);setActiveGoal(null);}}>Cancel</Btn>
        </div>
      </Drawer>}

      {delTarget&&<DeleteConfirm what={`goal "${delTarget.title}"`} onConfirm={del} onCancel={()=>setDelTarget(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   RECEIPT GENERATOR — WhatsApp-style shareable receipt
══════════════════════════════════════════════════════ */
function ReceiptModal({item,businessName,onClose}){
  const [downloading,setDownloading]=useState(false);

  const downloadReceipt = async()=>{
    setDownloading(true);
    try{
      // Load html2canvas from CDN
      if(!window.html2canvas){
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=res; s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      const el = document.getElementById('mb-receipt');
      const canvas = await window.html2canvas(el,{scale:2,backgroundColor:"#111820",useCORS:true});
      const link = document.createElement('a');
      link.download = `receipt-${item.product||item.source||"entry"}-${item.date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setDownloading(false);
    } catch(e){
      setDownloading(false);
    }
  };

  const total = item.qty&&item.price ? +item.qty * +item.price : +item.amount||0;

  return(
    <Drawer title="Receipt" subtitle="Download and share on WhatsApp" onClose={onClose} wide>
      {/* The receipt card that gets screenshotted */}
      <div id="mb-receipt" style={{background:"#111820",border:"1px solid #1A2535",borderRadius:16,padding:28,marginBottom:20,fontFamily:"'EB Garamond',serif"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:"1px solid #1A2535"}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:"#F0E8D8",fontWeight:700}}>{businessName||"My Business"}</div>
            <div style={{fontSize:12,color:"#4A607A",marginTop:2,fontFamily:"'Inter',sans-serif"}}>Official Receipt</div>
          </div>
          <div style={{width:44,height:44,borderRadius:10,background:"linear-gradient(135deg,#D4A853,#9A7530)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#06080F"}}>₵</div>
        </div>
        {/* Details */}
        <div style={{marginBottom:20}}>
          {[
            ["Item / Service", item.product||item.source||item.description||"—"],
            ["Date",           item.date||todayS()],
            item.qty ? ["Quantity",  `${item.qty} units`] : null,
            item.price ? ["Unit Price", fmt(item.price)] : null,
            item.customer ? ["Customer",  item.customer] : null,
            item.category ? ["Category",  item.category] : null,
          ].filter(Boolean).map(([label,value])=>(
            <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1A253540"}}>
              <span style={{fontSize:13,color:"#4A607A",fontFamily:"'Inter',sans-serif"}}>{label}</span>
              <span style={{fontSize:14,color:"#F0E8D8",fontFamily:"'EB Garamond',serif"}}>{value}</span>
            </div>
          ))}
        </div>
        {/* Total */}
        <div style={{background:"#D4A85315",border:"1px solid #D4A85330",borderRadius:10,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:14,color:"#8FA3BC",fontFamily:"'Inter',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Total</span>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,color:"#D4A853",fontWeight:700}}>{fmt(total)}</span>
        </div>
        {/* Footer */}
        <div style={{textAlign:"center",fontSize:11,color:"#4A607A",fontFamily:"'Inter',sans-serif",marginTop:8}}>
          Thank you for your business ✦ Generated by MoneyBook Ghana
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn full onClick={downloadReceipt} loading={downloading}>⇩ Download Receipt Image</Btn>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Drawer>
  );
}

/* ══════════════════════════════════════════════════════
   REPORTS PAGE — real data + trend simulator
══════════════════════════════════════════════════════ */
function ReportsPage({isMobile}){
  const [inc,     setInc]    =useState([]);
  const [exp,     setExp]    =useState([]);
  const [sal,     setSal]    =useState([]);
  const [loading, setLoading]=useState(true);
  const [simMonths,    setSimMonths]    =useState(3);
  const [simIncGrowth, setSimIncGrowth]=useState(5);
  const [simExpGrowth, setSimExpGrowth]=useState(3);
  const [showSim,      setShowSim]     =useState(false);

  useEffect(()=>{
    const load=async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){setLoading(false);return;}
      const [i,e,s]=await Promise.all([
        supabase.from('income').select('*').eq('user_id',user.id),
        supabase.from('expenses').select('*').eq('user_id',user.id),
        supabase.from('sales').select('*').eq('user_id',user.id),
      ]);
      setInc(i.data||[]);setExp(e.data||[]);setSal(s.data||[]);
      setLoading(false);
    };
    load();
  },[]);

  const totalInc=inc.reduce((s,i)=>s+(+i.amount),0);
  const totalExp=exp.reduce((s,e)=>s+(+e.amount),0);
  const salesRev=sal.reduce((s,s2)=>s+(+s2.qty * +s2.price),0);
  const profit=totalInc-totalExp;
  const margin=totalInc>0?((profit/totalInc)*100).toFixed(1):"0.0";

  const catExp=exp.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+(+e.amount);return a;},{});
  const catData=Object.entries(catExp).map(([name,value])=>({name,value}));

  const monthMap={};
  inc.forEach(i=>{const m=i.date?.slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={m,i:0,e:0};monthMap[m].i+=(+i.amount);});
  exp.forEach(e=>{const m=e.date?.slice(0,7);if(!m)return;if(!monthMap[m])monthMap[m]={m,i:0,e:0};monthMap[m].e+=(+e.amount);});
  const monthly=Object.values(monthMap).sort((a,b)=>a.m.localeCompare(b.m)).map(x=>({...x,label:x.m.slice(5),forecast:false}));

  const buildForecast=()=>{
    if(monthly.length===0) return [];
    const last=monthly[monthly.length-1];
    const avgInc=monthly.reduce((s,m)=>s+m.i,0)/monthly.length;
    const avgExp=monthly.reduce((s,m)=>s+m.e,0)/monthly.length;
    const iG=1+simIncGrowth/100, eG=1+simExpGrowth/100;
    let curI=last.i||avgInc, curE=last.e||avgExp;
    const lastDate=new Date(last.m+"-01");
    return Array.from({length:simMonths},(_,n)=>{
      curI*=iG; curE*=eG;
      lastDate.setMonth(lastDate.getMonth()+1);
      return{m:lastDate.toISOString().slice(0,7),label:String(lastDate.getMonth()+1).padStart(2,"0"),i:Math.round(curI),e:Math.round(curE),forecast:true};
    });
  };

  const chartData=showSim?[...monthly,...buildForecast()]:monthly;
  const CustomDot=({cx,cy,payload})=>payload?.forecast?<circle cx={cx} cy={cy} r={4} fill={T.gold} stroke={T.bg} strokeWidth={2}/>:null;

  return(
    <div className="fade">
      <PageBanner img={HERO_IMGS.dashboard} title="Reports" sub="Your complete financial picture at a glance"/>
      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading reports...</div>
      ):(<>
        {/* P&L */}
        <div style={{...S.card,padding:isMobile?"18px":"26px 30px",marginBottom:20}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:20,...S.mono}}>Profit & Loss Summary</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?16:24}}>
            {[{l:"Total Income",v:fmt(totalInc),c:T.emerald},{l:"Total Expenses",v:fmt(totalExp),c:T.rose},{l:"Sales Revenue",v:fmt(salesRev),c:T.sapphire},{l:"Net Profit",v:fmt(profit),c:profit>=0?T.gold:T.rose}].map(({l,v,c})=>(
              <div key={l} style={{borderLeft:`3px solid ${c}`,paddingLeft:14}}>
                <div style={{fontSize:11,color:T.fog,textTransform:"uppercase",letterSpacing:1,...S.mono,marginBottom:6}}>{l}</div>
                <div style={{...S.title,fontSize:isMobile?20:26,color:c,fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[{l:"Profit Margin",v:`${margin}%`,n:"of income is profit",c:T.gold},{l:"Expense Ratio",v:`${totalInc>0?((totalExp/totalInc)*100).toFixed(1):0}%`,n:"of income spent",c:T.rose},{l:"Total Entries",v:`${inc.length+exp.length}`,n:"income + expense records",c:T.sapphire}].map(({l,v,n,c})=>(
            <div key={l} style={{...S.card,borderRadius:16,padding:"18px 16px",textAlign:"center"}}>
              <div style={{fontSize:10,color:T.fog,textTransform:"uppercase",letterSpacing:1.1,...S.mono,marginBottom:8}}>{l}</div>
              <div style={{...S.title,fontSize:isMobile?26:34,color:c,fontWeight:700}}>{v}</div>
              <div style={{fontSize:11,color:T.fog,...S.mono,marginTop:5}}>{n}</div>
            </div>
          ))}
        </div>

        {/* Chart + simulator */}
        <div style={{...S.card,padding:22,marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
            <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,...S.mono}}>Monthly Income vs Expenses {showSim&&<span style={{color:T.gold}}>+ Forecast</span>}</div>
            <button onClick={()=>setShowSim(v=>!v)} style={{background:showSim?`${T.gold}20`:"transparent",border:`1px solid ${showSim?T.gold:T.rim}`,borderRadius:8,padding:"5px 14px",color:showSim?T.gold:T.fog,fontSize:13,cursor:"pointer",...S.serif,transition:"all .2s"}}>
              {showSim?"✦ Hide Forecast":"✦ Show Forecast"}
            </button>
          </div>
          {showSim&&(
            <div style={{background:`${T.gold}08`,border:`1px solid ${T.gold}25`,borderRadius:14,padding:"16px 18px",marginBottom:18}}>
              <div style={{fontSize:12,color:T.gold,...S.mono,fontWeight:600,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>📈 Trend Simulator</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:16}}>
                <div><div style={{fontSize:12,color:T.ash,...S.mono,marginBottom:6}}>Forecast Months: <strong style={{color:T.cream}}>{simMonths}</strong></div><input type="range" min={1} max={12} value={simMonths} onChange={e=>setSimMonths(+e.target.value)} style={{width:"100%",accentColor:T.gold}}/></div>
                <div><div style={{fontSize:12,color:T.ash,...S.mono,marginBottom:6}}>Income Growth/mo: <strong style={{color:T.emerald}}>+{simIncGrowth}%</strong></div><input type="range" min={-20} max={50} value={simIncGrowth} onChange={e=>setSimIncGrowth(+e.target.value)} style={{width:"100%",accentColor:T.emerald}}/></div>
                <div><div style={{fontSize:12,color:T.ash,...S.mono,marginBottom:6}}>Expense Growth/mo: <strong style={{color:T.rose}}>+{simExpGrowth}%</strong></div><input type="range" min={-20} max={50} value={simExpGrowth} onChange={e=>setSimExpGrowth(+e.target.value)} style={{width:"100%",accentColor:T.rose}}/></div>
              </div>
              {monthly.length>0&&(()=>{
                const fc=buildForecast();
                const lastFc=fc[fc.length-1];
                const projProfit=lastFc?lastFc.i-lastFc.e:0;
                return(
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12,marginTop:14}}>
                    {[{l:`Month +${simMonths} Income`,v:fmt(lastFc?.i||0),c:T.emerald},{l:`Month +${simMonths} Expenses`,v:fmt(lastFc?.e||0),c:T.rose},{l:`Month +${simMonths} Profit`,v:fmt(projProfit),c:projProfit>=0?T.gold:T.rose}].map(({l,v,c})=>(
                      <div key={l} style={{background:`${c}10`,border:`1px solid ${c}25`,borderRadius:10,padding:"10px 14px"}}>
                        <div style={{fontSize:11,color:T.fog,...S.mono,marginBottom:4}}>{l}</div>
                        <div style={{...S.title,fontSize:18,color:c,fontWeight:700}}>{v}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          {chartData.length===0?(
            <div style={{color:T.fog,fontSize:14,...S.serif,textAlign:"center",padding:"40px 0"}}>Add income or expenses to see your chart.</div>
          ):(
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{top:4,right:4,bottom:0,left:-20}}>
                <defs>
                  <linearGradient id="rwi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.emerald} stopOpacity={.3}/><stop offset="95%" stopColor={T.emerald} stopOpacity={0}/></linearGradient>
                  <linearGradient id="rwe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.rose} stopOpacity={.2}/><stop offset="95%" stopColor={T.rose} stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{fill:T.fog,fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:T.fog,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`}/>
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null;
                  const isFc=payload[0]?.payload?.forecast;
                  return(
                    <div style={{background:T.cardHi,border:`1px solid ${isFc?T.gold:T.rim}`,borderRadius:10,padding:"10px 14px"}}>
                      <div style={{color:isFc?T.gold:T.ash,fontSize:11,...S.mono,marginBottom:4}}>{label} {isFc?"(forecast)":"(actual)"}</div>
                      {payload.map((p,i)=><div key={i} style={{color:p.color||T.cream,...S.serif,fontSize:14,fontWeight:600}}>{p.name}: {fmt(p.value)}</div>)}
                    </div>
                  );
                }}/>
                <Area type="monotone" dataKey="i" stroke={T.emerald} fill="url(#rwi)" strokeWidth={2} name="Income" dot={<CustomDot/>}/>
                <Area type="monotone" dataKey="e" stroke={T.rose}    fill="url(#rwe)" strokeWidth={2} name="Expenses" dot={<CustomDot/>}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category bar */}
        <div style={{...S.card,borderRadius:16,padding:22}}>
          <div style={{fontSize:11,color:T.ash,textTransform:"uppercase",letterSpacing:1,marginBottom:14,...S.mono}}>Expenses by Category</div>
          {catData.length===0?(
            <div style={{color:T.fog,fontSize:14,...S.serif,textAlign:"center",padding:"30px 0"}}>No expenses yet</div>
          ):(
            <ResponsiveContainer width="100%" height={Math.max(180,catData.length*40)}>
              <BarChart data={catData} layout="vertical" margin={{top:0,right:16,bottom:0,left:8}}>
                <XAxis type="number" tick={{fill:T.fog,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/>
                <YAxis type="category" dataKey="name" tick={{fill:T.ash,fontSize:11}} axisLine={false} tickLine={false} width={90}/>
                <Tooltip content={<CTip/>}/>
                <Bar dataKey="value" radius={[0,6,6,0]}>
                  {catData.map((_,i)=><Cell key={i} fill={SERIES_COLORS[i%SERIES_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </>)}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EXPORT PAGE — fully Supabase connected
   Bug fix: sequential exports replaced with async loop
══════════════════════════════════════════════════════ */
function ExportPage({isMobile}){
  const [inc,     setInc]    =useState([]);
  const [exp,     setExp]    =useState([]);
  const [sal,     setSal]    =useState([]);
  const [cust,    setCust]   =useState([]);
  const [dbt,     setDbt]    =useState([]);
  const [loading, setLoading]=useState(true);
  const [exporting,setExporting]=useState(false);
  const [toast,   setToast]  =useState(null);

  useEffect(()=>{
    const load=async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){setLoading(false);return;}
      const [i,e,s,c,d]=await Promise.all([
        supabase.from('income').select('*').eq('user_id',user.id),
        supabase.from('expenses').select('*').eq('user_id',user.id),
        supabase.from('sales').select('*').eq('user_id',user.id),
        supabase.from('customers').select('*').eq('user_id',user.id),
        supabase.from('debts').select('*').eq('user_id',user.id),
      ]);
      setInc(i.data||[]);setExp(e.data||[]);setSal(s.data||[]);setCust(c.data||[]);setDbt(d.data||[]);
      setLoading(false);
    };
    load();
  },[]);

  const triggerDownload=(content,filename,mime)=>{
    const blob=new Blob([content],{type:mime});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;a.click();
    URL.revokeObjectURL(url);
  };
  const toCSV=(rows,cols)=>{
    const header=cols.map(c=>`"${c.label}"`).join(",");
    const body=rows.map(r=>cols.map(c=>{const v=c.fn?c.fn(r):(r[c.key]??"");return `"${String(v).replace(/"/g,'""')}"`;}).join(",")).join("\n");
    return header+"\n"+body;
  };
  const toJSON=(rows,cols)=>JSON.stringify(rows.map(r=>Object.fromEntries(cols.map(c=>[c.label,c.fn?c.fn(r):(r[c.key]??"")]))),null,2);

  const totalInc  =inc.reduce((s,i)=>s+(+i.amount),0);
  const totalExp  =exp.reduce((s,e)=>s+(+e.amount),0);
  const totalSales=sal.reduce((s,s2)=>s+(+s2.qty * +s2.price),0);
  const net=totalInc-totalExp;

  const DATASETS=[
    {key:"income",   label:"Income",         icon:"💰",color:T.emerald, count:inc.length,  total:fmt(totalInc),
      cols:[{label:"Date",key:"date"},{label:"Source",key:"source"},{label:"Category",key:"category"},{label:"Amount (GHS)",fn:r=>(+r.amount).toFixed(2)}],rows:inc},
    {key:"expenses", label:"Expenses",        icon:"📤",color:T.rose,    count:exp.length,  total:fmt(totalExp),
      cols:[{label:"Date",key:"date"},{label:"Description",key:"description"},{label:"Category",key:"category"},{label:"Amount (GHS)",fn:r=>(+r.amount).toFixed(2)}],rows:exp},
    {key:"sales",    label:"Sales",           icon:"🛒",color:T.gold,    count:sal.length,  total:fmt(totalSales),
      cols:[{label:"Date",key:"date"},{label:"Product",key:"product"},{label:"Qty",key:"qty"},{label:"Unit Price",fn:r=>(+r.price).toFixed(2)},{label:"Total",fn:r=>((+r.qty)*(+r.price)).toFixed(2)},{label:"Customer",key:"customer"}],rows:sal},
    {key:"customers",label:"Customers",       icon:"👥",color:T.sapphire,count:cust.length, total:`${cust.length} records`,
      cols:[{label:"Name",key:"name"},{label:"Phone",key:"phone"},{label:"Purchases",key:"purchases"},{label:"Total Spent",fn:r=>(+r.total_spent||0).toFixed(2)},{label:"Last Seen",key:"last_seen"},{label:"Note",key:"note"}],rows:cust},
    {key:"debts",    label:"Debts & Credits", icon:"⟳",color:T.amethyst,count:dbt.length,  total:`${dbt.length} entries`,
      cols:[{label:"Name",key:"name"},{label:"Type",fn:r=>r.type==="owed_to_me"?"Owed to Me":"I Owe"},{label:"Amount",fn:r=>(+r.amount).toFixed(2)},{label:"Due",key:"due"},{label:"Note",key:"note"}],rows:dbt},
  ];

  const buildPL=()=>[
    "MONEYBOOK GHANA — PROFIT & LOSS SUMMARY",
    `Generated: ${new Date().toLocaleDateString("en-GH",{dateStyle:"long"})}`,
    "═══════════════════════════════════════",
    `Total Income:    GHS ${totalInc.toFixed(2)}`,
    `Total Expenses:  GHS ${totalExp.toFixed(2)}`,
    `Sales Revenue:   GHS ${totalSales.toFixed(2)}`,
    `Net Profit/Loss: GHS ${net.toFixed(2)}`,
    `Profit Margin:   ${totalInc>0?((net/totalInc)*100).toFixed(1):0}%`,
    "","INCOME","───────────────────────────────────────",
    ...inc.map(i=>`${i.date}  ${(i.source||"").padEnd(30)}  GHS ${(+i.amount).toFixed(2)}`),
    "","EXPENSES","───────────────────────────────────────",
    ...exp.map(e=>`${e.date}  ${(e.description||"").padEnd(30)}  GHS ${(+e.amount).toFixed(2)}`),
    "","SALES","───────────────────────────────────────",
    ...sal.map(s=>`${s.date}  ${(s.product||"").padEnd(30)}  ${s.qty}x GHS ${(+s.price).toFixed(2)} = GHS ${((+s.qty)*(+s.price)).toFixed(2)}`),
  ].join("\n");

  // Bug fix: await each download sequentially instead of fragile setTimeout stacking
  const exportAll=async()=>{
    setExporting(true);
    for(const ds of DATASETS){
      triggerDownload(toCSV(ds.rows,ds.cols),`moneybook-${ds.key}.csv`,"text/csv");
      await new Promise(r=>setTimeout(r,200));
    }
    triggerDownload(buildPL(),"moneybook-pl.txt","text/plain");
    setExporting(false);
    setToast({msg:"✓ All files downloaded",color:T.emerald});
  };

  return(
    <div className="fade">
      {toast&&<Toast msg={toast.msg} color={toast.color} onDone={()=>setToast(null)}/>}
      <PageBanner img={HERO_IMGS.dashboard} title="Export Data" sub="Download your financial records as CSV, JSON or plain text">
        <Btn onClick={exportAll} loading={exporting}>⇩ Export Everything</Btn>
      </PageBanner>

      {loading?(
        <div style={{padding:40,textAlign:"center",color:T.fog,...S.serif,fontSize:16}}>Loading your data...</div>
      ):(<>
        <div style={{background:"linear-gradient(135deg,#0D1A10,#081410)",border:`1px solid ${T.emerald}30`,borderRadius:18,padding:isMobile?"18px 20px":"22px 28px",marginBottom:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:14}}>
            <div>
              <div style={{...S.title,fontSize:20,color:T.cream,fontWeight:700,marginBottom:4}}>📄 Full P&L Summary</div>
              <div style={{fontSize:13,color:T.fog,...S.mono}}>Income + Expenses + Sales in one formatted text file</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="outline" sm onClick={()=>triggerDownload(buildPL(),"moneybook-pl.txt","text/plain")}>⇩ Download .txt</Btn>
              <Btn variant="gold" sm onClick={exportAll} loading={exporting}>⇩ Export All</Btn>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:14,marginTop:18}}>
            {[{l:"Total Income",v:fmt(totalInc),c:T.emerald},{l:"Total Expenses",v:fmt(totalExp),c:T.rose},{l:"Sales Revenue",v:fmt(totalSales),c:T.sapphire},{l:"Net Profit",v:fmt(net),c:net>=0?T.gold:T.rose}].map(({l,v,c})=>(
              <div key={l} style={{borderLeft:`3px solid ${c}`,paddingLeft:12}}>
                <div style={{fontSize:10,color:T.fog,textTransform:"uppercase",letterSpacing:1,...S.mono,marginBottom:4}}>{l}</div>
                <div style={{...S.title,fontSize:isMobile?18:22,color:c,fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
          {DATASETS.map(ds=>(
            <div key={ds.key} className="card-lift" style={{...S.card,borderRadius:18,padding:22}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:44,height:44,borderRadius:12,background:`${ds.color}18`,border:`1px solid ${ds.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{ds.icon}</div>
                  <div>
                    <div style={{...S.serif,fontSize:17,color:T.cream,fontWeight:600}}>{ds.label}</div>
                    <div style={{fontSize:12,color:T.fog,...S.mono,marginTop:2}}>{ds.count} records · {ds.total}</div>
                  </div>
                </div>
                <Badge color={ds.color}>{ds.count}</Badge>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                {ds.cols.map(c=><span key={c.label} style={{padding:"3px 9px",borderRadius:20,background:T.rimHi,color:T.ash,fontSize:11,...S.mono}}>{c.label}</span>)}
              </div>
              {ds.rows.length>0?(
                <div style={{background:"#090D14",borderRadius:10,padding:"10px 12px",marginBottom:16,fontFamily:"monospace",fontSize:11,color:T.fog,maxHeight:72,overflow:"hidden"}}>
                  <div style={{color:T.ash}}>{ds.cols.map(c=>c.label).join(", ")}</div>
                  {ds.rows.slice(0,2).map((r,i)=><div key={i} style={{marginTop:3}}>{ds.cols.map(c=>(c.fn?c.fn(r):(r[c.key]??""))).join(", ")}</div>)}
                  {ds.rows.length>2&&<div style={{color:T.rimHi,marginTop:3}}>... {ds.rows.length-2} more rows</div>}
                </div>
              ):(
                <div style={{padding:"14px",background:"#090D14",borderRadius:10,marginBottom:16,color:T.fog,fontSize:13,...S.serif,textAlign:"center"}}>No data yet</div>
              )}
              <div style={{display:"flex",gap:8}}>
                <Btn variant="gold" sm full onClick={()=>triggerDownload(toCSV(ds.rows,ds.cols),`moneybook-${ds.key}.csv`,"text/csv")} disabled={ds.rows.length===0}>⇩ CSV</Btn>
                <Btn variant="ghost" sm full onClick={()=>triggerDownload(toJSON(ds.rows,ds.cols),`moneybook-${ds.key}.json`,"application/json")} disabled={ds.rows.length===0}>⇩ JSON</Btn>
              </div>
            </div>
          ))}
        </div>

        <div style={{...S.card,borderRadius:18,padding:22,marginTop:20}}>
          <div style={{fontSize:12,color:T.ash,textTransform:"uppercase",letterSpacing:1,...S.mono,marginBottom:16}}>About Export Formats</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:16}}>
            {[{f:".CSV",icon:"📊",desc:"Opens directly in Excel or Google Sheets. Best for analysis and printing."},{f:".JSON",icon:"🖥",desc:"Developer format. Import into other apps, Supabase, or scripts."},{f:".TXT",icon:"📄",desc:"Plain text P&L. Easy to read, share on WhatsApp, or print."}].map(({f,icon,desc})=>(
              <div key={f} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:40,height:40,borderRadius:10,background:`${T.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                <div>
                  <div style={{...S.title,fontSize:17,color:T.gold,fontWeight:700,marginBottom:4}}>{f}</div>
                  <div style={{fontSize:13,color:T.ash,...S.serif,lineHeight:1.6}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>)}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════════════ */
export default function App(){
  const [user,    setUser]   =useState(null);
  const [active,  setActive] =useState("dashboard");
  const [data,    setData]   =useState(SEED);
  const [menuOpen,setMenuOpen]=useState(false);
  const [isDark,  setIsDark] =useState(true);
  const w=useW();
  const isM=w<768;

  // Apply theme tokens globally whenever isDark changes
  useEffect(()=>{
    const theme = isDark ? DARK : LIGHT;
    Object.assign(T, theme);
    document.documentElement.style.setProperty("--mb-bg", theme.bg);
    document.documentElement.style.setProperty("--mb-surface", theme.surface);
  },[isDark]);

  const toggleTheme = () => setIsDark(v=>!v);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user) setUser({
        name:    session.user.user_metadata?.name    ||session.user.email,
        business:session.user.user_metadata?.business||"My Business",
        avatar:  (session.user.user_metadata?.name   ||session.user.email)[0].toUpperCase()
      });
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      if(session?.user) setUser({
        name:    session.user.user_metadata?.name    ||session.user.email,
        business:session.user.user_metadata?.business||"My Business",
        avatar:  (session.user.user_metadata?.name   ||session.user.email)[0].toUpperCase()
      });
      else setUser(null);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  if(!user) return <><style>{CSS}</style><AuthPage onAuth={u=>setUser(u)}/></>;

  const pp={data,setData,isMobile:isM};
  const pages={
    dashboard: <Dashboard    isMobile={isM} budgets={data.budgets}/>,
    income:    <IncomePage    isMobile={isM}/>,
    expenses:  <ExpensesPage  isMobile={isM}/>,
    sales:     <SalesPage     isMobile={isM}/>,
    budget:    <BudgetPage    {...pp}/>,
    customers: <CustomersPage isMobile={isM}/>,
    debts:     <DebtsPage     isMobile={isM}/>,
    goals:     <GoalsPage     isMobile={isM}/>,
    reports:   <ReportsPage   isMobile={isM}/>,
    export:    <ExportPage    isMobile={isM}/>,
  };

  return(
    <>
      <style>{CSS}</style>
      <div style={{fontFamily:"'EB Garamond',serif",background:T.bg,minHeight:"100vh",color:T.cream,display:"flex",flexDirection:isM?"column":"row"}}>
        {!isM&&<Sidebar active={active} setActive={setActive} user={user} onLogout={async()=>{await supabase.auth.signOut();setUser(null);}} isDark={isDark} onToggleTheme={toggleTheme}/>}
        {isM &&<MobileHeader active={active} user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen} setActive={setActive} onLogout={async()=>{await supabase.auth.signOut();setUser(null);}}/>}
        <main style={{marginLeft:isM?0:226,flex:1,padding:isM?"18px 16px 90px":"34px 44px",minHeight:"100vh"}}>
          {pages[active]}
        </main>
        {isM&&<MobileNav active={active} setActive={setActive}/>}
      </div>
    </>
  );
}
