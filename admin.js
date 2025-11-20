// admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  get
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

// MQTT Setup for capacity control
const brokerIP = "ws://localhost:9001"; // Adjust if your MQTT broker uses different port
const mqttClient = mqtt.connect(brokerIP);

const sensorTopics = [
  "parking/areaA/sensor1",
  "parking/areaA/sensor2",
  "parking/areaB/sensor1",
  "parking/areaB/sensor2",
  "parking/areaB/sensor3",
  "parking/areaB/sensor4"
];

mqttClient.on("connect", () => {
  console.log("Admin: Connected to MQTT broker");
  sensorTopics.forEach((topic) => mqttClient.subscribe(topic));
});

mqttClient.on("error", (error) => {
  console.error("MQTT Error:", error);
});

// Handle MQTT messages for sensor status
mqttClient.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const match = topic.match(/parking\/area([A-Z])\/sensor(\d+)/i);
    if (match) {
      const area = match[1].toUpperCase();
      const sensorNum = match[2];
      updateSensorDisplay(area, sensorNum, payload);
      checkSensorStatus(area, sensorNum, payload); // Monitor for alerts
    }
  } catch (error) {
    console.error("Error parsing sensor message:", error);
  }
});

// Function to update sensor display
function updateSensorDisplay(area, sensorNum, data) {
  const idPrefixPrimary = `sensor${area}${sensorNum}`;
  const idPrefixFallback = `sensor${sensorNum}`;

  const statusElement =
    document.getElementById(`${idPrefixPrimary}Status`) ||
    document.getElementById(`${idPrefixFallback}Status`);
  const distanceElement =
    document.getElementById(`${idPrefixPrimary}Distance`) ||
    document.getElementById(`${idPrefixFallback}Distance`);
  const detectingElement =
    document.getElementById(`${idPrefixPrimary}Detecting`) ||
    document.getElementById(`${idPrefixFallback}Detecting`);
  
  if (statusElement) {
    statusElement.textContent = data.status || "Unknown";
    statusElement.className = "sensor-value " + (data.status === "Working" ? "status-ok" : "status-error");
  }
  
  if (distanceElement) {
    const distance = data.distance || 0;
    distanceElement.textContent = distance < 999 ? `${distance} cm` : "Error";
  }
  
  if (detectingElement) {
    detectingElement.textContent = data.detecting ? "Yes" : "No";
    detectingElement.className = "sensor-value " + (data.detecting ? "detecting-yes" : "detecting-no");
  }
}

// Function to set capacity for an area
function setCapacity(area, capacity) {
  const topic = `parking/area${area}/capacity`;
  mqttClient.publish(topic, capacity.toString(), { qos: 1 }, (err) => {
    if (err) {
      console.error(`Failed to publish capacity for Area ${area}:`, err);
      alert(`Failed to update capacity for Area ${area}`);
    } else {
      console.log(`Capacity for Area ${area} set to ${capacity}`);
      alert(`Capacity for Area ${area} updated to ${capacity}`);
    }
  });
}

// Email Alert Configuration
const emailSettingsRef = ref(db, "settings/alertEmail");
let alertEmail = null;
let lastAlertTimes = {}; // Track last alert time to prevent spam
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts for same issue

// Load saved email
onValue(emailSettingsRef, (snapshot) => {
  alertEmail = snapshot.val();
  const emailInput = document.getElementById("alertEmail");
  if (emailInput && alertEmail) {
    emailInput.value = alertEmail;
  }
});

// Save email function
function saveAlertEmail(email) {
  if (!email || !email.includes("@")) {
    return { success: false, error: "Invalid email address" };
  }
  set(emailSettingsRef, email);
  alertEmail = email;
  return { success: true };
}

// Send email alert function
async function sendEmailAlert(subject, message) {
  if (!alertEmail) {
    console.warn("No alert email configured");
    return { success: false, error: "No email configured" };
  }

  // Use your deployed API endpoint or local server
  // Update this URL to match your deployment
  const API_URL = window.location.origin + "/api/send-email";
  // For local development, you might need: "http://localhost:3000/api/send-email"
  
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        toEmail: alertEmail,
        subject: subject,
        message: message
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error sending email alert:", error);
    // Fallback: try direct Brevo API call (if CORS allows)
    return { success: false, error: error.message };
  }
}

// Check if we should send alert (prevent spam)
function shouldSendAlert(alertKey) {
  const now = Date.now();
  const lastTime = lastAlertTimes[alertKey];
  
  if (!lastTime || (now - lastTime) > ALERT_COOLDOWN) {
    lastAlertTimes[alertKey] = now;
    return true;
  }
  return false;
}

// Monitor sensor status
const sensorStatus = {};
const sensorLastSeen = {};

function checkSensorStatus(area, sensorNum, data) {
  const sensorKey = `${area}-${sensorNum}`;
  const now = Date.now();
  
  // Update last seen time
  sensorLastSeen[sensorKey] = now;
  
  // Check if sensor is offline (status error or no data for 2 minutes)
  const isOffline = data.status !== "Working" || !data.status;
  
  if (isOffline && sensorStatus[sensorKey] !== "offline") {
    sensorStatus[sensorKey] = "offline";
    const alertKey = `sensor-${sensorKey}-offline`;
    
    if (shouldSendAlert(alertKey) && alertEmail) {
      sendEmailAlert(
        `⚠️ Sensor Offline Alert - Area ${area} Sensor ${sensorNum}`,
        `<h2>Sensor Disconnection Alert</h2>
        <p><strong>Sensor:</strong> Area ${area} - Sensor ${sensorNum}</p>
        <p><strong>Status:</strong> ${data.status || "Unknown"}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>Please check the sensor connection and ESP device.</p>`
      );
    }
  } else if (!isOffline && sensorStatus[sensorKey] === "offline") {
    sensorStatus[sensorKey] = "online";
    console.log(`Sensor ${sensorKey} is back online`);
  }
}

// Check for sensors that haven't reported in a while
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 2 * 60 * 1000; // 2 minutes
  
  Object.keys(sensorLastSeen).forEach(sensorKey => {
    if (now - sensorLastSeen[sensorKey] > TIMEOUT) {
      if (sensorStatus[sensorKey] !== "offline") {
        sensorStatus[sensorKey] = "offline";
        const [area, sensorNum] = sensorKey.split("-");
        const alertKey = `sensor-${sensorKey}-timeout`;
        
        if (shouldSendAlert(alertKey) && alertEmail) {
          sendEmailAlert(
            `⚠️ Sensor Timeout Alert - Area ${area} Sensor ${sensorNum}`,
            `<h2>Sensor Timeout Alert</h2>
            <p><strong>Sensor:</strong> Area ${area} - Sensor ${sensorNum}</p>
            <p><strong>Issue:</strong> No data received for more than 2 minutes</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p>This may indicate the ESP device is offline or the sensor is disconnected.</p>`
          );
        }
      }
    }
  });
}, 30000); // Check every 30 seconds

// Monitor MQTT connection
let mqttConnected = false;
let mqttLastConnect = null;

mqttClient.on("connect", () => {
  console.log("Admin: Connected to MQTT broker");
  mqttConnected = true;
  mqttLastConnect = Date.now();
  sensorTopics.forEach((topic) => mqttClient.subscribe(topic));
});

mqttClient.on("error", (error) => {
  console.error("MQTT Error:", error);
  if (mqttConnected) {
    mqttConnected = false;
    const alertKey = "mqtt-disconnect";
    
    if (shouldSendAlert(alertKey) && alertEmail) {
      sendEmailAlert(
        "⚠️ MQTT Connection Lost",
        `<h2>MQTT Broker Connection Lost</h2>
        <p><strong>Error:</strong> ${error.message || "Connection failed"}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>Please check the MQTT broker status and network connection.</p>`
      );
    }
  }
});

mqttClient.on("close", () => {
  if (mqttConnected) {
    mqttConnected = false;
    const alertKey = "mqtt-close";
    
    if (shouldSendAlert(alertKey) && alertEmail) {
      sendEmailAlert(
        "⚠️ MQTT Connection Closed",
        `<h2>MQTT Broker Connection Closed</h2>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>The connection to the MQTT broker has been closed. Please check the broker status.</p>`
      );
    }
  }
});

// Set up capacity control buttons
document.addEventListener("DOMContentLoaded", () => {
  // Area A
  document.getElementById("setCapacityA")?.addEventListener("click", () => {
    const capacity = parseInt(document.getElementById("capacityA").value);
    if (capacity > 0 && capacity <= 100) {
      setCapacity("A", capacity);
    } else {
      alert("Capacity must be between 1 and 100");
    }
  });

  // Area B
  document.getElementById("setCapacityB")?.addEventListener("click", () => {
    const capacity = parseInt(document.getElementById("capacityB").value);
    if (capacity > 0 && capacity <= 100) {
      setCapacity("B", capacity);
    } else {
      alert("Capacity must be between 1 and 100");
    }
  });

  // Email settings
  const saveEmailBtn = document.getElementById("saveEmailBtn");
  const emailInput = document.getElementById("alertEmail");
  const emailStatus = document.getElementById("emailStatus");

  saveEmailBtn?.addEventListener("click", () => {
    const email = emailInput?.value.trim();
    if (!email) {
      emailStatus.textContent = "Please enter an email address";
      emailStatus.className = "email-status error";
      return;
    }

    const result = saveAlertEmail(email);
    if (result.success) {
      emailStatus.textContent = "Email saved successfully!";
      emailStatus.className = "email-status success";
      setTimeout(() => {
        emailStatus.textContent = "";
        emailStatus.className = "email-status";
      }, 3000);
    } else {
      emailStatus.textContent = result.error || "Failed to save email";
      emailStatus.className = "email-status error";
    }
  });
});

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
const historyRef = ref(db, "history");

// Test Firebase connection
console.log("Firebase initialized, database:", db);
console.log("History ref path:", historyRef.toString());

// Initialize history and analytics immediately when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Ensure history list element exists
  const list = document.getElementById("historyList");
  if (list) {
    console.log("DOM ready - History list element found");
    // History listener is set up below and will fire immediately when Firebase has data
  } else {
    console.error("History list element not found in DOM!");
  }
  
  // Also ensure charts can be initialized
  const chartAEl = document.getElementById("chartA");
  const chartBEl = document.getElementById("chartB");
  if (chartAEl && chartBEl) {
    console.log("Chart elements found, ready for data");
  }
});

// Track last values to prevent duplicate entries
let lastAreaA = { available: null, occupied: null };
let lastAreaB = { available: null, occupied: null };

// Track last history entry to prevent duplicates
let lastHistoryEntryA = null;
let lastHistoryEntryB = null;

// Debounce timers
let debounceTimerA = null;
let debounceTimerB = null;

// In-memory stores
const allHistory = [];

// Charts
let chartA, chartB;

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
  const chartAEl = document.getElementById("chartA");
  const chartBEl = document.getElementById("chartB");
  
  if (!chartAEl || !chartBEl) {
    console.warn("Chart canvas elements not found");
    return false;
  }
  
  if (!chartA) {
    const ctxA = chartAEl.getContext("2d");
    chartA = createLineChart(ctxA, "Area A");
    console.log("Chart A initialized");
  }
  if (!chartB) {
    const ctxB = chartBEl.getContext("2d");
    chartB = createLineChart(ctxB, "Area B");
    console.log("Chart B initialized");
  }
  return true;
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
  const byArea = { A: [], B: [] };
  for (const entry of allHistory) {
    const ts = entry.ts ?? entry.timestamp ?? null;
    if (!ts || ts < cutoff) continue;
    if (!byArea[entry.area]) continue;
    byArea[entry.area].push(entry);
  }

  // Sort by time
  byArea.A.sort((a, b) => a.ts - b.ts);
  byArea.B.sort((a, b) => a.ts - b.ts);

  function applyData(chart, entries) {
    if (!chart) {
      console.warn("Chart not initialized");
      return;
    }
    chart.data.labels = entries.map((e) => formatTs(e.ts));
    chart.data.datasets[0].data = entries.map((e) => e.occupied ?? 0);
    chart.update("none"); // Update without animation for faster loading
    console.log(`Chart updated with ${entries.length} data points`);
  }

  // Update charts even if empty (shows empty state)
  console.log(`Updating charts - Area A: ${byArea.A.length} entries, Area B: ${byArea.B.length} entries`);
  applyData(chartA, byArea.A);
  applyData(chartB, byArea.B);
}

function formatHistoryTimestamp(entry) {
  const date = entry.ts
    ? new Date(entry.ts)
    : entry.iso
    ? new Date(entry.iso)
    : null;

  if (date && !Number.isNaN(date.getTime())) {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  }

  return entry.time || "";
}

// Helper: update display
function updateArea(areaId, data) {
  const availableElement = document.getElementById(`available${areaId}`);
  const available = data.available ?? 0;
  
  if (available === 0) {
    availableElement.textContent = "FULL";
    availableElement.classList.add("full");
  } else {
    availableElement.textContent = available;
    availableElement.classList.remove("full");
  }
}

// Helper: check if values changed and not duplicate of last history entry
function hasChanged(areaId, data) {
  const last = areaId === "A" ? lastAreaA : lastAreaB;
  const available = data.available ?? 0;
  const occupied = data.occupied ?? 0;
  
  // Check against last tracked values - if same, no change
  if (last.available === available && last.occupied === occupied) {
    return false; // No change
  }
  
  // Update last values immediately to prevent duplicates
  if (areaId === "A") {
    lastAreaA = { available, occupied };
  } else {
    lastAreaB = { available, occupied };
  }
  
  return true; // Values changed
}

// Function to add to history (simplified - no debounce, just duplicate check)
function addToHistory(areaId, data) {
  const available = data.available ?? 0;
  const occupied = data.occupied ?? 0;
  
  // Check if values changed
  const last = areaId === "A" ? lastAreaA : lastAreaB;
  
  // If values haven't changed, don't add
  if (last.available === available && last.occupied === occupied) {
    return; // No change
  }
  
  // Check last history entry to prevent duplicates within 1 second
  const lastHistory = areaId === "A" ? lastHistoryEntryA : lastHistoryEntryB;
  if (lastHistory) {
    const now = Date.now();
    const timeDiff = now - (lastHistory.ts || 0);
    
    // If same values and within 1 second, skip
    if (lastHistory.available === available && 
        lastHistory.occupied === occupied && 
        timeDiff < 1000) {
      return; // Duplicate within 1 second
    }
  }
  
  // Add to history - only include status if it exists
  const now = Date.now();
  const historyEntry = { 
    area: areaId, 
    available: available,
    occupied: occupied,
    time: new Date(now).toLocaleTimeString(), 
    iso: new Date(now).toISOString(), 
    ts: now 
  };
  
  // Only add status if it exists and is not undefined
  if (data.status !== undefined && data.status !== null) {
    historyEntry.status = data.status;
  }
  
  push(historyRef, historyEntry);
  
  // Update last tracked values
  if (areaId === "A") {
    lastAreaA = { available, occupied };
    lastHistoryEntryA = historyEntry;
  } else {
    lastAreaB = { available, occupied };
    lastHistoryEntryB = historyEntry;
  }
}

// AREA A listener
onValue(areaARef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("A", data);
  
  // Use debounced function to add to history
  addToHistory("A", data);
});

// AREA B listener
onValue(areaBRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("B", data);
  
  // Use debounced function to add to history
  addToHistory("B", data);
});

// Display history - loads immediately from Firebase, independent of MQTT/ESP
function loadHistoryFromFirebase(snapshot) {
  console.log("History listener fired", snapshot.exists());
  
  const list = document.getElementById("historyList");
  if (!list) {
    console.warn("History list element not found, will retry when DOM is ready");
    // Retry after a short delay
    setTimeout(() => loadHistoryFromFirebase(snapshot), 100);
    return;
  }
  
  const history = snapshot.val();
  console.log("History data from Firebase:", history ? Object.keys(history).length + " entries" : "null");

  // Clear loading message
  list.innerHTML = "";

  if (!history || Object.keys(history).length === 0) {
    console.log("No history data in Firebase");
    list.innerHTML = "<li>No recent data yet</li>";
    // Initialize charts with empty data
    updateCharts();
    return;
  }

  const entries = Object.values(history);
  console.log("Processing", entries.length, "history entries");
  
  // Merge into in-memory store
  allHistory.length = 0;
  for (const e of entries) {
    const ts = typeof e.ts === "number" ? e.ts : (e.iso ? Date.parse(e.iso) : null);
    if (!ts) {
      console.warn("Entry missing timestamp:", e);
      continue;
    }
    allHistory.push({ ...e, ts });
  }

  console.log("Loaded", allHistory.length, "entries into allHistory");

  // Sort all history by timestamp
  allHistory.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  // Update last history entries
  const areaAEntries = entries.filter(e => e.area === "A").sort((a, b) => {
    const tsA = typeof a.ts === "number" ? a.ts : (a.iso ? Date.parse(a.iso) : 0);
    const tsB = typeof b.ts === "number" ? b.ts : (b.iso ? Date.parse(b.iso) : 0);
    return tsB - tsA;
  });
  const areaBEntries = entries.filter(e => e.area === "B").sort((a, b) => {
    const tsA = typeof a.ts === "number" ? a.ts : (a.iso ? Date.parse(a.iso) : 0);
    const tsB = typeof b.ts === "number" ? b.ts : (b.iso ? Date.parse(b.iso) : 0);
    return tsB - tsA;
  });
  
  if (areaAEntries.length > 0) {
    lastHistoryEntryA = areaAEntries[0];
  }
  if (areaBEntries.length > 0) {
    lastHistoryEntryB = areaBEntries[0];
  }

  // Show last 10 (most recent)
  const sortedEntries = entries.sort((a, b) => {
    const tsA = typeof a.ts === "number" ? a.ts : (a.iso ? Date.parse(a.iso) : 0);
    const tsB = typeof b.ts === "number" ? b.ts : (b.iso ? Date.parse(b.iso) : 0);
    return tsB - tsA; // Most recent first
  });
  
  const lastTen = sortedEntries.slice(0, 10); // Get first 10 (most recent)

  if (lastTen.length === 0) {
    list.innerHTML = "<li>No recent data yet</li>";
  } else {
    console.log("Displaying", lastTen.length, "history entries");
    lastTen.forEach((entry) => {
      const li = document.createElement("li");
      const timestampLabel = formatHistoryTimestamp(entry);
      li.textContent = `[${timestampLabel}] Area ${entry.area} — Occupied: ${entry.occupied}, Available: ${entry.available}`;
      list.appendChild(li);
    });
  }

  // Update charts with existing data
  console.log("Updating charts with", allHistory.length, "entries");
  updateCharts();
}

// Set up history listener - fires immediately when Firebase has data
console.log("Setting up history listener...");
onValue(historyRef, (snapshot) => {
  console.log("History listener callback triggered");
  loadHistoryFromFirebase(snapshot);
}, (error) => {
  // Handle errors
  console.error("Error loading history from Firebase:", error);
  const list = document.getElementById("historyList");
  if (list) {
    list.innerHTML = "<li>Error loading history data: " + error.message + "</li>";
  }
});

// Also try a one-time read to test connection
import { get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
get(historyRef).then((snapshot) => {
  console.log("One-time read test - History exists:", snapshot.exists());
  if (snapshot.exists()) {
    console.log("History data keys:", Object.keys(snapshot.val()));
    // Manually trigger load if listener didn't fire
    loadHistoryFromFirebase(snapshot);
  } else {
    console.log("No history data in Firebase yet");
  }
}).catch((error) => {
  console.error("Error reading history:", error);
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
    { canvas: chartB.canvas, name: "chart-area-b.png" }
  ];
  canvases.forEach(({ canvas, name }) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, name);
    });
  });
});
