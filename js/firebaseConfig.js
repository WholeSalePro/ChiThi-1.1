// Firebase v9 modular setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js"; // ✅ Realtime DB import

const firebaseConfig = {
  apiKey: "AIzaSyArH87_5HnUnrP4ZntrNgXXwKvPTJWNA4o",
  authDomain: "chiti-dd1bb.firebaseapp.com",
  projectId: "chiti-dd1bb",
  storageBucket: "chiti-dd1bb.firebasestorage.app",
  messagingSenderId: "621083678655",
  appId: "1:621083678655:web:b20d3cd86119ca9cc3b30a",
  databaseURL: "https://chiti-dd1bb-default-rtdb.firebaseio.com" // ✅ RTDB URL required
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app); // ✅ Initialize Realtime Database
const auth = getAuth(app);

export { db, rtdb, auth, onAuthStateChanged };
