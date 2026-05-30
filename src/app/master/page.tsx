"use client";

import { useEffect, useRef, useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

interface Product {
  id: number; no: number; nama: string; hpp: number;
  skuId: string; productLink: string; productImage: string;
  category: string; platform: string; activeStatus: string;
}
interface Specialist { id: number; no: number; nama: string }
interface Category   { id: number; no: number; nama: string; deskripsi: string }
interface MasterData { products: Product[]; specialists: Specialist[]; categories: Category[] }
interface ReminderTemplate {
  id: number; nama: string; tipeReminder: string; isiPesan: string; aktif: boolean;
}

type ToastItem = { id: number; message: string; kind: "success" | "error" };
let _tid = 0;

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border transition-all ${
            t.kind === "success"
              ? "bg-white border-green-200 text-green-800"
              : "bg-white border-red-200 text-red-700"
          }`}
        >
          {t.kind === "success"
            ? <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          }
          {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-auto text-gray-300 hover:text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirm({
  nama, onConfirm, onCancel, loading, title = "Hapus Data?", subtitle = "Tindakan ini tidak dapat dibatalkan",
}: { nama: string; onConfirm: () => void; onCancel: () => void; loading: boolean; title?: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Yakin ingin menghapus <span className="font-semibold text-gray-900">&ldquo;{nama}&rdquo;</span>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            )}
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function MasterPage() {
  const [data, setData]           = useState<MasterData>({ products: [], specialists: [], categories: [] });
  const [tab,  setTab]            = useState<"products" | "specialists" | "categories" | "templates">("products");
  const [templates, setTemplates]     = useState<ReminderTemplate[]>([]);
  const [tmplLoading, setTmplLoading] = useState(false);
  const [tmplSaving, setTmplSaving]   = useState(false);
  // Unified template form — "add" or "edit" mode
  const [tmplMode, setTmplMode]       = useState<"add" | "edit">("add");
  const [tmplEditId, setTmplEditId]   = useState<number | null>(null);
  const [tmplForm, setTmplForm]       = useState({ nama: "", tipeReminder: "Reminder Pengiriman", isiPesan: "", aktif: true });
  // Delete confirm for templates
  const [delTmpl, setDelTmpl]         = useState<{ id: number; nama: string } | null>(null);
  const [delTmplLoading, setDelTmplLoading] = useState(false);
  const tmplFormRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm]           = useState<Record<string, string>>({});
  const [adding,  setAdding]      = useState(false);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit state
  const [editId,     setEditId]     = useState<number | null>(null);
  const [editForm,   setEditForm]   = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [delConfirm, setDelConfirm] = useState<{ id: number; type: string; nama: string } | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchData(); }, []);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toasts]);

  // Cancel edit when tab changes
  useEffect(() => {
    setEditId(null); setEditForm({}); setForm({});
    resetTmplForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Load templates when switching to template tab
  useEffect(() => {
    if (tab !== "templates") return;
    fetchTemplates();
  }, [tab]);

  async function fetchTemplates() {
    setTmplLoading(true);
    try {
      const res = await fetch("/api/reminder-template");
      if (res.ok) setTemplates(await res.json());
      else toast("Gagal memuat template", "error");
    } catch {
      toast("Gagal memuat template", "error");
    } finally {
      setTmplLoading(false);
    }
  }

  async function handleToggleTemplate(t: ReminderTemplate) {
    await fetch("/api/reminder-template", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, aktif: !t.aktif }),
    });
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, aktif: !x.aktif } : x));
  }

  function resetTmplForm() {
    setTmplForm({ nama: "", tipeReminder: "Reminder Pengiriman", isiPesan: "", aktif: true });
    setTmplMode("add");
    setTmplEditId(null);
  }

  function startEditTmpl(t: ReminderTemplate) {
    setTmplForm({ nama: t.nama, tipeReminder: t.tipeReminder, isiPesan: t.isiPesan, aktif: t.aktif });
    setTmplMode("edit");
    setTmplEditId(t.id);
    setTimeout(() => tmplFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function handleSubmitTmpl() {
    if (!tmplForm.nama.trim() || !tmplForm.isiPesan.trim()) {
      toast("Harap lengkapi data template", "error");
      return;
    }
    setTmplSaving(true);
    try {
      let res: Response;
      if (tmplMode === "edit" && tmplEditId) {
        res = await fetch("/api/reminder-template", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tmplEditId, ...tmplForm }),
        });
      } else {
        res = await fetch("/api/reminder-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tmplForm),
        });
      }
      if (res.ok) {
        toast("Template berhasil disimpan");
        resetTmplForm();
        await fetchTemplates();
      } else {
        const json = await res.json();
        toast(json.error || "Gagal menyimpan template", "error");
      }
    } catch {
      toast("Terjadi error", "error");
    }
    setTmplSaving(false);
  }

  async function handleDeleteTmpl() {
    if (!delTmpl) return;
    setDelTmplLoading(true);
    await fetch("/api/reminder-template", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: delTmpl.id }),
    });
    setTemplates(prev => prev.filter(x => x.id !== delTmpl.id));
    toast("Template dihapus");
    setDelTmpl(null);
    setDelTmplLoading(false);
    // If we were editing this template, reset form
    if (tmplEditId === delTmpl.id) resetTmplForm();
  }

  function toast(message: string, kind: "success" | "error" = "success") {
    setToasts(prev => [...prev, { id: ++_tid, message, kind }]);
  }
  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const res  = await fetch("/api/master");
      const json = await res.json() as { products?: Product[]; specialists?: Specialist[]; categories?: Category[]; error?: string };
      if (!res.ok) {
        setFetchError(json.error ?? `Server error ${res.status}`);
        console.error("[fetchData] API error:", json.error);
        return;
      }
      setData({
        products:    json.products    ?? [],
        specialists: json.specialists ?? [],
        categories:  json.categories  ?? [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memuat data";
      setFetchError(msg);
      console.error("[fetchData]", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Add ──────────────────────────────────────────────────────────────────
  async function handleAdd(type: string) {
    if (!form.nama?.trim()) return;
    setAdding(true);
    try {
      const payload = {
        nama:         form.nama.trim(),
        hpp:          Number(form.hpp || 0),
        deskripsi:    form.deskripsi    || "",
        skuId:        form.skuId        || "",
        productLink:  form.productLink  || "",
        productImage: form.productImage || "",
        category:     form.category     || "",
        platform:     form.platform     || "",
        activeStatus: form.activeStatus || "ACTIVE",
      };
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data: payload }),
      });
      if (res.ok) {
        setForm({});
        toast("Berhasil ditambahkan");
        await fetchData();
      } else {
        const json = await res.json();
        toast(json.error || "Gagal menambahkan", "error");
      }
    } catch {
      toast("Gagal terhubung ke server", "error");
    } finally {
      setAdding(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function startEdit(id: number, type: string) {
    setEditId(id);
    if (type === "product") {
      const item = data.products.find(p => p.id === id);
      if (item) setEditForm({
        nama:         item.nama,
        hpp:          String(item.hpp),
        skuId:        item.skuId        || "",
        productLink:  item.productLink  || "",
        productImage: item.productImage || "",
        category:     item.category     || "",
        platform:     item.platform     || "",
        activeStatus: item.activeStatus || "ACTIVE",
      });
    } else if (type === "specialist") {
      const item = data.specialists.find(s => s.id === id);
      if (item) setEditForm({ nama: item.nama });
    } else if (type === "category") {
      const item = data.categories.find(c => c.id === id);
      if (item) setEditForm({ nama: item.nama, deskripsi: item.deskripsi });
    }
  }

  async function handleEdit(type: string) {
    if (!editId || !editForm.nama?.trim()) return;
    setEditSaving(true);
    const payload = {
      nama:         editForm.nama.trim(),
      hpp:          Number(editForm.hpp || 0),
      deskripsi:    editForm.deskripsi    || "",
      skuId:        editForm.skuId        || "",
      productLink:  editForm.productLink  || "",
      productImage: editForm.productImage || "",
      category:     editForm.category     || "",
      platform:     editForm.platform     || "",
      activeStatus: editForm.activeStatus || "ACTIVE",
    };
    const res = await fetch("/api/master", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id: editId, data: payload }),
    });
    if (res.ok) {
      setEditId(null);
      setEditForm({});
      toast("Berhasil diperbarui");
      await fetchData();
    } else {
      const json = await res.json();
      toast(json.error || "Gagal menyimpan", "error");
    }
    setEditSaving(false);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!delConfirm) return;
    setDeleting(true);
    const res = await fetch("/api/master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: delConfirm.type, id: delConfirm.id }),
    });
    if (res.ok) {
      toast(`"${delConfirm.nama}" berhasil dihapus`);
      setDelConfirm(null);
      await fetchData();
    } else {
      const json = await res.json();
      toast(json.error || "Gagal menghapus", "error");
    }
    setDeleting(false);
  }

  // ── Icon helpers ─────────────────────────────────────────────────────────
  const EditIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
  const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
  const SaveIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
  const SpinIcon = () => (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );

  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors bg-white";
  const editInputCls = "border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full bg-indigo-50/50";

  return (
    <div className="space-y-5">
      {/* Toasts */}
      <Toasts items={toasts} onDismiss={dismissToast} />

      {/* Delete confirm modal — for products/specialists/categories */}
      {delConfirm && (
        <DeleteConfirm
          nama={delConfirm.nama}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setDelConfirm(null)}
          loading={deleting}
        />
      )}

      {/* Delete confirm modal — for reminder templates */}
      {delTmpl && (
        <DeleteConfirm
          nama={delTmpl.nama}
          onConfirm={handleDeleteTmpl}
          onCancel={() => !delTmplLoading && setDelTmpl(null)}
          loading={delTmplLoading}
          title="Hapus Template Reminder?"
        />
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Master</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kelola produk, specialist, dan kategori affiliate</p>
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <span>⚠️ {fetchError}</span>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { key: "products",    label: "📦 Produk",           count: data.products.length },
          { key: "specialists", label: "👤 Specialist",        count: data.specialists.length },
          { key: "categories",  label: "🏷️ Kategori",          count: data.categories.length },
          { key: "templates",   label: "💬 Template Reminder", count: templates.length },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              tab === key ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ─── Produk Tab ──────────────────────────────────────────────────────── */}
      {tab === "products" && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">Tambah Produk Baru</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <input
                placeholder="Nama produk *"
                value={form.nama || ""}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                className={`${inputCls}`}
              />
              <input
                placeholder="SKU ID (e.g. 584272299238131038)"
                value={form.skuId || ""}
                onChange={e => setForm(f => ({ ...f, skuId: e.target.value }))}
                className={`${inputCls} font-mono text-xs`}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">Rp</span>
                <input
                  type="number"
                  placeholder="HPP"
                  value={form.hpp || ""}
                  onChange={e => setForm(f => ({ ...f, hpp: e.target.value }))}
                  className={`${inputCls} w-full pl-8`}
                />
              </div>
              <input
                placeholder="URL Produk (https://...)"
                value={form.productLink || ""}
                onChange={e => setForm(f => ({ ...f, productLink: e.target.value }))}
                className={`${inputCls}`}
              />
              <input
                placeholder="URL Gambar Produk"
                value={form.productImage || ""}
                onChange={e => setForm(f => ({ ...f, productImage: e.target.value }))}
                className={`${inputCls}`}
              />
              <input
                placeholder="Kategori (Parfum, Skincare, dll)"
                value={form.category || ""}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className={`${inputCls}`}
              />
              <select
                value={form.platform || ""}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className={`${inputCls}`}
              >
                <option value="">Platform (opsional)</option>
                <option value="tiktok">TikTok Shop</option>
                <option value="tokopedia">Tokopedia</option>
                <option value="shopee">Shopee</option>
                <option value="all">Semua Platform</option>
              </select>
              <select
                value={form.activeStatus || "ACTIVE"}
                onChange={e => setForm(f => ({ ...f, activeStatus: e.target.value }))}
                className={`${inputCls}`}
              >
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Tidak Aktif</option>
              </select>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => handleAdd("product")}
                disabled={adding || !form.nama?.trim()}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {adding ? <SpinIcon /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                Tambah Produk
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center"><div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>
            ) : data.products.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-1">Belum ada produk</p>
                <p className="text-xs text-gray-300">Tambah produk menggunakan form di atas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Nama Produk</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-48">SKU ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-36">HPP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28">Platform</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-20">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-20">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.products.map((p) => (
                      <tr key={p.id} className="group hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs">{p.no}</td>

                        {editId === p.id ? (
                          <>
                            <td className="px-2 py-2" colSpan={5}>
                              {/* Edit inline — 2-row grid */}
                              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                                <input
                                  value={editForm.nama || ""}
                                  onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))}
                                  placeholder="Nama produk *"
                                  className={editInputCls}
                                  autoFocus
                                />
                                <input
                                  value={editForm.skuId || ""}
                                  onChange={e => setEditForm(f => ({ ...f, skuId: e.target.value }))}
                                  placeholder="SKU ID"
                                  className={`${editInputCls} font-mono text-xs`}
                                />
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                                  <input
                                    type="number"
                                    value={editForm.hpp || ""}
                                    onChange={e => setEditForm(f => ({ ...f, hpp: e.target.value }))}
                                    placeholder="HPP"
                                    className={`${editInputCls} pl-8`}
                                  />
                                </div>
                                <input
                                  value={editForm.productLink || ""}
                                  onChange={e => setEditForm(f => ({ ...f, productLink: e.target.value }))}
                                  placeholder="URL Produk"
                                  className={editInputCls}
                                />
                                <input
                                  value={editForm.productImage || ""}
                                  onChange={e => setEditForm(f => ({ ...f, productImage: e.target.value }))}
                                  placeholder="URL Gambar"
                                  className={editInputCls}
                                />
                                <input
                                  value={editForm.category || ""}
                                  onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                  placeholder="Kategori"
                                  className={editInputCls}
                                />
                                <select
                                  value={editForm.platform || ""}
                                  onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}
                                  className={editInputCls}
                                >
                                  <option value="">Platform</option>
                                  <option value="tiktok">TikTok Shop</option>
                                  <option value="tokopedia">Tokopedia</option>
                                  <option value="shopee">Shopee</option>
                                  <option value="all">Semua Platform</option>
                                </select>
                                <select
                                  value={editForm.activeStatus || "ACTIVE"}
                                  onChange={e => setEditForm(f => ({ ...f, activeStatus: e.target.value }))}
                                  className={editInputCls}
                                >
                                  <option value="ACTIVE">Aktif</option>
                                  <option value="INACTIVE">Tidak Aktif</option>
                                </select>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => handleEdit("product")}
                                  disabled={editSaving}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {editSaving ? <SpinIcon /> : <SaveIcon />} Simpan
                                </button>
                                <button
                                  onClick={() => setEditId(null)}
                                  disabled={editSaving}
                                  className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                  Batal
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{p.nama}</div>
                              {p.category && <div className="text-xs text-gray-400 mt-0.5">{p.category}</div>}
                            </td>
                            <td className="px-4 py-3">
                              {p.skuId ? (
                                <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{p.skuId}</span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {p.hpp > 0 ? `Rp ${p.hpp.toLocaleString("id-ID")}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {p.platform ? (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  p.platform === "tiktok"    ? "bg-pink-50 text-pink-700" :
                                  p.platform === "tokopedia" ? "bg-green-50 text-green-700" :
                                  p.platform === "shopee"    ? "bg-orange-50 text-orange-700" :
                                  "bg-gray-100 text-gray-600"
                                }`}>
                                  {p.platform === "tiktok" ? "TikTok" :
                                   p.platform === "tokopedia" ? "Tokopedia" :
                                   p.platform === "shopee" ? "Shopee" :
                                   p.platform === "all" ? "Semua" : p.platform}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                p.activeStatus === "INACTIVE"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-green-50 text-green-700"
                              }`}>
                                {p.activeStatus === "INACTIVE" ? "Nonaktif" : "Aktif"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {p.productLink && (
                                  <a
                                    href={p.productLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Buka Link Produk"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                  </a>
                                )}
                                <button
                                  onClick={() => startEdit(p.id, "product")}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="Edit"
                                >
                                  <EditIcon />
                                </button>
                                <button
                                  onClick={() => setDelConfirm({ id: p.id, type: "product", nama: p.nama })}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Hapus"
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Specialist Tab ───────────────────────────────────────────────────── */}
      {tab === "specialists" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">Tambah Affiliate Specialist</h2>
            <div className="flex gap-3">
              <input
                placeholder="Nama specialist / PIC"
                value={form.nama || ""}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdd("specialist")}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={() => handleAdd("specialist")}
                disabled={adding || !form.nama?.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {adding ? <SpinIcon /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                Tambah
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center"><div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>
            ) : data.specialists.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-1">Belum ada specialist</p>
                <p className="text-xs text-gray-300">Tambah specialist menggunakan form di atas</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-12">No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Nama</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.specialists.map((s) => (
                    <tr key={s.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{s.no}</td>

                      {editId === s.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              value={editForm.nama || ""}
                              onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") handleEdit("specialist"); if (e.key === "Escape") setEditId(null); }}
                              className={editInputCls}
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleEdit("specialist")}
                                disabled={editSaving}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {editSaving ? <SpinIcon /> : <SaveIcon />} Simpan
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                disabled={editSaving}
                                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                Batal
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{s.nama}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(s.id, "specialist")}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                onClick={() => setDelConfirm({ id: s.id, type: "specialist", nama: s.nama })}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Hapus"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Kategori Tab ─────────────────────────────────────────────────────── */}
      {tab === "categories" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">Tambah Kategori Affiliate</h2>
            <div className="flex gap-3">
              <input
                placeholder="Nama kategori"
                value={form.nama || ""}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdd("category")}
                className={`${inputCls} flex-1`}
              />
              <input
                placeholder="Deskripsi (opsional)"
                value={form.deskripsi || ""}
                onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={() => handleAdd("category")}
                disabled={adding || !form.nama?.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {adding ? <SpinIcon /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                Tambah
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center"><div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>
            ) : data.categories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-1">Belum ada kategori</p>
                <p className="text-xs text-gray-300">Tambah kategori menggunakan form di atas</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-12">No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Deskripsi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.categories.map((c) => (
                    <tr key={c.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{c.no}</td>

                      {editId === c.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              value={editForm.nama || ""}
                              onChange={e => setEditForm(f => ({ ...f, nama: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") handleEdit("category"); if (e.key === "Escape") setEditId(null); }}
                              className={editInputCls}
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              value={editForm.deskripsi || ""}
                              onChange={e => setEditForm(f => ({ ...f, deskripsi: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") handleEdit("category"); if (e.key === "Escape") setEditId(null); }}
                              className={editInputCls}
                              placeholder="Deskripsi (opsional)"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleEdit("category")}
                                disabled={editSaving}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {editSaving ? <SpinIcon /> : <SaveIcon />} Simpan
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                disabled={editSaving}
                                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                Batal
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-900">{c.nama}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{c.deskripsi || <span className="text-gray-300 italic">—</span>}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(c.id, "category")}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                onClick={() => setDelConfirm({ id: c.id, type: "category", nama: c.nama })}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Hapus"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Template Reminder Tab ────────────────────────────────────────────── */}
      {tab === "templates" && (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            <strong>Variables yang tersedia:</strong>{" "}
            {["{username}", "{produk}", "{deadline}", "{video_ke}", "{pic}", "{hari_terlambat}"].map(v => (
              <code key={v} className="bg-blue-100 px-1.5 py-0.5 rounded mx-0.5">{v}</code>
            ))}
          </div>

          {/* ── Persistent Add / Edit Form ─────────────────────────────────── */}
          <div
            ref={tmplFormRef}
            className={`bg-white rounded-xl border shadow-sm p-5 space-y-3 transition-colors ${
              tmplMode === "edit" ? "border-indigo-300 bg-indigo-50/20" : "border-gray-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">
                {tmplMode === "edit" ? "✏️ Edit Template" : "➕ Tambah Template Baru"}
              </h2>
              {tmplMode === "edit" && (
                <button
                  onClick={resetTmplForm}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
                >
                  ✕ Batal Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nama Template <span className="text-red-400">*</span></label>
                <input
                  value={tmplForm.nama}
                  onChange={e => setTmplForm(f => ({ ...f, nama: e.target.value }))}
                  className={`${inputCls} w-full`}
                  placeholder="e.g. Reminder Khusus"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipe Reminder <span className="text-red-400">*</span></label>
                <select
                  value={tmplForm.tipeReminder}
                  onChange={e => setTmplForm(f => ({ ...f, tipeReminder: e.target.value }))}
                  className={`${inputCls} w-full`}
                >
                  {["Reminder Pengiriman","Reminder Video 1","Reminder Video 2","Reminder Video 3","Reminder Terlambat","Final Warning"].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Isi Pesan <span className="text-red-400">*</span></label>
              <textarea
                value={tmplForm.isiPesan}
                onChange={e => setTmplForm(f => ({ ...f, isiPesan: e.target.value }))}
                className={`${inputCls} resize-y font-mono text-xs w-full`}
                rows={6}
                placeholder={"Halo kak {username} 👋\nReminder produk *{produk}*...\nHubungi PIC: {pic}"}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSubmitTmpl}
                disabled={tmplSaving}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {tmplSaving ? <SpinIcon /> : <SaveIcon />}
                {tmplMode === "edit" ? "Update Template" : "Simpan Template"}
              </button>
              {tmplMode === "edit" && (
                <button
                  onClick={resetTmplForm}
                  disabled={tmplSaving}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Batal
                </button>
              )}
            </div>
          </div>

          {/* ── Template List ──────────────────────────────────────────────── */}
          {tmplLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">Memuat template...</div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Belum ada template. Isi form di atas untuk menambah.</div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                    tmplEditId === t.id ? "border-indigo-300 ring-1 ring-indigo-200" : !t.aktif ? "opacity-60 border-gray-100" : "border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{t.nama}</span>
                      <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded">
                        {t.tipeReminder}
                      </span>
                      <button
                        onClick={() => handleToggleTemplate(t)}
                        className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                          t.aktif
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {t.aktif ? "✓ Aktif" : "Non-aktif"}
                      </button>
                      {tmplEditId === t.id && (
                        <span className="text-xs text-indigo-500 font-medium">• Sedang diedit</span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEditTmpl(t)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          tmplEditId === t.id
                            ? "text-indigo-600 bg-indigo-50"
                            : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                        }`}
                        title="Edit template"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => setDelTmpl({ id: t.id, nama: t.nama })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Hapus template"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  {/* Preview — always visible */}
                  <div className="px-5 py-3">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{t.isiPesan}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MasterPageGate() {
  return (
    <PermissionGate permission={PERMISSIONS.EDIT_WORKSPACE}>
      <MasterPage />
    </PermissionGate>
  );
}
