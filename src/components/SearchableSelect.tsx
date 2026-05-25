"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  suggestionsUrl: string; // e.g. /api/master/suggestions?type=kota
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  value, onChange, placeholder = "Ketik untuk mencari...",
  suggestionsUrl, className = "", disabled = false,
}: Props) {
  const [query, setQuery]         = useState(value);
  const [options, setOptions]     = useState<string[]>([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep query in sync when value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  function doFetch(q: string) {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${suggestionsUrl}&q=${encodeURIComponent(q)}`);
        const data: string[] = await res.json();
        setOptions(data);
        setOpen(true);
      } catch { /* ignore */ }
      setLoading(false);
    }, 200);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setActiveIdx(-1);
    if (v.length === 0) { onChange(""); setOpen(false); return; }
    doFetch(v);
  }

  function handleFocus() {
    doFetch(query);
  }

  function select(opt: string) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, options.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); select(options[activeIdx]); }
    if (e.key === "Escape") { setOpen(false); }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white pr-8 ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
        autoComplete="off"
      />
      {/* Arrow icon */}
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
        {loading ? "⏳" : "▾"}
      </span>

      {open && options.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto py-1"
        >
          {options.map((opt, idx) => (
            <li
              key={opt}
              onMouseDown={() => select(opt)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                idx === activeIdx ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
