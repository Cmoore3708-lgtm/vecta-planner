import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { Plus, Printer, Search, CalendarDays, CalendarRange, LayoutDashboard } from "lucide-react";
import "./style.css";

const TECHS = ["Jordan", "Alfie"];
const RAMPS = ["Left", "Middle", "Right"];
const RAMP_LABEL = { Left: "Ramp 1", Middle: "Ramp 2", Right: "Ramp 3" };
const RAMP_CLASS = { Left: "left", Middle: "middle", Right: "right" };
const RAMP_CAPACITY = 8;

const STATUS = {
  booked: "Booked",
  arrived: "Arrived",
  in_progress: "In Progress",
  work_complete: "Work Complete",
  ready_to_invoice: "Ready to Invoice",
  archived: "Archived",
  no_show: "No-show"
};

const JOB_TYPES = [
  ["MOT", 1],
  ["Interim Service", 1.5],
  ["Minor Service", 1.5],
  ["Major Service", 2.5],
  ["Diagnostics", 2],
  ["Front Brakes", 1.5],
  ["Rear Brakes", 1.5],
  ["Front & Rear Brakes", 3],
  ["Suspension", 2],
  ["Clutch", 6],
  ["Timing Belt", 4.5],
  ["Turbo", 5],
  ["Air Conditioning", 1],
  ["Tyres", 1],
  ["Electrical", 2],
  ["Other", 1]
];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function uid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10); }
function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function addDaysISO(iso, days) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function monthStartISO(iso) { const d = new Date(`${iso}T00:00:00`); d.setDate(1); return d.toISOString().slice(0, 10); }
function friendlyDate(iso) { return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }); }
function shortDate(iso) { return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }); }
function isWeekend(iso) { const day = new Date(`${iso}T00:00:00`).getDay(); return day === 0 || day === 6; }

function dateKey(date) { return `vecta:v111:${date}`; }
const globalKey = "vecta:v111:global";
const tasksKey = "vecta:v111:tasks";
const notesKey = "vecta:v111:notes";

function read(key) { return JSON.parse(localStorage.getItem(key) || "[]"); }
function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function localDate(date) { return read(dateKey(date)); }
function setLocalDate(date, jobs) { write(dateKey(date), jobs); }
function localGlobal() { return read(globalKey); }
function setLocalGlobal(jobs) { write(globalKey, jobs); }
function localTasks() { return read(tasksKey); }
function setLocalTasks(tasks) { write(tasksKey, tasks); }
function localNotes() { return read(notesKey); }
function setLocalNotes(notes) { write(notesKey, notes); }

async function seedLocal() {
  if (supabase) return;
  const t = todayISO();
  if (!localStorage.getItem(dateKey(t))) {
    setLocalDate(t, [
      { id: uid(), card_type: "job", booking_date: t, registration: "YD18 ABC", vehicle: "Ford Transit", work_required: "Rear brakes", drop_time: "08:30", technician: "Jordan", ramp: "Left", status: "booked", job_type: "Rear Brakes", estimated_hours: 1.5 },
      { id: uid(), card_type: "job", booking_date: t, registration: "MJ20 CCC", vehicle: "Nissan Juke", work_required: "Diagnostic", drop_time: "12:00", technician: "Alfie", ramp: "Middle", status: "in_progress", job_type: "Diagnostics", estimated_hours: 2 }
    ]);
  }
  if (!localStorage.getItem(globalKey)) {
    setLocalGlobal([
      { id: uid(), card_type: "job", registration: "AB12 XYZ", vehicle: "Nissan Qashqai", work_required: "Service + MOT", drop_time: "10:30", technician: "Unallocated", status: "booked", job_type: "Minor Service", estimated_hours: 2 },
      { id: uid(), card_type: "waiting", registration: "KV70 UOS", vehicle: "BMW 218i", work_required: "Brake reset when there is a gap", technician: "Waiting", status: "booked", job_type: "Diagnostics", estimated_hours: 1 }
    ]);
  }
  if (!localStorage.getItem(tasksKey)) setLocalTasks([{ id: uid(), task_text: "Invoice Transit brakes", priority: "today", done: false }]);
  if (!localStorage.getItem(notesKey)) setLocalNotes([{ id: uid(), note_text: "Check tomorrow's workload before leaving." }]);
}

async function listDate(date) {
  if (supabase) {
    const { data, error } = await supabase.from("jobs").select("*").eq("booking_date", date).eq("archived", false).neq("technician", "Unallocated").neq("card_type", "waiting").order("drop_time");
    if (error) throw error;
    return data || [];
  }
  return localDate(date).filter(j => !j.archived && j.technician !== "Unallocated" && j.card_type !== "waiting");
}

async function listGlobal() {
  if (supabase) {
    const { data, error } = await supabase.from("jobs").select("*").is("booking_date", null).eq("archived", false).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return localGlobal().filter(j => !j.archived);
}

async function listTasks() {
  if (supabase) {
    const { data, error } = await supabase.from("tasks").select("*").eq("done", false).order("sort_order");
    if (error) throw error;
    return data || [];
  }
  return localTasks().filter(t => !t.done);
}

async function listNotes() {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    } catch { return []; }
  }
  return localNotes();
}

async function saveJob(job, currentDate) {
  const payload = { ...job, registration: (job.registration || "").toUpperCase() };
  if (payload.status === "archived") payload.archived = true;
  if (payload.technician === "Unallocated" || payload.technician === "Waiting" || payload.card_type === "waiting") payload.booking_date = null;
  else payload.booking_date = payload.booking_date || currentDate;

  if (supabase) {
    const { error } = await supabase.from("jobs").upsert(payload);
    if (error) throw error;
    return;
  }

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("vecta:v111:") && key !== globalKey && key !== tasksKey && key !== notesKey) {
      const d = key.replace("vecta:v111:", "");
      setLocalDate(d, localDate(d).filter(j => j.id !== payload.id));
    }
  }
  setLocalGlobal(localGlobal().filter(j => j.id !== payload.id));
  if (payload.booking_date) setLocalDate(payload.booking_date, [...localDate(payload.booking_date), payload]);
  else setLocalGlobal([...localGlobal(), payload]);
}

async function deleteJob(id) {
  if (supabase) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("vecta:v111:")) write(key, read(key).filter(r => r.id !== id));
  }
}

async function saveTask(task) {
  if (supabase) {
    const { error } = await supabase.from("tasks").upsert(task);
    if (error) throw error;
    return;
  }
  setLocalTasks([...localTasks().filter(t => t.id !== task.id), task]);
}
async function deleteTask(id) {
  if (supabase) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  setLocalTasks(localTasks().filter(t => t.id !== id));
}
async function saveNote(note) {
  if (supabase) {
    try { await supabase.from("notes").upsert(note); } catch {}
    return;
  }
  setLocalNotes([...localNotes().filter(n => n.id !== note.id), note]);
}
async function deleteNote(id) {
  if (supabase) {
    try { await supabase.from("notes").delete().eq("id", id); } catch {}
    return;
  }
  setLocalNotes(localNotes().filter(n => n.id !== id));
}

function RampUtil({ jobs, onRamp }) {
  return (
    <section className="rampUtil">
      {RAMPS.map(r => {
        const hours = jobs.filter(j => j.ramp === r).reduce((s, j) => s + Number(j.estimated_hours || 1), 0);
        const pct = Math.min(140, Math.round((hours / RAMP_CAPACITY) * 100));
        const free = Math.max(0, RAMP_CAPACITY - hours);
        return (
          <button key={r} className={`rampMeter ${RAMP_CLASS[r]} ${pct > 95 ? "red" : pct > 75 ? "amber" : "green"}`} onClick={() => onRamp(r)}>
            <div>
              <b>{RAMP_LABEL[r]}</b>
              <span>{hours.toFixed(1)} / {RAMP_CAPACITY} hrs · {free.toFixed(1)} hrs free</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
          </button>
        );
      })}
    </section>
  );
}

function WeekUtil({ dates }) {
  return (
    <section className="weekUtil">
      {dates.map(d => {
        const hrs = localDate(d).reduce((s, j) => s + Number(j.estimated_hours || 1), 0);
        const pct = Math.min(140, Math.round((hrs / 16) * 100));
        return (
          <button key={d} className={`utilDay ${isWeekend(d) ? "closed" : pct > 95 ? "red" : pct > 75 ? "amber" : "green"}`}>
            <b>{shortDate(d)}</b>
            <span>{isWeekend(d) ? "Closed" : `${pct}%`}</span>
            {!isWeekend(d) && <div><i style={{ width: `${Math.min(100, pct)}%` }} /></div>}
          </button>
        );
      })}
    </section>
  );
}

function JobCard({ job, onEdit, onDragStart }) {
  return (
    <div className={`job ${RAMP_CLASS[job.ramp] || ""} ${job.status}`} draggable onDragStart={e => onDragStart(e, job)} onDoubleClick={() => onEdit(job)}>
      {job.drop_time && <div className="time">{String(job.drop_time).slice(0, 5)}</div>}
      <b>{job.registration || "NO REG"}</b>
      <span>{job.vehicle || ""}</span>
      <p>{job.work_required || ""}</p>
      <em>{STATUS[job.status] || job.status}</em>
    </div>
  );
}

function JobDialog({ job, date, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(job || {});
  useEffect(() => {
    setForm(job || { id: "", card_type: "job", registration: "", vehicle: "", work_required: "", customer_note: "", drop_time: "", technician: "Unallocated", ramp: "", status: "booked", job_type: "Other", estimated_hours: 1 });
  }, [job]);

  function update(field, value) {
    if (field === "registration") value = value.toUpperCase();
    if (field === "job_type") {
      const found = JOB_TYPES.find(([name]) => name === value);
      setForm(f => ({ ...f, job_type: value, estimated_hours: found ? found[1] : f.estimated_hours }));
      return;
    }
    setForm(f => ({ ...f, [field]: value }));
  }

  return (
    <div className="backdrop">
      <div className="dialog">
        <h2>{form.id ? "Edit Job" : "Add Job"}</h2>
        <div className="two">
          <label>Card Type<select value={form.card_type || "job"} onChange={e => update("card_type", e.target.value)}><option value="job">Job</option><option value="waiting">Waiting Job</option></select></label>
          <label>Status<select value={form.status || "booked"} onChange={e => update("status", e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label>Registration<input autoFocus value={form.registration || ""} onChange={e => update("registration", e.target.value)} /></label>
        <label>Vehicle<input value={form.vehicle || ""} onChange={e => update("vehicle", e.target.value)} /></label>
        <label>Work Required<textarea value={form.work_required || ""} onChange={e => update("work_required", e.target.value)} /></label>
        <div className="two">
          <label>Job Type<select value={form.job_type || "Other"} onChange={e => update("job_type", e.target.value)}>{JOB_TYPES.map(([name]) => <option key={name}>{name}</option>)}</select></label>
          <label>Estimated Hours<input type="number" step="0.5" value={form.estimated_hours || 1} onChange={e => update("estimated_hours", Number(e.target.value))} /></label>
        </div>
        <div className="two">
          <label>Drop-off<input type="time" value={String(form.drop_time || "").slice(0, 5)} onChange={e => update("drop_time", e.target.value)} /></label>
          <label>Technician<select value={form.technician || "Unallocated"} onChange={e => update("technician", e.target.value)}><option>Unallocated</option><option>Waiting</option>{TECHS.map(t => <option key={t}>{t}</option>)}</select></label>
        </div>
        <label>Ramp<select value={form.ramp || ""} onChange={e => update("ramp", e.target.value)}><option value="">No ramp</option>{RAMPS.map(r => <option key={r} value={r}>{RAMP_LABEL[r]}</option>)}</select></label>
        <label>Customer / Note<input value={form.customer_note || ""} onChange={e => update("customer_note", e.target.value)} /></label>
        <div className="dialogActions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          {form.id && <button className="danger" onClick={() => onDelete(form.id)}>Delete</button>}
          <button onClick={() => onSave({ ...form, id: form.id || uid() })}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Notes({ notes, onSave, onDelete }) {
  const [text, setText] = useState("");
  return (
    <section>
      <h2>Notes</h2>
      <div className="taskAdd"><input placeholder="Add note..." value={text} onChange={e => setText(e.target.value)} /><button onClick={() => { if (text.trim()) { onSave({ id: uid(), note_text: text.trim() }); setText(""); } }}>Add</button></div>
      {notes.map(n => <div className="note" key={n.id}><span>{n.note_text}</span><button onClick={() => onDelete(n.id)}>×</button></div>)}
    </section>
  );
}

function Tasks({ tasks, onSave, onDelete }) {
  const [text, setText] = useState("");
  return (
    <section className="tasks">
      <h2>Tasks</h2>
      <div className="taskAdd"><input placeholder="Add task..." value={text} onChange={e => setText(e.target.value)} /><button onClick={() => { if (text.trim()) { onSave({ id: uid(), task_text: text.trim(), priority: "today", done: false }); setText(""); } }}>Add</button></div>
      {tasks.map(t => <div className={`task ${t.priority}`} key={t.id}><span>{t.task_text}</span><button onClick={() => onDelete(t.id)}>Done</button></div>)}
    </section>
  );
}

function App() {
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("day");
  const [jobs, setJobs] = useState([]);
  const [global, setGlobalState] = useState([]);
  const [tasks, setTaskState] = useState([]);
  const [notes, setNotesState] = useState([]);
  const [dialogJob, setDialogJob] = useState(undefined);
  const [query, setQuery] = useState("");
  const [ramp, setRamp] = useState(null);

  async function refresh() {
    setJobs(await listDate(date));
    setGlobalState(await listGlobal());
    setTaskState(await listTasks());
    setNotesState(await listNotes());
  }

  useEffect(() => { seedLocal().then(refresh); }, []);
  useEffect(() => { refresh(); }, [date]);
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel("jobs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, refresh)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [date]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysISO(date, i));
  const waiting = global.filter(j => j.card_type === "waiting" || j.technician === "Waiting");
  const unallocated = global.filter(j => j.card_type !== "waiting" && j.technician !== "Waiting");
  const techJobs = tech => jobs.filter(j => j.technician === tech && !j.archived);
  const searchRows = [...jobs, ...global].filter(j => `${j.registration} ${j.vehicle} ${j.work_required} ${j.customer_note}`.toUpperCase().includes(query.toUpperCase()));
  const rampRows = jobs.filter(j => j.ramp === ramp);

  function dragStart(e, job, fromDate = date) {
    e.dataTransfer.setData("application/json", JSON.stringify({ id: job.id, fromDate }));
  }

  async function dropTech(e, tech) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
    const found = [...jobs, ...global].find(j => j.id === data.id);
    if (found) await saveJob({ ...found, technician: tech, card_type: "job", booking_date: date }, date);
    refresh();
  }

  async function dropDate(e, targetDate) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
    const found = [...global, ...localDate(data.fromDate || date)].find(j => j.id === data.id);
    if (found) await saveJob({ ...found, booking_date: targetDate, technician: found.technician === "Unallocated" || found.technician === "Waiting" ? "Jordan" : found.technician, card_type: "job" }, targetDate);
    refresh();
  }

  return (
    <div>
      <header>
        <div><h1>Vecta Planner</h1><small>{supabase ? "Cloud mode" : "Local demo mode"}</small></div>
        <div>
          <button onClick={() => setMode("dashboard")}><LayoutDashboard size={16} />Dashboard</button>
          <button onClick={() => setMode("week")}><CalendarRange size={16} />7 Days</button>
          <button onClick={() => setMode("day")}><CalendarDays size={16} />Day</button>
          <button onClick={() => setMode("month")}>Month</button>
          <button onClick={() => setDialogJob(null)}><Plus size={16} />Add Job</button>
          <button onClick={() => window.print()}><Printer size={16} />Print</button>
        </div>
      </header>
      <main>
        <section className="toolbar">
          <button className="secondary" onClick={() => setDate(addDaysISO(date, -1))}>‹ Previous</button>
          <button className="secondary" onClick={() => setDate(todayISO())}>Today</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="secondary" onClick={() => setDate(addDaysISO(date, 1))}>Next ›</button>
          <div className="search"><Search size={16} /><input placeholder="Search reg/customer..." value={query} onChange={e => setQuery(e.target.value)} /></div>
        </section>

        {query && <section className="results">{searchRows.map(j => <button key={j.id} onClick={() => setDialogJob(j)}><b>{j.registration}</b> {j.work_required}</button>)}</section>}

        <RampUtil jobs={jobs} onRamp={setRamp} />
        {(mode === "dashboard" || mode === "week") && <WeekUtil dates={weekDates} />}

        {mode === "dashboard" && (
          <section className="dashboard"><h2>Workshop Health</h2><div className="metrics">
            <div><b>{jobs.length}</b><span>Today's Jobs</span></div>
            <div><b>{unallocated.length}</b><span>Unallocated</span></div>
            <div><b>{waiting.length}</b><span>Waiting Jobs</span></div>
            <div><b>{jobs.filter(j => j.status === "ready_to_invoice").length}</b><span>Ready to Invoice</span></div>
          </div></section>
        )}

        {mode === "week" && (
          <section className="week">{weekDates.map(d => (
            <div key={d} className={`day ${isWeekend(d) ? "weekend" : ""} ${d === date ? "active" : ""}`} onDragOver={e => e.preventDefault()} onDrop={e => dropDate(e, d)}>
              <div className="dayHead"><b>{shortDate(d)}</b><button onClick={() => { setDate(d); setMode("day"); }}>Open</button></div>
              <small>{localDate(d).length} jobs{isWeekend(d) ? " • Closed" : ""}</small>
              {localDate(d).map(j => <div key={j.id} className={`mini ${RAMP_CLASS[j.ramp] || ""}`} draggable onDragStart={e => dragStart(e, j, d)}><b>{j.registration}</b>{j.drop_time && <span>{String(j.drop_time).slice(0, 5)}</span>}<small>{j.technician}</small></div>)}
            </div>
          ))}</section>
        )}

        {mode === "month" && <section className="month">{Array.from({ length: 35 }, (_, i) => addDaysISO(monthStartISO(date), i)).map(d => <button key={d} className={`monthDay ${isWeekend(d) ? "weekend" : ""}`} onClick={() => { setDate(d); setMode("day"); }}><b>{new Date(`${d}T00:00:00`).getDate()}</b><span>{localDate(d).length} jobs</span></button>)}</section>}

        {mode === "day" && (
          <>
            <section className="printTitle"><b>DAILY WORKSHOP PLANNER</b><span>{friendlyDate(date)}</span></section>
            <section className="layout">
              <aside className="side">
                <section><h2>New / Unallocated</h2><div className="sideDrop">{unallocated.map(j => <JobCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} />)}</div></section>
                <section><h2>Waiting Jobs</h2><div className="sideDrop">{waiting.map(j => <JobCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} />)}</div></section>
                <Notes notes={notes} onSave={async n => { await saveNote(n); refresh(); }} onDelete={async id => { await deleteNote(id); refresh(); }} />
              </aside>
              <section className="board twoMechanics">
                {TECHS.map(t => <div key={t} className="tech large"><h2>{t}</h2><div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => dropTech(e, t)}>{techJobs(t).map(j => <JobCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} />)}</div></div>)}
                <Tasks tasks={tasks} onSave={async t => { await saveTask(t); refresh(); }} onDelete={async id => { await deleteTask(id); refresh(); }} />
              </section>
            </section>
          </>
        )}

        {ramp && <div className="backdrop"><div className="dialog"><h2>{RAMP_LABEL[ramp]}</h2>{rampRows.map(j => <button key={j.id} className={`rampRow ${RAMP_CLASS[j.ramp]}`} onClick={() => { setRamp(null); setDialogJob(j); }}><b>{String(j.drop_time || "--:--").slice(0, 5)}</b><span>{j.registration}</span><small>{j.technician} — {j.work_required}</small></button>)}<button className="secondary" onClick={() => setRamp(null)}>Close</button></div></div>}
        {dialogJob !== undefined && <JobDialog job={dialogJob} date={date} onClose={() => setDialogJob(undefined)} onDelete={async id => { await deleteJob(id); setDialogJob(undefined); refresh(); }} onSave={async j => { await saveJob(j, date); setDialogJob(undefined); refresh(); }} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
