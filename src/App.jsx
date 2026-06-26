import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { CalendarDays, ChevronLeft, ChevronRight, Menu, Plus, Search, Printer } from "lucide-react";
import "./style.css";

const TECHS = ["Jordan", "Alfie"];
const RAMPS = ["Left", "Middle", "Right"];
const RAMP_LABEL = { Left: "RAMP 1", Middle: "RAMP 2", Right: "RAMP 3" };
const RAMP_CLASS = { Left: "ramp-left", Middle: "ramp-middle", Right: "ramp-right" };
const RAMP_CAPACITY = 8;

const DEFAULT_SETTINGS = {
  mechanics: [
    { name: "Jordan", capacity: 8 },
    { name: "Alfie", capacity: 8 }
  ],
  ramps: [
    { key: "Left", label: "Ramp 1", capacity: 8 },
    { key: "Middle", label: "Ramp 2", capacity: 8 },
    { key: "Right", label: "Ramp 3", capacity: 8 }
  ],
  statuses: ["In Progress", "Ready to Invoice", "Completed"],
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  jobTypes: [
    { group: "SERVICE", name: "Small Service", description: "Small Service", hours: 1.2, colour: "service" },
    { group: "SERVICE", name: "Interim Service", description: "Interim Service", hours: 1.5, colour: "service" },
    { group: "SERVICE", name: "Major Service", description: "Major Service", hours: 2.5, colour: "service" },
    { group: "BRAKES", name: "Front Pads", description: "Front Brake Pads", hours: 1.0, colour: "brakes" },
    { group: "BRAKES", name: "Rear Pads", description: "Rear Brake Pads", hours: 1.0, colour: "brakes" },
    { group: "BRAKES", name: "Front Discs & Pads", description: "Front Brake Discs & Pads", hours: 1.5, colour: "brakes" },
    { group: "BRAKES", name: "Rear Discs & Pads", description: "Rear Brake Discs & Pads", hours: 1.5, colour: "brakes" },
    { group: "BRAKES", name: "Front & Rear Brakes", description: "Front & Rear Brake Discs & Pads", hours: 3.0, colour: "brakes" },
    { group: "GENERAL", name: "MOT", description: "MOT", hours: 1.0, colour: "mot" },
    { group: "GENERAL", name: "Diagnostics", description: "Diagnostics", hours: 2.0, colour: "diagnostics" },
    { group: "GENERAL", name: "Clutch", description: "Clutch Replacement", hours: 6.0, colour: "bigjob" },
    { group: "GENERAL", name: "Timing Belt", description: "Timing Belt Replacement", hours: 4.5, colour: "bigjob" },
    { group: "GENERAL", name: "Suspension", description: "Suspension Work", hours: 2.0, colour: "suspension" },
    { group: "GENERAL", name: "Air Conditioning", description: "Air Conditioning Service / Repair", hours: 1.0, colour: "aircon" },
    { group: "GENERAL", name: "Other", description: "", hours: 1.0, colour: "other" }
  ]
};

const settingsKey = "vecta:settings:v1";

function loadLocalSettings() {
  return JSON.parse(localStorage.getItem(settingsKey) || JSON.stringify(DEFAULT_SETTINGS));
}

function saveLocalSettings(settings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

const STATUS = {
  in_progress: "In Progress",
  ready_to_invoice: "Ready to Invoice",
  completed: "Completed"
};

const JOB_TYPES = [
  { group: "SERVICE", name: "Small Service", description: "Small Service", hours: 1.2, colour: "service" },
  { group: "SERVICE", name: "Interim Service", description: "Interim Service", hours: 1.5, colour: "service" },
  { group: "SERVICE", name: "Major Service", description: "Major Service", hours: 2.5, colour: "service" },
  { group: "BRAKES", name: "Front Pads", description: "Front Brake Pads", hours: 1.0, colour: "brakes" },
  { group: "BRAKES", name: "Rear Pads", description: "Rear Brake Pads", hours: 1.0, colour: "brakes" },
  { group: "BRAKES", name: "Front Discs & Pads", description: "Front Brake Discs & Pads", hours: 1.5, colour: "brakes" },
  { group: "BRAKES", name: "Rear Discs & Pads", description: "Rear Brake Discs & Pads", hours: 1.5, colour: "brakes" },
  { group: "BRAKES", name: "Front & Rear Brakes", description: "Front & Rear Brake Discs & Pads", hours: 3.0, colour: "brakes" },
  { group: "GENERAL", name: "MOT", description: "MOT", hours: 1.0, colour: "mot" },
  { group: "GENERAL", name: "Diagnostics", description: "Diagnostics", hours: 2.0, colour: "diagnostics" },
  { group: "GENERAL", name: "Clutch", description: "Clutch Replacement", hours: 6.0, colour: "bigjob" },
  { group: "GENERAL", name: "Timing Belt", description: "Timing Belt Replacement", hours: 4.5, colour: "bigjob" },
  { group: "GENERAL", name: "Suspension", description: "Suspension Work", hours: 2.0, colour: "suspension" },
  { group: "GENERAL", name: "Air Conditioning", description: "Air Conditioning Service / Repair", hours: 1.0, colour: "aircon" },
  { group: "GENERAL", name: "Other", description: "", hours: 1.0, colour: "other" }
];

const JOB_TYPE_GROUPS = [...new Set(JOB_TYPES.map(j => j.group))];

function findJobType(name) {
  return JOB_TYPES.find(j => j.name === name) || JOB_TYPES[JOB_TYPES.length - 1];
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
}
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function friendlyDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}
function localKey(date) { return `vecta:v113:${date}`; }
const globalKey = "vecta:v113:global";
const tasksKey = "vecta:v113:tasks";
const notesKey = "vecta:v113:notes";

function readLS(key) { return JSON.parse(localStorage.getItem(key) || "[]"); }
function writeLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

async function seedLocal() {
  if (supabase) return;
  const date = todayISO();

  if (!localStorage.getItem(localKey(date))) {
    writeLS(localKey(date), [
      {
        id: uuid(),
        booking_date: date,
        registration: "AJ68 LZD",
        vehicle: "Nissan Qashqai",
        work_required: "Major Service",
        drop_time: "08:00",
        technician: "Jordan",
        ramp: "Left",
        status: "in_progress",
        job_type: "Major Service",
        estimated_hours: 2.5
      },
      {
        id: uuid(),
        booking_date: date,
        registration: "BT19 KLM",
        vehicle: "Ford Focus",
        work_required: "Clutch Replacement",
        drop_time: "11:00",
        technician: "Jordan",
        ramp: "Left",
        status: "in_progress",
        job_type: "Clutch",
        estimated_hours: 2
      },
      {
        id: uuid(),
        booking_date: date,
        registration: "DP20 VWX",
        vehicle: "Mercedes C Class",
        work_required: "Diagnostics",
        drop_time: "14:00",
        technician: "Jordan",
        ramp: "Middle",
        status: "in_progress",
        job_type: "Diagnostics",
        estimated_hours: 1.5
      },
      {
        id: uuid(),
        booking_date: date,
        registration: "KV70 UOS",
        vehicle: "BMW 2 Series",
        work_required: "Brake Discs & Pads",
        drop_time: "08:30",
        technician: "Alfie",
        ramp: "Right",
        status: "in_progress",
        job_type: "Front & Rear Brakes",
        estimated_hours: 4
      },
      {
        id: uuid(),
        booking_date: date,
        registration: "FD22 PQR",
        vehicle: "Audi A4",
        work_required: "Diagnostics",
        drop_time: "13:00",
        technician: "Alfie",
        ramp: "Right",
        status: "in_progress",
        job_type: "Diagnostics",
        estimated_hours: 2
      },
      {
        id: uuid(),
        booking_date: date,
        registration: "YP69 STU",
        vehicle: "Range Rover Evoque",
        work_required: "Service + MOT",
        drop_time: "15:30",
        technician: "Alfie",
        ramp: "Right",
        status: "in_progress",
        job_type: "Minor Service",
        estimated_hours: 2
      }
    ]);
  }

  if (!localStorage.getItem(globalKey)) {
    writeLS(globalKey, [
      {
        id: uuid(),
        card_type: "job",
        registration: "NU18 REG",
        vehicle: "Nissan Qashqai",
        work_required: "Major Service",
        customer_note: "Customer waiting",
        technician: "Unallocated",
        status: "in_progress",
        estimated_hours: 2.5,
        job_type: "Major Service"
      },
      {
        id: uuid(),
        card_type: "job",
        registration: "FV67 ABC",
        vehicle: "Ford Transit",
        work_required: "Clutch Replacement",
        customer_note: "Customer waiting",
        technician: "Unallocated",
        status: "in_progress",
        estimated_hours: 5,
        job_type: "Clutch"
      },
      {
        id: uuid(),
        card_type: "waiting",
        registration: "YG19 DEF",
        vehicle: "Vauxhall Astra",
        work_required: "Brake Pads Fitted",
        customer_note: "Waiting for collection",
        technician: "Waiting",
        status: "work_complete",
        estimated_hours: 1
      }
    ]);
  }

  if (!localStorage.getItem(tasksKey)) {
    writeLS(tasksKey, [
      { id: uuid(), task_text: "Order brake pads for Transit", done: false },
      { id: uuid(), task_text: "Print invoices for today's work", done: false },
      { id: uuid(), task_text: "Check stock levels — oil, filters, bulbs", done: false }
    ]);
  }

  if (!localStorage.getItem(notesKey)) {
    writeLS(notesKey, [{ id: uuid(), note_text: "Add notes, reminders or anything important for today." }]);
  }
}

async function listDate(date) {
  if (supabase) {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("booking_date", date)
      .eq("archived", false)
      .neq("technician", "Unallocated")
      .neq("technician", "Waiting")
      .order("drop_time");
    if (error) throw error;
    return data || [];
  }
  return readLS(localKey(date)).filter(j => !j.archived && j.technician !== "Unallocated" && j.technician !== "Waiting");
}

async function listGlobal() {
  if (supabase) {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .is("booking_date", null)
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return readLS(globalKey);
}

async function listTasks() {
  if (supabase) {
    const { data, error } = await supabase.from("tasks").select("*").eq("done", false).order("created_at");
    if (error) throw error;
    return data || [];
  }
  return readLS(tasksKey).filter(t => !t.done);
}

async function listNotes() {
  if (supabase) {
    try {
      const { data } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
      return data || [];
    } catch {
      return [];
    }
  }
  return readLS(notesKey);
}

async function saveJob(job, date) {
  const payload = {
    ...job,
    id: job.id || uuid(),
    registration: (job.registration || "").toUpperCase()
  };

  if (payload.status === "archived") payload.archived = true;
  if (payload.technician === "Unallocated" || payload.technician === "Waiting" || payload.card_type === "waiting") {
    payload.booking_date = null;
  } else {
    payload.booking_date = payload.booking_date || date;
  }

  if (supabase) {
    const { error } = await supabase.from("jobs").upsert(payload);
    if (error) {
      alert(error.message);
      throw error;
    }
    return;
  }

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("vecta:v113:") && key !== globalKey && key !== tasksKey && key !== notesKey) {
      writeLS(key, readLS(key).filter(j => j.id !== payload.id));
    }
  }

  writeLS(globalKey, readLS(globalKey).filter(j => j.id !== payload.id));
  if (payload.booking_date) writeLS(localKey(payload.booking_date), [...readLS(localKey(payload.booking_date)), payload]);
  else writeLS(globalKey, [...readLS(globalKey), payload]);
}

async function deleteJob(id) {
  if (supabase) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) throw error;
    return;
  }

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("vecta:v113:")) writeLS(key, readLS(key).filter(x => x.id !== id));
  }
}

async function saveTask(task) {
  const payload = { ...task, id: task.id || uuid(), done: false };
  if (supabase) {
    const { error } = await supabase.from("tasks").upsert(payload);
    if (error) {
      alert(error.message);
      throw error;
    }
    return;
  }
  writeLS(tasksKey, [...readLS(tasksKey).filter(t => t.id !== payload.id), payload]);
}

async function deleteTask(id) {
  if (supabase) {
    const { error } = await supabase.from("tasks").update({ done: true }).eq("id", id);
    if (error) throw error;
    return;
  }
  writeLS(tasksKey, readLS(tasksKey).filter(t => t.id !== id));
}

async function saveNote(note) {
  const payload = { ...note, id: note.id || uuid() };
  if (supabase) {
    const { error } = await supabase.from("notes").upsert(payload);
    if (error) {
      alert(error.message);
      throw error;
    }
    return;
  }
  writeLS(notesKey, [...readLS(notesKey).filter(n => n.id !== payload.id), payload]);
}

async function deleteNote(id) {
  if (supabase) {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  writeLS(notesKey, readLS(notesKey).filter(n => n.id !== id));
}

function hoursForRamp(jobs, ramp) {
  return jobs.filter(j => j.ramp === ramp).reduce((sum, j) => sum + Number(j.estimated_hours || 1), 0);
}

function RampUtilisation({ jobs, onRamp }) {
  return (
    <section className="ramp-strip">
      <div className="ramp-title">RAMP UTILISATION</div>
      {RAMPS.map(ramp => {
        const hours = hoursForRamp(jobs, ramp);
        const pct = Math.min(100, Math.round((hours / RAMP_CAPACITY) * 100));
        const colour = pct >= 86 ? "danger" : pct >= 61 ? "warning" : "good";
        return (
          <button key={ramp} className={`ramp-summary ${colour}`} onClick={() => onRamp(ramp)}>
            <strong>{RAMP_LABEL[ramp]}</strong>
            <div className="progress"><i style={{ width: `${pct}%` }} /></div>
            <span>{hours.toFixed(1)} / {RAMP_CAPACITY}.0 hrs</span>
          </button>
        );
      })}
      <div className="legend"><span className="dot good" />0 - 60% <span className="dot warning" />61 - 85% <span className="dot danger" />86 - 100%</div>
    </section>
  );
}

function SmallJobCard({ job, onEdit, onDragStart }) {
  return (
    <div className={`small-card ${RAMP_CLASS[job.ramp] || "ramp-left"}`} draggable onDragStart={e => onDragStart(e, job)} onDoubleClick={() => onEdit(job)}>
      <div className="small-card-top">
        <b>{job.registration || "NO REG"}</b>
        <span>{job.vehicle || ""}</span>
      </div>
      <p>{job.work_required || ""}</p>
      {job.customer_name && <small>{job.customer_name} · {job.customer_phone}</small>}
      <div className="small-card-bottom">
        <span>{job.customer_note || ""}</span>
        <em>Est: {Number(job.estimated_hours || 1).toFixed(1)} hrs</em>
      </div>
    </div>
  );
}

function ScheduleCard({ job, onEdit, onDragStart, onHistory }) {
  return (
    <div className={`schedule-card ${RAMP_CLASS[job.ramp] || ""} status-${job.status}`} draggable onDragStart={e => onDragStart(e, job)} onDoubleClick={() => onEdit(job)}>
      <div className="card-actions"><button title="History" onClick={(e)=>{e.stopPropagation(); onHistory(job)}}><History size={14}/></button></div>
      <strong>{job.registration || "NO REG"}</strong>
      <h4>{job.vehicle || ""}</h4>
      <p>{job.work_required || ""}</p>
      {job.customer_name && <small>{job.customer_name} · {job.customer_phone}</small>}
      <span>{job.drop_time ? String(job.drop_time).slice(0, 5) : "--:--"} · {Number(job.estimated_hours || 1).toFixed(1)} hrs</span>
    </div>
  );
}


function JobDialog({ job, date, jobTypes = JOB_TYPES, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(job || {});

  useEffect(() => {
    setForm(job || {
      id: "",
      card_type: "job",
      registration: "",
      customer_name: "",
      customer_phone: "",
      vehicle: "",
      work_required: "",
      customer_note: "",
      drop_time: "",
      technician: "Unallocated",
      ramp: "",
      status: "in_progress",
      job_type: "Other",
      estimated_hours: 1,
      job_colour: "other"
    });
  }, [job]);

  function update(field, value) {
    if (field === "registration") value = value.toUpperCase();
    setForm(f => ({ ...f, [field]: value }));
  }

  function applyQuickJob(typeName) {
    const selected = findJobType(typeName);
    setForm(f => ({
      ...f,
      job_type: selected.name,
      work_required: selected.description || f.work_required,
      estimated_hours: selected.hours,
      job_colour: selected.colour
    }));
  }

  function validateAndSave() {
    const required = [
      ["registration", "Registration"],
      ["customer_name", "Customer name"],
      ["customer_phone", "Phone number"],
      ["vehicle", "Vehicle"],
      ["work_required", "Work required"],
      ["technician", "Technician"],
      ["estimated_hours", "Estimated hours"]
    ];

    for (const [field, label] of required) {
      if (!String(form[field] || "").trim()) {
        alert(`${label} is required.`);
        return;
      }
    }

    onSave({ ...form, id: form.id || uuid() });
  }

  return (
    <div className="backdrop">
      <div className="dialog wide-dialog">
        <h2>{form.id ? "Edit Job" : "Add Job"}</h2>

        <div className="quick-job-area">
          <h3>Quick Job Buttons</h3>
          {[...new Set(jobTypes.map(j => j.group))].map(group => (
            <div className="quick-group" key={group}>
              <strong>{group}</strong>
              <div>
                {jobTypes.filter(j => j.group === group).map(j => (
                  <button key={j.name} type="button" className={`quick-job ${j.colour}`} onClick={() => applyQuickJob(j.name)}>
                    {j.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="two">
          <label>Registration *
            <input autoFocus value={form.registration || ""} onChange={e => update("registration", e.target.value)} />
          </label>
          <label>Vehicle *
            <input value={form.vehicle || ""} onChange={e => update("vehicle", e.target.value)} />
          </label>
        </div>

        <div className="two">
          <label>Customer name *
            <input value={form.customer_name || ""} onChange={e => update("customer_name", e.target.value)} />
          </label>
          <label>Phone number *
            <input value={form.customer_phone || ""} onChange={e => update("customer_phone", e.target.value)} />
          </label>
        </div>

        <label>Work required *
          <textarea value={form.work_required || ""} onChange={e => update("work_required", e.target.value)} />
        </label>

        <div className="three">
          <label>Status
            <select value={form.status || "in_progress"} onChange={e => update("status", e.target.value)}>
              {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Estimated Hours *
            <input type="number" step="0.5" value={form.estimated_hours || 1} onChange={e => update("estimated_hours", Number(e.target.value))} />
          </label>
          <label>Drop-off
            <input type="time" value={String(form.drop_time || "").slice(0, 5)} onChange={e => update("drop_time", e.target.value)} />
          </label>
        </div>

        <div className="three">
          <label>Technician *
            <select value={form.technician || "Unallocated"} onChange={e => update("technician", e.target.value)}>
              <option>Unallocated</option>
              <option>Waiting</option>
              {settings.mechanics.map(m => <option key={m.name}>{m.name}</option>)}
            </select>
          </label>
          <label>Ramp
            <select value={form.ramp || ""} onChange={e => update("ramp", e.target.value)}>
              <option value="">No ramp</option>
              {RAMPS.map(r => <option key={r} value={r}>{RAMP_LABEL[r]}</option>)}
            </select>
          </label>
          <label>Card Type
            <select value={form.card_type || "job"} onChange={e => update("card_type", e.target.value)}>
              <option value="job">Job</option>
              <option value="waiting">Waiting Job</option>
            </select>
          </label>
        </div>

        <label>Notes
          <input value={form.customer_note || ""} onChange={e => update("customer_note", e.target.value)} />
        </label>

        <div className="dialog-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          {form.id && <button className="danger-button" onClick={() => onDelete(form.id)}>Delete</button>}
          <button onClick={validateAndSave}>Save</button>
        </div>
      </div>
    </div>
  );
}


function NotesPanel({ notes, onSave, onDelete }) {
  const [text, setText] = useState("");

  return (
    <section className="notes-panel">
      <h3>Notes</h3>
      <textarea placeholder="Add notes, reminders or anything important for today..." value={text} onChange={e => setText(e.target.value)} />
      <button onClick={() => { if (text.trim()) { onSave({ id: uuid(), note_text: text.trim() }); setText(""); } }}>Add Note</button>
      {notes.map(n => <div className="note-row" key={n.id}><span>{n.note_text}</span><button onClick={() => onDelete(n.id)}>×</button></div>)}
    </section>
  );
}

function TasksPanel({ tasks, onSave, onDelete }) {
  const [text, setText] = useState("");

  return (
    <section className="tasks-panel">
      <div className="tasks-head">
        <h3>Tasks</h3>
        <button onClick={() => { if (text.trim()) { onSave({ id: uuid(), task_text: text.trim(), done: false }); setText(""); } }}>+ Add Task</button>
      </div>
      <input placeholder="Add task..." value={text} onChange={e => setText(e.target.value)} />
      <div className="task-grid">
        {tasks.map(t => <label key={t.id} className="task-row"><input type="checkbox" onChange={() => onDelete(t.id)} /> {t.task_text}</label>)}
      </div>
    </section>
  );
}



function AvailabilityPanel({ jobs, settings, onClose, onAddJob }) {
  const [jobTypeName, setJobTypeName] = useState(settings.jobTypes?.[0]?.name || "MOT");
  const selected = settings.jobTypes.find(j => j.name === jobTypeName) || settings.jobTypes[0];
  const hoursNeeded = Number(selected?.hours || 1);

  const mechanicRows = settings.mechanics.map(m => {
    const used = jobs.filter(j => j.technician === m.name).reduce((s, j) => s + Number(j.estimated_hours || 1), 0);
    return { ...m, used, free: Math.max(0, Number(m.capacity || 8) - used) };
  });

  const rampRows = settings.ramps.map(r => {
    const used = jobs.filter(j => j.ramp === r.key).reduce((s, j) => s + Number(j.estimated_hours || 1), 0);
    return { ...r, used, free: Math.max(0, Number(r.capacity || 8) - used) };
  });

  const bestMechanic = [...mechanicRows].sort((a,b)=>b.free-a.free)[0];
  const bestRamp = [...rampRows].sort((a,b)=>b.free-a.free)[0];
  const canFit = bestMechanic?.free >= hoursNeeded && bestRamp?.free >= hoursNeeded;

  return (
    <div className="backdrop">
      <div className="dialog availability-dialog">
        <h2>Find Availability</h2>
        <p className="muted">Quick check for whether today can take another job.</p>

        <label>Job Type
          <select value={jobTypeName} onChange={e => setJobTypeName(e.target.value)}>
            {settings.jobTypes.map(j => <option key={j.name}>{j.name}</option>)}
          </select>
        </label>

        <div className={`availability-result ${canFit ? "good" : "bad"}`}>
          <strong>{canFit ? "Can fit today" : "Today is tight"}</strong>
          <span>{selected?.name} needs about {hoursNeeded.toFixed(1)} hrs</span>
          {bestMechanic && bestRamp && (
            <em>Best option: {bestMechanic.name} on {bestRamp.label}</em>
          )}
        </div>

        <div className="availability-grid">
          <section>
            <h3>Mechanics</h3>
            {mechanicRows.map(m => (
              <div key={m.name} className="capacity-row">
                <b>{m.name}</b>
                <span>{m.used.toFixed(1)} used / {m.capacity} hrs</span>
                <em>{m.free.toFixed(1)} hrs free</em>
              </div>
            ))}
          </section>
          <section>
            <h3>Ramps</h3>
            {rampRows.map(r => (
              <div key={r.key} className="capacity-row">
                <b>{r.label}</b>
                <span>{r.used.toFixed(1)} used / {r.capacity} hrs</span>
                <em>{r.free.toFixed(1)} hrs free</em>
              </div>
            ))}
          </section>
        </div>

        <div className="dialog-actions">
          <button className="secondary" onClick={onClose}>Close</button>
          <button onClick={() => onAddJob(selected, bestMechanic, bestRamp)}>Create Booking From This</button>
        </div>
      </div>
    </div>
  );
}

function VehicleHistoryPanel({ job, allJobs, onClose }) {
  const reg = job?.registration || "";
  const matches = allJobs.filter(j => (j.registration || "").toUpperCase() === reg.toUpperCase());

  return (
    <div className="backdrop">
      <div className="dialog history-dialog">
        <h2>Vehicle History</h2>
        <div className="history-title">
          <strong>{reg || "No Registration"}</strong>
          <span>{job?.vehicle || ""}</span>
          <em>{job?.customer_name || ""} {job?.customer_phone ? "· " + job.customer_phone : ""}</em>
        </div>

        <h3>Previous / Current Visits</h3>
        {matches.length === 0 && <p className="muted">No history yet. Future completed jobs will appear here.</p>}
        {matches.map(j => (
          <div className="history-row" key={j.id}>
            <b>{j.registration}</b>
            <span>{j.work_required}</span>
            <em>{j.status || "In Progress"} · {j.estimated_hours || 1} hrs</em>
          </div>
        ))}

        <h3>Notes</h3>
        <p className="muted">{job?.customer_note || "No notes yet."}</p>

        <h3>Invoices</h3>
        <p className="muted">Invoice links will be shown here once invoicing integration is added.</p>

        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}


function SettingsPanel({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);

  function updateMechanic(index, field, value) {
    setDraft(s => {
      const mechanics = [...s.mechanics];
      mechanics[index] = { ...mechanics[index], [field]: field === "capacity" ? Number(value) : value };
      return { ...s, mechanics };
    });
  }

  function updateRamp(index, field, value) {
    setDraft(s => {
      const ramps = [...s.ramps];
      ramps[index] = { ...ramps[index], [field]: field === "capacity" ? Number(value) : value };
      return { ...s, ramps };
    });
  }

  function updateJobType(index, field, value) {
    setDraft(s => {
      const jobTypes = [...s.jobTypes];
      jobTypes[index] = { ...jobTypes[index], [field]: field === "hours" ? Number(value) : value };
      return { ...s, jobTypes };
    });
  }

  function addJobType() {
    setDraft(s => ({
      ...s,
      jobTypes: [...s.jobTypes, { group: "GENERAL", name: "New Job Type", description: "New Job Type", hours: 1, colour: "other" }]
    }));
  }

  function removeJobType(index) {
    setDraft(s => ({ ...s, jobTypes: s.jobTypes.filter((_, i) => i !== index) }));
  }

  function addMechanic() {
    setDraft(s => ({ ...s, mechanics: [...s.mechanics, { name: "New Mechanic", capacity: 8 }] }));
  }

  function removeMechanic(index) {
    setDraft(s => ({ ...s, mechanics: s.mechanics.filter((_, i) => i !== index) }));
  }

  return (
    <div className="backdrop">
      <div className="dialog settings-dialog">
        <h2>Workshop Settings</h2>

        <section className="settings-section">
          <h3>Mechanics & Daily Capacity</h3>
          {draft.mechanics.map((m, i) => (
            <div className="settings-row" key={i}>
              <input value={m.name} onChange={e => updateMechanic(i, "name", e.target.value)} />
              <input type="number" step="0.5" value={m.capacity} onChange={e => updateMechanic(i, "capacity", e.target.value)} />
              <button className="secondary" onClick={() => removeMechanic(i)}>Remove</button>
            </div>
          ))}
          <button className="secondary" onClick={addMechanic}>+ Add Mechanic</button>
        </section>

        <section className="settings-section">
          <h3>Ramps & Daily Capacity</h3>
          {draft.ramps.map((r, i) => (
            <div className="settings-row" key={r.key}>
              <input value={r.label} onChange={e => updateRamp(i, "label", e.target.value)} />
              <input type="number" step="0.5" value={r.capacity} onChange={e => updateRamp(i, "capacity", e.target.value)} />
            </div>
          ))}
        </section>

        <section className="settings-section">
          <h3>Job Types & Default Hours</h3>
          <div className="job-type-settings">
            {draft.jobTypes.map((j, i) => (
              <div className="job-type-row" key={`${j.name}-${i}`}>
                <input value={j.group} onChange={e => updateJobType(i, "group", e.target.value.toUpperCase())} />
                <input value={j.name} onChange={e => updateJobType(i, "name", e.target.value)} />
                <input value={j.description} onChange={e => updateJobType(i, "description", e.target.value)} />
                <input type="number" step="0.5" value={j.hours} onChange={e => updateJobType(i, "hours", e.target.value)} />
                <button className="secondary" onClick={() => removeJobType(i)}>×</button>
              </div>
            ))}
          </div>
          <button className="secondary" onClick={addJobType}>+ Add Job Type</button>
        </section>

        <section className="settings-section">
          <h3>Working Days</h3>
          <input
            value={draft.workingDays.join(", ")}
            onChange={e => setDraft(s => ({ ...s, workingDays: e.target.value.split(",").map(x => x.trim()).filter(Boolean) }))}
          />
        </section>

        <div className="dialog-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(draft)}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}


function App() {
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("day");
  const [jobs, setJobs] = useState([]);
  const [globalJobs, setGlobalJobs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [dialogJob, setDialogJob] = useState(undefined);
  const [query, setQuery] = useState("");
  const [rampModal, setRampModal] = useState(null);
  const [settings, setSettings] = useState(loadLocalSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [historyJob, setHistoryJob] = useState(null);

  const mechanicNames = settings.mechanics.map(m => m.name);
  const jobTypes = settings.jobTypes;
  const jobTypeGroups = [...new Set(jobTypes.map(j => j.group))];
  const rampSettings = settings.ramps;
  const rampLabelByKey = Object.fromEntries(rampSettings.map(r => [r.key, r.label]));
  const rampCapacityByKey = Object.fromEntries(rampSettings.map(r => [r.key, r.capacity]));

  function saveSettings(updated) {
    saveLocalSettings(updated);
    setSettings(updated);
    setSettingsOpen(false);
  }

  async function refresh() {
    setJobs(await listDate(date));
    setGlobalJobs(await listGlobal());
    setTasks(await listTasks());
    setNotes(await listNotes());
  }

  useEffect(() => { seedLocal().then(refresh); }, []);
  useEffect(() => { refresh(); }, [date]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("vecta-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [date]);

  const waiting = globalJobs.filter(j => j.card_type === "waiting" || j.technician === "Waiting");
  const unallocated = globalJobs.filter(j => j.card_type !== "waiting" && j.technician !== "Waiting");
  const techJobs = tech => jobs.filter(j => j.technician === tech && !j.archived);
  const searchRows = [...jobs, ...globalJobs].filter(j => `${j.registration} ${j.vehicle} ${j.work_required} ${j.customer_note} ${j.customer_name} ${j.customer_phone}`.toUpperCase().includes(query.toUpperCase()));
  const rampRows = rampModal ? jobs.filter(j => j.ramp === rampModal) : [];

  function dragStart(e, job, fromDate = date) {
    e.dataTransfer.setData("application/json", JSON.stringify({ id: job.id, fromDate }));
  }

  async function dropOnTech(e, tech) {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
    const found = [...jobs, ...globalJobs].find(j => j.id === data.id);
    if (found) await saveJob({ ...found, technician: tech, card_type: "job", booking_date: date }, date);
    refresh();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <Menu size={20} />
          <div className="brand"><span>VECTA</span><b>PLANNER</b></div>
        </div>

        <div className="date-nav">
          <button onClick={() => setDate(addDaysISO(date, -1))}><ChevronLeft size={18} /></button>
          <div className="date-pill"><CalendarDays size={17} /> {friendlyDate(date)}</div>
          <button onClick={() => setDate(addDaysISO(date, 1))}><ChevronRight size={18} /></button>
        </div>

        <div className="top-actions">
          <button onClick={() => setDate(todayISO())}>Today</button>
          <button onClick={() => window.print()}><Printer size={16} /> Print</button>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="day">Day</option>
            <option value="dashboard">Dashboard</option>
          </select>
          <button onClick={() => setAvailabilityOpen(true)}><Wand2 size={16} /> Find Availability</button><button onClick={() => setSettingsOpen(true)}><Settings size={16} /> Settings</button><button onClick={() => setDialogJob(null)}><Plus size={16} /> Add Job</button>
        </div>
      </header>

      <RampUtilisation jobs={jobs} onRamp={setRampModal} />

      <div className="planner-layout">
        <aside className="left-panel">
          <section>
            <h3>Unallocated Jobs <span>{unallocated.length}</span></h3>
            <div className="panel-list">
              {unallocated.map(j => <SmallJobCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} />)}
            </div>
          </section>

          <section>
            <h3>Waiting Jobs <span>{waiting.length}</span></h3>
            <div className="panel-list waiting">
              {waiting.map(j => <SmallJobCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} />)}
            </div>
          </section>

          <NotesPanel notes={notes} onSave={async n => { await saveNote(n); refresh(); }} onDelete={async id => { await deleteNote(id); refresh(); }} />
        </aside>

        <main className="main-board">
          <div className="board-tools">
            <div className="search-box"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search registration..." /></div>
            {query && <div className="search-results">{searchRows.map(j => <button key={j.id} onClick={() => setDialogJob(j)}>{j.registration} — {j.work_required}</button>)}</div>}
          </div>

          <section className="schedule">
            <div className="time-rail">
              {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"].map(t => <span key={t}>{t}</span>)}
            </div>

            {mechanicNames.map(tech => {
              const hours = techJobs(tech).reduce((s, j) => s + Number(j.estimated_hours || 1), 0);
              return (
                <section className="tech-column" key={tech}>
                  <div className="tech-head">
                    <div className="avatar">{tech[0]}</div>
                    <div><h2>{tech}</h2><span>{hours.toFixed(1)} / 8.0 hrs</span></div>
                  </div>

                  <div className="job-stack" onDragOver={e => e.preventDefault()} onDrop={e => dropOnTech(e, tech)}>
                    {techJobs(tech).map(j => <ScheduleCard key={j.id} job={j} onEdit={setDialogJob} onDragStart={dragStart} onHistory={setHistoryJob} />)}
                  </div>
                </section>
              );
            })}
          </section>

          <TasksPanel tasks={tasks} onSave={async t => { await saveTask(t); refresh(); }} onDelete={async id => { await deleteTask(id); refresh(); }} />
        </main>
      </div>

      {availabilityOpen && <AvailabilityPanel
          jobs={jobs}
          settings={settings}
          onClose={() => setAvailabilityOpen(false)}
          onAddJob={(selected, mech, ramp) => {
            setAvailabilityOpen(false);
            setDialogJob({
              id: "",
              card_type: "job",
              registration: "",
              customer_name: "",
              customer_phone: "",
              vehicle: "",
              work_required: selected?.description || selected?.name || "",
              technician: mech?.name || "Unallocated",
              ramp: ramp?.key || "",
              status: "in_progress",
              job_type: selected?.name || "Other",
              estimated_hours: selected?.hours || 1,
              job_colour: selected?.colour || "other"
            });
          }}
        />}

      {historyJob && <VehicleHistoryPanel job={historyJob} allJobs={[...jobs, ...globalJobs]} onClose={() => setHistoryJob(null)} />}

      {settingsOpen && <SettingsPanel settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />}

      {rampModal && (
        <div className="backdrop">
          <div className="dialog">
            <h2>{RAMP_LABEL[rampModal]}</h2>
            {rampRows.length === 0 && <p>No jobs on this ramp.</p>}
            {rampRows.map(j => <button className={`ramp-modal-row ${RAMP_CLASS[j.ramp]}`} key={j.id} onClick={() => { setRampModal(null); setDialogJob(j); }}>{j.drop_time || "--:--"} — {j.registration} — {j.technician}</button>)}
            <button onClick={() => setRampModal(null)}>Close</button>
          </div>
        </div>
      )}

      {dialogJob !== undefined && <JobDialog job={dialogJob} date={date} jobTypes={settings.jobTypes} onClose={() => setDialogJob(undefined)} onDelete={async id => { await deleteJob(id); setDialogJob(undefined); refresh(); }} onSave={async j => { await saveJob(j, date); setDialogJob(undefined); refresh(); }} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
