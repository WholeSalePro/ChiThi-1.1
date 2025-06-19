import { onAuthStateChanged, auth, rtdb } from './firebaseConfig.js';
import { setupPresence } from './presence.js';
import { loadPage } from './router.js';

onAuthStateChanged(auth, async (user) => {
  if (user) {
    setupPresence(user.uid)
    loadPage('chats');
  } else {
    loadPage('login');
  }
});
