// ===== Storage keys =====
const CREDS_KEY = "mp_creds_v1";
const RUNS_KEY = "mp_runs_v1";
const SESSION_KEY = "mp_session_v1";

// ===== Helpers =====
function $(id) { return document.getElementById(id); }
function nowLocalDatetimeValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function loadCreds() {
  const raw = localStorage.getItem(CREDS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveCreds(username, passHashHex) {
  localStorage.setItem(CREDS_KEY, JSON.stringify({ username, passHashHex }));
}

function loadRuns() {
  const raw = localStorage.getItem(RUNS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveRuns(runs) {
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

function setSession(isLoggedIn) {
  sessionStorage.setItem(SESSION_KEY, isLoggedIn ? "1" : "0");
}

function getSession() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

// SHA-256 hashing (Web Crypto)
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function computeTotal(base, penalty, bonus) {
  return (base | 0) - (penalty | 0) + (bonus | 0);
}

function show(sectionId) {
  $("loginSection").classList.add("hidden");
  $("appSection").classList.add("hidden");
  $(sectionId).classList.remove("hidden");
}

// ===== Login =====
$("setCredsBtn").addEventListener("click", async () => {
  const u = $("username").value.trim();
  const p = $("password").value;
  if (!u || !p) {
    $("loginMsg").textContent = "Enter a username and password first.";
    return;
  }
  const hash = await sha256Hex(p);
  saveCreds(u, hash);
  $("loginMsg").textContent = "Login saved. Now press Log in.";
});

$("loginBtn").addEventListener("click", async () => {
  const creds = loadCreds();
  if (!creds) {
    $("loginMsg").textContent = "No login set yet. Enter username/password and click Set/Change Login.";
    return;
  }

  const u = $("username").value.trim();
  const p = $("password").value;

  const hash = await sha256Hex(p);
  if (u === creds.username && hash === creds.passHashHex) {
    setSession(true);
    initApp();
    show("appSection");
  } else {
    $("loginMsg").textContent = "Wrong username or password.";
  }
});

$("logoutBtn").addEventListener("click", () => {
  setSession(false);
  $("password").value = "";
  show("loginSection");
});

// ===== App =====
function renderTable() {
  const runs = loadRuns().sort((a,b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const tbody = $("runsTable").querySelector("tbody");
  tbody.innerHTML = "";

  for (const r of runs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(r.occurredAt).toLocaleString()}</td>
      <td>${r.completed ? "Yes" : "No"}</td>
      <td>${r.basePoints}</td>
      <td>${r.penaltyPoints}</td>
      <td>${r.bonusPoints}</td>
      <td><b>${r.totalScore}</b></td>
      <td>${(r.notes || "").replaceAll("<","&lt;")}</td>
      <td><button data-del="${r.id}" class="secondary">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      const next = loadRuns().filter(r => r.id !== id);
      saveRuns(next);
      renderTable();
    });
  });
}

function updateTotalPreview() {
  const base = Number($("basePoints").value || 0);
  const pen = Number($("penaltyPoints").value || 0);
  const bon = Number($("bonusPoints").value || 0);
  $("totalScore").value = String(computeTotal(base, pen, bon));
}

["basePoints","penaltyPoints","bonusPoints"].forEach(id => {
  $(id).addEventListener("input", updateTotalPreview);
});

$("addRunBtn").addEventListener("click", () => {
  const occurredAt = $("occurredAt").value;
  const completed = $("completed").value === "true";
  const basePoints = Number($("basePoints").value || 0);
  const penaltyPoints = Number($("penaltyPoints").value || 0);
  const bonusPoints = Number($("bonusPoints").value || 0);
  const notes = $("notes").value.trim();

  if (!occurredAt) {
    $("appMsg").textContent = "Please set the date/time.";
    return;
  }

  const totalScore = computeTotal(basePoints, penaltyPoints, bonusPoints);

  const run = {
    id: uuid(),
    occurredAt: new Date(occurredAt).toISOString(),
    completed,
    basePoints,
    penaltyPoints,
    bonusPoints,
    totalScore,
    notes
  };

  const runs = loadRuns();
  runs.push(run);
  saveRuns(runs);

  $("appMsg").textContent = "Saved!";
  $("notes").value = "";
  renderTable();
});

$("exportBtn").addEventListener("click", () => {
  const runs = loadRuns().sort((a,b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  const header = ["Run ID","Occurred At","Completed","Base Points","Penalty Points","Bonus Points","Total Score","Notes"];

  const escape = (s) => {
    s = String(s ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  };

  const lines = [
    header.join(","),
    ...runs.map(r => [
      r.id,
      r.occurredAt,
      r.completed ? "TRUE" : "FALSE",
      r.basePoints,
      r.penaltyPoints,
      r.bonusPoints,
      r.totalScore,
      r.notes || ""
    ].map(escape).join(","))
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mission-possible-runs.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function initApp() {
  $("occurredAt").value = nowLocalDatetimeValue();
  updateTotalPreview();
  renderTable();
}

// Auto-login if session exists
if (getSession()) {
  initApp();
  show("appSection");
} else {
  show("loginSection");
}
