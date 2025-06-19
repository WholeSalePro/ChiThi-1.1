import { db, rtdb } from "./firebaseConfig.js";
import {
  doc,
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  orderBy,
  serverTimestamp,
  updateDoc,
  collection,
  collectionGroup,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, onValue, set, update, get, child } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

import { auth } from "./firebaseConfig.js";
import { getChatId, loadPage } from "./router.js";
import { icons } from "./icons.js";

export async function renderChatsPage(app) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const userDoc = await getDoc(doc(db, "users", uid));
  const user = userDoc.data();

  let unsubscribeMessagesListener = null;

  const myStatusRef = ref(rtdb, `status/${uid}/isOnline`);

  onValue(myStatusRef, (snap) => {
    const isOnline = snap.val();

    if (isOnline) {
      // Start listening to all messages sent to me
      const q = query(
        collectionGroup(db, "chat"),
        where("receiver", "==", uid),
        where("status", "==", "sent")
      );

      // Clear previous listener if exists
      if (unsubscribeMessagesListener) unsubscribeMessagesListener();

      // Setup listener
      unsubscribeMessagesListener = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
            const docSnap = change.doc;
            updateDoc(docSnap.ref, {
              status: "delivered"
            });
          }
        });
      });

    } else {
      // Stop listening when offline
      if (unsubscribeMessagesListener) {
        unsubscribeMessagesListener();
        unsubscribeMessagesListener = null;
      }
    }
  });

  app.innerHTML = `
    <div class="header">
      <h2 class="logo">ChiThi</h2>
      <div class="header-right">
        <span id="profile-btn" class="username">${user.displayName}</span>
        <button class="icons" id="settings-btn">${icons.settings}</button>
      </div>
    </div>

    <div id="chat-list" class="chat-list">
      <p id="loading" class="loading">Loading chats...</p>
    </div>

    <div class="footer" style="display: none;">
      <div class="icons footer-btn active">${icons.chat}</div>
      <div class="icons footer-btn">${icons.blog}</div>
      <div class="icons footer-btn">${icons.publish}</div>
    </div>

    <div class="search-btn" id="search-btn">
      ${icons.search}
    </div>
  `;

  const chatList = document.getElementById("chat-list");
  const chatsMap = new Map(); // { otherId: { data, lastMsgTime, ... } }

  function formatTime(sentTime) {
    const date = new Date(sentTime.seconds * 1000);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${(hours % 12 || 12)}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  function renderChats() {
    chatList.innerHTML = "";

    console.log(chatsMap.values());
    const sortedChats = Array.from(chatsMap.values()).sort((a, b) => {
      return (b.lastMsgTime?.seconds || 0) - (a.lastMsgTime?.seconds || 0);
    });

    sortedChats.forEach(({ otherId, otherUser, lastMsg, lastMsgTime, unread, sender }) => {
      const formattedTime = lastMsgTime ? formatTime(lastMsgTime) : "";
      const isOwnMsg = sender === uid;

      const preview = `${isOwnMsg ? "You: " : ""}${lastMsg.slice(0, 30)}${lastMsg.length > 30 ? "..." : ""}`;

      const chatItem = document.createElement("div");
      chatItem.className = "chat-item";
      chatItem.id = `chat-${otherId}`;
      chatItem.innerHTML = `
        <div class="chat-left">
          <div class="chat-name">${otherUser.displayName}</div>
          <div class="chat-preview">${preview}</div>
        </div>
        <div class="chat-right">
          <div class="chat-time">${formattedTime}</div>
          ${unread > 0 ? `<div class="chat-unread">${unread}</div>` : ""}
        </div>
      `;

      chatItem.onclick = () => loadPage("chat", otherId);
      chatList.appendChild(chatItem);
    });


  }

  async function handleSnapshot(snapshot) {
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      const otherId = data.sender === uid ? data.receiver : data.sender;
      const chatId = getChatId(uid, otherId);

      // Get other user info
      const otherUserSnap = await getDoc(doc(db, "users", otherId));
      const otherUser = otherUserSnap.exists() ? otherUserSnap.data() : { displayName: "Unknown" };

      // Count unseen messages from this chat
      const messagesRef = collection(db, "messages", chatId, "chat");
      const unseenQuery = query(messagesRef, where("receiver", "==", uid), where("status", "!=", "seen"));
      const unseenSnap = await getDocs(unseenQuery);
      const unread = unseenSnap.size;

      const lastMsg = data.lastMsg || "";
      const lastMsgTime = data.lastMsgTime || null;

      chatsMap.set(otherId, {
        otherId,
        otherUser,
        lastMsg,
        lastMsgTime,
        unread,
        sender
      });
    }

    renderChats();
  }


  const q1 = query(collection(db, "messages"), where("sender", "==", uid));
  const q2 = query(collection(db, "messages"), where("receiver", "==", uid));
  onSnapshot(q1, handleSnapshot);
  onSnapshot(q2, handleSnapshot);



  // Navigation buttons
  document.getElementById("search-btn").onclick = () => loadPage("search");
  document.getElementById("settings-btn").onclick = () => loadPage("settings");
  document.getElementById("profile-btn").onclick = () => loadPage("profile", uid);
}
