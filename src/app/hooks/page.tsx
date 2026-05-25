"use client";

import { useEffect, useState } from "react";

interface Hook {
  id: number;
  formula: string;
  deskripsi: string;
  detail: string;
}

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/hooks").then(r => r.json()).then(setHooks);
  }, []);

  const filtered = hooks.filter(h =>
    h.formula.toLowerCase().includes(search.toLowerCase()) ||
    h.deskripsi.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">HOOK Formula</h1>
        <p className="text-sm text-gray-500 mt-0.5">Library formula hook untuk konten TikTok Affiliate</p>
      </div>

      <input
        type="text"
        placeholder="Cari formula atau deskripsi..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white w-full max-w-md shadow-sm"
      />

      {hooks.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">💡</div>
          <p className="text-gray-500 text-sm">Data HOOK Formula belum diimport.</p>
          <p className="text-gray-400 text-xs mt-1">Jalankan seed data dari terminal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((hook) => (
            <div
              key={hook.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div
                className="px-5 py-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === hook.id ? null : hook.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{hook.formula}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{hook.deskripsi}</p>
                  </div>
                  <span className="text-gray-400 shrink-0">{expanded === hook.id ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded === hook.id && (
                <div className="px-5 pb-4 border-t border-gray-50">
                  <div className="mt-3 bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{hook.detail}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && hooks.length > 0 && (
        <p className="text-gray-400 text-sm">Tidak ada formula yang cocok dengan pencarian.</p>
      )}
    </div>
  );
}
