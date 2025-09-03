import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Tesseract from "tesseract.js";
import localforage from "localforage";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis
} from "recharts";
import { ArrowDownCircle, ArrowUpCircle, Wallet, UploadCloud, LogOut, Edit2, Trash2, Search } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";
import io from "socket.io-client";
import "react-toastify/dist/ReactToastify.css";

/* -------------------------
  Theme & colors (tweakable)
------------------------- */
const ACCENT = "#E50914";
const MUTED = "#9CA3AF";
const INCOME = "#16A34A";
const EXPENSE = "#DC2626";

/* -------------------------
  Localforage keys
------------------------- */
const LF_TRANSACTIONS = "ft_transactions_v1";   // cached transactions
const LF_QUEUE = "ft_sync_queue_v1";           // offline sync actions
const LF_SETTINGS = "ft_settings_v1";

/* -------------------------
  Smart date parsing helper
  supports:
    - today, yesterday
    - X days ago, X weeks ago
    - last Monday/Tuesday...
    - explicit dd-mm-yyyy, yyyy-mm-dd
    - weekday names (interpreted as last occurance if in future)
------------------------- */
function parseSmartDate(input) {
  if (!input) return new Date();
  const s = input.toString().trim().toLowerCase();

  const now = new Date();
  const weekdays = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

  // Exact formats dd-mm-yyyy or yyyy-mm-dd
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let dd = Number(dmy[1]), mm = Number(dmy[2]) - 1, yy = Number(dmy[3]);
    if (yy < 100) yy += 2000;
    const dt = new Date(yy, mm, dd);
    if (!isNaN(dt)) return dt;
  }
  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const dt = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!isNaN(dt)) return dt;
  }

  if (s === "today") return now;
  if (s === "yesterday") {
    const d = new Date(now); d.setDate(d.getDate() - 1); return d;
  }

  // "2 days ago" or "3 weeks ago"
  let rel = s.match(/^(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago$/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const d = new Date(now);
    if (unit.startsWith("day")) d.setDate(d.getDate() - n);
    else if (unit.startsWith("week")) d.setDate(d.getDate() - n * 7);
    else if (unit.startsWith("month")) d.setMonth(d.getMonth() - n);
    else if (unit.startsWith("year")) d.setFullYear(d.getFullYear() - n);
    return d;
  }

  // "last friday"
  let lastMatch = s.match(/^last\s+([a-z]+)$/);
  if (lastMatch) {
    const dayName = lastMatch[1];
    const wi = weekdays.indexOf(dayName);
    if (wi >= 0) {
      const d = new Date(now);
      const diff = (d.getDay() - wi + 7) % 7 || 7;
      d.setDate(d.getDate() - diff);
      return d;
    }
  }

  // "monday", "friday" => treat as the most recent occurrence (could be today)
  if (weekdays.includes(s)) {
    const wi = weekdays.indexOf(s);
    const d = new Date(now);
    const diff = (d.getDay() - wi + 7) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  }

  // fallback try Date parse
  const tryDt = new Date(s);
  if (!isNaN(tryDt)) return tryDt;
  // default
  return now;
}

/* -------------------------
  Utility helpers
------------------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------
  Dashboard component
------------------------- */
function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ description: "", amount: "", type: "expense", date: "" , category: "general"});
  const [aiText, setAiText] = useState("");
  const [parsedTransactions, setParsedTransactions] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const syncQueueRef = useRef([]);
  const socketRef = useRef(null);

  const categories = useMemo(() => ["all","food","groceries","salary","transport","entertainment","bills","shopping","general"], []);

  // formatting
  const formatCurrency = (n = 0) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

  /* -------------------------
    Initialize: load user, cached txns, queue, connect socket
  ------------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get("http://localhost:5000/user", { withCredentials: true });
        if (res.data) {
          if (!mounted) return;
          setUser(res.data);
        } else {
          navigate("/");
        }
      } catch (err) {
        // If cannot fetch user, redirect to login (or keep offline)
        navigate("/");
      }

      // load cached txns
      const cached = await localforage.getItem(LF_TRANSACTIONS);
      if (cached && mounted) setTransactions(cached);

      // load queued operations
      const queue = await localforage.getItem(LF_QUEUE) || [];
      syncQueueRef.current = queue;

      // connect socket for realtime
      try {
        socketRef.current = io("http://localhost:5000", { transports: ["websocket"], reconnectionAttempts: 5, auth: { token: "" }});
        socketRef.current.on("connect", () => {
          setSocketConnected(true);
          // request sync or just rely on REST + queue flush
          flushQueue(); // try flushing on connect
        });
        socketRef.current.on("disconnect", () => setSocketConnected(false));

        // realtime handlers (server should emit these with payload = transaction)
        socketRef.current.on("transaction:created", (txn) => {
          setTransactions(prev => {
            // ignore if we already have it
            if (prev.some(t => t._id === txn._id)) return prev;
            const next = [...prev, txn];
            localforage.setItem(LF_TRANSACTIONS, next);
            return next;
          });
        });
        socketRef.current.on("transaction:updated", (txn) => {
          setTransactions(prev => {
            const next = prev.map(p => p._id === txn._id ? txn : p);
            localforage.setItem(LF_TRANSACTIONS, next);
            return next;
          });
        });
        socketRef.current.on("transaction:deleted", ({ id }) => {
          setTransactions(prev => {
            const next = prev.filter(p => p._id !== id);
            localforage.setItem(LF_TRANSACTIONS, next);
            return next;
          });
        });
      } catch (err) {
        // socket may fail — we continue working offline
        console.warn("Socket connect failed:", err?.message || err);
      }
    })();

    return () => { mounted = false; if (socketRef.current) socketRef.current.disconnect(); };
  }, [navigate]);

  /* -------------------------
    Fetch transactions from server (with offline fallback)
  ------------------------- */
  useEffect(() => {
    let mounted = true;
    if (!user) return;
    (async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/transactions/${user.email}`);
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setTransactions(data);
        await localforage.setItem(LF_TRANSACTIONS, data);
      } catch (err) {
        // show cached & warn
        const cached = await localforage.getItem(LF_TRANSACTIONS);
        if (cached && mounted) setTransactions(cached);
        toast.warn("⚠️ Offline or server error — showing cached data.");
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  /* -------------------------
    Sync queue operations:
      queue item format { op: "create"|"update"|"delete", payload: {...}, id: optional }
    - saves queue to localforage
    - flushQueue tries to execute sequentially with retries
  ------------------------- */
  const saveQueue = useCallback(async () => {
    await localforage.setItem(LF_QUEUE, syncQueueRef.current || []);
  }, []);

  const enqueue = useCallback(async (item) => {
    syncQueueRef.current = [...(syncQueueRef.current || []), item];
    await saveQueue();
  }, [saveQueue]);

  async function flushQueue() {
    if (!user) return;
    if (!navigator.onLine) return;
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      while (syncQueueRef.current && syncQueueRef.current.length > 0) {
        const item = syncQueueRef.current[0];
        try {
          if (item.op === "create") {
            const res = await axios.post("http://localhost:5000/api/transactions", item.payload);
            // replace temporary item (local id) if exists
            setTransactions(prev => {
              const withoutTemp = prev.filter(t => t._tempId !== item.payload._tempId);
              const next = [...withoutTemp, res.data];
              localforage.setItem(LF_TRANSACTIONS, next);
              return next;
            });
          } else if (item.op === "update") {
            await axios.put(`http://localhost:5000/api/transactions/${item.id}`, item.payload);
            setTransactions(prev => {
              const next = prev.map(p => p._id === item.id ? { ...p, ...item.payload } : p);
              localforage.setItem(LF_TRANSACTIONS, next);
              return next;
            });
          } else if (item.op === "delete") {
            await axios.delete(`http://localhost:5000/api/transactions/${item.id}`);
            setTransactions(prev => {
              const next = prev.filter(p => p._id !== item.id);
              localforage.setItem(LF_TRANSACTIONS, next);
              return next;
            });
          }
          // remove the processed item
          syncQueueRef.current.shift();
          await saveQueue();
        } catch (err) {
          // if a network error, break and try later
          console.error("Sync item failed:", err?.message || err);
          // if 4xx (bad data), drop it to avoid infinite loops
          if (err?.response && err.response.status >= 400 && err.response.status < 500) {
            syncQueueRef.current.shift();
            await saveQueue();
            toast.error("Dropped invalid queued action.");
            continue;
          }
          // otherwise stop processing and retry later
          break;
        }
      }
    } finally {
      setIsSyncing(false);
    }
  }

  // try flush when coming online
  useEffect(() => {
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /* -------------------------
    Utility: optimistic create / update / delete
  ------------------------- */
  const optimisticCreate = async (payload) => {
    // payload should include user email
    const _tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const localItem = { ...payload, _tempId, date: payload.date || new Date().toISOString() };
    setTransactions(prev => {
      const next = [...prev, localItem];
      localforage.setItem(LF_TRANSACTIONS, next);
      return next;
    });
    // enqueue
    await enqueue({ op: "create", payload: localItem });
    // try immediate flush if online
    if (navigator.onLine) await flushQueue();
  };

  const optimisticUpdate = async (id, payload) => {
    const previous = transactions.find(t => t._id === id);
    setTransactions(prev => {
      const next = prev.map(p => p._id === id ? { ...p, ...payload } : p);
      localforage.setItem(LF_TRANSACTIONS, next);
      return next;
    });
    await enqueue({ op: "update", id, payload });
    if (navigator.onLine) await flushQueue();
    return previous;
  };

  const optimisticDelete = async (id) => {
    const previous = transactions.find(t => t._id === id);
    setTransactions(prev => {
      const next = prev.filter(p => p._id !== id);
      localforage.setItem(LF_TRANSACTIONS, next);
      return next;
    });
    await enqueue({ op: "delete", id });
    if (navigator.onLine) await flushQueue();
    return previous;
  };

  /* -------------------------
    Form submit (uses smart date parser)
  ------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim() || !form.amount) {
      toast.warn("Please enter description and amount.");
      return;
    }
    const parsedDate = form.date ? parseSmartDate(form.date) : new Date();
    const payload = {
      user: user.email,
      description: form.description.trim(),
      amount: Number(form.amount),
      type: form.type,
      date: parsedDate.toISOString(),
      category: form.category || "general"
    };
    try {
      await optimisticCreate(payload);
      setForm({ description: "", amount: "", type: "expense", date: "", category: "general" });
      toast.success("Transaction queued (will sync when online).");
    } catch (err) {
      toast.error("Failed to queue transaction.");
    }
  };

  /* -------------------------
    AI Parser / OCR (same logic you've used)
    small improvement: try to guess date/category from parsed text (basic heuristics)
  ------------------------- */
  const handleAiParse = async () => {
    if (!aiText.trim()) return toast.warn("Please enter or upload text.");
    try {
      const res = await axios.post("http://localhost:5000/api/ai/parse", { text: aiText });
      if (Array.isArray(res.data) && res.data.length > 0) {
        // basic heuristics: if parsed item has 'date' text like 'yesterday' or '12-08-2025' convert
        const normalized = res.data.map(x => {
          const dateGuess = x.dateText ? parseSmartDate(x.dateText) : (x.date ? new Date(x.date) : new Date());
          return {
            ...x,
            amount: Number(x.amount || 0),
            date: dateGuess.toISOString(),
            category: x.category || "general"
          };
        });
        setParsedTransactions(normalized);
        toast.success("Parsed! Click to load into form or add directly.");
      } else {
        toast.info("No transactions found in text.");
      }
    } catch (err) {
      console.error(err);
      toast.error("AI parsing failed.");
    }
  };

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data } = await Tesseract.recognize(file, "eng");
      setAiText(data.text);
      // call parser automatically
      const res = await axios.post("http://localhost:5000/api/ai/parse", { text: data.text });
      if (Array.isArray(res.data) && res.data.length > 0) {
        const normalized = res.data.map(x => ({ ...x, amount: Number(x.amount || 0), date: x.date ? new Date(x.date).toISOString() : new Date().toISOString(), category: x.category || "general" }));
        setParsedTransactions(normalized);
        toast.success("Receipt parsed. Click to load.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Receipt parsing failed.");
    }
  };

  const handleSelectParsedTransaction = (t) => {
    setForm({
      description: t.description || "",
      amount: t.amount || "",
      type: t.type || "expense",
      date: t.date ? new Date(t.date).toLocaleDateString("en-IN") : "",
      category: t.category || "general"
    });
    toast.info("Loaded parsed transaction into form.");
  };

  /* -------------------------
    Edit & Delete handlers (inline edit)
  ------------------------- */
  const handleEdit = async (id, patch) => {
    try {
      await optimisticUpdate(id, patch);
      toast.success("Edit queued.");
    } catch (err) {
      toast.error("Failed to queue edit.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      await optimisticDelete(id);
      toast.success("Delete queued.");
    } catch (err) {
      toast.error("Failed to queue delete.");
    }
  };

  /* -------------------------
    Derived totals with useMemo for perf
  ------------------------- */
  const totalIncome = useMemo(() => transactions.filter(t => t.type === "income").reduce((a, b) => a + (b.amount || 0), 0), [transactions]);
  const totalExpense = useMemo(() => transactions.filter(t => t.type === "expense").reduce((a, b) => a + (b.amount || 0), 0), [transactions]);
  const balance = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense]);

  /* -------------------------
    Weekly chart data
  ------------------------- */
  useEffect(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - i);
      return { date: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }), income: 0, expense: 0 };
    }).reverse();
    transactions.forEach(t => {
      const when = new Date(t.date || t.createdAt || Date.now());
      const label = when.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      const idx = last7.findIndex(d => d.date === label);
      if (idx >= 0) {
        if (t.type === "income") last7[idx].income += t.amount || 0;
        else last7[idx].expense += t.amount || 0;
      }
    });
    setWeeklyData(last7);
  }, [transactions]);

  const chartData = useMemo(() => ([ { name: "Expenses", value: totalExpense }, { name: "Income", value: totalIncome } ]), [totalExpense, totalIncome]);
  const pieColors = [EXPENSE, INCOME];

  /* -------------------------
    Filtering & search (debounced)
  ------------------------- */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (categoryFilter !== "all" && (t.category || "general") !== categoryFilter) return false;
      if (!debouncedSearch) return true;
      const q = debouncedSearch;
      return (t.description || "").toLowerCase().includes(q) ||
             (t.category || "").toLowerCase().includes(q) ||
             (t._id || "").toLowerCase().includes(q);
    }).sort((a,b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [transactions, categoryFilter, debouncedSearch]);

  /* -------------------------
    Small UI motion presets
  ------------------------- */
  const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.28 } } };
  const hoverLift = { whileHover: { y: -3 } };

  /* -------------------------
    Render
  ------------------------- */
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-gray-100 font-sans relative">
      {/* decorative overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.6]">
        <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(229,9,20,0.12),transparent_70%)]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-[--accent] ring-1 ring-white/20 flex items-center justify-center" style={{ ["--accent"]: ACCENT }}>
              <Wallet className="h-5 w-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
              <span className="text-white">Finance</span>
              <span className="ml-2" style={{ color: ACCENT }}>Tracker</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-300">
                <div className="h-8 w-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-200">{user.name?.charAt(0)?.toUpperCase() || "U"}</span>
                </div>
                <div className="flex flex-col leading-tight max-w-[220px] truncate">
                  <span className="font-medium truncate">{user.name}</span>
                  <span className="text-xs text-gray-400 truncate">{user.email}</span>
                </div>
              </div>
            )}

            {user && (
              <motion.button {...hoverLift} onClick={async () => { try { await axios.get("http://localhost:5000/logout", { withCredentials: true }); } catch{} setUser(null); navigate("/"); }} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-white/10">
                <LogOut className="h-4 w-4" /> Logout
              </motion.button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 space-y-8">
        {/* Top summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <motion.div {...fadeUp} {...hoverLift} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
            <div className="text-sm uppercase tracking-wide text-gray-400">Total Income</div>
            <div className="mt-3 flex items-center gap-2">
              <ArrowUpCircle className="h-6 w-6 text-emerald-400" />
              <div className="text-3xl font-bold">{formatCurrency(totalIncome)}</div>
            </div>
          </motion.div>

          <motion.div {...fadeUp} {...hoverLift} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
            <div className="text-sm uppercase tracking-wide text-gray-400">Total Expenses</div>
            <div className="mt-3 flex items-center gap-2">
              <ArrowDownCircle className="h-6 w-6 text-red-400" />
              <div className="text-3xl font-bold">{formatCurrency(totalExpense)}</div>
            </div>
          </motion.div>

          <motion.div {...fadeUp} {...hoverLift} className="relative overflow-hidden rounded-2xl border border-white/10 p-[1px]">
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-2xl pointer-events-none" />
            <div className="rounded-2xl bg-black/60 p-6 backdrop-blur-xl">
              <div className="text-sm uppercase tracking-wide text-gray-400">Balance</div>
              <div className="mt-3 text-3xl font-extrabold" style={{ color: balance >= 0 ? "#F3F4F6" : ACCENT }}>
                {formatCurrency(balance)}
              </div>
              <div className="mt-2 text-xs text-gray-400">{isSyncing ? "Syncing..." : (navigator.onLine ? (socketConnected ? "Online (realtime)" : "Online") : "Offline")}</div>
            </div>
          </motion.div>
        </div>

        {/* AI Parser + Add form + controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* AI Parser */}
          <motion.section {...fadeUp} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6 lg:col-span-1">
            <h2 className="text-lg font-semibold">AI Parser / OCR</h2>
            <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={4}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100 placeholder-gray-500 focus:outline-none" placeholder="Paste SMS, email, or receipt text..." />
            <div className="mt-3 flex flex-wrap gap-3">
              <button onClick={handleAiParse} className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: ACCENT }}>Parse Text</button>
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-100">
                <UploadCloud className="h-4 w-4" /> Upload Receipt
                <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" />
              </label>
            </div>
            <AnimatePresence>
              {parsedTransactions.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mt-3 max-h-48 overflow-y-auto space-y-2">
                  {parsedTransactions.map((t, i) => (
                    <motion.button key={i} {...hoverLift} onClick={() => handleSelectParsedTransaction(t)} className="w-full text-left rounded-xl border border-white/10 bg-black/40 px-3 py-2 hover:bg-black/55">
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-gray-400">{formatCurrency(t.amount)} · {t.type} · {t.category || "general"}</div>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          {/* Add Transaction */}
          <motion.section {...fadeUp} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold">Add Transaction</h2>
            <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                     placeholder="Description" className="md:col-span-2 rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100" required />
              <input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                     placeholder="Amount" type="number" className="rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100" required />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                     placeholder="Date (smart) e.g. yesterday / 12-08-2025" className="rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="rounded-xl border border-white/10 bg-black/40 p-3 text-gray-100 md:col-span-1">
                {categories.filter(c => c !== "all").map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <motion.button {...hoverLift} type="submit" className="md:col-span-4 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                Add Transaction
              </motion.button>
            </form>
          </motion.section>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.section {...fadeUp} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-4">Expense vs Income</h2>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                     label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                  {chartData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "#111", borderRadius: 8 }} />
                <Legend wrapperStyle={{ color: MUTED }} />
              </PieChart>
            </ResponsiveContainer>
          </motion.section>

          <motion.section {...fadeUp} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-4">Weekly Overview</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="date" tick={{ fill: "#E5E7EB" }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false}/>
                <YAxis tick={{ fill: "#E5E7EB" }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false}/>
                <Tooltip formatter={(v)=>formatCurrency(v)} contentStyle={{ background: "#111", borderRadius: 8 }} />
                <Legend wrapperStyle={{ color: MUTED }} />
                <Bar dataKey="income" fill={INCOME} radius={[6,6,0,0]} />
                <Bar dataKey="expense" fill={EXPENSE} radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.section>
        </div>

        {/* Transactions list with search / categories / edit / delete */}
        <motion.section {...fadeUp} className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 w-full max-w-md">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-3 top-3 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, category or id..." className="pl-10 pr-3 py-2 w-full rounded-xl bg-black/40 border border-white/10 text-gray-100" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="rounded-xl border border-white/10 bg-black/40 p-2 text-gray-100">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="text-sm text-gray-400">{filteredTransactions.length} items</div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTransactions.length === 0 && <div className="text-gray-400">No transactions found.</div>}
            {filteredTransactions.map(txn => (
              <div key={txn._id || txn._tempId} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-white/10 bg-black/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium truncate">{txn.description}</div>
                    <div className="text-xs text-gray-400">· {txn.category || "general"}</div>
                    <div className="text-xs text-gray-500 ml-auto">{new Date(txn.date || txn.createdAt || Date.now()).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-sm text-gray-300">{txn.note || ""}</div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className={`text-lg font-bold ${txn.type === "income" ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(txn.amount)}</div>
                  <div className="flex items-center gap-2">
                    <button title="Edit" onClick={() => {
                      // quick inline edit modal - we will prompt for new amount / desc simply
                      const newDesc = prompt("Edit description", txn.description);
                      if (newDesc === null) return;
                      const newAmtRaw = prompt("Edit amount", String(txn.amount || ""));
                      if (newAmtRaw === null) return;
                      const newAmt = Number(newAmtRaw);
                      if (isNaN(newAmt)) return alert("Invalid amount");
                      handleEdit(txn._id, { description: newDesc, amount: newAmt });
                    }} className="p-2 rounded-md hover:bg-white/5"><Edit2 className="h-4 w-4" /></button>

                    <button title="Delete" onClick={() => handleDelete(txn._id)} className="p-2 rounded-md hover:bg-white/5"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </main>

      <ToastContainer theme="dark" position="bottom-right" />
    </div>
  );
}

export default Dashboard;
