"use client";

import { useState, useEffect, useCallback } from "react";

interface RewardDist {
  id: number; campaignId: number; tiktokUsername: string; namaAffiliate: string;
  rewardType: string; rewardLabel: string; amount: number;
  status: string; paidAt: string | null; notes: string; createdAt: string;
  campaign?: { id: number; nama: string };
}
interface CampaignOption { id: number; nama: string; }

const STATUS_META: Record<string, { bg: string; text: string; dot: string }> = {
  Pending:  { bg:"bg-yellow-50", text:"text-yellow-700", dot:"bg-yellow-400"  },
  Approved: { bg:"bg-blue-50",   text:"text-blue-700",   dot:"bg-blue-400"    },
  Paid:     { bg:"bg-emerald-50",text:"text-emerald-700",dot:"bg-emerald-400" },
  Rejected: { bg:"bg-red-50",    text:"text-red-700",    dot:"bg-red-400"     },
};
const TYPE_META: Record<string, { icon: string; bg: string; text: string }> = {
  leaderboard:{ icon:"🏆", bg:"bg-amber-100",   text:"text-amber-800"   },
  consistency:{ icon:"🔥", bg:"bg-emerald-100", text:"text-emerald-800" },
  milestone:  { icon:"🎯", bg:"bg-violet-100",  text:"text-violet-800"  },
  fixed:      { icon:"🎥", bg:"bg-indigo-100",  text:"text-indigo-800"  },
};
function fmt(n: number) { return new Intl.NumberFormat("id-ID").format(Math.round(n)); }
function fmtRp(n: number) {
  if (n >= 1_000_000) return `Rp${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp${(n/1_000).toFixed(0)}rb`;
  return `Rp${fmt(n)}`;
}
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{status}
    </span>
  );
}

function AddRewardModal({ campaigns, onClose, onCreated }: { campaigns: CampaignOption[]; onClose: () => void; onCreated: () => void; }) {
  const [form, setForm] = useState({ campaignId:"", tiktokUsername:"", namaAffiliate:"", rewardType:"leaderboard", rewardLabel:"", amount:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.campaignId || !form.tiktokUsername.trim() || !form.amount) { setErr("Campaign, username, dan amount wajib diisi"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/rewards", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...form, campaignId:Number(form.campaignId), amount:Number(form.amount)}) });
      if (!res.ok) { const d = await res.json() as {error?:string}; throw new Error(d.error); }
      onCreated(); onClose();
    } catch(e) { setErr(e instanceof Error ? e.message : "Gagal"); } finally { setSaving(false); }
  }
  const f = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">+ Tambah Reward</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Campaign *</label>
            <select value={form.campaignId} onChange={e=>setForm(p=>({...p,campaignId:e.target.value}))} className={`${f} bg-white`}>
              <option value="">Pilih campaign…</option>
              {campaigns.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">TikTok Username *</label><input value={form.tiktokUsername} onChange={e=>setForm(p=>({...p,tiktokUsername:e.target.value}))} placeholder="@username" className={f} /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Nama</label><input value={form.namaAffiliate} onChange={e=>setForm(p=>({...p,namaAffiliate:e.target.value}))} placeholder="Nama" className={f} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tipe *</label>
              <select value={form.rewardType} onChange={e=>setForm(p=>({...p,rewardType:e.target.value}))} className={`${f} bg-white`}>
                <option value="leaderboard">Leaderboard</option><option value="consistency">Consistency</option>
                <option value="milestone">Milestone</option><option value="fixed">Fixed</option>
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Label</label><input value={form.rewardLabel} onChange={e=>setForm(p=>({...p,rewardLabel:e.target.value}))} placeholder="e.g. Juara 1" className={f} /></div>
          </div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount (Rp) *</label><input type="number" min="0" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="0" className={f} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label><input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Catatan opsional" className={f} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">{saving?"Menyimpan…":"Simpan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RewardsPage() {
  const [rewards, setRewards]     = useState<RewardDist[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [filterCampaign, setFC]   = useState("");
  const [filterStatus, setFS]     = useState("");
  const [filterUser, setFU]       = useState("");

  const fetchRewards = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filterCampaign) p.set("campaignId", filterCampaign);
      if (filterStatus)   p.set("status", filterStatus);
      if (filterUser)     p.set("username", filterUser);
      const res  = await fetch(`/api/rewards?${p}`);
      const data = await res.json() as RewardDist[];
      setRewards(Array.isArray(data) ? data : []);
    } catch(err){console.error(err);} finally{setLoading(false);}
  }, [filterCampaign, filterStatus, filterUser]);

  useEffect(() => {
    fetchRewards();
    fetch("/api/campaigns").then(r=>r.json()).then((d:CampaignOption[])=>setCampaigns(Array.isArray(d)?d:[])).catch(()=>{});
  }, [fetchRewards]);

  async function handleStatusChange(id: number, status: string) {
    await fetch(`/api/rewards/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status}) });
    fetchRewards();
  }
  async function handleDelete(id: number) {
    if (!confirm("Hapus reward ini?")) return;
    await fetch(`/api/rewards/${id}`, {method:"DELETE"}); fetchRewards();
  }

  const totalPending  = rewards.filter(r=>r.status==="Pending").reduce((s,r)=>s+r.amount,0);
  const totalApproved = rewards.filter(r=>r.status==="Approved").reduce((s,r)=>s+r.amount,0);
  const totalPaid     = rewards.filter(r=>r.status==="Paid").reduce((s,r)=>s+r.amount,0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {showAdd && <AddRewardModal campaigns={campaigns} onClose={()=>setShowAdd(false)} onCreated={fetchRewards} />}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1"><span>Program Center</span><span>/</span><span className="text-indigo-600 font-medium">Rewards</span></div>
          <h1 className="text-2xl font-bold text-gray-900">Reward Distribution 🎁</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola distribusi reward dan track status pembayaran</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Tambah Reward</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[{label:"Total Entries",value:String(rewards.length),icon:"📋",color:"bg-gray-50"},{label:"Pending",value:fmtRp(totalPending),icon:"⏳",color:"bg-yellow-50"},{label:"Approved",value:fmtRp(totalApproved),icon:"✅",color:"bg-blue-50"},{label:"Paid Out",value:fmtRp(totalPaid),icon:"💸",color:"bg-emerald-50"}].map(s=>(
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${s.color}`}>{s.icon}</div>
            <div><p className="text-xs text-gray-400 font-medium">{s.label}</p><p className="text-xl font-bold text-gray-900">{s.value}</p></div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterCampaign} onChange={e=>setFC(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Semua Campaign</option>
          {campaigns.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFS(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Semua Status</option>
          {["Pending","Approved","Paid","Rejected"].map(s=><option key={s}>{s}</option>)}
        </select>
        <input value={filterUser} onChange={e=>setFU(e.target.value)} placeholder="Cari username…" className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[180px]" />
        {(filterCampaign||filterStatus||filterUser) && <button onClick={()=>{setFC("");setFS("");setFU("");}} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Reset</button>}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>
        ) : rewards.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4">🎁</div>
            <h3 className="font-semibold text-gray-700 mb-1">Belum ada reward</h3>
            <p className="text-sm text-gray-400 mb-5">Tambahkan reward dari campaign yang sudah selesai</p>
            <button onClick={()=>setShowAdd(true)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">+ Tambah Reward</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#","Affiliator","Campaign","Tipe","Amount","Status","Aksi"].map(h=>(
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rewards.map((r,i)=>{
                  const tm = TYPE_META[r.rewardType] ?? {icon:"💰",bg:"bg-gray-100",text:"text-gray-700"};
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i+1}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-gray-800">@{r.tiktokUsername}</div>{r.namaAffiliate&&<div className="text-xs text-gray-400">{r.namaAffiliate}</div>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{r.campaign?.nama??`Campaign #${r.campaignId}`}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${tm.bg} ${tm.text}`}>{tm.icon} {r.rewardLabel||r.rewardType}</span></td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRp(r.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select value={r.status} onChange={e=>handleStatusChange(r.id,e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            {["Pending","Approved","Paid","Rejected"].map(s=><option key={s}>{s}</option>)}
                          </select>
                          <button onClick={()=>handleDelete(r.id)} className="text-gray-300 hover:text-red-500 text-lg">×</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
