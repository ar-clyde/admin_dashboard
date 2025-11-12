// admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Redirect to login if not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  }
});

// Logout button
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    alert("Logged out successfully!");
    window.location.href = "login.html";
  } catch (error) {
    console.error("Logout Error:", error);
  }
});

// Firebase references
const areaARef = ref(db, "parking/A");
const areaBRef = ref(db, "parking/B");
const areaCRef = ref(db, "parking/C");
const historyRef = ref(db, "history");

// In-memory stores
const allHistory = [];

// Charts
let chartA, chartB, chartC;

function createLineChart(ctx, label) {
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Occupied",
          data: [],
          borderColor: "#ff7b72",
          backgroundColor: "rgba(255, 123, 114, 0.15)",
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: "Available",
          data: [],
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88, 166, 255, 0.15)",
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#c9d1d9" }
        },
        title: {
          display: false,
          text: label,
          color: "#c9d1d9"
        }
      },
      scales: {
        x: {
          ticks: { color: "#8b949e", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(48, 54, 61, 0.35)" }
        },
        y: {
          ticks: { color: "#8b949e" },
          grid: { color: "rgba(48, 54, 61, 0.35)" }
        }
      }
    }
  });
}

function ensureCharts() {
  if (!chartA) {
    const ctxA = document.getElementById("chartA").getContext("2d");
    chartA = createLineChart(ctxA, "Area A");
  }
  if (!chartB) {
    const ctxB = document.getElementById("chartB").getContext("2d");
    chartB = createLineChart(ctxB, "Area B");
  }
  if (!chartC) {
    const ctxC = document.getElementById("chartC").getContext("2d");
    chartC = createLineChart(ctxC, "Area C");
  }
}

function rangeToMs(range) {
  const oneHour = 60 * 60 * 1000;
  if (range === "24h") return 24 * oneHour;
  if (range === "7d") return 7 * 24 * oneHour;
  if (range === "30d") return 30 * 24 * oneHour;
  if (range === "365d") return 365 * 24 * oneHour;
  return 24 * oneHour;
}

function formatTs(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${day} ${h}:${m}`;
}

function updateCharts() {
  ensureCharts();
  const range = document.getElementById("analyticsRange")?.value || "24h";
  const now = Date.now();
  const cutoff = now - rangeToMs(range);

  // Partition by area
  const byArea = { A: [], B: [], C: [] };
  for (const entry of allHistory) {
    const ts = entry.ts ?? entry.timestamp ?? null;
    if (!ts || ts < cutoff) continue;
    if (!byArea[entry.area]) continue;
    byArea[entry.area].push(entry);
  }

  // Sort by time
  byArea.A.sort((a, b) => a.ts - b.ts);
  byArea.B.sort((a, b) => a.ts - b.ts);
  byArea.C.sort((a, b) => a.ts - b.ts);

  function applyData(chart, entries) {
    chart.data.labels = entries.map((e) => formatTs(e.ts));
    chart.data.datasets[0].data = entries.map((e) => e.occupied ?? 0);
    chart.data.datasets[1].data = entries.map((e) => e.available ?? 0);
    chart.update();
  }

  applyData(chartA, byArea.A);
  applyData(chartB, byArea.B);
  applyData(chartC, byArea.C);
}

// Helper: update display
function updateArea(areaId, data) {
  document.getElementById(`available${areaId}`).textContent = data.available ?? 0;
  document.getElementById(`occupied${areaId}`).textContent = data.occupied ?? 0;
}

// AREA A listener
onValue(areaARef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("A", data);
  const now = Date.now();
  push(historyRef, { area: "A", ...data, time: new Date(now).toLocaleTimeString(), iso: new Date(now).toISOString(), ts: now });
});

// AREA B listener
onValue(areaBRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("B", data);
  const now = Date.now();
  push(historyRef, { area: "B", ...data, time: new Date(now).toLocaleTimeString(), iso: new Date(now).toISOString(), ts: now });
});

// AREA C listener
onValue(areaCRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("C", data);
  const now = Date.now();
  push(historyRef, { area: "C", ...data, time: new Date(now).toLocaleTimeString(), iso: new Date(now).toISOString(), ts: now });
});

// Display history
onValue(historyRef, (snapshot) => {
  const list = document.getElementById("historyList");
  list.innerHTML = "";
  const history = snapshot.val();

  if (!history) {
    list.innerHTML = "<li>No recent data yet</li>";
    return;
  }

  const entries = Object.values(history);
  // Merge into in-memory store
  allHistory.length = 0;
  for (const e of entries) {
    const ts = typeof e.ts === "number" ? e.ts : (e.iso ? Date.parse(e.iso) : null);
    if (!ts) continue;
    allHistory.push({ ...e, ts });
  }

  // Show last 10
  const lastTen = entries.slice(-10).reverse();

  lastTen.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `[${entry.time}] Area ${entry.area} — Occupied: ${entry.occupied}, Available: ${entry.available}`;
    list.appendChild(li);
  });

  updateCharts();
});

// Controls
document.getElementById("analyticsRange")?.addEventListener("change", () => {
  updateCharts();
});

// Downloads
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsvRow(values) {
  return values.map((v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(",");
}

document.getElementById("downloadHistoryBtn")?.addEventListener("click", () => {
  const header = ["ts", "iso", "time", "area", "occupied", "available"];
  const lines = [toCsvRow(header)];
  // Use all history currently in memory; include entries that may not have ts by deriving from iso if present
  const rows = allHistory
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((e) => toCsvRow([e.ts, e.iso || (e.ts ? new Date(e.ts).toISOString() : ""), e.time || "", e.area, e.occupied, e.available]));
  lines.push(...rows);
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, "parking-history.csv");
});

document.getElementById("downloadAnalyticsBtn")?.addEventListener("click", () => {
  const range = document.getElementById("analyticsRange")?.value || "24h";
  const now = Date.now();
  const cutoff = now - rangeToMs(range);
  const filtered = allHistory.filter((e) => e.ts && e.ts >= cutoff);
  const header = ["ts", "when", "area", "occupied", "available"];
  const lines = [toCsvRow(header)];
  filtered
    .sort((a, b) => a.ts - b.ts)
    .forEach((e) => {
      lines.push(toCsvRow([e.ts, formatTs(e.ts), e.area, e.occupied, e.available]));
    });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `analytics-${range}.csv`);
});

document.getElementById("downloadChartImgBtn")?.addEventListener("click", () => {
  ensureCharts();
  const canvases = [
    { canvas: chartA.canvas, name: "chart-area-a.png" },
    { canvas: chartB.canvas, name: "chart-area-b.png" },
    { canvas: chartC.canvas, name: "chart-area-c.png" }
  ];
  canvases.forEach(({ canvas, name }) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, name);
    });
  });
});
