"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CAMPAIGN_OBJECTIVES, OBJECTIVE_META, VISUAL_TAKE } from "@/lib/constants";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

// ─── Constants ────────────────────────────────────────────────────────────────
const RULE_TYPES = ["Most Videos","Highest Views","Highest GMV","Best Conversion","Most Consistent","Most Active Creator","Custom Rule"] as const;

const STATUS_META: Record<string,{label:string;bg:string;text:string;dot:string}> = {
  Draft:    {label:"Draft",    bg:"bg-gray-100",   text:"text-gray-600",   dot:"bg-gray-400"  },
  Ready:    {label:"Ready",    bg:"bg-blue-50",    text:"text-blue-700",   dot:"bg-blue-500"  },
  Published:{label:"Published",bg:"bg-violet-50",  text:"text-violet-700", dot:"bg-violet-500"},
  Ongoing:  {label:"Ongoing",  bg:"bg-emerald-50", text:"text-emerald-700",dot:"bg-emerald-500"},
  Ended:    {label:"Ended",    bg:"bg-red-50",     text:"text-red-700",    dot:"bg-red-400"   },
};
const PARTICIPANT_STATUS_META: Record<string,{bg:string;text:string}> = {
  Pending:  {bg:"bg-yellow-50",text:"text-yellow-700"},
  Approved: {bg:"bg-blue-50",  text:"text-blue-700"  },
  Active:   {bg:"bg-emerald-50",text:"text-emerald-700"},
  Completed:{bg:"bg-indigo-50",text:"text-indigo-700"},
  Rejected: {bg:"bg-red-50",   text:"text-red-700"   },
};
const VISIBILITY_META: Record<string,{icon:string}> = {
  "Public":         {icon:"🌍"},
  "Invite Only":    {icon:"📩"},
  "Specialist Only":{icon:"⭐"},
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeaderboardRule {id:string;rank:number;ruleType:string;label:string;reward:number;}
interface Milestone       {id:string;type:"gmv"|"views"|"upload";target:number;reward:number;}
interface RewardConfig {
  fixed?:      {enabled:boolean;rewardPerVideo:number;rewardPerLive:number;completionBonus:number};
  leaderboard?:LeaderboardRule[];
  consistency?:{enabled:boolean;minUpload:number;rewardAmount:number};
  milestones?: Milestone[];
}
interface AutomationConfig {
  whatsappReminder?:    boolean;
  formSubmissionLink?:  boolean;
  stopAfterSubmit?:     boolean;
  autoLeaderboard?:     boolean;
  autoProgress?:        boolean;
  autoCompletion?:      boolean;
  welcomeMessage?:      boolean;
  reminderH3?:          boolean;
  reminderH3End?:       boolean;
  reminderH1Final?:     boolean;
}
interface Participant {
  id:number;campaignId:number;tiktokUsername:string;namaAffiliate:string;
  whatsapp:string;category:string;specialist:string;visualTake:string;
  joinedAt:string;status:string;videoCount:number;views:number;gmvContributed:number;
  lastVideoAt?:string|null;
}
interface CampaignSampleDelivery {
  id: number;
  affiliateUsername: string;
  statusProgress: string;
  sampleCategory: string;
  produk: string;
  tanggalKirim: string;
}
interface BroadcastLog {
  id:number;campaignId:number;message:string;targetType:string;
  totalSent:number;status:string;scheduledAt:string|null;sentAt:string|null;createdAt:string;
}
interface AnalyticsData {
  summary:{totalParticipants:number;activeParticipants:number;completedParticipants:number;completionRate:number;totalVideos:number;totalViews:number;totalGmv:number;activeUploaders:number;avgVideosPerCreator:number};
  topByVideos:{username:string;nama:string;value:number}[];
  topByViews: {username:string;nama:string;value:number}[];
  topByGmv:   {username:string;nama:string;value:number}[];
  categoryBreakdown:{name:string;videoCount:number;gmv:number;count:number}[];
  vtBreakdown:{name:string;videoCount:number;count:number}[];
  joinTrend:{date:string;count:number}[];
}
interface Specialist {id:number;nama:string;}
interface Category  {id:number;nama:string;}
interface Product   {id:number;nama:string;}
interface Campaign {
  id:number;nama:string;slug:string;
  objectives:string;deskripsi:string;bannerPath:string;
  status:string;visibility:string;
  affiliateCategories:string;visualTake:string;
  startDate:string|null;endDate:string|null;
  rewardConfig:string;rewardDeskripsi:string;
  maxParticipants:number; // used as target KPI — no hard cap
  picSpecialistId:number|null;picSpecialist:Specialist|null;
  catatan:string;isTemplate:boolean;
  approvalMode:string;joinSlug:string;automationConfig:string;
  createdAt:string;updatedAt:string;
  participants:Participant[];
  productFocus:{product:Product}[];
}
interface CampaignFormInfo {
  id:number;
  regFormId:string;regFormPublicId:string;regFormLink:string;regFormEditLink:string;lastRegSyncAt:string|null;
  subFormId:string;subFormPublicId:string;subFormLink:string;subFormEditLink:string;lastSubSyncAt:string|null;
  createdAt:string;
}
interface CampaignRegistration {
  id:number;campaignId:number;nama:string;usernameTiktok:string;noWhatsapp:string;
  alamat:string;kategoriAffiliate:string;visualTake:string;linkPortfolio:string;catatan:string;
  status:string;approvedAt:string|null;rejectedAt:string|null;createdAt:string;
}
type TabId = "overview"|"participants"|"leaderboard"|"analytics"|"automation"|"settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseJSON<T>(s:string,fb:T):T{try{return JSON.parse(s) as T;}catch{return fb;}}
function fmt(n:number){return new Intl.NumberFormat("id-ID").format(Math.round(n));}
function fmtRp(n:number){
  if(n>=1_000_000)return `Rp${(n/1_000_000).toFixed(1)}jt`;
  if(n>=1_000)return `Rp${(n/1_000).toFixed(0)}rb`;
  return `Rp${fmt(n)}`;
}
function formatDate(d:string|null){
  if(!d)return "—";
  return new Date(d).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"});
}
function daysLeft(e:string|null){
  if(!e)return null;
  return Math.ceil((new Date(e).getTime()-Date.now())/86_400_000);
}
function uid(){return Math.random().toString(36).slice(2,9);}
function slugify(s:string){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function StatusBadge({status}:{status:string}){
  const m=STATUS_META[status]??STATUS_META.Draft;
  return(<span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}><span className={`w-1.5 h-1.5 rounded-full ${m.dot}`}/>{m.label}</span>);
}
function ParticipantStatusBadge({status}:{status:string}){
  const m=PARTICIPANT_STATUS_META[status]??{bg:"bg-gray-100",text:"text-gray-600"};
  return(<span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>{status}</span>);
}
function ObjectiveBadge({label}:{label:string}){
  const m=OBJECTIVE_META[label]??{bg:"bg-gray-100",text:"text-gray-600",icon:"📌"};
  return(<span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>{m.icon} {label}</span>);
}
function Toggle({enabled,onToggle}:{enabled:boolean;onToggle:()=>void}){
  return(
    <button type="button" onClick={onToggle} className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${enabled?"bg-indigo-600":"bg-gray-200"}`}>
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled?"translate-x-4":""}`}/>
    </button>
  );
}

// ─── PicDropdown ─────────────────────────────────────────────────────────────
function PicDropdown({specialists,value,onChange}:{specialists:Specialist[];value:number|null;onChange:(id:number|null)=>void;}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef<HTMLDivElement>(null);
  const sel=specialists.find(s=>s.id===value)??null;
  const filt=specialists.filter(s=>s.nama.toLowerCase().includes(q.toLowerCase()));
  useEffect(()=>{
    function out(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);}
    document.addEventListener("mousedown",out);return()=>document.removeEventListener("mousedown",out);
  },[]);
  return(
    <div ref={ref} className="relative">
      <div onClick={()=>{setOpen(!open);setQ("");}} className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 cursor-pointer flex items-center justify-between gap-2 hover:border-indigo-300 transition-colors text-sm">
        <span className={sel?"text-gray-800":"text-gray-400"}>{sel?sel.nama:"Pilih PIC Specialist…"}</span>
        <span className="text-gray-300 text-xs shrink-0">▾</span>
      </div>
      {open&&(
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100"><input autoFocus type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari specialist…" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/></div>
          <div className="max-h-44 overflow-y-auto">
            <button type="button" onClick={()=>{onChange(null);setOpen(false);}} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-gray-400 hover:bg-gray-50">— Tidak ada PIC</button>
            {filt.map(s=>(
              <button key={s.id} type="button" onClick={()=>{onChange(s.id);setOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${value===s.id?"bg-indigo-50 text-indigo-700 font-semibold":"text-gray-700 hover:bg-gray-50"}`}>
                {value===s.id&&<span className="text-indigo-500 text-xs">✓</span>}{s.nama}
              </button>
            ))}
            {filt.length===0&&<p className="px-4 py-3 text-sm text-gray-400 text-center">Tidak ditemukan</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MultiSelect ─────────────────────────────────────────────────────────────
function MultiSelect({options,value,onChange,placeholder,metaFn}:{
  options:readonly string[]|string[];value:string[];onChange:(v:string[])=>void;placeholder:string;
  metaFn?:(opt:string)=>{bg:string;text:string;icon?:string}|null;
}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const toggle=(opt:string)=>onChange(value.includes(opt)?value.filter(v=>v!==opt):[...value,opt]);
  useEffect(()=>{
    function out(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);}
    document.addEventListener("mousedown",out);return()=>document.removeEventListener("mousedown",out);
  },[]);
  return(
    <div ref={ref} className="relative">
      <div onClick={()=>setOpen(!open)} className="min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-indigo-300 transition-colors">
        {value.length===0?<span className="text-gray-400 text-sm">{placeholder}</span>:value.map(v=>{
          const m=metaFn?metaFn(v):null;
          return(<span key={v} className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${m?`${m.bg} ${m.text}`:"bg-indigo-100 text-indigo-700"}`}>
            {m?.icon&&<span>{m.icon}</span>}{v}
            <button type="button" onClick={e=>{e.stopPropagation();toggle(v);}} className="hover:opacity-70 ml-0.5">×</button>
          </span>);
        })}
        <span className="ml-auto text-gray-300 text-xs">▾</span>
      </div>
      {open&&(
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {options.map(opt=>{
            const m=metaFn?metaFn(opt):null;
            return(<button key={opt} type="button" onClick={()=>toggle(opt)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${value.includes(opt)?"bg-indigo-50 text-indigo-700":"text-gray-700 hover:bg-gray-50"}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${value.includes(opt)?"bg-indigo-600 border-indigo-600 text-white":"border-gray-300"}`}>{value.includes(opt)?"✓":""}</span>
              {m?.icon&&<span>{m.icon}</span>}{opt}
            </button>);
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS:{id:TabId;label:string;icon:string}[] = [
  {id:"overview",    label:"Overview",    icon:"📊"},
  {id:"participants",label:"Participants",icon:"👥"},
  {id:"leaderboard", label:"Leaderboard", icon:"🏆"},
  {id:"analytics",   label:"Analytics",  icon:"📈"},
  {id:"automation",  label:"Automation", icon:"🤖"},
  {id:"settings",    label:"Settings",   icon:"⚙️"},
];

// ─── Mini Bar Chart (no library) ─────────────────────────────────────────────
function MiniBar({items,labelKey,valueKey,fmtFn}:{
  items:{[k:string]:unknown}[];labelKey:string;valueKey:string;fmtFn:(n:number)=>string;
}){
  const max=Math.max(...items.map(i=>i[valueKey] as number),1);
  return(
    <div className="space-y-2">
      {items.map((item,i)=>{
        const val=item[valueKey] as number;
        const pct=Math.round((val/max)*100);
        const colors=["bg-indigo-500","bg-violet-500","bg-blue-500","bg-cyan-500","bg-teal-500"];
        return(
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 w-28 truncate text-xs">@{item[labelKey] as string}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${colors[i%colors.length]}`} style={{width:`${pct}%`}}/>
            </div>
            <span className="text-xs font-bold text-gray-700 w-16 text-right">{fmtFn(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({c}:{c:Campaign}){
  const objectives =parseJSON<string[]>(c.objectives,[]);
  const categories =parseJSON<string[]>(c.affiliateCategories,[]);
  const visualTakes=parseJSON<string[]>(c.visualTake,[]);
  const rewardCfg  =parseJSON<RewardConfig>(c.rewardConfig,{});
  const active     =c.participants.filter(p=>p.status==="Active"||p.status==="Completed");
  const totalVideos=active.reduce((s,p)=>s+p.videoCount,0);
  const totalGmv   =active.reduce((s,p)=>s+p.gmvContributed,0);
  const vis        =VISIBILITY_META[c.visibility]??VISIBILITY_META["Public"];
  const days       =daysLeft(c.endDate);
  let rewardPool=0;
  if(rewardCfg.leaderboard)rewardPool+=rewardCfg.leaderboard.reduce((s,r)=>s+r.reward,0);
  if(rewardCfg.consistency?.enabled)rewardPool+=rewardCfg.consistency.rewardAmount;
  if(rewardCfg.milestones)rewardPool+=rewardCfg.milestones.reduce((s,m)=>s+m.reward,0);
  const rawPct=c.maxParticipants>0?Math.round((c.participants.length/c.maxParticipants)*100):null;
  const pct=rawPct;
  const isOverTarget=pct!==null&&pct>100;
  return(
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{label:"Total Peserta",value:fmt(c.participants.length),icon:"👥",color:"bg-blue-50"},{label:"Video Submitted",value:fmt(totalVideos),icon:"📹",color:"bg-violet-50"},{label:"Total GMV",value:fmtRp(totalGmv),icon:"💰",color:"bg-emerald-50"},{label:"Reward Pool",value:fmtRp(rewardPool),icon:"🏆",color:"bg-amber-50"}].map(k=>(
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${k.color}`}>{k.icon}</div>
            <div><p className="text-xs text-gray-400 font-medium">{k.label}</p><p className="text-xl font-bold text-gray-900">{k.value}</p></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">📋 Detail Campaign</h3>
          <div className="space-y-2.5">
            {[{label:"PIC",value:c.picSpecialist?.nama??"—"},{label:"Visibility",value:`${vis.icon} ${c.visibility}`},{label:"Approval",value:c.approvalMode==="Manual"?"Manual 👤":"Auto ✅"},{label:"Tanggal Mulai",value:formatDate(c.startDate)},{label:"Berakhir",value:formatDate(c.endDate)},{label:"Target Peserta",value:c.maxParticipants>0?fmt(c.maxParticipants)+" peserta":"—"},{label:"Template",value:c.isTemplate?"Ya":"Tidak"}].map(({label,value})=>(
              <div key={label} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-gray-400 shrink-0 w-32">{label}</span>
                <span className="text-gray-800 font-medium text-right">{value}</span>
              </div>
            ))}
            {c.joinSlug&&(
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Public Join Link</p>
                <a href={`/join/${c.joinSlug}`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline break-all">
                  /join/{c.joinSlug}
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          {objectives.length>0&&(
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2.5">🎯 Campaign Objectives</h3>
              <div className="flex flex-wrap gap-1.5">{objectives.map(obj=><ObjectiveBadge key={obj} label={obj}/>)}</div>
            </div>
          )}
          {categories.length>0&&(
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2.5">🏷️ Affiliate Categories</h3>
              <div className="flex flex-wrap gap-1.5">{categories.map(cat=><span key={cat} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">{cat}</span>)}</div>
            </div>
          )}
          {visualTakes.length>0&&(
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2.5">🎬 Visual Take</h3>
              <div className="flex flex-wrap gap-1.5">{visualTakes.map(vt=><span key={vt} className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full">{vt}</span>)}</div>
            </div>
          )}
          {c.productFocus?.length>0&&(
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2.5">🧴 Product Focus</h3>
              <div className="space-y-1.5">
                {c.productFocus.map(({product})=>(
                  <div key={product.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-base">🧴</span>
                    <span className="font-medium">{product.nama}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pct!==null&&(
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-2.5">👥 Target Peserta</h3>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">{c.participants.length} / {c.maxParticipants} peserta</span>
                <span className={`font-bold ${isOverTarget?"text-orange-500":"text-indigo-600"}`}>
                  {isOverTarget?"🔥 ":""}{pct}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${isOverTarget?"bg-gradient-to-r from-amber-400 to-orange-500":"bg-gradient-to-r from-indigo-500 to-violet-500"}`} style={{width:`${Math.min(pct,100)}%`}}/>
              </div>
              {isOverTarget&&<p className="text-[10px] text-orange-500 mt-1.5 font-semibold">✨ Over-achievement! Target telah terlampaui</p>}
            </div>
          )}
          {days!==null&&(
            <div className={`rounded-2xl border p-4 ${days<0?"bg-red-50 border-red-100":days<=3?"bg-amber-50 border-amber-100":"bg-emerald-50 border-emerald-100"}`}>
              <p className="text-xs font-semibold text-gray-500 mb-1">⏱️ Countdown</p>
              <p className={`text-3xl font-bold ${days<0?"text-red-600":days<=3?"text-amber-600":"text-emerald-600"}`}>{days<0?"Berakhir":days===0?"Hari ini":`${days} hari`}</p>
              <p className="text-xs text-gray-400 mt-0.5">Berakhir {formatDate(c.endDate)}</p>
            </div>
          )}
        </div>
      </div>
      {(rewardCfg.fixed?.enabled||(rewardCfg.leaderboard?.length??0)>0||rewardCfg.consistency?.enabled||(rewardCfg.milestones?.length??0)>0)&&(
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">🏆 Reward System</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rewardCfg.fixed?.enabled&&(<div className="bg-indigo-50 rounded-xl p-3"><p className="text-xs font-bold text-indigo-700 mb-2">🎥 Fixed Reward</p>{rewardCfg.fixed.rewardPerVideo>0&&<p className="text-sm text-indigo-800">Per Video: <strong>{fmtRp(rewardCfg.fixed.rewardPerVideo)}</strong></p>}{rewardCfg.fixed.rewardPerLive>0&&<p className="text-sm text-indigo-800">Per Live: <strong>{fmtRp(rewardCfg.fixed.rewardPerLive)}</strong></p>}{rewardCfg.fixed.completionBonus>0&&<p className="text-sm text-indigo-800">Completion: <strong>{fmtRp(rewardCfg.fixed.completionBonus)}</strong></p>}</div>)}
            {(rewardCfg.leaderboard?.length??0)>0&&(<div className="bg-amber-50 rounded-xl p-3"><p className="text-xs font-bold text-amber-700 mb-2">🏆 Leaderboard Reward</p>{rewardCfg.leaderboard!.map((r,i)=><p key={r.id} className="text-sm text-amber-800">{["🥇","🥈","🥉"][i]??`#${i+1}`} {r.label}: <strong>{fmtRp(r.reward)}</strong></p>)}</div>)}
            {rewardCfg.consistency?.enabled&&(<div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs font-bold text-emerald-700 mb-2">🔥 Consistency Reward</p><p className="text-sm text-emerald-800">Upload min {rewardCfg.consistency.minUpload} video → <strong>{fmtRp(rewardCfg.consistency.rewardAmount)}</strong></p></div>)}
            {(rewardCfg.milestones?.length??0)>0&&(<div className="bg-violet-50 rounded-xl p-3"><p className="text-xs font-bold text-violet-700 mb-2">🎯 Milestones</p>{rewardCfg.milestones!.map(m=><p key={m.id} className="text-sm text-violet-800">{m.type.toUpperCase()} {fmt(m.target)} → <strong>{fmtRp(m.reward)}</strong></p>)}</div>)}
          </div>
          {c.rewardDeskripsi&&<p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">{c.rewardDeskripsi}</p>}
        </div>
      )}
      {c.deskripsi&&<div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-semibold text-gray-800 mb-3">📝 Deskripsi</h3><p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{c.deskripsi}</p></div>}
      {c.catatan&&<div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800"><strong>📌 Catatan Internal:</strong> {c.catatan}</div>}
    </div>
  );
}

// ─── Send Sample Modal ────────────────────────────────────────────────────────
const DELIVERY_PRODUCTS_CACHE: {list: string[]; ts: number} = { list: [], ts: 0 };

function SendSampleModal({participant,campaign,specialists,onClose,onSent}:{
  participant: Participant;
  campaign: Campaign;
  specialists: Specialist[];
  onClose: ()=>void;
  onSent: ()=>void;
}) {
  // Auto-fill PIC from campaign, allow manual override
  const [picId,setPicId]=useState<string>(campaign.picSpecialistId?String(campaign.picSpecialistId):"");
  const [form,setForm]=useState({
    produk:"",qtyProduk:"1",
    totalVideoTarget:"3",
    tanggalKirim:new Date().toISOString().slice(0,10),
    catatan:"",
    deliveryReason:"",
  });
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState<{ok:boolean;msg:string}|null>(null);
  const [productSuggestions,setProductSuggestions]=useState<string[]>([]);

  useEffect(()=>{
    // Load product suggestions (cache for 60s)
    if(DELIVERY_PRODUCTS_CACHE.ts>Date.now()-60_000&&DELIVERY_PRODUCTS_CACHE.list.length>0){
      setProductSuggestions(DELIVERY_PRODUCTS_CACHE.list);return;
    }
    fetch("/api/master/suggestions?type=produk")
      .then(r=>r.json())
      .then((d:{value?:string}[]|unknown)=>{
        const list=Array.isArray(d)?d.filter((x)=>typeof (x as {value?:string}).value==="string").map((x)=>(x as {value:string}).value):[];
        DELIVERY_PRODUCTS_CACHE.list=list;DELIVERY_PRODUCTS_CACHE.ts=Date.now();
        setProductSuggestions(list);
      }).catch(()=>{});
  },[]);

  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();
    setSaving(true);
    try{
      const res=await fetch("/api/sample-delivery",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          affiliateUsername: participant.tiktokUsername,
          produk:            form.produk,
          qtyProduk:         Number(form.qtyProduk)||1,
          totalVideoTarget:  Number(form.totalVideoTarget)||0,
          tanggalKirim:      form.tanggalKirim,
          catatan:           form.catatan,
          sampleCategory:    "Campaign Support",
          relatedCampaignId: campaign.id,
          deliveryReason:    form.deliveryReason,
          isRepeatCreator:   false,
          picId:             picId ? Number(picId) : null,
        }),
      });
      if(res.ok){
        setResult({ok:true,msg:"✅ Sample berhasil dibuat & WA notifikasi dikirim!"});
        onSent();
      }else{
        const d=await res.json() as {error?:string};
        setResult({ok:false,msg:d.error||"Gagal membuat sample delivery."});
      }
    }catch(err){
      setResult({ok:false,msg:String(err)});
    }finally{setSaving(false);}
  }

  const inputCls="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white";

  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white">
          <div>
            <h3 className="font-bold text-gray-900">📦 Kirim Sample</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-semibold text-violet-700">@{participant.tiktokUsername}</span>
              {participant.namaAffiliate&&<span className="text-gray-400"> · {participant.namaAffiliate}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {result?(
          <div className="p-6 space-y-4">
            <div className={`rounded-xl p-4 text-sm font-medium ${result.ok?"bg-emerald-50 text-emerald-700 border border-emerald-200":"bg-red-50 text-red-700 border border-red-200"}`}>
              {result.msg}
            </div>
            <div className="flex gap-3">
              {result.ok&&(
                <a href="/sample-delivery" target="_blank" rel="noreferrer"
                  className="flex-1 text-center py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                  Lihat Sample Delivery ↗
                </a>
              )}
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                {result.ok?"Tutup":"Coba Lagi"}
              </button>
            </div>
          </div>
        ):(
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Auto-filled info */}
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-violet-500 font-semibold">Campaign:</span>
                <span className="text-violet-800 font-bold">{campaign.nama}</span>
                <span className="px-1.5 py-0.5 bg-violet-200 text-violet-700 rounded-md text-[10px] font-semibold">Campaign Support</span>
              </div>
              {participant.whatsapp&&<p className="text-gray-500">📱 {participant.whatsapp}</p>}
              {participant.visualTake&&<p className="text-gray-500">🎬 {participant.visualTake}</p>}
              {campaign.picSpecialist?.nama&&<p className="text-gray-500">👤 PIC: <span className="font-semibold text-violet-700">{campaign.picSpecialist.nama}</span></p>}
            </div>

            {/* PIC Override */}
            {specialists.length>0&&(
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">PIC / Affiliate Specialist</label>
                <select className={inputCls} value={picId} onChange={e=>setPicId(e.target.value)}>
                  <option value="">— Otomatis dari campaign —</option>
                  {specialists.map(s=>(
                    <option key={s.id} value={String(s.id)}>{s.nama}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Produk Dikirim *</label>
                <input list="produk-suggestions" required className={inputCls} placeholder="Pilih atau ketik produk..."
                  value={form.produk} onChange={e=>setForm(f=>({...f,produk:e.target.value}))}/>
                <datalist id="produk-suggestions">
                  {productSuggestions.map(p=><option key={p} value={p}/>)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Qty</label>
                <input type="number" min={1} className={inputCls} value={form.qtyProduk} onChange={e=>setForm(f=>({...f,qtyProduk:e.target.value}))}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Target Video</label>
                <input type="number" min={0} max={20} className={inputCls} value={form.totalVideoTarget} onChange={e=>setForm(f=>({...f,totalVideoTarget:e.target.value}))}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tanggal Kirim</label>
                <input type="date" className={inputCls} value={form.tanggalKirim} onChange={e=>setForm(f=>({...f,tanggalKirim:e.target.value}))}/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Catatan (opsional)</label>
                <textarea rows={2} className={`${inputCls} resize-none`} placeholder="Catatan pengiriman..."
                  value={form.catatan} onChange={e=>setForm(f=>({...f,catatan:e.target.value}))}/>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving||!form.produk}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving?(<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</>):"📦 Kirim Sample"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Participants Tab ─────────────────────────────────────────────────────────
function ParticipantsTab({c,onRefresh,formInfo,onRefreshForms,specialists}:{
  c:Campaign;onRefresh:()=>void;
  formInfo:CampaignFormInfo|null;onRefreshForms:()=>void;
  specialists:Specialist[];
}){
  const [participants,setParticipants]=useState<Participant[]>([]);
  const [loading,setLoading]  =useState(true);
  const [search,setSearch]    =useState("");
  const [filterStatus,setFSt] =useState("");
  const [filterCat,setFCat]   =useState("");
  const [filterVT,setFVT]     =useState("");
  const [adding,setAdding]    =useState(false);
  const [form,setForm]=useState({tiktokUsername:"",namaAffiliate:"",whatsapp:"",category:"",visualTake:""});
  const [saving,setSaving]    =useState(false);
  const [addError,setAddError]=useState("");
  // Registration state
  const [regMap,setRegMap]    =useState<Map<string,CampaignRegistration>>(new Map());
  const [pendingRegs,setPendingRegs]=useState<CampaignRegistration[]>([]);
  const [syncing,setSyncing]      =useState(false);
  const [syncingSub,setSyncingSub]=useState(false);
  const [showPending,setShowPending]=useState(true);
  const [rejectId,setRejectId]=useState<number|null>(null);
  const [rejectReason,setRejectReason]=useState("");
  const [toast,setToast]      =useState<{msg:string;type:"ok"|"err"}|null>(null);
  // Sample delivery state
  const [sampleModal,setSampleModal]          =useState<Participant|null>(null);
  const [campaignSamples,setCampaignSamples]  =useState<CampaignSampleDelivery[]>([]);

  function showToast(msg:string,type:"ok"|"err"){setToast({msg,type});setTimeout(()=>setToast(null),4000);}

  const categories=parseJSON<string[]>(c.affiliateCategories,[]);

  const fetchP=useCallback(async()=>{
    setLoading(true);
    try{
      const p=new URLSearchParams();
      if(search)p.set("search",search);if(filterStatus)p.set("status",filterStatus);
      if(filterCat)p.set("category",filterCat);if(filterVT)p.set("visualTake",filterVT);
      const res=await fetch(`/api/campaigns/${c.id}/participants?${p}`);
      setParticipants(await res.json() as Participant[]);
    }catch(e){console.error(e);}finally{setLoading(false);}
  },[c.id,search,filterStatus,filterCat,filterVT]);

  const fetchRegs=useCallback(async()=>{
    try{
      const r=await fetch(`/api/campaigns/${c.id}/registrations`);
      const data=await r.json() as CampaignRegistration[];
      if(!Array.isArray(data))return;
      const map=new Map<string,CampaignRegistration>();
      const pending:CampaignRegistration[]=[];
      for(const reg of data){
        map.set(reg.usernameTiktok.toLowerCase(),reg);
        if(reg.status==="pending")pending.push(reg);
      }
      setRegMap(map);setPendingRegs(pending);
    }catch(e){console.error(e);}
  },[c.id]);

  const fetchSamples=useCallback(async()=>{
    try{
      const res=await fetch(`/api/sample-delivery?campaignId=${c.id}&limit=200&subs=0`);
      if(res.ok){
        const d=await res.json() as {items?:CampaignSampleDelivery[]};
        setCampaignSamples(d.items??[]);
      }
    }catch{ /* non-critical */ }
  },[c.id]);

  useEffect(()=>{fetchP();},[fetchP]);
  useEffect(()=>{fetchRegs();},[fetchRegs]);
  useEffect(()=>{fetchSamples();},[fetchSamples]);

  async function handleAdd(e:React.FormEvent){
    e.preventDefault();
    if(!form.tiktokUsername.trim()){setAddError("Username wajib diisi");return;}
    setSaving(true);setAddError("");
    try{
      const res=await fetch(`/api/campaigns/${c.id}/participants`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      if(!res.ok){const d=await res.json() as {error?:string};throw new Error(d.error??"Gagal");}
      setForm({tiktokUsername:"",namaAffiliate:"",whatsapp:"",category:"",visualTake:""});setAdding(false);
      fetchP();onRefresh();
    }catch(e){setAddError(e instanceof Error?e.message:"Gagal");}finally{setSaving(false);}
  }
  async function handleStatus(id:number,status:string){
    await fetch(`/api/campaigns/${c.id}/participants/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    fetchP();onRefresh();
  }
  async function handleRemove(id:number){
    if(!confirm("Hapus peserta ini?"))return;
    await fetch(`/api/campaigns/${c.id}/participants/${id}`,{method:"DELETE"});
    fetchP();onRefresh();
  }
  async function handleSyncReg(){
    setSyncing(true);
    try{
      const r=await fetch(`/api/campaigns/${c.id}/forms`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync_reg"})});
      const d=await r.json() as {ok?:boolean;error?:string;synced?:number;approved?:number;pending?:number};
      if(d.error)showToast(d.error,"err");
      else{showToast(`Sync selesai: ${d.synced??0} diproses, ${d.approved??0} auto-approved, ${d.pending??0} pending`,"ok");fetchP();fetchRegs();onRefresh();onRefreshForms();}
    }catch(e){showToast(String(e),"err");}finally{setSyncing(false);}
  }
  async function handleSyncSub(){
    setSyncingSub(true);
    try{
      const r=await fetch(`/api/campaigns/${c.id}/forms`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync_sub"})});
      const d=await r.json() as {ok?:boolean;error?:string;synced?:number;skipped?:number};
      if(d.error)showToast(d.error,"err");
      else{showToast(`Sync submit selesai: ${d.synced??0} video diupdate, ${d.skipped??0} dilewati`,"ok");fetchP();onRefresh();}
    }catch(e){showToast(String(e),"err");}finally{setSyncingSub(false);}
  }
  async function handleApproveReg(regId:number){
    try{
      const r=await fetch(`/api/campaigns/${c.id}/registrations/${regId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve"})});
      const d=await r.json() as {ok?:boolean;error?:string};
      if(d.error)showToast(d.error,"err");
      else{showToast("Diapprove! WA konfirmasi diantrekan.","ok");fetchP();fetchRegs();onRefresh();}
    }catch(e){showToast(String(e),"err");}
  }
  async function handleRejectReg(regId:number){
    if(!rejectReason.trim()){showToast("Tulis alasan penolakan terlebih dahulu","err");return;}
    try{
      const r=await fetch(`/api/campaigns/${c.id}/registrations/${regId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reject",reason:rejectReason})});
      const d=await r.json() as {ok?:boolean;error?:string};
      if(d.error)showToast(d.error,"err");
      else{showToast("Registrasi ditolak.","ok");setRejectId(null);setRejectReason("");fetchRegs();}
    }catch(e){showToast(String(e),"err");}
  }

  const REG_STYLE:{[k:string]:{label:string;bg:string;text:string}}={
    auto_approved:{label:"Auto ✅",  bg:"bg-teal-50",   text:"text-teal-700"  },
    approved:     {label:"Approved ✅",bg:"bg-emerald-50",text:"text-emerald-700"},
    pending:      {label:"⏳ Pending", bg:"bg-yellow-50", text:"text-yellow-700"},
    rejected:     {label:"Rejected",  bg:"bg-red-50",    text:"text-red-700"   },
  };

  const fieldCls="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";
  return(
    <div className="space-y-4">
      {/* Toast */}
      {toast&&(
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toast.type==="ok"?"bg-emerald-600 text-white":"bg-red-600 text-white"}`}>
          <span>{toast.type==="ok"?"✅":"❌"}</span>{toast.msg}
        </div>
      )}
      {/* Send Sample Modal */}
      {sampleModal&&(
        <SendSampleModal
          participant={sampleModal}
          campaign={c}
          specialists={specialists}
          onClose={()=>setSampleModal(null)}
          onSent={()=>{fetchSamples();showToast("Sample delivery dibuat!","ok");setSampleModal(null);}}
        />
      )}
      {/* Reject Modal */}
      {rejectId!==null&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 mb-1">Tolak Pendaftaran</h3>
            <p className="text-sm text-gray-500 mb-4">Alasan penolakan (dikirim via WA jika nomor tersedia)</p>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} placeholder="Contoh: Kategori tidak sesuai dengan campaign ini" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"/>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={()=>{setRejectId(null);setRejectReason("");}} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Batal</button>
              <button onClick={()=>handleRejectReg(rejectId)} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700">Tolak</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cari username…" className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48"/>
        <select value={filterStatus} onChange={e=>setFSt(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Semua Status</option>
          {["Pending","Approved","Active","Completed","Rejected"].map(s=><option key={s}>{s}</option>)}
        </select>
        {categories.length>0&&(
          <select value={filterCat} onChange={e=>setFCat(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">Semua Kategori</option>
            {categories.map(cat=><option key={cat}>{cat}</option>)}
          </select>
        )}
        <select value={filterVT} onChange={e=>setFVT(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Semua Visual Take</option>
          {VISUAL_TAKE.map(vt=><option key={vt}>{vt}</option>)}
        </select>
        {(search||filterStatus||filterCat||filterVT)&&<button onClick={()=>{setSearch("");setFSt("");setFCat("");setFVT("");}} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Reset</button>}
        <div className="ml-auto flex items-center gap-2">
          {formInfo?.regFormId&&(
            <button onClick={handleSyncReg} disabled={syncing} className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-xs font-semibold hover:bg-teal-100 disabled:opacity-50">
              {syncing?(<><span className="w-3 h-3 border-2 border-teal-300 border-t-teal-700 rounded-full animate-spin"/>Syncing…</>):"🔄 Sync Registrasi"}
            </button>
          )}
          {formInfo?.subFormId&&(
            <button onClick={handleSyncSub} disabled={syncingSub} className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-semibold hover:bg-violet-100 disabled:opacity-50">
              {syncingSub?(<><span className="w-3 h-3 border-2 border-violet-300 border-t-violet-700 rounded-full animate-spin"/>Syncing…</>):"🎬 Sync Submit"}
            </button>
          )}
          <button onClick={()=>setAdding(!adding)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Tambah</button>
        </div>
      </div>

      {/* Add form (unchanged) */}
      {adding&&(
        <form onSubmit={handleAdd} className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          {addError&&<p className="text-xs text-red-600 mb-2">{addError}</p>}
          <div className="flex flex-wrap gap-2">
            <input type="text" value={form.tiktokUsername} onChange={e=>setForm(p=>({...p,tiktokUsername:e.target.value}))} placeholder="@tiktok_username *" className={fieldCls}/>
            <input type="text" value={form.namaAffiliate}  onChange={e=>setForm(p=>({...p,namaAffiliate:e.target.value}))}  placeholder="Nama" className={fieldCls}/>
            <input type="tel"  value={form.whatsapp}       onChange={e=>setForm(p=>({...p,whatsapp:e.target.value}))}       placeholder="WhatsApp" className={fieldCls}/>
            <select value={form.category}   onChange={e=>setForm(p=>({...p,category:e.target.value}))}   className={`${fieldCls} bg-white`}>
              <option value="">Kategori</option>{categories.map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={form.visualTake} onChange={e=>setForm(p=>({...p,visualTake:e.target.value}))} className={`${fieldCls} bg-white`}>
              <option value="">Visual Take</option>{VISUAL_TAKE.map(vt=><option key={vt}>{vt}</option>)}
            </select>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving?"...":"Tambah"}</button>
            <button type="button" onClick={()=>setAdding(false)} className="px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-white">Batal</button>
          </div>
        </form>
      )}

      {/* ── Pending Registrations Panel ───────────────────────────────────── */}
      {pendingRegs.length>0&&(
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <button onClick={()=>setShowPending(!showPending)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-100/50 transition-colors">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <span className="w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{pendingRegs.length}</span>
              ⏳ Antrian Pendaftaran — Perlu Review
            </span>
            <span className="text-amber-500 text-xs">{showPending?"▲ Sembunyikan":"▼ Tampilkan"}</span>
          </button>
          {showPending&&(
            <div className="divide-y divide-amber-100">
              {pendingRegs.map(reg=>(
                <div key={reg.id} className="flex items-start gap-3 px-5 py-3 hover:bg-amber-100/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-gray-800">{reg.nama||"(Nama kosong)"}</span>
                      <span className="text-xs text-gray-500 font-mono">@{reg.usernameTiktok}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      {reg.noWhatsapp&&<span>📱 {reg.noWhatsapp}</span>}
                      {reg.kategoriAffiliate&&<span>🏷️ {reg.kategoriAffiliate}</span>}
                      {reg.visualTake&&<span>🎬 {reg.visualTake}</span>}
                    </div>
                    {reg.alamat&&<p className="text-[11px] text-gray-400 mt-0.5 truncate">📍 {reg.alamat}</p>}
                    <p className="text-[10px] text-gray-300 mt-0.5">{new Date(reg.createdAt).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 pt-0.5">
                    <button onClick={()=>handleApproveReg(reg.id)} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 whitespace-nowrap">✓ Approve</button>
                    <button onClick={()=>{setRejectId(reg.id);setRejectReason("");}} className="px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-50 whitespace-nowrap">✕ Tolak</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>{loading?"Loading…":`${participants.length} peserta`}</span>
        {pendingRegs.length>0&&<span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full">{pendingRegs.length} pending registrasi</span>}
        {c.maxParticipants>0&&<span className="text-gray-400">Target: {fmt(c.maxParticipants)}</span>}
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.approvalMode==="Manual"?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>
          {c.approvalMode==="Manual"?"⚙️ Manual Approval":"⚡ Auto Approval"}
        </span>
      </div>

      {/* Participants table */}
      {loading?(
        <div className="py-12 text-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"/></div>
      ):participants.length===0?(
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">👥</div><p>Belum ada peserta{search?" (coba reset filter)":""}</p></div>
      ):(
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","Affiliator","Kategori","VT","Video","Views","GMV","Status","Registrasi","Join","Last Submit","Sample",""].map(h=>(
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${["GMV","Views"].includes(h)?"text-right":["Video","Sample",""].includes(h)?"text-center":"text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {participants.map((p,i)=>{
                  const reg=regMap.get(p.tiktokUsername.toLowerCase());
                  const rs=reg?REG_STYLE[reg.status]:null;
                  return(
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i+1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">@{p.tiktokUsername}</div>
                        {p.namaAffiliate&&<div className="text-xs text-gray-400">{p.namaAffiliate}</div>}
                        {p.whatsapp&&<div className="text-[10px] text-gray-300">{p.whatsapp}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{p.category||"—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[90px] truncate">{p.visualTake||"—"}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-700">{p.videoCount}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{p.views>0?fmt(p.views):"—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmtRp(p.gmvContributed)}</td>
                      <td className="px-4 py-3">
                        <select value={p.status} onChange={e=>handleStatus(p.id,e.target.value)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                          {["Pending","Approved","Active","Completed","Rejected"].map(s=><option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {rs?(
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${rs.bg} ${rs.text}`}>{rs.label}</span>
                        ):(
                          <span className="text-[10px] text-gray-300">Manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-400 whitespace-nowrap">
                        {new Date(p.joinedAt).toLocaleDateString("id-ID",{day:"numeric",month:"short"})}
                      </td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        {p.lastVideoAt?(
                          <span className="text-violet-600 font-medium">{new Date(p.lastVideoAt).toLocaleDateString("id-ID",{day:"numeric",month:"short"})}</span>
                        ):(
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {(()=>{
                          const sample=campaignSamples.find(s=>s.affiliateUsername.toLowerCase()===p.tiktokUsername.toLowerCase());
                          const STATUS_CLS:{[k:string]:string}={
                            "Selesai":   "bg-emerald-50 text-emerald-700 border-emerald-200",
                            "On Progress":"bg-blue-50 text-blue-700 border-blue-200",
                            "Belum Mulai":"bg-amber-50 text-amber-700 border-amber-200",
                          };
                          if(sample){
                            const cls=STATUS_CLS[sample.statusProgress]??"bg-gray-50 text-gray-500 border-gray-200";
                            return(
                              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${cls}`}>
                                📦 {sample.statusProgress}
                              </span>
                            );
                          }
                          return(
                            <button onClick={()=>setSampleModal(p)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap">
                              📦 Kirim
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={()=>handleRemove(p.id)} className="text-gray-300 hover:text-red-500 transition-colors text-lg">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
function LeaderboardTab({c}:{c:Campaign}){
  const rewardCfg=parseJSON<RewardConfig>(c.rewardConfig,{});
  const active=c.participants.filter(p=>p.status==="Active"||p.status==="Completed");
  const lbRules=rewardCfg.leaderboard??[];
  const primaryRule=lbRules[0]?.ruleType??"Highest GMV";

  const sorted=[...active].sort((a,b)=>{
    if(primaryRule==="Most Videos")    return b.videoCount-a.videoCount;
    if(primaryRule==="Highest Views")  return b.views-a.views;
    if(primaryRule==="Highest GMV")    return b.gmvContributed-a.gmvContributed;
    if(primaryRule==="Most Consistent")return b.videoCount-a.videoCount;
    return b.gmvContributed-a.gmvContributed;
  });
  const medal=(i:number)=>["🥇","🥈","🥉"][i]??`#${i+1}`;

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-gray-500">Ranking berdasarkan: <strong>{primaryRule}</strong></p>
          {lbRules.length>0&&<p className="text-xs text-gray-400 mt-0.5">Konfigurasi dari Reward System → Leaderboard</p>}
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{sorted.length} peserta aktif</span>
      </div>
      {sorted.length===0?(
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">🏆</div><p>Belum ada peserta aktif</p></div>
      ):(
        <div className="space-y-2">
          {sorted.map((p,i)=>{
            const leaderReward=lbRules[i];
            const topVal=primaryRule==="Most Videos"?sorted[0].videoCount:primaryRule==="Highest Views"?sorted[0].views:sorted[0].gmvContributed;
            const myVal =primaryRule==="Most Videos"?p.videoCount:primaryRule==="Highest Views"?p.views:p.gmvContributed;
            const pct=topVal>0?(myVal/topVal)*100:0;
            const mainStat=primaryRule==="Most Videos"?`${p.videoCount} video`:primaryRule==="Highest Views"?`${fmt(p.views)} views`:fmtRp(p.gmvContributed);
            return(
              <div key={p.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${i===0?"bg-amber-50 border-amber-200 shadow-sm":i===1?"bg-gray-50 border-gray-200":i===2?"bg-orange-50/50 border-orange-100":"bg-white border-gray-100"}`}>
                <span className="text-xl w-8 text-center shrink-0">{medal(i)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div><span className="font-bold text-gray-900">@{p.tiktokUsername}</span>{p.namaAffiliate&&<span className="text-xs text-gray-400 ml-2">{p.namaAffiliate}</span>}</div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-700">{mainStat}</div>
                      {leaderReward&&<div className="text-xs text-amber-600 font-semibold">{fmtRp(leaderReward.reward)}</div>}
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/60 rounded-full overflow-hidden border border-gray-100">
                    <div className={`h-full rounded-full transition-all duration-700 ${i===0?"bg-amber-400":i===1?"bg-gray-400":i===2?"bg-orange-400":"bg-indigo-400"}`} style={{width:`${pct}%`}}/>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
                    <div className="flex gap-3"><span>{p.videoCount} video</span><span>{fmt(p.views)} views</span><span>{fmtRp(p.gmvContributed)} GMV</span></div>
                    {leaderReward&&<span className="text-amber-600">{leaderReward.label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab({c}:{c:Campaign}){
  const [data,setData]=useState<AnalyticsData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    fetch(`/api/campaigns/${c.id}/analytics`)
      .then(async r=>{const d=await r.json() as AnalyticsData&{error?:string};if(!r.ok){setError(d.error??"Error");return;}setData(d);})
      .catch(()=>setError("Gagal memuat analytics"))
      .finally(()=>setLoading(false));
  },[c.id]);

  if(loading)return<div className="py-16 text-center"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"/></div>;
  if(error)return<div className="py-12 text-center text-red-500">{error}</div>;
  if(!data)return null;
  const s=data.summary;
  return(
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{label:"Total Peserta",value:s.totalParticipants,icon:"👥",color:"bg-blue-50"},{label:"Active Creator",value:s.activeUploaders,icon:"🎥",color:"bg-violet-50"},{label:"Completion Rate",value:`${s.completionRate}%`,icon:"✅",color:"bg-emerald-50"},{label:"Avg Video/Creator",value:s.avgVideosPerCreator,icon:"📊",color:"bg-amber-50"}].map(k=>(
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${k.color}`}>{k.icon}</div>
            <div><p className="text-xs text-gray-400 font-medium">{k.label}</p><p className="text-xl font-bold text-gray-900">{k.value}</p></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xs text-gray-400 font-medium mb-1">Total Videos</p><p className="text-2xl font-bold text-indigo-700">{fmt(s.totalVideos)}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xs text-gray-400 font-medium mb-1">Total Views</p><p className="text-2xl font-bold text-violet-700">{fmt(s.totalViews)}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xs text-gray-400 font-medium mb-1">Total GMV</p><p className="text-2xl font-bold text-emerald-700">{fmtRp(s.totalGmv)}</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">🎥 Top by Videos</h3>
          {data.topByVideos.length>0?<MiniBar items={data.topByVideos} labelKey="username" valueKey="value" fmtFn={n=>String(n)}/>:<p className="text-xs text-gray-400">Belum ada data</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">👁️ Top by Views</h3>
          {data.topByViews.length>0?<MiniBar items={data.topByViews} labelKey="username" valueKey="value" fmtFn={n=>fmt(n)}/>:<p className="text-xs text-gray-400">Belum ada data</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">💰 Top by GMV</h3>
          {data.topByGmv.length>0?<MiniBar items={data.topByGmv} labelKey="username" valueKey="value" fmtFn={fmtRp}/>:<p className="text-xs text-gray-400">Belum ada data</p>}
        </div>
      </div>
      {data.categoryBreakdown.length>0&&(
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">🏷️ Category Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">{["Kategori","Creators","Videos","GMV"].map(h=><th key={h} className={`py-2 text-xs font-semibold text-gray-500 ${h==="Kategori"?"text-left":"text-right"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.categoryBreakdown.map(cat=>(
                  <tr key={cat.name} className="hover:bg-gray-50/50">
                    <td className="py-2 font-medium text-gray-700">{cat.name}</td>
                    <td className="py-2 text-right text-gray-600">{cat.count}</td>
                    <td className="py-2 text-right text-indigo-600 font-semibold">{cat.videoCount}</td>
                    <td className="py-2 text-right text-emerald-700 font-bold">{fmtRp(cat.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data.vtBreakdown.length>0&&(
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">🎬 Visual Take Performance</h3>
          <MiniBar items={data.vtBreakdown} labelKey="name" valueKey="videoCount" fmtFn={n=>`${n} videos`}/>
        </div>
      )}
      {data.joinTrend.length>1&&(
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">📅 Join Trend</h3>
          <div className="flex items-end gap-1 h-20">
            {(()=>{const max=Math.max(...data.joinTrend.map(d=>d.count),1);return data.joinTrend.slice(-20).map(d=>(
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full bg-indigo-500 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity" style={{height:`${Math.max(4,(d.count/max)*100)}%`}}/>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded hidden group-hover:block whitespace-nowrap">{d.date}: {d.count}</div>
              </div>
            ));})()}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{data.joinTrend[0]?.date}</span>
            <span>{data.joinTrend[data.joinTrend.length-1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Broadcast Tab ────────────────────────────────────────────────────────────

// ─── Automation Tab ────────────────────────────────────────────────────────────
function AutomationTab({c,onRefresh}:{c:Campaign;onRefresh:()=>void}){
  const [config,setConfig]=useState<AutomationConfig>(parseJSON<AutomationConfig>(c.automationConfig,{}));
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  async function handleSave(){
    setSaving(true);setSaved(false);
    try{
      await fetch(`/api/campaigns/${c.id}/automation`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({automationConfig:JSON.stringify(config)})});
      setSaved(true);setTimeout(()=>setSaved(false),3000);onRefresh();
    }catch(e){console.error(e);}finally{setSaving(false);}
  }
  function set(key:keyof AutomationConfig,val:boolean){setConfig(p=>({...p,[key]:val}));}

  const SECTIONS=[
    {
      title:"🤖 Automation Toggles",
      items:[
        {key:"whatsappReminder"   as const,label:"Auto WhatsApp Reminder",    desc:"Kirim reminder otomatis via WhatsApp"},
        {key:"formSubmissionLink" as const,label:"Auto Form Submission Link",  desc:"Sertakan link form di setiap pesan"},
        {key:"stopAfterSubmit"    as const,label:"Auto Stop Reminder After Submit",desc:"Hentikan reminder setelah video disubmit"},
        {key:"autoLeaderboard"    as const,label:"Auto Leaderboard Update",    desc:"Update ranking otomatis setiap sync"},
        {key:"autoProgress"       as const,label:"Auto Progress Tracking",     desc:"Track progress affiliate secara otomatis"},
        {key:"autoCompletion"     as const,label:"Auto Completion Tracking",   desc:"Tandai affiliator sebagai Completed otomatis"},
        {key:"welcomeMessage"     as const,label:"Auto Welcome Message",       desc:"Kirim pesan sambutan saat affiliate join"},
      ],
    },
    {
      title:"⏰ Reminder Flow",
      items:[
        {key:"reminderH3"    as const,label:"H+3 Belum Upload",    desc:"Reminder jika affiliate belum upload 3 hari"},
        {key:"reminderH3End" as const,label:"H-3 Campaign Ending", desc:"Pengingat campaign akan berakhir 3 hari lagi"},
        {key:"reminderH1Final" as const,label:"H-1 Final Reminder",desc:"Reminder akhir sebelum campaign berakhir"},
      ],
    },
  ];

  return(
    <div className="space-y-5 max-w-2xl">
      {saved&&<div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">✓ Automation config tersimpan</div>}
      {SECTIONS.map(section=>(
        <div key={section.title} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">{section.title}</h3>
          {section.items.map(item=>(
            <div key={item.key} className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <Toggle enabled={!!config[item.key]} onToggle={()=>set(item.key,!config[item.key])}/>
            </div>
          ))}
        </div>
      ))}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">⚙️ Approval Mode</h3>
        <div className="flex gap-3">
          {["Auto","Manual"].map(mode=>(
            <button key={mode} type="button"
              onClick={async()=>{await fetch(`/api/campaigns/${c.id}/automation`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({approvalMode:mode})});onRefresh();}}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${c.approvalMode===mode?"bg-indigo-600 text-white border-indigo-600":"text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
              {mode==="Auto"?"⚡ Auto Approval":"👤 Manual Approval"}
              <div className={`text-[11px] mt-0.5 ${c.approvalMode===mode?"text-indigo-200":"text-gray-400"}`}>{mode==="Auto"?"Langsung Active saat join":"Perlu approval specialist"}</div>
            </button>
          ))}
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
        {saving?(<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan…</>):"💾 Simpan Automation Config"}
      </button>
    </div>
  );
}

// ─── Reward Editor ────────────────────────────────────────────────────────────
function RewardEditor({value,onChange}:{value:RewardConfig;onChange:(v:RewardConfig)=>void}){
  const upd=(patch:Partial<RewardConfig>)=>onChange({...value,...patch});
  const fixed      =value.fixed      ??{enabled:false,rewardPerVideo:0,rewardPerLive:0,completionBonus:0};
  const leaderboard=value.leaderboard??[];
  const consistency=value.consistency??{enabled:false,minUpload:5,rewardAmount:0};
  const milestones =value.milestones ??[];
  const addRule=()=>{const rank=leaderboard.length+1;upd({leaderboard:[...leaderboard,{id:uid(),rank,ruleType:"Most Videos",label:`Juara ${rank}`,reward:0}]});};
  const updateRule=(id:string,patch:Partial<LeaderboardRule>)=>upd({leaderboard:leaderboard.map(r=>r.id===id?{...r,...patch}:r)});
  const removeRule=(id:string)=>upd({leaderboard:leaderboard.filter(r=>r.id!==id).map((r,i)=>({...r,rank:i+1}))});
  const addMilestone=()=>upd({milestones:[...milestones,{id:uid(),type:"gmv",target:0,reward:0}]});
  const updateMilestone=(id:string,patch:Partial<Milestone>)=>upd({milestones:milestones.map(m=>m.id===id?{...m,...patch}:m)});
  const removeMilestone=(id:string)=>upd({milestones:milestones.filter(m=>m.id!==id)});
  const medal=(i:number)=>["🥇","🥈","🥉"][i]??`#${i+1}`;
  const ic="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white";
  return(
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-800">Fixed Reward</p><p className="text-xs text-gray-400">Per video / per live / completion</p></div><Toggle enabled={fixed.enabled} onToggle={()=>upd({fixed:{...fixed,enabled:!fixed.enabled}})}/></div>
        {fixed.enabled&&(<div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">{([["Per Video (Rp)","rewardPerVideo"],["Per Live (Rp)","rewardPerLive"],["Completion (Rp)","completionBonus"]] as const).map(([lbl,key])=>(<div key={key}><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">{lbl}</label><input type="number" min="0" value={fixed[key]||""} onChange={e=>upd({fixed:{...fixed,[key]:Number(e.target.value)||0}})} placeholder="0" className={ic}/></div>))}</div>)}
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">A. Ranking (Leaderboard)</p>
        {leaderboard.map((rule,i)=>(
          <div key={rule.id} className="flex items-center gap-2 bg-white rounded-xl p-2.5 border border-gray-100">
            <span className="text-base w-6 text-center shrink-0">{medal(i)}</span>
            <input type="text" value={rule.label} onChange={e=>updateRule(rule.id,{label:e.target.value})} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            <select value={rule.ruleType} onChange={e=>updateRule(rule.id,{ruleType:e.target.value})} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">{RULE_TYPES.map(t=><option key={t}>{t}</option>)}</select>
            <input type="number" min="0" value={rule.reward||""} onChange={e=>updateRule(rule.id,{reward:Number(e.target.value)||0})} placeholder="Rp" className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            <button type="button" onClick={()=>removeRule(rule.id)} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={addRule} className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-600">+ Add Rule</button>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-800">B. Consistency Reward</p><p className="text-xs text-gray-400">Bonus upload konsisten</p></div><Toggle enabled={consistency.enabled} onToggle={()=>upd({consistency:{...consistency,enabled:!consistency.enabled}})}/></div>
        {consistency.enabled&&(<div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200"><div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Min Upload</label><input type="number" min="1" value={consistency.minUpload||""} onChange={e=>upd({consistency:{...consistency,minUpload:Number(e.target.value)||0}})} className={ic}/></div><div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Reward (Rp)</label><input type="number" min="0" value={consistency.rewardAmount||""} onChange={e=>upd({consistency:{...consistency,rewardAmount:Number(e.target.value)||0}})} className={ic}/></div></div>)}
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">C. Milestone Reward</p>
        {milestones.map(m=>(
          <div key={m.id} className="flex items-center gap-2 bg-white rounded-xl p-2.5 border border-gray-100">
            <select value={m.type} onChange={e=>updateMilestone(m.id,{type:e.target.value as Milestone["type"]})} className="w-24 shrink-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"><option value="gmv">GMV</option><option value="views">Views</option><option value="upload">Upload</option></select>
            <input type="number" min="0" value={m.target||""} onChange={e=>updateMilestone(m.id,{target:Number(e.target.value)||0})} placeholder="Target" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            <input type="number" min="0" value={m.reward||""} onChange={e=>updateMilestone(m.id,{reward:Number(e.target.value)||0})} placeholder="Rp" className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
            <button type="button" onClick={()=>removeMilestone(m.id)} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={addMilestone} className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-600">+ Add Milestone</button>
      </div>
    </div>
  );
}

// ─── Product Multi Select ─────────────────────────────────────────────────────
function ProductMultiSelect({products,value,onChange}:{products:Product[];value:number[];onChange:(ids:number[])=>void}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);}
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  const filtered=products.filter(p=>p.nama.toLowerCase().includes(query.toLowerCase()));
  const selected=products.filter(p=>value.includes(p.id));
  const SHOW=3;
  function toggle(id:number){onChange(value.includes(id)?value.filter(v=>v!==id):[...value,id]);}
  return(
    <div ref={ref} className="relative">
      <div onClick={()=>setOpen(!open)} className="min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-teal-400 transition-colors">
        {selected.length===0?(<span className="text-gray-400 text-sm">Pilih produk...</span>):(
          <>{selected.slice(0,SHOW).map(p=>(<span key={p.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">{p.nama}<button type="button" onClick={e=>{e.stopPropagation();toggle(p.id);}} className="hover:opacity-70 leading-none ml-0.5">×</button></span>))}
          {selected.length>SHOW&&<span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">+{selected.length-SHOW}</span>}</>
        )}
        <span className="ml-auto text-gray-300 text-xs shrink-0">▾</span>
      </div>
      {open&&(
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus type="text" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari produk..." className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"/>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length===0?(<p className="px-4 py-3 text-sm text-gray-400">Produk tidak ditemukan</p>):filtered.map(p=>{
              const checked=value.includes(p.id);
              return(<button key={p.id} type="button" onClick={()=>toggle(p.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${checked?"bg-teal-50 text-teal-700":"text-gray-700 hover:bg-gray-50"}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${checked?"bg-teal-600 border-teal-600 text-white":"border-gray-300"}`}>{checked?"✓":""}</span>
                <span>🧴 {p.nama}</span>
              </button>);
            })}
          </div>
          {value.length>0&&<div className="px-4 py-2 border-t border-gray-100"><button type="button" onClick={()=>onChange([])} className="text-xs text-red-500 hover:underline">Hapus semua</button></div>}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({c,onUpdated,specialists,categories}:{c:Campaign;onUpdated:()=>void;specialists:Specialist[];categories:Category[];}){
  const router=useRouter();
  const [form,setForm]=useState({
    nama:               c.nama,slug:c.slug,
    objectives:         parseJSON<string[]>(c.objectives,[]),
    affiliateCategories:parseJSON<string[]>(c.affiliateCategories,[]),
    visualTake:         parseJSON<string[]>(c.visualTake,[]),
    productFocusIds:    (c.productFocus??[]).map(pf=>pf.product.id),
    deskripsi:          c.deskripsi,status:c.status,visibility:c.visibility,
    startDate:          c.startDate?c.startDate.split("T")[0]:"",
    endDate:            c.endDate?c.endDate.split("T")[0]:"",
    rewardConfig:       parseJSON<RewardConfig>(c.rewardConfig,{}),
    rewardDeskripsi:    c.rewardDeskripsi,
    maxParticipants:    String(c.maxParticipants),
    picSpecialistId:    c.picSpecialistId as number|null,
    catatan:            c.catatan,isTemplate:c.isTemplate,
    joinSlug:           c.joinSlug,
  });
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState("");
  const [products,setProducts]=useState<Product[]>([]);

  useEffect(()=>{
    fetch("/api/products")
      .then(async r=>{const d=await r.json() as Product[];setProducts(Array.isArray(d)?d:[]);})
      .catch(()=>{});
  },[]);
  // Banner upload
  const [bannerFile,setBannerFile]=useState<File|null>(null);
  const [bannerPreview,setBannerPreview]=useState(c.bannerPath||"");
  const [uploadingBanner,setUploadingBanner]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof form>(key:K,val:(typeof form)[K]){setForm(p=>({...p,[key]:val}));}
  const categoryNames=categories.map(cat=>cat.nama);
  const fc="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";

  function handleFileChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    setBannerFile(file);setBannerPreview(URL.createObjectURL(file));
  }
  async function handleBannerUpload(){
    if(!bannerFile)return;
    setUploadingBanner(true);
    try{
      const fd=new FormData();fd.append("banner",bannerFile);
      const res=await fetch(`/api/campaigns/${c.id}/banner`,{method:"POST",body:fd});
      const d=await res.json() as {bannerPath?:string;error?:string};
      if(!res.ok)throw new Error(d.error??"Upload gagal");
      setBannerFile(null);onUpdated();
    }catch(e){setError(e instanceof Error?e.message:"Upload gagal");}finally{setUploadingBanner(false);}
  }
  async function handleBannerDelete(){
    if(!confirm("Hapus banner?"))return;
    await fetch(`/api/campaigns/${c.id}/banner`,{method:"DELETE"});
    setBannerPreview("");onUpdated();
  }
  async function handleSave(e:React.FormEvent){
    e.preventDefault();setSaving(true);setSaved(false);setError("");
    try{
      const res=await fetch(`/api/campaigns/${c.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...form,objectives:JSON.stringify(form.objectives),affiliateCategories:JSON.stringify(form.affiliateCategories),visualTake:JSON.stringify(form.visualTake),productFocusIds:form.productFocusIds,rewardConfig:JSON.stringify(form.rewardConfig),maxParticipants:Number(form.maxParticipants)||0,startDate:form.startDate||null,endDate:form.endDate||null}),
      });
      if(!res.ok){const d=await res.json() as {error?:string};throw new Error(d.error??"Gagal");}
      setSaved(true);setTimeout(()=>setSaved(false),3000);onUpdated();
    }catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan");}finally{setSaving(false);}
  }
  async function handleDelete(){
    if(!confirm(`Hapus campaign "${c.nama}"?`))return;
    await fetch(`/api/campaigns/${c.id}`,{method:"DELETE"});router.push("/program/campaigns");
  }

  return(
    <form onSubmit={handleSave} className="max-w-2xl space-y-4">
      {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {saved&&<div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">✓ Perubahan berhasil disimpan</div>}

      {/* Banner */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">🖼️ Banner Campaign</h3>
        <div className={`relative h-36 rounded-xl overflow-hidden ${bannerPreview?"":"bg-gradient-to-r from-indigo-600 to-violet-600"}`}>
          {bannerPreview?(<img src={bannerPreview} alt="" className="w-full h-full object-cover"/>):(<div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">No Banner</div>)}
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden"/>
          <button type="button" onClick={()=>fileRef.current?.click()} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">📁 Pilih File</button>
          {bannerFile&&<button type="button" onClick={handleBannerUpload} disabled={uploadingBanner} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">{uploadingBanner?"Uploading…":"Upload Banner"}</button>}
          {bannerPreview&&!bannerFile&&<button type="button" onClick={handleBannerDelete} className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50">Hapus</button>}
        </div>
        {bannerFile&&<p className="text-xs text-gray-400">{bannerFile.name} ({(bannerFile.size/1024).toFixed(0)} KB)</p>}
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Informasi Campaign</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Nama</label><input type="text" value={form.nama} onChange={e=>set("nama",e.target.value)} className={fc}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Slug</label><input type="text" value={form.slug} onChange={e=>set("slug",e.target.value)} className={`${fc} font-mono`}/></div>
        </div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Deskripsi</label><textarea rows={3} value={form.deskripsi} onChange={e=>set("deskripsi",e.target.value)} className={`${fc} resize-none`}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label><select value={form.status} onChange={e=>set("status",e.target.value)} className={`${fc} bg-white`}>{["Draft","Ready","Published","Ongoing","Ended"].map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Visibility</label><select value={form.visibility} onChange={e=>set("visibility",e.target.value)} className={`${fc} bg-white`}>{["Public","Invite Only","Specialist Only"].map(v=><option key={v}>{v}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">PIC Specialist</label><PicDropdown specialists={specialists} value={form.picSpecialistId} onChange={id=>set("picSpecialistId",id)}/></div>
          <div className="flex items-end pb-0.5"><label className="flex items-center gap-3 cursor-pointer"><Toggle enabled={form.isTemplate} onToggle={()=>set("isTemplate",!form.isTemplate)}/><span className="text-sm text-gray-700">Simpan sebagai Template</span></label></div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Public Join Slug</label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 border-r-0 rounded-r-none">/join/</span>
            <input type="text" value={form.joinSlug} onChange={e=>set("joinSlug",slugify(e.target.value))} placeholder="nama-campaign" className={`${fc} rounded-l-none flex-1`}/>
            <button type="button" onClick={()=>set("joinSlug",slugify(c.nama)+"-"+Date.now().toString(36))} className="px-3 py-2.5 rounded-xl text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 whitespace-nowrap">Auto</button>
          </div>
          {form.joinSlug&&<p className="text-xs text-indigo-500 mt-1">→ /join/{form.joinSlug}</p>}
        </div>
      </div>

      {/* Objectives */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Objectives &amp; Target</h3>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Campaign Objectives</label><MultiSelect options={CAMPAIGN_OBJECTIVES} value={form.objectives} onChange={v=>set("objectives",v)} placeholder="Pilih objectives" metaFn={opt=>OBJECTIVE_META[opt]??null}/></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Affiliate Categories</label><MultiSelect options={categoryNames} value={form.affiliateCategories} onChange={v=>set("affiliateCategories",v)} placeholder="Pilih kategori affiliator"/></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Visual Take</label><MultiSelect options={VISUAL_TAKE} value={form.visualTake} onChange={v=>set("visualTake",v)} placeholder="Pilih jenis visual take"/></div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product Focus <span className="text-gray-400 font-normal">(dari Data Master)</span></label>
          <ProductMultiSelect products={products} value={form.productFocusIds} onChange={ids=>set("productFocusIds",ids)}/>
          <p className="text-[10px] text-gray-400 mt-1">Produk fokus campaign — analytics GMV, leaderboard, dan filter affiliate</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Mulai</label><input type="date" value={form.startDate} onChange={e=>set("startDate",e.target.value)} className={fc}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Berakhir</label><input type="date" value={form.endDate} onChange={e=>set("endDate",e.target.value)} className={fc}/></div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Peserta</label>
          <input type="number" min="1" value={form.maxParticipants} onChange={e=>set("maxParticipants",e.target.value)} placeholder="Target jumlah peserta campaign" className={fc}/>
          <p className="text-[10px] text-gray-400 mt-1">Peserta tetap dapat bergabung walaupun target sudah tercapai</p>
        </div>
      </div>

      {/* Reward */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Reward System</h3>
        <RewardEditor value={form.rewardConfig} onChange={v=>set("rewardConfig",v)}/>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Catatan Reward</label><input type="text" value={form.rewardDeskripsi} onChange={e=>set("rewardDeskripsi",e.target.value)} placeholder="e.g. Reward dicairkan H+7 setelah campaign selesai" className={fc}/></div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Catatan Internal</h3>
        <textarea rows={3} value={form.catatan} onChange={e=>set("catatan",e.target.value)} placeholder="Catatan internal…" className={`${fc} resize-none`}/>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={handleDelete} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50">Hapus Campaign</button>
        <button type="submit" disabled={saving} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
          {saving?(<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan…</>):"Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function CampaignDetailPage(){
  const params=useParams();
  const id=params?.id as string;
  const [campaign,setCampaign]         =useState<Campaign|null>(null);
  const [specialists,setSpecialists]   =useState<Specialist[]>([]);
  const [categories,setCategories]     =useState<Category[]>([]);
  const [loading,setLoading]           =useState(true);
  const [tab,setTab]                   =useState<TabId>("overview");
  const [formInfo,setFormInfo]         =useState<CampaignFormInfo|null>(null);
  const [generatingForms,setGeneratingForms]=useState(false);
  const [bannerToast,setBannerToast]   =useState<string|null>(null);

  const fetchCampaign=useCallback(async()=>{
    try{
      const res=await fetch(`/api/campaigns/${id}`);
      if(!res.ok){setCampaign(null);return;}
      const data=await res.json() as Campaign;
      setCampaign(data);
    }catch(err){console.error("[fetchCampaign]",err);setCampaign(null);}
    finally{setLoading(false);}
  },[id]);

  const fetchFormInfo=useCallback(async()=>{
    try{
      const r=await fetch(`/api/campaigns/${id}/forms`);
      const d=await r.json() as {campaignForm:CampaignFormInfo|null};
      setFormInfo(d.campaignForm??null);
    }catch(e){console.error("[fetchFormInfo]",e);}
  },[id]);

  async function handleGenerateForms(action:string){
    setGeneratingForms(true);
    try{
      const r=await fetch(`/api/campaigns/${id}/forms`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
      const d=await r.json() as {ok?:boolean;error?:string};
      if(d.error){setBannerToast(`❌ ${d.error}`);setTimeout(()=>setBannerToast(null),4000);}
      else{setBannerToast("✅ Form berhasil dibuat!");setTimeout(()=>setBannerToast(null),3000);await fetchFormInfo();}
    }catch(e){setBannerToast(`❌ ${String(e)}`);setTimeout(()=>setBannerToast(null),4000);}
    finally{setGeneratingForms(false);}
  }

  function copyLink(url:string){
    navigator.clipboard.writeText(url).then(()=>{setBannerToast("✅ Link disalin!");setTimeout(()=>setBannerToast(null),2000);});
  }

  useEffect(()=>{
    fetchCampaign();
    fetchFormInfo();
    fetch("/api/master")
      .then(async r=>{const d=await r.json() as {specialists?:Specialist[];categories?:Category[]};setSpecialists(d.specialists??[]);setCategories(d.categories??[]);})
      .catch(err=>console.error("[master fetch]",err));
  },[fetchCampaign,fetchFormInfo]);

  if(loading){return(<div className="p-6 max-w-7xl mx-auto animate-pulse"><div className="h-8 bg-gray-100 rounded w-64 mb-4"/><div className="h-40 bg-gray-100 rounded-2xl mb-6"/><div className="h-48 bg-gray-100 rounded-2xl"/></div>);}
  if(!campaign){return(<div className="p-6 text-center py-24"><div className="text-4xl mb-3">🔍</div><h2 className="font-bold text-gray-700 mb-1">Campaign tidak ditemukan</h2><Link href="/program/campaigns" className="text-indigo-600 text-sm hover:underline">← Kembali ke Campaign Center</Link></div>);}

  const vis=VISIBILITY_META[campaign.visibility]??VISIBILITY_META["Public"];
  return(
    <div className="p-6 max-w-7xl mx-auto">
      {/* Banner toast */}
      {bannerToast&&(
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-gray-900 text-white">{bannerToast}</div>
      )}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <Link href="/program/campaigns" className="hover:text-indigo-600">Campaign Center</Link>
        <span>/</span>
        <span className="text-indigo-600 font-medium truncate max-w-xs">{campaign.nama}</span>
      </div>
      {/* Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 mb-6" style={{minHeight:"9rem"}}>
        {campaign.bannerPath&&(<img src={campaign.bannerPath} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"/>)}
        <div className="absolute inset-0 flex items-end p-5">
          <div className="flex items-end justify-between w-full gap-3 flex-wrap">
            {/* Left: title */}
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <StatusBadge status={campaign.status}/>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 text-white text-[10px] font-medium rounded-full">{vis.icon} {campaign.visibility}</span>
                {campaign.joinSlug&&<a href={`/join/${campaign.joinSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/30 text-white text-[10px] font-medium rounded-full hover:bg-emerald-500/50">🔗 Join Link</a>}
              </div>
              <h1 className="text-xl font-bold text-white leading-tight">{campaign.nama}</h1>
              {campaign.isTemplate&&<span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-amber-400/30 text-amber-200 text-[10px] font-semibold rounded-full">📋 Template</span>}
            </div>
            {/* Right: action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Broadcast (unchanged) */}
              <Link
                href={`/broadcast?campaign_id=${campaign.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap"
              >
                📢 Broadcast Recruitment
              </Link>
              {/* Registration Form */}
              {formInfo?.regFormLink?(
                <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg overflow-hidden border border-white/10">
                  <a href={formInfo.regFormLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 text-white text-xs font-semibold hover:bg-white/20 transition-colors whitespace-nowrap">
                    📝 Form Daftar ↗
                  </a>
                  <button onClick={()=>copyLink(formInfo.regFormLink)} title="Salin link" className="px-2 py-1.5 text-white/70 hover:text-white hover:bg-white/20 text-xs transition-colors border-l border-white/20">📋</button>
                </div>
              ):(
                <button onClick={()=>handleGenerateForms("generate_reg")} disabled={generatingForms} className="flex items-center gap-1 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap disabled:opacity-50">
                  {generatingForms?"⏳ Membuat…":"📝 Buat Form Daftar"}
                </button>
              )}
              {/* Submission Form */}
              {formInfo?.subFormLink?(
                <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg overflow-hidden border border-white/10">
                  <a href={formInfo.subFormLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 text-white text-xs font-semibold hover:bg-white/20 transition-colors whitespace-nowrap">
                    🎥 Form Submit ↗
                  </a>
                  <button onClick={()=>copyLink(formInfo.subFormLink)} title="Salin link" className="px-2 py-1.5 text-white/70 hover:text-white hover:bg-white/20 text-xs transition-colors border-l border-white/20">📋</button>
                </div>
              ):(
                <button onClick={()=>handleGenerateForms("generate_sub")} disabled={generatingForms} className="flex items-center gap-1 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap disabled:opacity-50">
                  {generatingForms?"⏳ Membuat…":"🎥 Buat Form Submit"}
                </button>
              )}
              {/* PIC */}
              <div className="text-right pl-1 border-l border-white/20">
                <p className="text-white/60 text-xs">PIC</p>
                <p className="text-white font-semibold text-sm">{campaign.picSpecialist?.nama??"—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 border-b border-gray-100 mb-6 overflow-x-auto">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-px ${tab===t.id?"border-indigo-600 text-indigo-700":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
            <span className="text-sm">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {tab==="overview"    &&<OverviewTab      c={campaign}/>}
      {tab==="participants" &&<ParticipantsTab c={campaign} onRefresh={fetchCampaign} formInfo={formInfo} onRefreshForms={fetchFormInfo} specialists={specialists}/>}
      {tab==="leaderboard"  &&<LeaderboardTab c={campaign}/>}
      {tab==="analytics"    &&<AnalyticsTab   c={campaign}/>}
      {tab==="automation"   &&<AutomationTab  c={campaign} onRefresh={fetchCampaign}/>}
      {tab==="settings"     &&<SettingsTab    c={campaign} onUpdated={fetchCampaign} specialists={specialists} categories={categories}/>}
    </div>
  );
}

export default function CampaignDetailPageGate(){
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_CAMPAIGN}>
      <CampaignDetailPage />
    </PermissionGate>
  );
}
