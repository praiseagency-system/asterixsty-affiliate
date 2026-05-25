"use client";

/**
 * useMasterData — module-level cache for campaign dropdown data.
 *
 * Key guarantees:
 *  - Module-level variables survive component re-mounts (modal open/close cycles)
 *  - Single in-flight fetch is shared across all hook instances (deduplication)
 *  - Stale data refreshes automatically after STALE_MS
 *  - Distinguishes loading / loaded / error states so dropdowns never show
 *    "not found" while data is still on the way
 */

import { useState, useEffect, useRef } from "react";

// ── Shared types ──────────────────────────────────────────────────────────────
export interface Specialist { id: number; nama: string; }
export interface Category   { id: number; nama: string; deskripsi: string; }
export interface Product    { id: number; nama: string; }

interface MasterData {
  specialists: Specialist[];
  categories:  Category[];
  products:    Product[];
}

type FetchStatus = "loading" | "loaded" | "error";

// ── Module-level singleton (persists across React re-mounts) ──────────────────
let _cache: MasterData | null = null;
let _fetchedAt   = 0;
let _inflight: Promise<MasterData> | null = null;
const _subs = new Set<() => void>();

const STALE_MS = 2 * 60 * 1000; // 2 minutes

function _notify() {
  _subs.forEach((fn) => fn());
}

async function _doFetch(): Promise<MasterData> {
  console.log("[useMasterData] fetch start →", new Date().toISOString());
  const r = await fetch("/api/master");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as {
    specialists?: Specialist[];
    categories?:  Category[];
    products?:    Product[];
  };
  const data: MasterData = {
    specialists: d.specialists ?? [],
    categories:  d.categories  ?? [],
    products:    d.products    ?? [],
  };
  console.log(
    `[useMasterData] fetch success — specialists:${data.specialists.length}`,
    `categories:${data.categories.length}`,
    `products:${data.products.length}`,
  );
  return data;
}

function _ensureFetch(force = false): Promise<MasterData> {
  // Return cached data immediately if still fresh
  if (!force && _cache && Date.now() - _fetchedAt < STALE_MS) {
    console.log("[useMasterData] cache hit (fresh)");
    return Promise.resolve(_cache);
  }
  // Deduplicate — multiple callers share one in-flight request
  if (_inflight) {
    console.log("[useMasterData] deduped — joining inflight request");
    return _inflight;
  }

  _inflight = _doFetch()
    .then((data) => {
      _cache     = data;
      _fetchedAt = Date.now();
      _inflight  = null;
      _notify();
      return data;
    })
    .catch((err) => {
      _inflight = null;
      console.error("[useMasterData] fetch error:", err);
      throw err;
    });

  return _inflight;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useMasterData() {
  // Initialize from cache immediately — no flash of empty on re-mount
  const [status, setStatus] = useState<FetchStatus>(_cache ? "loaded" : "loading");
  const [data,   setData  ] = useState<MasterData | null>(_cache);
  const [error,  setError ] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Subscribe to out-of-band updates (e.g. another tab triggers refresh)
    const onUpdate = () => {
      if (!mounted.current || !_cache) return;
      console.log("[useMasterData] subscriber update received");
      setData(_cache);
      setStatus("loaded");
      setError(null);
    };
    _subs.add(onUpdate);

    // Trigger fetch (no-op if cache is fresh, deduped if already in-flight)
    _ensureFetch()
      .then((d) => {
        if (!mounted.current) return;
        setData(d);
        setStatus("loaded");
        setError(null);
      })
      .catch((err) => {
        if (!mounted.current) return;
        const msg = err instanceof Error ? err.message : "Gagal memuat data master";
        console.error("[useMasterData] setting error state:", msg);
        setError(msg);
        setStatus("error");
      });

    return () => {
      mounted.current = false;
      _subs.delete(onUpdate);
    };
  }, []);

  /** Force a fresh fetch regardless of stale time (e.g. after Data Master edit). */
  const refresh = () => {
    console.log("[useMasterData] manual refresh triggered");
    if (!mounted.current) return;
    setStatus("loading");
    _ensureFetch(true)
      .then((d) => {
        if (!mounted.current) return;
        setData(d);
        setStatus("loaded");
        setError(null);
      })
      .catch((err) => {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : "Gagal memuat ulang");
        setStatus("error");
      });
  };

  return {
    specialists: data?.specialists ?? [],
    categories:  data?.categories  ?? [],
    products:    data?.products    ?? [],
    /** True while the first fetch or a forced refresh is in-flight. */
    loading: status === "loading",
    /** True after at least one successful fetch. */
    loaded:  status === "loaded",
    error,
    refresh,
  };
}
