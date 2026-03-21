import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "./supabase";

/* ══════════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════════ */
const T = {
  bg:       "#06080F",
  surface:  "#0C1018",
  card:     "#111820",
  cardHi:   "#16202C",
  rim:      "#1A2535",
  rimHi:    "#243348",
  gold:     "#D4A853",
  goldLt:   "#F2C96A",
  goldDk:   "#9A7530",
  emerald:  "#1DB87A",
  rose:     "#E8485A",
  sapphire: "#4A8CF5",
  amethyst: "#9B72F5",
  cream:    "#F0E8D8",
  ash:      "#8FA3BC",
  fog:      "#4A607A",
  night:    "#1A2535",
};

const SERIES_COLORS = [T.gold, T.emerald, T.sapphire, T.rose, T.amethyst, "#F97316", "#06B6D4"];

const CATEGORY_ICONS = {
  Food:"🍛", Transport:"🚕", Business:"💼", Bills:"⚡", Shopping:"🛍",
  Healthcare:"💊", Entertainment:"🎬", Education:"📚", Other:"📦",
  Salary:"💵", Freelance:"🖥", "Food Sales":"🍽", Investment:"📈",
  "Business Revenue":"🏢",
};

/* ══════════════════════════════════════════════════════
   SEED DATA  (used for Budget / Reports / Export pages)
══════════════════════════════════════════════════════ */
const SEED = {
  income:    [],
  expenses:  [],
  sales:     [],
  customers: [],
  budgets:   [],
  debts:     [],
};

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
const fmt    = n => `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits:2 })}`;
const todayS = () => new Date().toISOString().split("T")[0];
const uid    = () => Date.now() + Math.random();

const useW = () => {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
};

/* ══════════════════════════════════════════════════════
   GLOBAL CSS
══════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=EB+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
  html, body { background: #06080F; font-family: 'EB Garamond', serif; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background: #06080F; }
  ::-webkit-scrollbar-thumb { background: #1A2535; border-radius:4px; }
  ::-webkit-scrollbar-thumb:hover { background: #243348; }
  .fade { animation: fadeUp .4s cubic-bezier(.22,.68,0,1.2) both; }
  .fade-1 { animation-delay:.05s; }
  .fade-2 { animation-delay:.1s; }
  .fade-3 { animation-delay:.15s; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
  .glow-btn { transition: all .2s; }
  .glow-btn:hover { box-shadow: 0 0 28px #D4A85355; transform: translateY(-1px); }
  .nav-link { transition: all .18s; }
  .nav-link:hover { background: rgba(212,168,83,.08) !important; color: #D4A853 !important; }
  .row-hover { transition: background .15s; }
  .row-hover:hover { background: #16202C; }
  .card-lift { transition: transform .2s, box-shadow .2s, border-color .2s; }
  .card-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,.5); border-color: #243348 !important; }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #D4A85370 !important;
    box-shadow: 0 0 0 3px #D4A85318;
  }
  input:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 100px #0C1018 inset !important;
    -webkit-text-fill-color: #F0E8D8 !important;
  }
  .tab { transition: all .2s; cursor:pointer; }
  .tab:hover { color: #D4A853 !important; }
  .pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
`;

/* ══════════════════════════════════════════════════════
   PRIMITIVES
══════════════════════════════════════════════════════ */
function Btn({ children, onClick, variant="gold", full, sm, style:s={}, disabled }) {
  const base = {
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
    border:"none", borderRadius:10, cursor:disabled?"not-allowed":"pointer",
    fontFamily:"'EB Garamond', serif", fontWeight:600, letterSpacing:.4,
    transition:"all .2s", width:full?"100%":undefined, opacity:disabled?.5:1,
    padding: sm ? "7px 16px" : "11px 24px",
    fontSize: sm ? 14 : 15,
  };
  const vs = {
    gold:    { background:`linear-gradient(135deg,${T.gold},${T.goldDk})`, color:"#06080F", ...base },
    outline: { background:"transparent", color:T.ash, border:`1px solid ${T.rim}`, ...base },
    danger:  { background:`${T.rose}18`, color:T.rose, border:`1px solid ${T.rose}40`, ...base },
    ghost:   { background:`${T.card}`, color:T.ash, border:`1px solid ${T.rim}`, ...base },
    emerald: { background:`linear-gradient(135deg,${T.emerald},#127A52)`, color:"#06080F", ...base },
  };
  return (
    <button onClick={disabled?undefined:onClick} className={variant==="gold"?"glow-btn":""} style={{...(vs[variant]||vs.gold), ...s}}>
      {children}
    </button>
  );
}

function Field({ label, children, hint, row }) {
  return (
    <div style={{ marginBottom:16, ...(row?{display:"flex",alignItems:"center",gap:12}:{}) }}>
      {label && <label style={{display:"block",fontSize:12,color:T.fog,fontFamily:"'Inter',sans-serif",textTransform:"uppercase",letterSpacing:1.1,marginBottom:row?0:6,flexShrink:0}}>{label}</label>}
      {children}
      {hint && <div style={{fontSize:12,color:T.fog,marginTop:4,fontFamily:"'Inter',sans-serif"}}>{hint}</div>}
    </div>
  );
}

function FInput({ label, hint, error, ...p }) {
  return (
    <Field label={label} hint={hint}>
      <input {...p} style={{width:"100%",padding:"10px 13px",background:"#090D14",border:`1px solid ${T.rim}`,borderRadius:9,color:T.cream,fontSize:15,fontFamily:"'EB Garamond',serif",...p.style}}/>
      {error && <div style={{fontSize:12,color:T.rose,marginTop:4,fontFamily:"'Inter',sans-serif"}}>{error}</div>}
    </Field>
  );
}

function FSelect({ label, options, ...p }) {
  return (
    <Field label={label}>
      <select {...p} style={{width:"100%",padding:"10px 13px",background:"#090D14",border:`1px solid ${T.rim}`,borderRadius:9,color:T.cream,fontSize:15,fontFamily:"'EB Garamond',serif",cursor:"pointer"}}>
        {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </Field>
  );
}

function FTextarea({ label, ...p }) {
  return (
    <Field label={label}>
      <textarea {...p} style={{width:"100%",padding:"10px 13px",background:"#090D14",border:`1px solid ${T.rim}`,borderRadius:9,color:T.cream,fontSize:15,fontFamily:"'EB Garamond',serif",resize:"vertical",minHeight:72,...p.style}}/>
    </Field>
  );
}

function Drawer({ title, subtitle, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="fade" style={{background:T.surface,border:`1px solid ${T.rim}`,borderRadius:22,padding:32,width:"100%",maxWidth:wide?600:460,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 40px 100px rgba(0,0,0,.7)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:26}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,color:T.cream,fontWeight:700,lineHeight:1}}>{title}</div>
            {subtitle && <div style={{fontSize:13,color:T.fog,marginTop:4,fontFamily:"'Inter',sans-serif"}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:`${T.fog}22`,border:"none",borderRadius:8,width:30,height:30,color:T.ash,fontSize:16,cursor:"pointer",lineHeight:1,flexShrink:0,marginLeft:12}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Badge({ children, color=T.gold }) {
  return (
    <span style={{display:"inline-block",padding:"3px 9px",borderRadius:20,background:`${color}18`,color,fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:500,letterSpacing:.3}}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, color=T.gold, icon, glow, delay="" }) {
  return (
    <div className={`card-lift fade ${delay}`} style={{background:T.card,border:`1px solid ${T.rim}`,borderRadius:18,padding:"20px 22px",borderTop:`2px solid ${color}`,boxShadow:glow?`0 6px 32px ${color}22`:"0 2px 12px rgba(0,0,0,.3)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${color}12 0%,transparent 70%)`}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{fontSize:11,color:T.fog,textTransform:"uppercase",letterSpacing:1.3,fontFamily:"'Inter',sans-serif",fontWeight:500}}>{label}</div>
        {icon && <span style={{fontSize:22,opacity:.85}}>{icon}</span>}
      </div>
      <div style={{fontSize:26,fontFamily:"'Cormorant Garamond',serif",color:T.cream,fontWeight:700,letterSpacing:-.5,lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:13,color,marginTop:7,fontFamily:"'Inter',sans-serif"}}>{sub}</div>}
    </div>
  );
}

const CTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:T.cardHi,border:`1px solid ${T.rim}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
      {label && <div style={{color:T.ash,marginBottom:5,fontSize:12,fontFamily:"'Inter',sans-serif"}}>{label}</div>}
      {payload.map((p,i) => <div key={i} style={{color:p.color||T.cream,fontWeight:600,fontFamily:"'EB Garamond',serif",fontSize:15}}>{fmt(p.value)}</div>)}
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   HERO IMAGES
══════════════════════════════════════════════════════ */
const HERO_IMGS = {
  auth:     "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&auto=format&fit=crop&q=70",
  dashboard:"https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=60",
  budget:   "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&auto=format&fit=crop&q=65",
  sales:    "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=65",
  customers:"https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&auto=format&fit=crop&q=65",
};

/* ══════════════════════════════════════════════════════
   AUTH PAGE
══════════════════════════════════════════════════════ */
function AuthPage({ onAuth }) {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [name, setName]       = useState("");
  const [biz, setBiz]         = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);
  const w = useW();
  const isM = w < 768;

  const submit = async () => {
    setErr("");
    if (mode === "login") {
      if (!email || !pass) return setErr("Please fill in all fields.");
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password:pass });
      setLoading(false);
      if (error) return setErr(error.message);
      onAuth({
        name: data.user.user_metadata?.name || email,
        business: data.user.user_metadata?.business || "My Business",
        avatar: (data.user.user_metadata?.name || email)[0].toUpperCase()
      });
    } else {
      if (!name || !email || !pass) return setErr("Please fill in all fields.");
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email, password:pass,
        options: { data: { name, business:biz||"My Business" } }
      });
      setLoading(false);
      if (error) return setErr(error.message);
      if (data.user) {
        onAuth({
          name,
          business: biz || "My Business",
          avatar: name[0].toUpperCase()
        });
      }
    }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", background:T.bg }}>
      {!isM && (
        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
          <img src={HERO_IMGS.auth} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", opacity:.55 }}/>
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(6,8,15,.9) 0%,rgba(6,8,15,.4) 100%)" }}/>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:52 }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:48, color:T.cream, fontWeight:700, lineHeight:1.1, maxWidth:380 }}>
              Your money,<br/><span style={{ color:T.gold }}>finally clear.</span>
            </div>
            <div style={{ fontSize:16, color:T.ash, marginTop:16, maxWidth:360, fontFamily:"'EB Garamond',serif", lineHeight:1.7 }}>
              Track income, expenses, sales and budgets — built for Ghanaian entrepreneurs and everyday people.
            </div>
            <div style={{ display:"flex", gap:28, marginTop:36 }}>
              {[["2,000+","Active users"], ["GHS 4M+","Tracked monthly"], ["100%","Free to start"]].map(([v,l]) => (
                <div key={l}>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, color:T.gold, fontWeight:700 }}>{v}</div>
                  <div style={{ fontSize:12, color:T.ash, fontFamily:"'Inter',sans-serif" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ width:isM?"100%":440, display:"flex", flexDirection:"column", justifyContent:"center", padding:isM?"32px 24px":"48px 40px", background:T.surface, borderLeft:`1px solid ${T.rim}` }}>
        <div style={{ marginBottom:36 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${T.gold},${T.goldDk})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:T.bg, boxShadow:`0 6px 20px ${T.gold}40` }}>₵</div>
            <div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:T.cream, fontWeight:700, lineHeight:1 }}>MoneyBook</div>
              <div style={{ fontSize:11, color:T.fog, letterSpacing:2, textTransform:"uppercase", fontFamily:"'Inter',sans-serif" }}>Ghana Edition</div>
            </div>
          </div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:30, color:T.cream, fontWeight:600, lineHeight:1.2 }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </div>
          <div style={{ fontSize:14, color:T.fog, marginTop:5, fontFamily:"'Inter',sans-serif" }}>
            {mode === "login" ? "Sign in to your dashboard" : "Start tracking your money today"}
          </div>
        </div>
        <div style={{ display:"flex", gap:4, marginBottom:24, background:T.card, borderRadius:12, padding:4 }}>
          {["login","signup"].map(t => (
            <button key={t} onClick={() => { setMode(t); setErr(""); }} style={{ flex:1, padding:"9px", border:"none", borderRadius:9, cursor:"pointer", fontFamily:"'EB Garamond',serif", fontWeight:600, fontSize:15, transition:"all .2s", background:mode===t?`linear-gradient(135deg,${T.gold},${T.goldDk})`:"transparent", color:mode===t?T.bg:T.fog }}>
              {t==="login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>
        {mode === "signup" && <>
          <FInput label="Full Name" placeholder="e.g. Michael Poku" value={name} onChange={e=>setName(e.target.value)}/>
          <FInput label="Business Name (optional)" placeholder="e.g. MP Web & Automations" value={biz} onChange={e=>setBiz(e.target.value)}/>
        </>}
        <FInput label="Email Address" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <FInput label="Password" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} error={err}/>
        {mode==="login" && (
          <div style={{ textAlign:"right", marginTop:-8, marginBottom:16 }}>
            <span style={{ fontSize:14, color:T.gold, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}>Forgot password?</span>
          </div>
        )}
        <Btn full onClick={submit}>{loading ? "Please wait…" : mode==="login" ? "Sign In →" : "Create Account →"}</Btn>
        <div style={{ marginTop:20, textAlign:"center", fontSize:14, color:T.fog, fontFamily:"'Inter',sans-serif" }}>
          {mode==="login" ? "No account? " : "Have an account? "}
          <span onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");}} style={{ color:T.gold, cursor:"pointer", fontWeight:600 }}>
            {mode==="login" ? "Register free" : "Sign in"}
          </span>
        </div>
        <div style={{ marginTop:24, borderTop:`1px solid ${T.rim}`, paddingTop:20 }}>
          <button onClick={() => onAuth({ name:"Michael P.", business:"MP Web & Automations", avatar:"M" })} style={{ width:"100%", padding:"11px", background:"transparent", border:`1px dashed ${T.rim}`, borderRadius:10, color:T.fog, fontSize:14, cursor:"pointer", fontFamily:"'EB Garamond',serif", transition:"all .2s" }}>
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
const NAV = [
  { id:"dashboard", icon:"◈", label:"Dashboard"  },
  { id:"income",    icon:"↑",  label:"Income"     },
  { id:"expenses",  icon:"↓",  label:"Expenses"   },
  { id:"sales",     icon:"⊕",  label:"Sales"      },
  { id:"budget",    icon:"◎",  label:"Budget"     },
  { id:"customers", icon:"◉",  label:"Customers"  },
  { id:"debts",     icon:"⟳",  label:"Debts"      },
  { id:"reports",   icon:"≡",  label:"Reports"    },
  { id:"export",    icon:"⇩",  label:"Export"     },
];

function Sidebar({ active, setActive, user, onLogout }) {
  return (
    <aside style={{ width:226, minHeight:"100vh", background:T.surface, borderRight:`1px solid ${T.rim}`, display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, zIndex:100 }}>
      <div style={{ padding:"22px 20px 18px", borderBottom:`1px solid ${T.rim}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:`linear-gradient(135deg,${T.gold},${T.goldDk})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:T.bg, boxShadow:`0 4px 16px ${T.gold}40`, flexShrink:0 }}>₵</div>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, color:T.cream, fontWeight:700, lineHeight:1 }}>MoneyBook</div>
            <div style={{ fontSize:10, color:T.fog, letterSpacing:1.6, textTransform:"uppercase", fontFamily:"'Inter',sans-serif", marginTop:2 }}>Ghana Edition</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"14px 10px", overflowY:"auto" }}>
        {NAV.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setActive(id)} className="nav-link"
            style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"10px 13px", marginBottom:2, background:active===id?`${T.gold}15`:"transparent", border:active===id?`1px solid ${T.gold}30`:"1px solid transparent", borderRadius:10, cursor:"pointer", color:active===id?T.gold:T.ash, fontSize:14, fontFamily:"'EB Garamond',serif", textAlign:"left" }}>
            <span style={{ fontSize:16, width:20, textAlign:"center", opacity:active===id?1:.65 }}>{icon}</span>
            <span style={{ fontWeight:active===id?600:400 }}>{label}</span>
            {active===id && <div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:T.gold }}/>}
          </button>
        ))}
      </nav>
      <div style={{ padding:"14px 16px", borderTop:`1px solid ${T.rim}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${T.sapphire},${T.amethyst})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0 }}>{user.avatar}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, color:T.cream, fontWeight:600, fontFamily:"'EB Garamond',serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
            <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.business}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ width:"100%", padding:"8px", background:"transparent", border:`1px solid ${T.rim}`, borderRadius:8, color:T.fog, fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif", transition:"all .2s" }}>Sign Out</button>
      </div>
    </aside>
  );
}

function MobileHeader({ active, user, menuOpen, setMenuOpen, setActive, onLogout }) {
  const page = NAV.find(n => n.id === active);
  return (
    <div style={{ position:"sticky", top:0, zIndex:150, background:T.surface, borderBottom:`1px solid ${T.rim}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width:32, height:32, borderRadius:9, background:`linear-gradient(135deg,${T.gold},${T.goldDk})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:T.bg }}>₵</div>
      <div style={{ flex:1, fontFamily:"'Cormorant Garamond',serif", fontSize:19, color:T.cream, fontWeight:700 }}>{page?.label || "MoneyBook"}</div>
      <button onClick={() => setMenuOpen(v => !v)} style={{ background:T.night, border:"none", borderRadius:8, width:34, height:34, color:T.ash, fontSize:16, cursor:"pointer" }}>☰</button>
      {menuOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.6)", backdropFilter:"blur(4px)" }} onClick={() => setMenuOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0, right:0, bottom:0, width:260, background:T.surface, borderLeft:`1px solid ${T.rim}`, padding:"20px 10px", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 6px 14px", borderBottom:`1px solid ${T.rim}`, marginBottom:8 }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, color:T.cream, fontWeight:700 }}>Menu</div>
              <button onClick={() => setMenuOpen(false)} style={{ background:"none", border:"none", color:T.fog, fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
            {NAV.map(({ id, icon, label }) => (
              <button key={id} onClick={() => { setActive(id); setMenuOpen(false); }}
                style={{ display:"flex", alignItems:"center", gap:11, width:"100%", padding:"11px 12px", marginBottom:2, background:active===id?`${T.gold}15`:"transparent", border:active===id?`1px solid ${T.gold}30`:"1px solid transparent", borderRadius:10, cursor:"pointer", color:active===id?T.gold:T.ash, fontSize:15, fontFamily:"'EB Garamond',serif", textAlign:"left" }}>
                <span style={{ fontSize:17, width:22, textAlign:"center" }}>{icon}</span>{label}
              </button>
            ))}
            <div style={{ marginTop:"auto", paddingTop:16, borderTop:`1px solid ${T.rim}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 6px 12px" }}>
                <div style={{ width:34, height:34, borderRadius:10, background:`linear-gradient(135deg,${T.sapphire},${T.amethyst})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff" }}>{user.avatar}</div>
                <div><div style={{ fontSize:14, color:T.cream, fontWeight:600, fontFamily:"'EB Garamond',serif" }}>{user.name}</div><div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{user.business}</div></div>
              </div>
              <button onClick={onLogout} style={{ width:"100%", padding:"9px", background:"transparent", border:`1px solid ${T.rim}`, borderRadius:10, color:T.fog, fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNav({ active, setActive }) {
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:T.surface, borderTop:`1px solid ${T.rim}`, display:"flex", padding:"8px 0 env(safe-area-inset-bottom,10px)" }}>
      {NAV.slice(0,5).map(({ id, icon, label }) => (
        <button key={id} onClick={() => setActive(id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, border:"none", background:"none", cursor:"pointer", padding:"4px 0", color:active===id?T.gold:T.fog, fontSize:10, fontFamily:"'Inter',sans-serif", fontWeight:active===id?600:400, transition:"all .15s" }}>
          <span style={{ fontSize:20 }}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PAGE HEADER BANNER
══════════════════════════════════════════════════════ */
function PageBanner({ img, title, sub, children }) {
  return (
    <div style={{ position:"relative", borderRadius:20, overflow:"hidden", marginBottom:28, minHeight:140 }}>
      <img src={img} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:.35 }}/>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(90deg,rgba(6,8,15,.96) 40%,rgba(6,8,15,.6) 100%)" }}/>
      <div style={{ position:"relative", padding:"28px 30px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:34, color:T.cream, fontWeight:700, lineHeight:1 }}>{title}</div>
          {sub && <div style={{ fontSize:14, color:T.ash, marginTop:5, fontFamily:"'Inter',sans-serif" }}>{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
function Dashboard({ data, isMobile }) {
  const D = "2026-03-20";
  const todayInc  = data.income.filter(i=>i.date===D).reduce((s,i)=>s+i.amount,0);
  const todayExp  = data.expenses.filter(e=>e.date===D).reduce((s,e)=>s+e.amount,0);
  const totalInc  = data.income.reduce((s,i)=>s+i.amount,0);
  const totalExp  = data.expenses.reduce((s,e)=>s+e.amount,0);
  const net       = totalInc - totalExp;
  const budgets   = data.budgets;
  const activeBudget = budgets[0];
  const budgetSpent  = activeBudget ? activeBudget.categories.reduce((s,c)=>s+c.spent,0) : 0;
  const budgetLeft   = activeBudget ? activeBudget.totalCash - budgetSpent : 0;

  const monthly = [
    {m:"Oct",i:2200,e:1100},{m:"Nov",i:2800,e:1200},{m:"Dec",i:3400,e:1800},
    {m:"Jan",i:2100,e:900},{m:"Feb",i:3900,e:2100},{m:"Mar",i:2850,e:1550},
  ];
  const spendByCat = data.expenses.reduce((a,e)=>{ a[e.category]=(a[e.category]||0)+e.amount; return a; },{});
  const pieData = Object.entries(spendByCat).map(([n,v])=>({name:n,value:v}));
  const recent = [...data.income.slice(0,3).map(i=>({...i,type:"income"})), ...data.expenses.slice(0,3).map(e=>({...e,type:"expense"}))]
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const cols = isMobile ? "1fr 1fr" : "repeat(4,1fr)";

  return (
    <div className="fade">
      <div style={{ position:"relative", borderRadius:22, overflow:"hidden", marginBottom:26, background:"linear-gradient(120deg,#0A1428,#0E1E10)" }}>
        <img src={HERO_IMGS.dashboard} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:.18 }}/>
        <div style={{ position:"relative", padding:isMobile?"22px 20px":"32px 36px" }}>
          <div style={{ fontSize:12, color:T.fog, textTransform:"uppercase", letterSpacing:1.5, fontFamily:"'Inter',sans-serif", marginBottom:6 }}>Thursday, 20 March 2026</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?28:42, color:T.cream, fontWeight:700, letterSpacing:-.5, lineHeight:1.1 }}>
            Good morning, Michael <span style={{ color:T.gold }}>✦</span>
          </div>
          <div style={{ fontSize:15, color:T.ash, marginTop:8, fontFamily:"'EB Garamond',serif" }}>Your financial summary at a glance.</div>
          <div style={{ display:"flex", gap:isMobile?20:40, marginTop:22, flexWrap:"wrap" }}>
            {[
              {l:"All-Time Income", v:fmt(totalInc), c:T.emerald},
              {l:"All-Time Expenses", v:fmt(totalExp), c:T.rose},
              {l:"Net Balance", v:fmt(net), c:T.gold},
            ].map(({l,v,c})=>(
              <div key={l}><div style={{fontSize:11,color:T.fog,fontFamily:"'Inter',sans-serif",marginBottom:3}}>{l}</div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?18:24,color:c,fontWeight:700}}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:cols, gap:14, marginBottom:22 }}>
        <StatCard label="Income Today"     value={fmt(todayInc)}           sub="↑ 3 sources"            color={T.emerald} icon="💰" glow delay="fade-1"/>
        <StatCard label="Expenses Today"   value={fmt(todayExp)}           sub="↓ 2 transactions"       color={T.rose}    icon="📤" delay="fade-2"/>
        <StatCard label="Budget Remaining" value={fmt(Math.max(budgetLeft,0))} sub={budgetLeft<0?"⚠ Overspent!":"✓ On track"} color={budgetLeft<0?T.rose:T.gold} icon="🎯" delay="fade-1"/>
        <StatCard label="Net Profit Today" value={fmt(todayInc-todayExp)} sub={(todayInc-todayExp)>=0?"✓ In the green":"⚠ Net loss"} color={(todayInc-todayExp)>=0?T.emerald:T.rose} icon="📊" delay="fade-2"/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 5fr", gap:16, marginBottom:16 }}>
        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>By Category</div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} dataKey="value" paddingAngle={3}>
                {pieData.map((_,i) => <Cell key={i} fill={SERIES_COLORS[i%SERIES_COLORS.length]}/>)}
              </Pie>
              <Tooltip content={<CTip/>}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 10px", marginTop:10 }}>
            {pieData.map((d,i) => (
              <div key={d.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.ash, fontFamily:"'Inter',sans-serif" }}>
                <div style={{ width:7, height:7, borderRadius:2, background:SERIES_COLORS[i%SERIES_COLORS.length] }}/>{d.name}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>Monthly Income vs Expenses</div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={monthly} margin={{ top:4, right:4, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="dai" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.emerald} stopOpacity={.3}/>
                  <stop offset="95%" stopColor={T.emerald} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="dae" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.rose} stopOpacity={.25}/>
                  <stop offset="95%" stopColor={T.rose} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="m" tick={{ fill:T.fog, fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:T.fog, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v/1000}k`}/>
              <Tooltip content={<CTip/>}/>
              <Area type="monotone" dataKey="i" stroke={T.emerald} fill="url(#dai)" strokeWidth={2.5} name="Income"/>
              <Area type="monotone" dataKey="e" stroke={T.rose}    fill="url(#dae)" strokeWidth={2.5} name="Expenses"/>
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", gap:20, marginTop:8 }}>
            {[{c:T.emerald,l:"Income"},{c:T.rose,l:"Expenses"}].map(({c,l})=>(
              <div key={l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.ash, fontFamily:"'Inter',sans-serif" }}>
                <div style={{ width:18, height:3, borderRadius:2, background:c }}/>{l}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"2fr 1fr", gap:16 }}>
        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>Recent Transactions</div>
          {recent.map((t,i) => (
            <div key={i} className="row-hover" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 8px", borderBottom:i<recent.length-1?`1px solid ${T.rim}`:"none", borderRadius:8 }}>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <div style={{ width:38, height:38, borderRadius:10, background:t.type==="income"?`${T.emerald}20`:`${T.rose}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                  {CATEGORY_ICONS[t.category]||"💳"}
                </div>
                <div>
                  <div style={{ fontSize:14, color:T.cream, fontFamily:"'EB Garamond',serif" }}>{t.source||t.description}</div>
                  <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{t.category} · {t.date}</div>
                </div>
              </div>
              <div style={{ fontSize:15, fontWeight:600, color:t.type==="income"?T.emerald:T.rose, fontFamily:"'EB Garamond',serif", flexShrink:0, marginLeft:12 }}>
                {t.type==="income"?"+":"-"}{fmt(t.amount)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>Debt Alerts</div>
          {data.debts.length === 0 && <div style={{ color:T.fog, fontSize:14, fontFamily:"'EB Garamond',serif" }}>No debts recorded.</div>}
          {data.debts.map(d => (
            <div key={d.id} style={{ padding:"12px", background:d.type==="i_owe"?`${T.rose}10`:`${T.emerald}10`, border:`1px solid ${d.type==="i_owe"?T.rose:T.emerald}25`, borderRadius:10, marginBottom:10 }}>
              <div style={{ fontSize:14, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{d.name}</div>
              <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:2 }}>{d.type==="i_owe"?"You owe":"Owes you"} · Due {d.due}</div>
              <div style={{ fontSize:16, fontWeight:700, color:d.type==="i_owe"?T.rose:T.emerald, fontFamily:"'Cormorant Garamond',serif", marginTop:4 }}>{fmt(d.amount)}</div>
            </div>
          ))}
          <div style={{ marginTop:14, padding:"14px", background:`${T.gold}10`, border:`1px solid ${T.gold}25`, borderRadius:10 }}>
            <div style={{ fontSize:13, color:T.gold, fontFamily:"'EB Garamond',serif", fontWeight:600, marginBottom:4 }}>💡 Tip of the day</div>
            <div style={{ fontSize:13, color:T.ash, fontFamily:"'EB Garamond',serif", lineHeight:1.6 }}>Record every sale, even small ones. Small sales add up to big profits over time.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   INCOME PAGE  — Supabase connected
══════════════════════════════════════════════════════ */
function IncomePage({ isMobile }) {
  const [income, setIncome]   = useState([]);
  const [modal, setModal]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ amount:"", date:todayS(), source:"", category:"Business Revenue" });
  const cats = ["Business Revenue","Salary","Freelance","Food Sales","Investment","Other"];

  const loadIncome = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('income')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });
    if (!error) setIncome(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadIncome(); }, [loadIncome]);

  const save = async () => {
    if (!form.amount || !form.source) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('income').insert({
      user_id:  user.id,
      amount:   +form.amount,
      date:     form.date,
      source:   form.source,
      category: form.category,
    });
    if (!error) {
      setModal(false);
      setForm({ amount:"", date:todayS(), source:"", category:"Business Revenue" });
      loadIncome();
    }
  };

  const total = income.reduce((s,i) => s + +i.amount, 0);
  const month = income.filter(i => i.date?.startsWith("2026-03")).reduce((s,i) => s + +i.amount, 0);
  const today = income.filter(i => i.date === todayS()).reduce((s,i) => s + +i.amount, 0);

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.dashboard} title="Income" sub="All money received across your businesses">
        <Btn onClick={() => setModal(true)}>+ Record Income</Btn>
      </PageBanner>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        <StatCard label="All-Time Income" value={fmt(total)} color={T.emerald} glow/>
        <StatCard label="This Month"      value={fmt(month)} color={T.gold}/>
        <StatCard label="Today"           value={fmt(today)} color={T.sapphire}/>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>Loading income records...</div>
      ) : (
        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, overflow:"hidden" }}>
          {income.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>
              No income recorded yet. Click <strong style={{color:T.gold}}>+ Record Income</strong> to add your first entry.
            </div>
          )}
          {isMobile ? (
            income.map((item,i,arr) => (
              <div key={item.id} className="row-hover" style={{ padding:"14px 16px", borderBottom:i<arr.length-1?`1px solid ${T.rim}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", gap:11, alignItems:"center" }}>
                  <span style={{ fontSize:20 }}>{CATEGORY_ICONS[item.category]||"💰"}</span>
                  <div>
                    <div style={{ fontSize:14, color:T.cream, fontFamily:"'EB Garamond',serif" }}>{item.source}</div>
                    <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{item.category} · {item.date}</div>
                  </div>
                </div>
                <div style={{ fontSize:15, fontWeight:600, color:T.emerald, fontFamily:"'EB Garamond',serif" }}>+{fmt(item.amount)}</div>
              </div>
            ))
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#090D14" }}>
                  {["","Date","Source","Category","Amount"].map(h => (
                    <th key={h} style={{ padding:"12px 18px", textAlign:"left", fontSize:11, color:T.fog, textTransform:"uppercase", letterSpacing:1, fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {income.map(item => (
                  <tr key={item.id} className="row-hover" style={{ borderTop:`1px solid ${T.rim}` }}>
                    <td style={{ padding:"12px 18px", fontSize:20 }}>{CATEGORY_ICONS[item.category]||"💰"}</td>
                    <td style={{ padding:"12px 18px", fontSize:13, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{item.date}</td>
                    <td style={{ padding:"12px 18px", fontSize:15, color:T.cream, fontFamily:"'EB Garamond',serif" }}>{item.source}</td>
                    <td style={{ padding:"12px 18px" }}><Badge color={T.emerald}>{item.category}</Badge></td>
                    <td style={{ padding:"12px 18px", fontSize:16, fontWeight:600, color:T.emerald, fontFamily:"'Cormorant Garamond',serif" }}>+{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modal && <Drawer title="Record Income" subtitle="Add a new income entry" onClose={() => setModal(false)}>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Source / Description" value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Client payment from Kofi…"/>
        <FSelect label="Category" options={cats} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={save}>Save Income</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EXPENSES PAGE  — Supabase connected
══════════════════════════════════════════════════════ */
function ExpensesPage({ isMobile }) {
  const [expenses, setExpenses] = useState([]);
  const [modal, setModal]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ amount:"", date:todayS(), description:"", category:"Food" });
  const cats = ["Food","Transport","Business","Bills","Shopping","Healthcare","Entertainment","Education","Other"];

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });
    if (!error) setExpenses(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const save = async () => {
    if (!form.amount || !form.description) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('expenses').insert({
      user_id:     user.id,
      amount:      +form.amount,
      date:        form.date,
      description: form.description,
      category:    form.category,
    });
    if (!error) {
      setModal(false);
      setForm({ amount:"", date:todayS(), description:"", category:"Food" });
      loadExpenses();
    }
  };

  const total = expenses.reduce((s,e) => s + +e.amount, 0);

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.budget} title="Expenses" sub="Every cedi spent, tracked with precision">
        <Btn onClick={() => setModal(true)}>+ Add Expense</Btn>
      </PageBanner>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        <StatCard label="Total Expenses" value={fmt(total)} color={T.rose} glow/>
        <StatCard label="This Month"     value={fmt(expenses.filter(e=>e.date?.startsWith("2026-03")).reduce((s,e)=>s+(+e.amount),0))} color={T.gold}/>
        <StatCard label="Today"          value={fmt(expenses.filter(e=>e.date===todayS()).reduce((s,e)=>s+(+e.amount),0))} color={T.rose}/>
      </div>
      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>Loading expenses...</div>
      ) : (
        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, overflow:"hidden" }}>
          {expenses.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>
              No expenses yet. Click <strong style={{color:T.gold}}>+ Add Expense</strong> to add one.
            </div>
          )}
          {isMobile ? (
            expenses.map((item,i,arr) => (
              <div key={item.id} className="row-hover" style={{ padding:"14px 16px", borderBottom:i<arr.length-1?`1px solid ${T.rim}`:"none", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", gap:11, alignItems:"center" }}>
                  <span style={{ fontSize:20 }}>{CATEGORY_ICONS[item.category]||"📤"}</span>
                  <div>
                    <div style={{ fontSize:14, color:T.cream, fontFamily:"'EB Garamond',serif" }}>{item.description}</div>
                    <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{item.category} · {item.date}</div>
                  </div>
                </div>
                <div style={{ fontSize:15, fontWeight:600, color:T.rose, fontFamily:"'EB Garamond',serif" }}>-{fmt(item.amount)}</div>
              </div>
            ))
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#090D14" }}>
                {["","Date","Description","Category","Amount"].map(h=><th key={h} style={{ padding:"12px 18px", textAlign:"left", fontSize:11, color:T.fog, textTransform:"uppercase", letterSpacing:1, fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {expenses.map(item => (
                  <tr key={item.id} className="row-hover" style={{ borderTop:`1px solid ${T.rim}` }}>
                    <td style={{ padding:"12px 18px", fontSize:20 }}>{CATEGORY_ICONS[item.category]||"📤"}</td>
                    <td style={{ padding:"12px 18px", fontSize:13, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{item.date}</td>
                    <td style={{ padding:"12px 18px", fontSize:15, color:T.cream, fontFamily:"'EB Garamond',serif" }}>{item.description}</td>
                    <td style={{ padding:"12px 18px" }}><Badge color={T.rose}>{item.category}</Badge></td>
                    <td style={{ padding:"12px 18px", fontSize:16, fontWeight:600, color:T.rose, fontFamily:"'Cormorant Garamond',serif" }}>-{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {modal && <Drawer title="Add Expense" subtitle="Record a new expense" onClose={() => setModal(false)}>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What was this for?"/>
        <FSelect label="Category" options={cats} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={save}>Save Expense</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SALES PAGE  — Supabase connected
══════════════════════════════════════════════════════ */
function SalesPage({ isMobile }) {
  const [sales, setSales]     = useState([]);
  const [modal, setModal]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ product:"", qty:1, price:"", customer:"", date:todayS() });

  const loadSales = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });
    if (!error) setSales(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadSales(); }, [loadSales]);

  const save = async () => {
    if (!form.product || !form.price) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('sales').insert({
      user_id:  user.id,
      product:  form.product,
      qty:      +form.qty,
      price:    +form.price,
      customer: form.customer,
      date:     form.date,
    });
    if (!error) {
      setModal(false);
      setForm({ product:"", qty:1, price:"", customer:"", date:todayS() });
      loadSales();
    }
  };

  const totalRev    = sales.reduce((s,s2) => s + (+s2.qty * +s2.price), 0);
  const totalOrders = sales.length;

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.sales} title="Sales" sub="Track every product and service sold">
        <Btn onClick={() => setModal(true)}>+ Record Sale</Btn>
      </PageBanner>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        <StatCard label="Total Revenue"   value={fmt(totalRev)} color={T.gold} glow/>
        <StatCard label="Total Orders"    value={`${totalOrders} orders`} color={T.sapphire}/>
        <StatCard label="Avg Order Value" value={fmt(totalRev/Math.max(totalOrders,1))} color={T.emerald}/>
      </div>
      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>Loading sales...</div>
      ) : (
        <div style={{ display:"grid", gap:12 }}>
          {sales.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:T.fog, background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, fontFamily:"'EB Garamond',serif", fontSize:16 }}>
              No sales yet. Click <strong style={{color:T.gold}}>+ Record Sale</strong> to add one.
            </div>
          )}
          {sales.map(item => (
            <div key={item.id} className="card-lift" style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:16, padding:isMobile?"14px 16px":"18px 22px", display:"flex", justifyContent:"space-between", alignItems:isMobile?"flex-start":"center", flexDirection:isMobile?"column":"row", gap:isMobile?10:0 }}>
              <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                <div style={{ width:44, height:44, borderRadius:12, background:`${T.gold}18`, border:`1px solid ${T.gold}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🛒</div>
                <div>
                  <div style={{ fontSize:16, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{item.product}</div>
                  <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:2 }}>Qty: {item.qty} × {fmt(item.price)} · {item.date}</div>
                  {item.customer && <div style={{ fontSize:12, color:T.sapphire, fontFamily:"'Inter',sans-serif", marginTop:1 }}>👤 {item.customer}</div>}
                </div>
              </div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?20:26, fontWeight:700, color:T.gold }}>{fmt(+item.qty * +item.price)}</div>
            </div>
          ))}
        </div>
      )}
      {modal && <Drawer title="Record Sale" subtitle="Log a product or service sale" onClose={() => setModal(false)}>
        <FInput label="Product / Service" value={form.product} onChange={e=>setForm(f=>({...f,product:e.target.value}))} placeholder="e.g. Waakye large, n8n setup…"/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FInput label="Quantity" type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/>
          <FInput label="Unit Price (GHS)" type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
        </div>
        {form.qty && form.price && (
          <div style={{ background:`${T.gold}12`, border:`1px solid ${T.gold}35`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontFamily:"'Cormorant Garamond',serif", fontSize:18, color:T.gold, fontWeight:700 }}>
            Total: {fmt(+form.qty * +form.price)}
          </div>
        )}
        <FInput label="Customer (optional)" value={form.customer} onChange={e=>setForm(f=>({...f,customer:e.target.value}))} placeholder="Customer name"/>
        <FInput label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={save}>Save Sale</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BUDGET PAGE  — local state (not Supabase)
══════════════════════════════════════════════════════ */
function BudgetPage({ data, setData, isMobile }) {
  const [selected, setSelected]     = useState(data.budgets[0]?.id || null);
  const [createBudgetModal, setCBM] = useState(false);
  const [addCatModal, setAddCat]    = useState(false);
  const [recordModal, setRecord]    = useState(null);
  const [deleteCfm, setDeleteCfm]   = useState(null);
  const [nbForm, setNbForm]         = useState({ name:"", date:todayS(), totalCash:"" });
  const [newCat, setNewCat]         = useState({ name:"", budget:"", icon:"📦" });
  const [spendAmt, setSpendAmt]     = useState("");

  const budget    = data.budgets.find(b => b.id === selected);
  const totAlloc  = budget ? budget.categories.reduce((s,c)=>s+c.budget,0) : 0;
  const totSpent  = budget ? budget.categories.reduce((s,c)=>s+c.spent,0) : 0;
  const free      = budget ? budget.totalCash - totAlloc : 0;

  const createBudget = () => {
    if (!nbForm.name || !nbForm.totalCash) return;
    const nb = { id:uid(), name:nbForm.name, date:nbForm.date, totalCash:+nbForm.totalCash, color:T.gold, categories:[] };
    setData(d => ({ ...d, budgets:[...d.budgets, nb] }));
    setSelected(nb.id);
    setCBM(false);
    setNbForm({ name:"", date:todayS(), totalCash:"" });
  };

  const deleteBudget = (id) => {
    setData(d => ({ ...d, budgets:d.budgets.filter(b=>b.id!==id) }));
    setSelected(data.budgets.find(b=>b.id!==id)?.id||null);
    setDeleteCfm(null);
  };

  const addCategory = () => {
    if (!newCat.name || !newCat.budget || !selected) return;
    setData(d => ({ ...d, budgets:d.budgets.map(b => b.id!==selected ? b : { ...b, categories:[...b.categories, { id:uid(), name:newCat.name, icon:newCat.icon, budget:+newCat.budget, spent:0 }] }) }));
    setAddCat(false);
    setNewCat({ name:"", budget:"", icon:"📦" });
  };

  const recordSpend = (catId) => {
    if (!spendAmt || +spendAmt <= 0) return;
    setData(d => ({ ...d, budgets:d.budgets.map(b => b.id!==selected ? b : { ...b, categories:b.categories.map(c => c.id!==catId ? c : { ...c, spent:c.spent+(+spendAmt) }) }) }));
    setRecord(null);
    setSpendAmt("");
  };

  const removeCategory = (catId) => {
    setData(d => ({ ...d, budgets:d.budgets.map(b => b.id!==selected ? b : { ...b, categories:b.categories.filter(c=>c.id!==catId) }) }));
  };

  const catIconOptions = ["🍛","🚕","🛍","📦","⚡","💊","🎬","📚","🏠","💼","🍺","✈️","🎮","📱"];

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.budget} title="Daily Budget" sub="Create, manage and track your budgets">
        <div style={{ display:"flex", gap:10 }}>
          {budget && <Btn variant="outline" sm onClick={() => setAddCat(true)}>+ Category</Btn>}
          <Btn onClick={() => setCBM(true)}>+ New Budget</Btn>
        </div>
      </PageBanner>

      {data.budgets.length > 0 ? (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:20, overflowX:"auto", paddingBottom:4 }}>
            {data.budgets.map(b => (
              <button key={b.id} onClick={() => setSelected(b.id)}
                style={{ padding:"8px 18px", borderRadius:24, border:`1px solid ${selected===b.id?T.gold:T.rim}`, background:selected===b.id?`${T.gold}18`:T.card, color:selected===b.id?T.gold:T.ash, fontFamily:"'EB Garamond',serif", fontSize:14, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, transition:"all .2s" }}>
                {b.name}
              </button>
            ))}
          </div>

          {budget && (
            <>
              <div style={{ background:"linear-gradient(135deg,#0D1E10,#081410)", border:`1px solid ${T.emerald}28`, borderRadius:18, padding:isMobile?"18px 20px":"22px 28px", marginBottom:20, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:`radial-gradient(circle,${T.emerald}14 0%,transparent 70%)` }}/>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                  <div>
                    <div style={{ fontSize:12, color:T.emerald, textTransform:"uppercase", letterSpacing:1.3, fontFamily:"'Inter',sans-serif", marginBottom:6, opacity:.8 }}>Total Cash · {budget.date}</div>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?36:48, color:T.cream, fontWeight:700, letterSpacing:-1.5, lineHeight:1 }}>{fmt(budget.totalCash)}</div>
                    <div style={{ display:"flex", gap:isMobile?14:28, marginTop:14, flexWrap:"wrap" }}>
                      {[{l:"Allocated",v:fmt(totAlloc),c:T.gold},{l:"Spent",v:fmt(totSpent),c:T.rose},{l:"Unallocated",v:fmt(free),c:T.emerald}].map(({l,v,c})=>(
                        <div key={l}><div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginBottom:3 }}>{l}</div><div style={{ fontSize:16, fontWeight:700, color:c, fontFamily:"'EB Garamond',serif" }}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setDeleteCfm(budget.id)} style={{ background:`${T.rose}18`, border:`1px solid ${T.rose}40`, borderRadius:8, padding:"6px 14px", color:T.rose, fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}>Delete Budget</button>
                </div>
              </div>

              {budget.categories.length === 0 && (
                <div style={{ textAlign:"center", padding:"48px 24px", background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>
                  No categories yet. Click <strong style={{ color:T.gold }}>+ Category</strong> to add one.
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
                {budget.categories.map(cat => {
                  const pct  = cat.budget > 0 ? Math.min((cat.spent/cat.budget)*100,100) : 0;
                  const over = cat.spent > cat.budget;
                  const bc   = over ? T.rose : pct>70 ? T.gold : T.emerald;
                  const rem  = cat.budget - cat.spent;
                  return (
                    <div key={cat.id} className="card-lift" style={{ background:T.card, border:`1px solid ${over?T.rose+"50":T.rim}`, borderRadius:18, padding:20, boxShadow:over?`0 0 24px ${T.rose}16`:"none" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:26 }}>{cat.icon}</span>
                          <span style={{ fontSize:16, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{cat.name}</span>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          {over && <Badge color={T.rose}>⚠ Over</Badge>}
                          <button onClick={() => removeCategory(cat.id)} style={{ background:"none", border:"none", color:T.fog, cursor:"pointer", fontSize:14, opacity:.6 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ height:8, background:T.night, borderRadius:4, marginBottom:14, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${bc}80,${bc})`, borderRadius:4, transition:"width .7s ease", boxShadow:`0 0 10px ${bc}55` }}/>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontFamily:"'Inter',sans-serif", marginBottom:12 }}>
                        <span style={{ color:T.fog }}>Budget <span style={{ color:T.cream, fontWeight:500 }}>{fmt(cat.budget)}</span></span>
                        <span style={{ color:T.fog }}>Spent <span style={{ color:T.rose, fontWeight:500 }}>{fmt(cat.spent)}</span></span>
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:over?T.rose:T.emerald, fontFamily:"'EB Garamond',serif", marginBottom:14 }}>
                        {over ? `GHS ${Math.abs(rem).toFixed(2)} overspent` : `GHS ${rem.toFixed(2)} remaining`}
                      </div>
                      <Btn variant="outline" sm full onClick={() => { setRecord(cat.id); setSpendAmt(""); }}>Record Spend</Btn>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign:"center", padding:"72px 24px", background:T.card, border:`1px solid ${T.rim}`, borderRadius:22 }}>
          <div style={{ fontSize:52, marginBottom:16 }}>📊</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, color:T.cream, marginBottom:8 }}>No budgets yet</div>
          <div style={{ fontSize:15, color:T.fog, fontFamily:"'EB Garamond',serif", marginBottom:24 }}>Create your first daily budget to start tracking your spending.</div>
          <Btn onClick={() => setCBM(true)}>+ Create First Budget</Btn>
        </div>
      )}

      {createBudgetModal && <Drawer title="Create New Budget" subtitle="Set up a daily or event-based budget" onClose={() => setCBM(false)}>
        <FInput label="Budget Name" value={nbForm.name} onChange={e=>setNbForm(f=>({...f,name:e.target.value}))} placeholder="e.g. March Daily Budget, Event Budget…"/>
        <FInput label="Total Cash Available (GHS)" type="number" value={nbForm.totalCash} onChange={e=>setNbForm(f=>({...f,totalCash:e.target.value}))} placeholder="e.g. 500"/>
        <FInput label="Date" type="date" value={nbForm.date} onChange={e=>setNbForm(f=>({...f,date:e.target.value}))}/>
        <div style={{ background:`${T.gold}10`, border:`1px solid ${T.gold}25`, borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:14, color:T.ash, fontFamily:"'EB Garamond',serif", lineHeight:1.6 }}>
          💡 After creating the budget, you can add spending categories like Food, Transport, etc.
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn full onClick={createBudget}>Create Budget</Btn>
          <Btn variant="ghost" onClick={() => setCBM(false)}>Cancel</Btn>
        </div>
      </Drawer>}

      {addCatModal && <Drawer title="Add Category" subtitle={`Adding to: ${budget?.name}`} onClose={() => setAddCat(false)}>
        <FInput label="Category Name" value={newCat.name} onChange={e=>setNewCat(f=>({...f,name:e.target.value}))} placeholder="e.g. Food, Transport, Bills…"/>
        <FInput label="Budget Amount (GHS)" type="number" value={newCat.budget} onChange={e=>setNewCat(f=>({...f,budget:e.target.value}))} placeholder="e.g. 80"/>
        <Field label="Icon">
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:4 }}>
            {catIconOptions.map(ic => (
              <button key={ic} onClick={() => setNewCat(f=>({...f,icon:ic}))} style={{ width:38, height:38, borderRadius:8, border:`1px solid ${newCat.icon===ic?T.gold:T.rim}`, background:newCat.icon===ic?`${T.gold}20`:T.card, fontSize:20, cursor:"pointer" }}>{ic}</button>
            ))}
          </div>
        </Field>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={addCategory}>Add Category</Btn>
          <Btn variant="ghost" onClick={() => setAddCat(false)}>Cancel</Btn>
        </div>
      </Drawer>}

      {recordModal && <Drawer title="Record Spending" subtitle={`Category: ${budget?.categories.find(c=>c.id===recordModal)?.name}`} onClose={() => setRecord(null)}>
        <FInput label="Amount Spent (GHS)" type="number" value={spendAmt} onChange={e=>setSpendAmt(e.target.value)} placeholder="0.00"/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={() => recordSpend(recordModal)}>Record</Btn>
          <Btn variant="ghost" onClick={() => setRecord(null)}>Cancel</Btn>
        </div>
      </Drawer>}

      {deleteCfm && <Drawer title="Delete Budget?" subtitle="This cannot be undone." onClose={() => setDeleteCfm(null)}>
        <div style={{ fontSize:15, color:T.ash, fontFamily:"'EB Garamond',serif", marginBottom:20, lineHeight:1.6 }}>
          Are you sure you want to delete <strong style={{ color:T.cream }}>{budget?.name}</strong>? All categories and spending data will be lost.
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="danger" full onClick={() => deleteBudget(deleteCfm)}>Yes, Delete</Btn>
          <Btn variant="ghost" onClick={() => setDeleteCfm(null)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CUSTOMERS PAGE  — Supabase connected
══════════════════════════════════════════════════════ */
function CustomersPage({ isMobile }) {
  const [customers, setCustomers] = useState([]);
  const [modal, setModal]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const [selected, setSel]        = useState(null);
  const [form, setForm]           = useState({ name:"", phone:"", note:"" });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('total_spent', { ascending: false });
    if (!error) setCustomers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const save = async () => {
    if (!form.name) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('customers').insert({
      user_id:     user.id,
      name:        form.name,
      phone:       form.phone,
      note:        form.note,
      total_spent: 0,
      purchases:   0,
      last_seen:   todayS(),
    });
    if (!error) {
      setModal(false);
      setForm({ name:"", phone:"", note:"" });
      loadCustomers();
    }
  };

  const totalRev = customers.reduce((s,c) => s + (+c.total_spent||0), 0);
  const topCust  = customers[0];

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.customers} title="Customers" sub="Your mini CRM — know who drives your revenue">
        <Btn onClick={() => setModal(true)}>+ Add Customer</Btn>
      </PageBanner>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        <StatCard label="Total Customers" value={customers.length}    color={T.sapphire}/>
        <StatCard label="Total Revenue"   value={fmt(totalRev)}       color={T.gold} glow/>
        <StatCard label="Top Customer"    value={topCust?.name||"—"}  color={T.emerald} sub={topCust?fmt(topCust.total_spent):""}/>
      </div>
      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>Loading customers...</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
          {customers.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:T.fog, background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, fontFamily:"'EB Garamond',serif", fontSize:16, gridColumn:"1/-1" }}>
              No customers yet. Click <strong style={{color:T.gold}}>+ Add Customer</strong> to add one.
            </div>
          )}
          {customers.map((c,i) => (
            <div key={c.id} className="card-lift" onClick={() => setSel(c)} style={{ background:T.card, border:`1px solid ${i===0?T.gold+"45":T.rim}`, borderRadius:18, padding:22, cursor:"pointer", position:"relative", overflow:"hidden" }}>
              {i===0 && <div style={{ position:"absolute", top:14, right:14, fontSize:10, background:`${T.gold}20`, color:T.gold, padding:"3px 9px", borderRadius:20, fontFamily:"'Inter',sans-serif", fontWeight:700 }}>★ TOP</div>}
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                <div style={{ width:50, height:50, borderRadius:14, background:`linear-gradient(135deg,${SERIES_COLORS[i%SERIES_COLORS.length]}50,${SERIES_COLORS[i%SERIES_COLORS.length]}20)`, border:`1px solid ${SERIES_COLORS[i%SERIES_COLORS.length]}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:SERIES_COLORS[i%SERIES_COLORS.length], flexShrink:0, fontFamily:"'Cormorant Garamond',serif" }}>
                  {c.name[0]}
                </div>
                <div>
                  <div style={{ fontSize:17, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif" }}>{c.phone}</div>
                  {c.note && <div style={{ fontSize:12, color:T.ash, fontFamily:"'EB Garamond',serif", marginTop:2, fontStyle:"italic" }}>{c.note}</div>}
                </div>
              </div>
              <div style={{ borderTop:`1px solid ${T.rim}`, paddingTop:12, display:"flex", justifyContent:"space-between" }}>
                <div><div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginBottom:3 }}>Total Spent</div><div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:T.gold, fontWeight:700 }}>{fmt(c.total_spent||0)}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginBottom:3 }}>Purchases</div><div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:T.cream, fontWeight:700 }}>{c.purchases||0}x</div></div>
              </div>
              <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:8 }}>Last seen {c.last_seen}</div>
            </div>
          ))}
        </div>
      )}
      {modal && <Drawer title="Add Customer" subtitle="Add a new customer to your CRM" onClose={() => setModal(false)}>
        <FInput label="Customer Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Kofi Mensah"/>
        <FInput label="Phone Number"  value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. 0244 123 456"/>
        <FTextarea label="Note (optional)" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Any details about this customer…"/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={save}>Save Customer</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
      {selected && <Drawer title={selected.name} subtitle={`Customer profile · ${selected.phone}`} onClose={() => setSel(null)}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
          {[{l:"Total Spent",v:fmt(selected.total_spent||0),c:T.gold},{l:"Purchases",v:`${selected.purchases||0}x`,c:T.sapphire}].map(({l,v,c})=>(
            <div key={l} style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginBottom:5 }}>{l}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, color:c, fontWeight:700 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:14, color:T.ash, fontFamily:"'EB Garamond',serif", lineHeight:1.7, marginBottom:20 }}>{selected.note || "No notes for this customer."}</div>
        <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif" }}>Last seen: {selected.last_seen}</div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DEBTS PAGE  — Supabase connected
══════════════════════════════════════════════════════ */
function DebtsPage({ isMobile }) {
  const [debts, setDebts]     = useState([]);
  const [modal, setModal]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ name:"", type:"owed_to_me", amount:"", due:"", note:"" });

  const loadDebts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setDebts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadDebts(); }, [loadDebts]);

  const save = async () => {
    if (!form.name || !form.amount) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('debts').insert({
      user_id: user.id,
      name:    form.name,
      type:    form.type,
      amount:  +form.amount,
      due:     form.due || null,
      note:    form.note,
    });
    if (!error) {
      setModal(false);
      setForm({ name:"", type:"owed_to_me", amount:"", due:"", note:"" });
      loadDebts();
    }
  };

  const settle = async (id) => {
    await supabase.from('debts').delete().eq('id', id);
    loadDebts();
  };

  const owedToMe = debts.filter(d => d.type === "owed_to_me");
  const iOwe     = debts.filter(d => d.type === "i_owe");
  const netDebt  = owedToMe.reduce((s,d)=>s+(+d.amount),0) - iOwe.reduce((s,d)=>s+(+d.amount),0);

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.sales} title="Debts & Credits" sub="Track who owes you and what you owe">
        <Btn onClick={() => setModal(true)}>+ Add Entry</Btn>
      </PageBanner>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        <StatCard label="Owed to Me"   value={fmt(owedToMe.reduce((s,d)=>s+(+d.amount),0))} color={T.emerald} glow/>
        <StatCard label="I Owe"        value={fmt(iOwe.reduce((s,d)=>s+(+d.amount),0))}     color={T.rose}/>
        <StatCard label="Net Position" value={fmt(netDebt)} color={netDebt>=0?T.gold:T.rose} sub={netDebt>=0?"You're ahead":"You owe more"}/>
      </div>
      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:T.fog, fontFamily:"'EB Garamond',serif", fontSize:16 }}>Loading debts...</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:20 }}>
          <div>
            <div style={{ fontSize:12, color:T.emerald, textTransform:"uppercase", letterSpacing:1.2, fontFamily:"'Inter',sans-serif", marginBottom:12, paddingLeft:4 }}>💚 Owed to Me</div>
            {owedToMe.length===0 && <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:14, padding:20, color:T.fog, fontFamily:"'EB Garamond',serif", textAlign:"center" }}>None</div>}
            {owedToMe.map(d => (
              <div key={d.id} className="card-lift" style={{ background:T.card, border:`1px solid ${T.emerald}30`, borderRadius:14, padding:18, marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:16, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{d.name}</div>
                    {d.note && <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:2 }}>{d.note}</div>}
                    {d.due && <div style={{ fontSize:12, color:T.gold, fontFamily:"'Inter',sans-serif", marginTop:4 }}>Due: {d.due}</div>}
                  </div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:T.emerald, fontWeight:700 }}>{fmt(d.amount)}</div>
                </div>
                <Btn variant="emerald" sm style={{ marginTop:12 }} onClick={() => settle(d.id)}>Mark Settled ✓</Btn>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:12, color:T.rose, textTransform:"uppercase", letterSpacing:1.2, fontFamily:"'Inter',sans-serif", marginBottom:12, paddingLeft:4 }}>❤ I Owe</div>
            {iOwe.length===0 && <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:14, padding:20, color:T.fog, fontFamily:"'EB Garamond',serif", textAlign:"center" }}>None</div>}
            {iOwe.map(d => (
              <div key={d.id} className="card-lift" style={{ background:T.card, border:`1px solid ${T.rose}30`, borderRadius:14, padding:18, marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:16, color:T.cream, fontFamily:"'EB Garamond',serif", fontWeight:600 }}>{d.name}</div>
                    {d.note && <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:2 }}>{d.note}</div>}
                    {d.due && <div style={{ fontSize:12, color:T.rose, fontFamily:"'Inter',sans-serif", marginTop:4 }}>Due: {d.due}</div>}
                  </div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:T.rose, fontWeight:700 }}>{fmt(d.amount)}</div>
                </div>
                <Btn variant="danger" sm style={{ marginTop:12 }} onClick={() => settle(d.id)}>Mark Paid ✓</Btn>
              </div>
            ))}
          </div>
        </div>
      )}
      {modal && <Drawer title="Add Debt / Credit" subtitle="Record money owed or borrowed" onClose={() => setModal(false)}>
        <FInput label="Person / Company Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Kofi Mensah"/>
        <FSelect label="Type" options={[{value:"owed_to_me",label:"💚 Owed to Me"},{value:"i_owe",label:"❤ I Owe"}]} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/>
        <FInput label="Amount (GHS)" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/>
        <FInput label="Due Date (optional)" type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))}/>
        <FTextarea label="Note (optional)" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="What is this for?"/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <Btn full onClick={save}>Save</Btn>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
        </div>
      </Drawer>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   REPORTS PAGE
══════════════════════════════════════════════════════ */
function ReportsPage({ data, isMobile }) {
  const income   = data.income.reduce((s,i)=>s+i.amount,0);
  const expenses = data.expenses.reduce((s,e)=>s+e.amount,0);
  const salesRev = data.sales.reduce((s,s2)=>s+s2.qty*s2.price,0);
  const profit   = income - expenses;
  const margin   = income>0 ? ((profit/income)*100).toFixed(1) : "0.0";

  const weekly = [
    {d:"Mon",i:600,e:300},{d:"Tue",i:400,e:500},{d:"Wed",i:900,e:200},
    {d:"Thu",i:1200,e:600},{d:"Fri",i:750,e:400},{d:"Sat",i:320,e:180},{d:"Sun",i:0,e:0},
  ];
  const catExp  = data.expenses.reduce((a,e)=>{ a[e.category]=(a[e.category]||0)+e.amount; return a; },{});
  const catData = Object.entries(catExp).map(([name,value])=>({name,value}));

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.dashboard} title="Reports" sub="Your complete financial picture at a glance"/>
      <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:isMobile?"18px":"26px 30px", marginBottom:20 }}>
        <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:20, fontFamily:"'Inter',sans-serif" }}>Profit & Loss Summary</div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:isMobile?16:24 }}>
          {[{l:"Total Income",v:fmt(income),c:T.emerald},{l:"Total Expenses",v:fmt(expenses),c:T.rose},{l:"Sales Revenue",v:fmt(salesRev),c:T.sapphire},{l:"Net Profit",v:fmt(profit),c:profit>=0?T.gold:T.rose}].map(({l,v,c})=>(
            <div key={l} style={{ borderLeft:`3px solid ${c}`, paddingLeft:14 }}>
              <div style={{ fontSize:11, color:T.fog, textTransform:"uppercase", letterSpacing:1, fontFamily:"'Inter',sans-serif", marginBottom:6 }}>{l}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?20:26, color:c, fontWeight:700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[{l:"Profit Margin",v:`${margin}%`,n:"of income is profit",c:T.gold},{l:"Expense Ratio",v:`${income>0?((expenses/income)*100).toFixed(1):0}%`,n:"of income spent",c:T.rose},{l:"Revenue Growth",v:"+18%",n:"vs last month",c:T.emerald}].map(({l,v,n,c})=>(
          <div key={l} style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:16, padding:"18px 16px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:T.fog, textTransform:"uppercase", letterSpacing:1.1, fontFamily:"'Inter',sans-serif", marginBottom:8 }}>{l}</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?26:34, color:c, fontWeight:700 }}>{v}</div>
            <div style={{ fontSize:11, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:5 }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16 }}>
        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:16, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>This Week — Daily Trend</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weekly} margin={{ top:4, right:4, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="rwi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.emerald} stopOpacity={.3}/>
                  <stop offset="95%" stopColor={T.emerald} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="rwe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.rose} stopOpacity={.2}/>
                  <stop offset="95%" stopColor={T.rose} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="d" tick={{ fill:T.fog, fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:T.fog, fontSize:10 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<CTip/>}/>
              <Area type="monotone" dataKey="i" stroke={T.emerald} fill="url(#rwi)" strokeWidth={2}/>
              <Area type="monotone" dataKey="e" stroke={T.rose}    fill="url(#rwe)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:16, padding:22 }}>
          <div style={{ fontSize:11, color:T.ash, textTransform:"uppercase", letterSpacing:1, marginBottom:14, fontFamily:"'Inter',sans-serif" }}>Expenses by Category</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={catData} layout="vertical" margin={{ top:0, right:16, bottom:0, left:8 }}>
              <XAxis type="number" tick={{ fill:T.fog, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/>
              <YAxis type="category" dataKey="name" tick={{ fill:T.ash, fontSize:11 }} axisLine={false} tickLine={false} width={85}/>
              <Tooltip content={<CTip/>}/>
              <Bar dataKey="value" radius={[0,6,6,0]}>
                {catData.map((_,i)=><Cell key={i} fill={SERIES_COLORS[i%SERIES_COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EXPORT PAGE
══════════════════════════════════════════════════════ */
function ExportPage({ data, isMobile }) {
  const [exported, setExported] = useState(null);

  const triggerDownload = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const toCSV = (rows, cols) => {
    const header = cols.map(c => `"${c.label}"`).join(",");
    const body   = rows.map(r => cols.map(c => {
      const v = c.fn ? c.fn(r) : (r[c.key] ?? "");
      return `"${String(v).replace(/"/g,'""')}"`;
    }).join(",")).join("\n");
    return header + "\n" + body;
  };

  const toJSON = (rows, cols) =>
    JSON.stringify(rows.map(r => Object.fromEntries(cols.map(c => [c.label, c.fn ? c.fn(r) : (r[c.key] ?? "")]))), null, 2);

  const income    = data.income;
  const expenses  = data.expenses;
  const sales     = data.sales;
  const customers = data.customers;
  const debts     = data.debts;

  const totalInc   = income.reduce((s,i)=>s+i.amount,0);
  const totalExp   = expenses.reduce((s,e)=>s+e.amount,0);
  const totalSales = sales.reduce((s,s2)=>s+s2.qty*s2.price,0);
  const net        = totalInc - totalExp;

  const DATASETS = [
    {
      key:"income", label:"Income", icon:"💰", color:T.emerald,
      count:income.length, total:fmt(totalInc),
      cols:[{label:"Date",key:"date"},{label:"Source",key:"source"},{label:"Category",key:"category"},{label:"Amount (GHS)",fn:r=>r.amount.toFixed(2)}],
      rows: income,
    },
    {
      key:"expenses", label:"Expenses", icon:"📤", color:T.rose,
      count:expenses.length, total:fmt(totalExp),
      cols:[{label:"Date",key:"date"},{label:"Description",key:"description"},{label:"Category",key:"category"},{label:"Amount (GHS)",fn:r=>r.amount.toFixed(2)}],
      rows: expenses,
    },
    {
      key:"sales", label:"Sales", icon:"🛒", color:T.gold,
      count:sales.length, total:fmt(totalSales),
      cols:[{label:"Date",key:"date"},{label:"Product",key:"product"},{label:"Qty",key:"qty"},{label:"Unit Price (GHS)",fn:r=>r.price.toFixed(2)},{label:"Total (GHS)",fn:r=>(r.qty*r.price).toFixed(2)},{label:"Customer",key:"customer"}],
      rows: sales,
    },
    {
      key:"customers", label:"Customers", icon:"👥", color:T.sapphire,
      count:customers.length, total:`${customers.length} records`,
      cols:[{label:"Name",key:"name"},{label:"Phone",key:"phone"},{label:"Purchases",key:"purchases"},{label:"Total Spent (GHS)",fn:r=>(r.totalSpent||0).toFixed(2)},{label:"Last Seen",key:"lastSeen"},{label:"Note",key:"note"}],
      rows: customers,
    },
    {
      key:"debts", label:"Debts & Credits", icon:"⟳", color:T.amethyst,
      count:debts.length, total:`${debts.length} entries`,
      cols:[{label:"Name",key:"name"},{label:"Type",fn:r=>r.type==="owed_to_me"?"Owed to Me":"I Owe"},{label:"Amount (GHS)",fn:r=>r.amount.toFixed(2)},{label:"Due",key:"due"},{label:"Note",key:"note"}],
      rows: debts,
    },
  ];

  const buildPL = () => {
    const now = new Date().toLocaleDateString("en-GH", { dateStyle:"long" });
    return [
      "MONEYBOOK GHANA — PROFIT & LOSS SUMMARY",
      `Generated: ${now}`,
      "═══════════════════════════════════════",
      "",
      `Total Income:      GHS ${totalInc.toFixed(2)}`,
      `Total Expenses:    GHS ${totalExp.toFixed(2)}`,
      `Sales Revenue:     GHS ${totalSales.toFixed(2)}`,
      `Net Profit/Loss:   GHS ${net.toFixed(2)}`,
      `Profit Margin:     ${totalInc>0?((net/totalInc)*100).toFixed(1):0}%`,
      "",
      "═══════════════════════════════════════",
      "INCOME BREAKDOWN",
      "───────────────────────────────────────",
      ...income.map(i=>`${i.date}  ${i.source.padEnd(30)}  GHS ${i.amount.toFixed(2)}`),
      "",
      "EXPENSE BREAKDOWN",
      "───────────────────────────────────────",
      ...expenses.map(e=>`${e.date}  ${e.description.padEnd(30)}  GHS ${e.amount.toFixed(2)}`),
      "",
      "SALES BREAKDOWN",
      "───────────────────────────────────────",
      ...sales.map(s=>`${s.date}  ${s.product.padEnd(30)}  ${s.qty}x GHS ${s.price.toFixed(2)} = GHS ${(s.qty*s.price).toFixed(2)}`),
    ].join("\n");
  };

  const exportCSV  = (ds) => { triggerDownload(toCSV(ds.rows,ds.cols),  `moneybook-${ds.key}.csv`,  "text/csv"); setExported(ds.key); setTimeout(()=>setExported(null),2200); };
  const exportJSON = (ds) => { triggerDownload(toJSON(ds.rows,ds.cols), `moneybook-${ds.key}.json`, "application/json"); setExported(ds.key+"_json"); setTimeout(()=>setExported(null),2200); };
  const exportPL   = ()   => { triggerDownload(buildPL(), "moneybook-profit-loss.txt", "text/plain"); setExported("pl"); setTimeout(()=>setExported(null),2200); };
  const exportAll  = ()   => {
    DATASETS.forEach((ds,i) => setTimeout(()=>triggerDownload(toCSV(ds.rows,ds.cols),`moneybook-${ds.key}.csv`,"text/csv"),i*300));
    setTimeout(()=>triggerDownload(buildPL(),"moneybook-profit-loss.txt","text/plain"),DATASETS.length*300);
    setExported("all"); setTimeout(()=>setExported(null),2800);
  };

  return (
    <div className="fade">
      <PageBanner img={HERO_IMGS.dashboard} title="Export Data" sub="Download your financial records as CSV, JSON or plain text">
        <Btn onClick={exportAll} variant="gold">⇩ Export Everything</Btn>
      </PageBanner>

      {exported && (
        <div className="fade" style={{ position:"fixed", bottom:isMobile?90:32, right:24, zIndex:900, background:T.emerald, color:"#06080F", padding:"12px 20px", borderRadius:12, fontFamily:"'EB Garamond',serif", fontSize:15, fontWeight:600, boxShadow:"0 8px 32px rgba(0,0,0,.5)", display:"flex", alignItems:"center", gap:8 }}>
          ✓ Download started!
        </div>
      )}

      <div style={{ background:`linear-gradient(135deg,#0D1A10,#081410)`, border:`1px solid ${T.emerald}30`, borderRadius:18, padding:isMobile?"18px 20px":"22px 28px", marginBottom:22 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:T.cream, fontWeight:700, marginBottom:4 }}>📄 Full P&L Summary</div>
            <div style={{ fontSize:13, color:T.fog, fontFamily:"'Inter',sans-serif" }}>Income + Expenses + Sales — all in one formatted text file</div>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <Btn variant="outline" sm onClick={exportPL}>⇩ Download .txt</Btn>
            <Btn variant="gold" sm onClick={exportAll}>⇩ Export All Files</Btn>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:14, marginTop:18 }}>
          {[{l:"Total Income",v:fmt(totalInc),c:T.emerald},{l:"Total Expenses",v:fmt(totalExp),c:T.rose},{l:"Sales Revenue",v:fmt(totalSales),c:T.sapphire},{l:"Net Profit",v:fmt(net),c:net>=0?T.gold:T.rose}].map(({l,v,c})=>(
            <div key={l} style={{ borderLeft:`3px solid ${c}`, paddingLeft:12 }}>
              <div style={{ fontSize:10, color:T.fog, textTransform:"uppercase", letterSpacing:1, fontFamily:"'Inter',sans-serif", marginBottom:4 }}>{l}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:isMobile?18:22, color:c, fontWeight:700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
        {DATASETS.map(ds => (
          <div key={ds.key} className="card-lift" style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:`${ds.color}18`, border:`1px solid ${ds.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{ds.icon}</div>
                <div>
                  <div style={{ fontFamily:"'EB Garamond',serif", fontSize:17, color:T.cream, fontWeight:600 }}>{ds.label}</div>
                  <div style={{ fontSize:12, color:T.fog, fontFamily:"'Inter',sans-serif", marginTop:2 }}>{ds.count} records · {ds.total}</div>
                </div>
              </div>
              <Badge color={ds.color}>{ds.count}</Badge>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
              {ds.cols.map(c => (
                <span key={c.label} style={{ padding:"3px 9px", borderRadius:20, background:`${T.rimHi}`, color:T.ash, fontSize:11, fontFamily:"'Inter',sans-serif" }}>{c.label}</span>
              ))}
            </div>
            {ds.rows.length > 0 ? (
              <div style={{ background:"#090D14", borderRadius:10, padding:"10px 12px", marginBottom:16, fontFamily:"monospace", fontSize:11, color:T.fog, maxHeight:72, overflow:"hidden" }}>
                <div style={{ color:T.ash }}>{ds.cols.map(c=>c.label).join(", ")}</div>
                {ds.rows.slice(0,2).map((r,i)=>(
                  <div key={i} style={{ color:T.fog, marginTop:3 }}>{ds.cols.map(c=>(c.fn?c.fn(r):(r[c.key]??""))).join(", ")}</div>
                ))}
                {ds.rows.length>2 && <div style={{ color:T.rimHi, marginTop:3 }}>... {ds.rows.length-2} more rows</div>}
              </div>
            ) : (
              <div style={{ padding:"14px", background:"#090D14", borderRadius:10, marginBottom:16, color:T.fog, fontSize:13, fontFamily:"'EB Garamond',serif", textAlign:"center" }}>No data yet</div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="gold" sm full onClick={()=>exportCSV(ds)} disabled={ds.rows.length===0}>⇩ CSV</Btn>
              <Btn variant="ghost" sm full onClick={()=>exportJSON(ds)} disabled={ds.rows.length===0}>⇩ JSON</Btn>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:T.card, border:`1px solid ${T.rim}`, borderRadius:18, padding:22, marginTop:20 }}>
        <div style={{ fontSize:12, color:T.ash, textTransform:"uppercase", letterSpacing:1, fontFamily:"'Inter',sans-serif", marginBottom:16 }}>About Export Formats</div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:16 }}>
          {[
            { fmt:".CSV", icon:"📊", desc:"Opens directly in Microsoft Excel, Google Sheets, or any spreadsheet app. Best for analysis and printing." },
            { fmt:".JSON", icon:"🖥", desc:"Developer-friendly format. Use this to import your data into other apps, Supabase, or custom scripts." },
            { fmt:".TXT", icon:"📄", desc:"Plain text P&L report. Easy to read, share by email or WhatsApp, or print as a statement." },
          ].map(({fmt:f,icon,desc})=>(
            <div key={f} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:40, height:40, borderRadius:10, background:`${T.gold}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{icon}</div>
              <div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, color:T.gold, fontWeight:700, marginBottom:4 }}>{f}</div>
                <div style={{ fontSize:13, color:T.ash, fontFamily:"'EB Garamond',serif", lineHeight:1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════════════ */
export default function App() {
  const [user,     setUser]     = useState(null);
  const [active,   setActive]   = useState("dashboard");
  const [data,     setData]     = useState(SEED);
  const [menuOpen, setMenuOpen] = useState(false);
  const w   = useW();
  const isM = w < 768;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          name:     session.user.user_metadata?.name     || session.user.email,
          business: session.user.user_metadata?.business || "My Business",
          avatar:   (session.user.user_metadata?.name    || session.user.email)[0].toUpperCase()
        });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          name:     session.user.user_metadata?.name     || session.user.email,
          business: session.user.user_metadata?.business || "My Business",
          avatar:   (session.user.user_metadata?.name    || session.user.email)[0].toUpperCase()
        });
      } else {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!user) return (
    <><style>{CSS}</style><AuthPage onAuth={u => { setUser(u); setData({ ...SEED, user:u }); }}/></>
  );

  const pp = { data, setData, isMobile:isM };
  const pages = {
    dashboard: <Dashboard    {...pp}/>,
    income:    <IncomePage    isMobile={isM}/>,
    expenses:  <ExpensesPage  isMobile={isM}/>,
    sales:     <SalesPage     isMobile={isM}/>,
    budget:    <BudgetPage    {...pp}/>,
    customers: <CustomersPage isMobile={isM}/>,
    debts:     <DebtsPage     isMobile={isM}/>,
    reports:   <ReportsPage   {...pp}/>,
    export:    <ExportPage    {...pp}/>,
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ fontFamily:"'EB Garamond',serif", background:T.bg, minHeight:"100vh", color:T.cream, display:"flex", flexDirection:isM?"column":"row" }}>
        {!isM && <Sidebar active={active} setActive={setActive} user={user} onLogout={async () => { await supabase.auth.signOut(); setUser(null); }}/>}
        {isM  && <MobileHeader active={active} user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen} setActive={setActive} onLogout={async () => { await supabase.auth.signOut(); setUser(null); }}/>}
        <main style={{ marginLeft:isM?0:226, flex:1, padding:isM?"18px 16px 90px":"34px 44px", minHeight:"100vh" }}>
          {pages[active]}
        </main>
        {isM && <MobileNav active={active} setActive={setActive}/>}
      </div>
    </>
  );
}
