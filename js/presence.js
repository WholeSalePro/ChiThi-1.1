import { ref, onValue, onDisconnect, serverTimestamp, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { rtdb, db } from "./firebaseConfig.js";  // Your RTDB instance
import { auth } from "./firebaseConfig.js";
import { getChatId } from "./router.js";
import {
  getDocs,
  collection,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

export async function setupPresence(uid) {
  const userStatusRef = ref(rtdb, 'status/' + uid);

  // This special path is true if client is connected to RTDB
  const connectedRef = ref(rtdb, '.info/connected');

  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      // When connected, set isOnline to true
      set(userStatusRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      });

      // On disconnect, set isOnline to false and update lastSeen
      onDisconnect(userStatusRef).set({
        isOnline: false,
        lastSeen: Date.now()
      });
    }
  });

  const chatListSnap = await getDocs(collection(db, "messages"));

  chatListSnap.docs.forEach(docSnap => {
    const chatData = docSnap.data();
    const chatId = getChatId(chatData.sender, chatData.receiver);
    const isSender = uid === chatData.sender;
    const isReceiver = uid === chatData.receiver;

    if (!isSender && !isReceiver) return; // not involved in this chat

    const typingStatusPath = `chats/${chatId}/typingStatus`;
    const liveMsgPath = `chats/${chatId}/liveMsg`;

    // Setup onDisconnect for typing status
    const typingRef = ref(rtdb, typingStatusPath);
    const liveMsgRef = ref(rtdb, liveMsgPath);

    onDisconnect(typingRef).update({
      ...(isSender ? { senderTyping: false } : { receiverTyping: false })
    });

    onDisconnect(liveMsgRef).set({
      text: "",
      sender: uid,
      updatedAt: Date.now()
    });
  });

}

export function listenToUserStatus(otherUserId, statusDiv) {
  const otherUserStatusRef = ref(rtdb, 'status/' + otherUserId);
  onValue(otherUserStatusRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      statusDiv.textContent = "Offline";
      return;
    }

    if (data.isOnline) {
      statusDiv.textContent = "Online";
    } else if (data.lastSeen) {
      const lastSeenDate = new Date(data.lastSeen);
      statusDiv.textContent = `Last seen at ${lastSeenDate.toLocaleTimeString()}`;
    } else {
      statusDiv.textContent = "Offline";
    }
  });
}
