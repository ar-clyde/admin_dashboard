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
  const timestamp = new Date().toLocaleTimeString();
  push(historyRef, { area: "A", ...data, time: timestamp });
});

// AREA B listener
onValue(areaBRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("B", data);
  const timestamp = new Date().toLocaleTimeString();
  push(historyRef, { area: "B", ...data, time: timestamp });
});

// AREA C listener
onValue(areaCRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;
  updateArea("C", data);
  const timestamp = new Date().toLocaleTimeString();
  push(historyRef, { area: "C", ...data, time: timestamp });
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

  const entries = Object.values(history).slice(-10).reverse();
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `[${entry.time}] Area ${entry.area} — Occupied: ${entry.occupied}, Available: ${entry.available}`;
    list.appendChild(li);
  });
});
