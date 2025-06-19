import { db, auth, rtdb } from "./firebaseConfig.js";
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

import { listenToUserStatus, setupPresence } from "./presence.js";

import { loadPage, getChatId } from "./router.js";
import { icons } from "./icons.js";

export async function renderChatPage(app, otherUserId) {
  const otherUserSnap = await getDoc(doc(db, 'users', otherUserId));
  if (!otherUserSnap.exists()) {
    app.innerHTML = `<p>User not found.</p>`;
    return;
  }
  const otherUser = otherUserSnap.data();
  let chatOn = true;

  app.innerHTML = `
    <div class="header">
      <div class="icons" id="back-btn" style="cursor:pointer;">${icons.back}</div>
      <div class="header-right">
        <div id="typing-indicator" class="typing-indicator" style="font-style: italic; color: gray; padding-left: 10px; height: 20px;"></div>
        <div style="display:inline-flex;flex-direction: column;">
          <div class="chat-title">${otherUser.displayName}</div>
          <div id="statusDiv" class="typing-indicator" style="font-style: italic;font-size: 12px; color: gray; padding-left: 10px; height: 20px;"></div>
        </div>
        <button class="icons" id="chatSettings">${icons.settings}</button>
      </div>
    </div>

    <div id="messages" class="messages"></div>
    
    <div class="live-msg-glow hid" id="live-msg"></div>

    <div id="reply-preview" class="reply-preview hid">
      <div id="reply-text" class="reply-text"></div>
      <button id="cancel-reply" class="icons cancel-reply">${icons.close}</button>
    </div>

    <div class="chat-input-bar">
      <input type="text" id="message-input" placeholder="Type a message..." autocomplete="off" />
      <button class="icons" id="send-btn">${icons.send}</button>
    </div>
  `;

  document.getElementById("chatSettings").onclick = () => loadPage("chatSettings", otherUser);

  const uid = auth.currentUser?.uid;
  if (!uid) {
    app.innerHTML = `<p>Please login first.</p>`;
    return;
  }

  const chatId = getChatId(uid, otherUserId);
  const messagesRef = collection(db, "messages", chatId, "chat");
  const mainMessageDocRef = doc(db, "messages", chatId);

  const messagesDiv = document.getElementById("messages");
  const input = document.getElementById("message-input");
  const typingIndicator = document.getElementById("typing-indicator");
  const statusDiv = document.getElementById("statusDiv");
  const liveMsgDiv = document.getElementById("live-msg");

  let replyTo = null;
  const replyPreview = document.getElementById("reply-preview");
  const replyText = document.getElementById("reply-text");
  const cancelReplyBtn = document.getElementById("cancel-reply");

  cancelReplyBtn.onclick = () => {
    replyTo = null;
    replyPreview.classList.add("hid");
    replyText.textContent = '';

    document.querySelectorAll(".swipe-reply").forEach(el => el.classList.remove("swipe-reply"));
  };

  // Listen for other user's online status and last seen

  // Listen to other user's status
  listenToUserStatus(otherUserId, statusDiv);

  // Listen to messages and render them
  const messagesQuery = query(messagesRef, orderBy("time", "asc"));
  onSnapshot(messagesQuery, (snapshot) => {
    messagesDiv.innerHTML = "";

    snapshot.forEach(docSnap => {
      const msg = docSnap.data();

      const messageWrapper = document.createElement("div");
      messageWrapper.className = "message-wrapper " + (msg.sender === uid ? "sent" : "received");

      // If this message is a reply to another
      if (msg.replyTo && msg.replyTo.text) {
        const replyDiv = document.createElement("div");
        replyDiv.className = "reply-to";
        replyDiv.textContent = msg.replyTo.text;
        messageWrapper.appendChild(replyDiv);
      }

      // Main message bubble
      const textDiv = document.createElement("div");
      textDiv.className = "message";
      textDiv.textContent = msg.text;

      // Show message status for sender
      const statusContainer = document.createElement("div");
      statusContainer.className = "msg-meta";

      // Create sent time
      const timeSpan = document.createElement("span");
      timeSpan.className = "msg-time";
      const sentTime = msg.time?.toDate?.(); // For Firestore Timestamp
      if (sentTime) {
        const hours = sentTime.getHours();
        const minutes = sentTime.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedTime = `${(hours % 12 || 12)}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        timeSpan.textContent = formattedTime;
      }
      statusContainer.appendChild(timeSpan);
      if (msg.sender === uid) {
        // Create status icon
        const statusSpan = document.createElement("span");
        statusSpan.className = "msg-status";
        if (msg.status === "sent") {
          statusSpan.textContent = "✓";
        } else if (msg.status === "delivered") {
          statusSpan.textContent = "✓✓";
        } else if (msg.status === "seen") {
          statusSpan.textContent = "✓✓";
          statusSpan.style.color = "blue"; // Make it blue when seen
        }
        // Append both time and status
        statusContainer.appendChild(statusSpan);
      }

      textDiv.appendChild(statusContainer);


      textDiv.style.cursor = "pointer";
      textDiv.style.transition = "transform 0.25s ease, background 0.2s ease";

      // Swipe/Touch handlers for reply
      let touchStartX = 0;

      textDiv.addEventListener("touchstart", e => {
        touchStartX = e.changedTouches[0].screenX;
      });

      textDiv.addEventListener("touchmove", e => {
        const currentX = e.changedTouches[0].screenX;
        const delta = currentX - touchStartX;
        if (delta > 0 && delta < 100) {
          textDiv.style.transform = `translateX(${delta}px)`;
        }
      });

      textDiv.addEventListener("touchend", e => {
        const swipeDistance = e.changedTouches[0].screenX - touchStartX;
        if (swipeDistance > 60) {
          document.querySelectorAll(".swipe-reply").forEach(el => el.classList.remove("swipe-reply"));
          textDiv.classList.add("swipe-reply");
          replyTo = { text: msg.text };
          replyText.textContent = `Replying to: ${msg.text}`;
          replyPreview.classList.remove("hid");
        }
        textDiv.style.transform = "translateX(0)";
      });

      // Desktop double-click reply
      textDiv.addEventListener("dblclick", () => {
        document.querySelectorAll(".swipe-reply").forEach(el => el.classList.remove("swipe-reply"));
        textDiv.classList.add("swipe-reply");
        replyTo = { text: msg.text };
        replyText.textContent = `Replying to: ${msg.text}`;
        replyPreview.classList.remove("hid");
        setTimeout(() => textDiv.classList.remove("swipe-reply"), 250);
      });

      messageWrapper.appendChild(textDiv);
      messagesDiv.appendChild(messageWrapper);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  const senderORreciever = (await getDoc(mainMessageDocRef)).data();
  const typingStatusRef = ref(rtdb, `chats/${chatId}/typingStatus`);
  onValue(typingStatusRef, (snapshot) => {
    const typingData = snapshot.val();
    if (!typingData) return;

    const isSender = uid === senderORreciever.sender;
    const isReceiver = uid === senderORreciever.receiver;

    const typing = (isSender && typingData.receiverTyping) || (isReceiver && typingData.senderTyping);
    typingIndicator.textContent = typing ? "Typing..." : "";
  });

  // Listen to main chat document for live mode, typing status, and live message
  const liveMsgRef = ref(rtdb, `chats/${chatId}/liveMsg`);

  onValue(liveMsgRef, (snapshot) => {
    const liveMsg = snapshot.val();

    const shouldShowLive = liveMsg && liveMsg.sender !== uid && liveMsg.text.trim().length > 0;

    if (shouldShowLive) {
      liveMsgDiv.classList.remove("hid");
      liveMsgDiv.textContent = liveMsg.text;
    } else {
      liveMsgDiv.classList.add("hid");
    }
  });



  // Mark messages as seen
  onSnapshot(messagesQuery, (snapshot) => {
    if (chatOn) {
      snapshot.docChanges().forEach(change => {
        const msg = change.doc.data();
        if (msg.receiver === uid && msg.status !== "seen") {
          updateDoc(change.doc.ref, {
            status: "seen"
          });
        }
      });
    }
  });

  // Handle typing input updates
  input.addEventListener("input", async (e) => {
    const text = e.target.value;
    const mainDocSnap = await getDoc(mainMessageDocRef);
    if (!mainDocSnap.exists()) return;

    const data = mainDocSnap.data();
    const { sender, receiver } = data;
    const isSender = uid === sender;
    const isReceiver = uid === receiver;

    // Update typing status
    const typingStatusRef = ref(rtdb, `chats/${chatId}/typingStatus`);

    if (text.length > 0) {
      await update(typingStatusRef, {
        ...(isSender ? { senderTyping: true } : { receiverTyping: true }),
      });
    } else {
      await update(typingStatusRef, {
        ...(isSender ? { senderTyping: false } : { receiverTyping: false }),
      });
    }
    // Update live message if live mode active
    const liveMsgSnap = await get(child(ref(rtdb), `chats/${chatId}/liveMsg`));
    const liveMsg = liveMsgSnap.val();
    if (liveMsg && liveMsg.sender === uid) {
      await set(ref(rtdb, `chats/${chatId}/liveMsg`), {
        text,
        sender: uid,
        updatedAt: Date.now()
      });
    }
  });

  // Send message handler
  document.getElementById("send-btn").onclick = async () => {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    const mainDocSnap = await getDoc(mainMessageDocRef);
    const data = mainDocSnap.data();
    if (!data) return;

    const isSender = uid === data.sender;
    const chatId = getChatId(data.sender, data.receiver);
    await addDoc(messagesRef, {
      text,
      sender: uid,
      status: "sent",
      receiver: otherUserId,
      time: serverTimestamp(),
      ...(replyTo && { replyTo })
    });

    // Clear typing status after sending message
    await update(typingStatusRef, {
      ...(isSender ? { senderTyping: false } : { receiverTyping: false }),
    });

    await updateLastMessage(uid, otherUserId, text);

    const liveMsgSnap = await get(child(ref(rtdb), `chats/${chatId}/liveMsg`));
    const liveMsg = liveMsgSnap.val();
    // Clear live message if sender's liveMsg present
    if (liveMsg && liveMsg.sender === uid) {
      console.log("ok", liveMsg.sender);

      await set(ref(rtdb, `chats/${chatId}/liveMsg`), {
        text: '',
        sender: liveMsg.sender,
        updatedAt: Date.now()
      });
    }

    replyTo = null;
    replyPreview.classList.add("hid");
    replyText.textContent = '';
  };

  // Back button to chats list
  document.getElementById("back-btn").onclick = () => {
    chatOn = false;
    loadPage("chats")
  };
}

async function updateLastMessage(uid, otherId, text) {
  const chatDoc = doc(db, "messages", getChatId(uid, otherId));
  await setDoc(chatDoc, {
    sender: uid,
    receiver: otherId,
    lastMsg: text,
    lastMsgSender: uid,
    lastMsgTime: serverTimestamp(),
    lastMsgQty: 1
  }, { merge: true });
}
