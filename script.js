import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    doc,
    setDoc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDCsryqISeW2Vj-hE5gHhHahLPCQfC2F38",
    authDomain: "lilpoet-ezra.firebaseapp.com",
    projectId: "lilpoet-ezra",
    storageBucket: "lilpoet-ezra.firebasestorage.app",
    messagingSenderId: "444135592226",
    appId: "1:444135592226:web:a3e7bfdbd75b1c61fa157b",
    measurementId: "G-SGX0QD0YF0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

console.log("Firebase auth initialized", {
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    apiKey: firebaseConfig.apiKey,
    appId: firebaseConfig.appId,
    origin: window.location.origin,
    protocol: window.location.protocol
});

const poemForm = document.getElementById("poemForm");
const authorInput = document.getElementById("authorInput");
const titleInput = document.getElementById("titleInput");
const contentInput = document.getElementById("contentInput");
const categoryInput = document.getElementById("categoryInput");
const poemsContainer = document.getElementById("poemsContainer");
const toast = document.getElementById("toast");
const submitBtn = document.getElementById("submitBtn");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const poemCount = document.getElementById("poemCount");
const charCount = document.getElementById("charCount");
const audioToggleBtn = document.getElementById("audioToggleBtn");
const rainVolume = document.getElementById("rainVolume");
const pianoVolume = document.getElementById("pianoVolume");
const vinylVolume = document.getElementById("vinylVolume");
const categoryFilter = document.getElementById("categoryFilter");
const authState = document.getElementById("authState");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const signOutBtn = document.getElementById("signOutBtn");
const authForm = document.getElementById("authForm");
const authSection = document.getElementById("authSection");
const authToggleBtn = document.getElementById("authToggleBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const sessionHint = document.getElementById("sessionHint");
const menuToggleBtn = document.getElementById("menuToggleBtn");
const mobileNav = document.getElementById("mobileNav");
const shell = document.querySelector(".shell");
const introScreen = document.getElementById("intro-screen");
const enterBtn = document.getElementById("enter-btn");
const focusOverlay = document.getElementById("focus-overlay");
const closeFocusBtn = document.getElementById("close-focus");
const focusPoem = document.getElementById("focus-poem");
const loadingIndicator = document.getElementById("loadingIndicator");

const favoriteStorageKey = "lilpoet-favorites";
let favoritePoemIds = new Set(loadFavoritePoems());
let favoriteCountsByPoem = new Map();
let commentsByPoem = new Map();
let readingProgressByPoem = new Map();
let unsubscribeFavorites = null;
let unsubscribeComments = null;
let unsubscribeProgress = null;
let activeProgressPoemId = null;
let progressSaveTimers = new Map();

requestAnimationFrame(() => shell?.classList.add("ready"));

// Show loading indicator initially
loadingIndicator.classList.add("show");

// Intro screen functionality
enterBtn?.addEventListener("click", () => {
    introScreen.classList.add("fade-out");
    setTimeout(() => {
        introScreen.style.display = "none";
        shell.classList.add("ready");
    }, 800);
});

// Focus mode functionality
function openFocusMode(poem) {
    focusPoem.innerHTML = `
        <h2>${escapeHtml(poem.title || "Untitled Piece")}</h2>
        <div class="focus-author">held by ${escapeHtml(poem.author)}</div>
        <div class="focus-text">${escapeHtml(poem.content || "")}</div>
    `;
    focusOverlay.classList.add("active");
    document.body.style.overflow = "hidden";

    // Update URL with poem ID
    const url = new URL(window.location);
    url.hash = `#poem-${poem.id}`;
    window.history.replaceState(null, '', url);
}

function closeFocusMode() {
    focusOverlay.classList.remove("active");
    document.body.style.overflow = "";

    // Clear URL hash
    const url = new URL(window.location);
    url.hash = '';
    window.history.replaceState(null, '', url);
}

closeFocusBtn?.addEventListener("click", closeFocusMode);

focusOverlay?.addEventListener("click", (e) => {
    if (e.target === focusOverlay) {
        closeFocusMode();
    }
});

// Close focus mode on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focusOverlay.classList.contains("active")) {
        closeFocusMode();
    }
});

let allPoems = [];
let hideToastTimer = null;
let saving = false;
let audioContext = null;
let audioNodes = null;
let audioActive = false;
let audioBufferCache = null;
let currentUser = null;
let initialLoad = true;
let authSectionExpanded = false;
let migratedUserId = null;

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeText(value) {
    return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeCssIdentifier(value) {
    if (window.CSS?.escape) {
        return CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
}

function loadFavoritePoems() {
    try {
        const stored = localStorage.getItem(favoriteStorageKey);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn("Could not load favorites:", error);
        return [];
    }
}

function saveFavoritePoems() {
    try {
        localStorage.setItem(favoriteStorageKey, JSON.stringify([...favoritePoemIds]));
    } catch (error) {
        console.warn("Could not save favorites:", error);
    }
}

function interactionDocId(userId, poemId) {
    return `${userId}_${poemId}`;
}

function stopInteractionListeners() {
    unsubscribeFavorites?.();
    unsubscribeComments?.();
    unsubscribeProgress?.();
    unsubscribeFavorites = null;
    unsubscribeComments = null;
    unsubscribeProgress = null;
}

function subscribeInteractionData(user) {
    stopInteractionListeners();

    unsubscribeFavorites = onSnapshot(collection(db, "favorites"), (snapshot) => {
        const nextCounts = new Map();
        const nextUserFavorites = new Set();

        snapshot.forEach((favoriteDoc) => {
            const favorite = favoriteDoc.data();
            if (!favorite.poemId) return;
            nextCounts.set(favorite.poemId, (nextCounts.get(favorite.poemId) || 0) + 1);
            if (user && favorite.userId === user.uid) {
                nextUserFavorites.add(favorite.poemId);
            }
        });

        favoriteCountsByPoem = nextCounts;
        favoritePoemIds = user ? nextUserFavorites : new Set(loadFavoritePoems());
        if (user) saveFavoritePoems();
        renderPoems();
    }, (error) => {
        console.error("Favorites listener failed:", error);
        showToast("The saved pieces could not be reached.", "error");
    });

    unsubscribeComments = onSnapshot(query(collection(db, "comments"), orderBy("createdAt", "asc")), (snapshot) => {
        const grouped = new Map();
        snapshot.forEach((commentDoc) => {
            const data = commentDoc.data();
            if (!data.poemId) return;
            const comment = {
                id: commentDoc.id,
                poemId: data.poemId,
                userId: data.userId || "",
                userEmail: data.userEmail || "",
                author: data.author || "Night reader",
                text: data.text || "",
                createdAt: data.createdAt || null
            };
            const list = grouped.get(comment.poemId) || [];
            list.push(comment);
            grouped.set(comment.poemId, list);
        });
        commentsByPoem = grouped;
        renderPoems();
    }, (error) => {
        console.error("Comments listener failed:", error);
        showToast("The responses could not be reached.", "error");
    });

    if (!user) {
        readingProgressByPoem = new Map();
        renderPoems();
        return;
    }

    unsubscribeProgress = onSnapshot(query(collection(db, "readingProgress"), where("userId", "==", user.uid)), (snapshot) => {
        const nextProgress = new Map();
        snapshot.forEach((progressDoc) => {
            const data = progressDoc.data();
            if (data.userId === user.uid && data.poemId) {
                nextProgress.set(data.poemId, {
                    progress: Number(data.progress) || 0,
                    completed: Boolean(data.completed),
                    updatedAt: data.updatedAt || null
                });
            }
        });
        readingProgressByPoem = nextProgress;
        renderPoems();
    }, (error) => {
        console.error("Reading progress listener failed:", error);
        showToast("Your place in the archive could not be restored.", "error");
    });
}

function formatReadTime(content) {
    const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.ceil(words / 180))} min read`;
}

function createFavoriteButton(poem) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "poem-favorite-btn";
    const updateState = () => {
        const isActive = favoritePoemIds.has(poem.id);
        button.classList.toggle("active", isActive);
        button.textContent = isActive ? "Kept" : "Keep";
    };

    button.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (favoritePoemIds.has(poem.id)) {
            favoritePoemIds.delete(poem.id);
        } else {
            favoritePoemIds.add(poem.id);
        }
        updateState();
        saveFavoritePoems();
        if (!button.classList.contains("pulse")) {
            button.classList.add("pulse");
            window.setTimeout(() => button.classList.remove("pulse"), 340);
        }
    });

    updateState();
    return button;
}

function getMetaChip(label) {
    const chip = document.createElement("span");
    chip.className = "poem-meta-chip";
    chip.textContent = label;
    return chip;
}

function getPlainChip(label) {
    const chip = document.createElement("span");
    chip.className = "poem-meta-chip";
    chip.textContent = label;
    return chip;
}

function createFirebaseFavoriteButton(poem) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "poem-favorite-btn";

    const updateState = () => {
        const isActive = favoritePoemIds.has(poem.id);
        const count = favoriteCountsByPoem.get(poem.id) || 0;
        button.classList.toggle("active", isActive);
        button.textContent = `${isActive ? "Kept" : "Keep"} ${count || ""}`.trim();
        button.title = isActive ? "Let this piece go" : "Keep this piece";
    };

    button.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!currentUser) {
            showToast("Sign in to keep this piece beyond tonight.", "error");
            return;
        }

        const wasFavorite = favoritePoemIds.has(poem.id);
        if (wasFavorite) {
            favoritePoemIds.delete(poem.id);
        } else {
            favoritePoemIds.add(poem.id);
        }
        updateState();
        saveFavoritePoems();

        try {
            const favoriteRef = doc(db, "favorites", interactionDocId(currentUser.uid, poem.id));
            if (wasFavorite) {
                await deleteDoc(favoriteRef);
            } else {
                await setDoc(favoriteRef, {
                    poemId: poem.id,
                    userId: currentUser.uid,
                    userEmail: currentUser.email || "",
                    createdAt: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Favorite update failed:", error);
            if (wasFavorite) {
                favoritePoemIds.add(poem.id);
            } else {
                favoritePoemIds.delete(poem.id);
            }
            updateState();
            saveFavoritePoems();
            showToast("This piece could not be kept just now.", "error");
        }

        button.classList.add("pulse");
        window.setTimeout(() => button.classList.remove("pulse"), 340);
    });

    updateState();
    return button;
}

function getCategoryLabel(category) {
    const categoryNames = {
        love: "Love & Longing",
        nature: "Earth & Weather",
        life: "Life & Becoming",
        social: "City & Witness",
        spiritual: "Spirit & Silence",
        personal: "Self & Survival",
        other: "Elsewhere"
    };
    return categoryNames[category] || category;
}

function getProgressPercent(poemId) {
    return Math.max(0, Math.min(100, Math.round(readingProgressByPoem.get(poemId)?.progress || 0)));
}

function scheduleProgressSave(poemId, progress) {
    if (!currentUser) return;
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

    if (safeProgress <= getProgressPercent(poemId) && safeProgress !== 100) {
        return;
    }

    clearTimeout(progressSaveTimers.get(poemId));
    progressSaveTimers.set(poemId, window.setTimeout(async () => {
        try {
            await setDoc(doc(db, "readingProgress", interactionDocId(currentUser.uid, poemId)), {
                poemId,
                userId: currentUser.uid,
                userEmail: currentUser.email || "",
                progress: safeProgress,
                completed: safeProgress >= 100,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error("Progress save failed:", error);
        }
    }, 450));
}

function updateActiveReadingProgress() {
    if (!activeProgressPoemId || !currentUser) return;
    const card = document.querySelector(`[data-poem-id="${escapeCssIdentifier(activeProgressPoemId)}"]`);
    const text = card?.querySelector(".poem-text");
    if (!text) return;

    const rect = text.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const readableDistance = Math.max(1, rect.height + viewportHeight * 0.5);
    const viewedDistance = viewportHeight - rect.top;
    const progress = Math.max(10, Math.min(100, (viewedDistance / readableDistance) * 100));
    scheduleProgressSave(activeProgressPoemId, progress);
}

function createProgressPanel(poem) {
    const progress = getProgressPercent(poem.id);
    const panel = document.createElement("div");
    panel.className = "reading-progress-panel";
    panel.innerHTML = `
        <div class="reading-progress-label">
            <span>Place in the night</span>
            <strong>${progress}%</strong>
        </div>
        <div class="reading-progress-track" aria-hidden="true">
            <span style="width: ${progress}%"></span>
        </div>
    `;

    const markReadBtn = document.createElement("button");
    markReadBtn.type = "button";
    markReadBtn.className = "poem-action-btn";
    markReadBtn.textContent = progress >= 100 ? "Stayed with it" : "Mark as stayed";
    markReadBtn.disabled = !currentUser || progress >= 100;
    markReadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        scheduleProgressSave(poem.id, 100);
        showToast("Your place has been kept.", "success");
    });

    panel.appendChild(markReadBtn);
    return panel;
}

async function addComment(poemId, textarea) {
    if (!currentUser) {
        showToast("Sign in before leaving a response.", "error");
        return;
    }

    const text = textarea.value.trim();
    if (!text) {
        showToast("Leave at least one honest line.", "error");
        return;
    }

    try {
        textarea.disabled = true;
        await addDoc(collection(db, "comments"), {
            poemId,
            text,
            userId: currentUser.uid,
            userEmail: currentUser.email || "",
            author: currentUser.email?.split("@")[0] || "Night reader",
            createdAt: serverTimestamp()
        });
        textarea.value = "";
        showToast("Your response has been left quietly.", "success");
    } catch (error) {
        console.error("Comment add failed:", error);
        showToast("The response could not be placed.", "error");
    } finally {
        textarea.disabled = false;
    }
}

async function deleteComment(commentId) {
    if (!currentUser) return;
    try {
        await deleteDoc(doc(db, "comments", commentId));
        showToast("The response has been withdrawn.", "success");
    } catch (error) {
        console.error("Comment delete failed:", error);
        showToast("The response could not be withdrawn.", "error");
    }
}

function createCommentsSection(poem) {
    const comments = commentsByPoem.get(poem.id) || [];
    const section = document.createElement("section");
    section.className = "comments-section";
    section.setAttribute("aria-label", `Responses for ${poem.title || "poem"}`);

    const title = document.createElement("h4");
    title.textContent = `Responses (${comments.length})`;
    section.appendChild(title);

    const list = document.createElement("div");
    list.className = "comment-list";

    if (comments.length === 0) {
        const empty = document.createElement("p");
        empty.className = "comment-empty";
        empty.textContent = "No one has answered this piece yet.";
        list.appendChild(empty);
    } else {
        comments.forEach((comment) => {
            const item = document.createElement("article");
            item.className = "comment";
            item.innerHTML = `
                <div class="comment-head">
                    <strong>${escapeHtml(comment.author)}</strong>
                    <span>${formatDate(comment.createdAt)}</span>
                </div>
                <p>${escapeHtml(comment.text)}</p>
            `;

            if (currentUser && comment.userId === currentUser.uid) {
                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "comment-delete-btn";
                removeBtn.textContent = "Withdraw";
                removeBtn.addEventListener("click", () => deleteComment(comment.id));
                item.appendChild(removeBtn);
            }

            list.appendChild(item);
        });
    }

    section.appendChild(list);

    const form = document.createElement("form");
    form.className = "comment-form";
    form.innerHTML = `
        <label>
            <span>Leave a response</span>
            <textarea rows="3" maxlength="600" placeholder="${currentUser ? "A quiet line is enough." : "Sign in to respond"}"></textarea>
        </label>
        <button type="submit" class="poem-action-btn" ${currentUser ? "" : "disabled"}>Leave it here</button>
    `;

    const textarea = form.querySelector("textarea");
    textarea.disabled = !currentUser;
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        addComment(poem.id, textarea);
    });

    section.appendChild(form);
    return section;
}

function getAuthDiagnostic() {
    const origin = window.location.origin;
    const protocol = window.location.protocol;
    return {
        origin,
        protocol,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
        appId: firebaseConfig.appId
    };
}

function formatFirebaseAuthError(error) {
    let message = "The door would not open.";
    if (!error || !error.code) {
        return message;
    }

    if (error.code === "auth/user-not-found") {
        return "No account is tied to that address.";
    }
    if (error.code === "auth/wrong-password") {
        return "That passphrase does not match.";
    }
    if (error.code === "auth/invalid-email") {
        return "That address does not look right.";
    }
    if (error.code === "auth/weak-password") {
        return "Choose a passphrase with more weight.";
    }
    if (error.code === "auth/email-already-in-use") {
        return "That address already has a place here.";
    }
    if (error.code === "auth/invalid-credential") {
        const diag = getAuthDiagnostic();
        console.warn("Firebase invalid credential details:", { error, diag });
        return "The sign-in was refused. Check the Firebase email/password settings.";
    }
    if (error.code === "auth/configuration-not-found") {
        const diag = getAuthDiagnostic();
        console.warn("Firebase auth configuration diagnostics:", diag);
        if (diag.protocol === "file:") {
            return "Sign-in needs a local server or hosted page, not a file opened directly.";
        }
        return "The account doorway is not configured yet. Check Firebase auth settings and allowed origins.";
    }

    return message;
}

function applyTheme(theme) {
    const chosen = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = chosen;
    localStorage.setItem("lilpoet-theme", chosen);
    if (themeToggleBtn) {
        themeToggleBtn.textContent = chosen === "light" ? "Return to night" : "Lift the light";
    }
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
}

function setAuthSectionExpanded(expanded) {
    authSectionExpanded = expanded;
    authSection?.classList.toggle("collapsed", !expanded);
    authForm?.classList.toggle("hidden", !expanded);
    authToggleBtn?.setAttribute("aria-expanded", String(expanded));
}

function toggleAuthSection() {
    setAuthSectionExpanded(!authSectionExpanded);
}

async function migrateOwnedPoemsToLove() {
    // Guard: only run once per user session
    if (!currentUser || migratedUserId === currentUser.uid) {
        return;
    }

    // Only attempt migration if we have poems loaded
    if (allPoems.length === 0) {
        migratedUserId = currentUser.uid; // Mark as attempted
        return;
    }

    // Find user's poems that need category migration
    const poemsToUpdate = allPoems.filter(
        (poem) =>
            poem.userId === currentUser.uid &&
            (!poem.category || poem.category !== "love")
    );

    // Mark as attempted to avoid retry loop
    migratedUserId = currentUser.uid;

    if (poemsToUpdate.length === 0) {
        console.log("No pieces need Love & Longing category migration.");
        return;
    }

    console.log(`Migrating ${poemsToUpdate.length} piece(s) to Love & Longing...`);

    try {
        const updatePromises = poemsToUpdate.map((poem) =>
            updateDoc(doc(db, "poems", poem.id), {
                category: "love",
                updatedAt: serverTimestamp()
            }).catch((err) => {
                console.error(`Failed to migrate poem ${poem.id}:`, err);
                throw err;
            })
        );

        await Promise.all(updatePromises);

        const count = poemsToUpdate.length;
        const message = `Re-shelved ${count} piece${count === 1 ? "" : "s"} under Love & Longing.`;
        console.log("Migration complete:", message);
        showToast(message, "success");
    } catch (error) {
        console.error("Poem migration failed:", error);

        // Provide specific error feedback
        let errorMsg = "The older pieces could not be re-shelved.";
        if (error.code === "permission-denied") {
            errorMsg = "Permission was denied. Check the Firestore rules.";
        } else if (error.code === "unavailable") {
            errorMsg = "The archive is briefly unreachable.";
        }

        showToast(errorMsg, "error");
    }
}

function updateAuthDisplay(user) {
    currentUser = user;
    const signedIn = !!user;
    subscribeInteractionData(user);

    authState.textContent = signedIn
        ? `You returned as ${user.email || "your account"}.`
        : "You can read without being remembered. Sign in to keep your place.";

    // Hide entire auth section when signed in
    authSection?.classList.toggle("hidden", signedIn);

    signOutBtn.classList.toggle("hidden", !signedIn);
    poemForm.classList.toggle("disabled", !signedIn);
    submitBtn.disabled = !signedIn || saving;
    authorInput.disabled = !signedIn;
    titleInput.disabled = !signedIn;
    categoryInput.disabled = !signedIn;
    contentInput.disabled = !signedIn;
    statusText.textContent = signedIn ? "Waiting for a line." : "Sign in before leaving a piece.";

    sessionHint.textContent = signedIn
        ? `${user.email?.split("@")[0] || "your account"} is back in the room. Saved pieces and progress will hold.`
        : "Read in silence. Sign in when you want the archive to remember you.";

    renderPoems();
    migrateOwnedPoemsToLove();
}

async function handleSignIn() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showToast("Enter an address and a passphrase.", "error");
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = "Returning...";
        await signInWithEmailAndPassword(auth, email, password);
        showToast("You are back in the room.", "success");
    } catch (error) {
        console.error("Sign in failed:", error);
        const message = formatFirebaseAuthError(error);
        showToast(message, "error");
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Return";
    }
}

async function handleRegister() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showToast("Enter an address and a passphrase.", "error");
        return;
    }

    if (password.length < 6) {
        showToast("Let the passphrase hold at least six characters.", "error");
        return;
    }

    try {
        registerBtn.disabled = true;
        registerBtn.textContent = "Making room...";
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("A quiet place has been made for you.", "success");
    } catch (error) {
        console.error("Registration failed:", error);
        const message = formatFirebaseAuthError(error) || "The account could not be made.";
        showToast(message, "error");
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Begin";
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
        showToast("You have stepped back into the night.", "success");
    } catch (error) {
        console.error("Sign out failed:", error);
        showToast("You could not leave just yet.", "error");
    }
}

async function deletePoem(poemId) {
    if (!currentUser) {
        showToast("Sign in before removing a piece.", "error");
        return;
    }

    try {
        await deleteDoc(doc(db, "poems", poemId));
        showToast("The piece has been removed from the archive.", "success");
    } catch (error) {
        console.error("Delete failed:", error);
        showToast("The piece would not leave the archive.", "error");
    }
}

function highlightSearchTerm(text, term) {
    if (!term) return escapeHtml(text);
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escapedTerm})`, "gi");
    return escapeHtml(text).replace(regex, "<mark>$1</mark>");
}

function snippetForTerm(text, term) {
    const normalized = text.toLowerCase();
    const index = normalized.indexOf(term.toLowerCase());
    if (index === -1) return "";

    const start = Math.max(0, index - 32);
    const end = Math.min(text.length, index + term.length + 32);
    let snippet = text.slice(start, end).trim();

    if (start > 0) snippet = `... ${snippet}`;
    if (end < text.length) snippet = `${snippet} ...`;
    return snippet;
}

function formatDate(ts) {
    if (!ts) return "Just now";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    if (hideToastTimer) clearTimeout(hideToastTimer);
    hideToastTimer = setTimeout(() => {
        toast.className = "toast";
    }, 2200);
}

function setSavingState(isSaving) {
    saving = isSaving;
    submitBtn.disabled = isSaving || !currentUser;
    submitBtn.textContent = isSaving ? "Saving..." : "Place in archive";
    statusText.textContent = isSaving
        ? "Carrying the line into the archive..."
        : currentUser
            ? "Waiting for a line."
            : "Sign in before leaving a piece.";
}

function getSliderLevel(slider, fallback) {
    return Math.max(0, Math.min(1, Number(slider?.value ?? fallback) / 100));
}

function makeNoiseBuffer(ctx, seconds = 2) {
    const frameCount = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
        output[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function makeVinylBuffer(ctx, seconds = 4) {
    const frameCount = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
        const crackle = Math.random() > 0.985 ? (Math.random() * 2 - 1) * 0.9 : 0;
        output[i] = (Math.random() * 2 - 1) * 0.04 + crackle;
    }
    return buffer;
}

async function loadPianoBuffer(ctx) {
    if (audioBufferCache) return audioBufferCache;
    const response = await fetch("audio/beat.mp3");
    if (!response.ok) {
        throw new Error(`Failed to load audio file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    audioBufferCache = await ctx.decodeAudioData(arrayBuffer);
    return audioBufferCache;
}

function applyAmbientVolumes() {
    if (!audioNodes) return;
    audioNodes.rainGain.gain.setTargetAtTime(getSliderLevel(rainVolume, 35) * 0.28, audioContext.currentTime, 0.04);
    audioNodes.pianoGain.gain.setTargetAtTime(getSliderLevel(pianoVolume, 28) * 0.45, audioContext.currentTime, 0.04);
    audioNodes.vinylGain.gain.setTargetAtTime(getSliderLevel(vinylVolume, 18) * 0.18, audioContext.currentTime, 0.04);
}

async function createAmbientAudio() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = makeNoiseBuffer(ctx, 2.5);
    rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 950;
    rainFilter.Q.value = 0.7;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSource.connect(rainFilter).connect(rainGain).connect(masterGain);

    const vinylSource = ctx.createBufferSource();
    vinylSource.buffer = makeVinylBuffer(ctx, 4);
    vinylSource.loop = true;
    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = "highpass";
    vinylFilter.frequency.value = 1600;
    const vinylGain = ctx.createGain();
    vinylGain.gain.value = 0;
    vinylSource.connect(vinylFilter).connect(vinylGain).connect(masterGain);

    const pianoSource = ctx.createBufferSource();
    pianoSource.buffer = await loadPianoBuffer(ctx);
    pianoSource.loop = true;
    const pianoGain = ctx.createGain();
    pianoGain.gain.value = 0;
    pianoSource.connect(pianoGain).connect(masterGain);

    rainSource.start();
    vinylSource.start();
    pianoSource.start();

    return {
        ctx,
        sources: [rainSource, vinylSource, pianoSource],
        rainGain,
        pianoGain,
        vinylGain,
        masterGain
    };
}

async function startAmbientMode() {
    if (!audioContext || audioContext.state === "closed") {
        try {
            audioNodes = await createAmbientAudio();
            audioContext = audioNodes.ctx;
        } catch (error) {
            console.error("Failed to load ambient audio:", error);
            showToast("The room tone could not begin.", "error");
            return;
        }
    }

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    audioActive = true;
    applyAmbientVolumes();
    audioToggleBtn.classList.add("active");
    audioToggleBtn.textContent = "Quiet";
    audioToggleBtn.setAttribute("aria-pressed", "true");
    showToast("Room tone is now under the piece.", "success");
}

async function stopAmbientMode() {
    if (!audioContext) return;

    try {
        audioNodes?.sources?.forEach((source) => source.stop());
        await audioContext.close();
    } catch (error) {
        console.warn("Audio stop error:", error);
    }

    audioContext = null;
    audioNodes = null;
    audioActive = false;

    audioToggleBtn.classList.remove("active");
    audioToggleBtn.textContent = "Play";
    audioToggleBtn.setAttribute("aria-pressed", "false");
    showToast("The room has gone quiet.", "success");
}

function toggleAmbientMode() {
    if (audioActive) {
        stopAmbientMode();
    } else {
        startAmbientMode();
    }
}

async function editPoem(poemId, currentContent, poemElement) {
    const poemText = poemElement.querySelector('.poem-text');
    const originalContent = poemText.textContent;

    // Make the text editable
    poemText.contentEditable = true;
    poemText.focus();

    // Select all text for easy replacement
    const range = document.createRange();
    range.selectNodeContents(poemText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Add visual indication that it's being edited
    poemText.classList.add('editing');

    // Handle saving on Enter key or losing focus
    const saveEdit = async () => {
        const newContent = poemText.textContent.trim();
        if (newContent === originalContent || newContent === "") {
            // No changes or empty, revert
            poemText.textContent = originalContent;
            poemText.contentEditable = false;
            poemText.classList.remove('editing');
            return;
        }

        try {
            const poemRef = doc(db, "poems", poemId);
            await updateDoc(poemRef, {
                content: newContent,
                updatedAt: serverTimestamp()
            });
            showToast("The piece has been revised.", "success");
        } catch (error) {
            console.error("Update failed:", error);
            showToast("The revision would not hold.", "error");
            // Revert on error
            poemText.textContent = originalContent;
        }

        poemText.contentEditable = false;
        poemText.classList.remove('editing');
    };

    // Save on Enter (without Shift)
    poemText.addEventListener('keydown', function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEdit();
            poemText.removeEventListener('keydown', handleKeydown);
        } else if (e.key === 'Escape') {
            // Cancel edit
            poemText.textContent = originalContent;
            poemText.contentEditable = false;
            poemText.classList.remove('editing');
            poemText.removeEventListener('keydown', handleKeydown);
            poemText.removeEventListener('blur', handleBlur);
        }
    }, { once: true });

    // Save on blur (clicking away)
    const handleBlur = () => {
        saveEdit();
        poemText.removeEventListener('blur', handleBlur);
    };
    poemText.addEventListener('blur', handleBlur);
}

function animateMetric(el, value) {
    const start = Number(el.textContent) || 0;
    if (start === value) return;

    const duration = 260;
    const startTime = performance.now();

    function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        el.textContent = String(Math.round(start + (value - start) * progress));
        if (progress < 1) {
            requestAnimationFrame(tick);
        }
    }

    el.animate(
        [
            { transform: "translateY(0)" },
            { transform: "translateY(-6px)" },
            { transform: "translateY(0)" }
        ],
        { duration: 280, easing: "ease-out" }
    );

    requestAnimationFrame(tick);
}

// Scroll animation observer
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.classList.add('animate-in');
            }, index * 100); // Stagger animations
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '50px'
});

// Observe page elements with fade-in classes so they animate when scrolled into view
document.addEventListener('DOMContentLoaded', () => {
    try {
        document.querySelectorAll('.fade-reveal').forEach(el => scrollObserver.observe(el));
    } catch (e) {
        console.warn('Scroll reveal setup failed:', e);
    }
});

function updateCounters() {
    animateMetric(poemCount, allPoems.length);
    animateMetric(charCount, contentInput.value.length);
}

function formatPoemContent(text, term) {
    if (!text) return "";
    // Normalize line endings
    const normalized = String(text).replace(/\r\n/g, "\n");
    // Split into paragraphs on double newlines
    const parts = normalized.split(/\n\s*\n/);
    return parts
        .map((p) => {
            const escaped = escapeHtml(p.trim());
            return term ? highlightSearchTerm(escaped, term) : escaped;
        })
        .map((p) => `<p>${p}</p>`)
        .join("\n");
}

function renderPoems() {
    const term = searchInput.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;

    const filtered = allPoems.filter((poem) => {
        const title = (poem.title || "").toLowerCase();
        const content = (poem.content || "").toLowerCase();
        const matchesSearch = !term || title.includes(term) || content.includes(term);
        const matchesCategory = !selectedCategory || poem.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    poemsContainer.innerHTML = "";

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = term ? "Nothing in the archive answers that search." : "The archive is quiet for now.";
        poemsContainer.appendChild(empty);
        return;
    }

    for (const [index, poem] of filtered.entries()) {
        const card = document.createElement("details");
        card.className = "poem";
        card.dataset.poemId = poem.id;

        const summary = document.createElement("summary");
        summary.className = "poem-summary";

        const top = document.createElement("div");
        top.className = "poem-top";

        const heading = document.createElement("h3");
        heading.innerHTML = term
            ? highlightSearchTerm(poem.title || "Untitled Piece", term)
            : escapeHtml(poem.title || "Untitled Piece");
        heading.style.cursor = "pointer";
        heading.addEventListener("click", (e) => {
            e.stopPropagation();
            openFocusMode(poem);
        });

        const author = document.createElement("span");
        author.className = "poem-author";
        author.textContent = `held by ${poem.author}`;
        author.style.cursor = "pointer";
        author.addEventListener("click", (e) => {
            e.stopPropagation();
            openFocusMode(poem);
        });

        const category = document.createElement("span");
        category.className = "poem-category";
        if (poem.category) {
            category.textContent = getCategoryLabel(poem.category);
        }

        const metaRow = document.createElement("div");
        metaRow.className = "poem-meta";
        if (poem.category) {
            metaRow.appendChild(getMetaChip(getCategoryLabel(poem.category)));
        }
        metaRow.appendChild(getMetaChip(formatReadTime(poem.content)));

        const favoriteBtn = createFirebaseFavoriteButton(poem);

        const isOwnPoem = currentUser && poem.userId === currentUser.uid;
        let deleteBtn = null;
        let editBtn = null;
        if (isOwnPoem) {
            editBtn = document.createElement("button");
            editBtn.className = "poem-edit-btn";
            editBtn.textContent = "Revise";
            editBtn.type = "button";
            editBtn.title = "Revise this piece";
            editBtn.onclick = (e) => {
                e.stopPropagation();
                editAuthor(poem.id, poem.author);
            };

            deleteBtn = document.createElement("button");
            deleteBtn.className = "poem-delete-btn";
            deleteBtn.textContent = "Remove";
            deleteBtn.type = "button";
            deleteBtn.title = "Remove this piece";
            deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await deletePoem(poem.id);
            });
        }

        const time = document.createElement("span");
        time.className = "poem-time";
        const createdDate = poem.createdAt ? new Date(poem.createdAt.toDate ? poem.createdAt.toDate() : poem.createdAt) : new Date();
        const updatedDate = poem.updatedAt ? new Date(poem.updatedAt.toDate ? poem.updatedAt.toDate() : poem.updatedAt) : createdDate;

        const timeAgo = formatDate(updatedDate);
        const fullDate = updatedDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        time.textContent = timeAgo;
        time.title = `Entered: ${createdDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })}${poem.updatedAt ? `\nRevised: ${fullDate}` : ''}`;

        top.appendChild(heading);
        top.appendChild(author);
        if (poem.category) {
            top.appendChild(category);
        }
        top.appendChild(metaRow);
        if (deleteBtn) {
            top.appendChild(editBtn);
            top.appendChild(deleteBtn);
        }
        top.appendChild(time);
        top.appendChild(favoriteBtn);

        summary.appendChild(top);

        if (term) {
            const titleMatch = (poem.title || "").toLowerCase().includes(term);
            const contentMatch = (poem.content || "").toLowerCase().includes(term);
            if (titleMatch || contentMatch) {
                const matchLabel = document.createElement("div");
                matchLabel.className = "poem-match";
                const matchedSections = [];
                if (titleMatch) matchedSections.push("title");
                if (contentMatch) matchedSections.push("body");
                matchLabel.textContent = `Found in the ${matchedSections.join(" and ")}`;
                summary.appendChild(matchLabel);

                if (contentMatch && !titleMatch) {
                    const snippetText = snippetForTerm(poem.content || "", term);
                    if (snippetText) {
                        const snippet = document.createElement("p");
                        snippet.className = "poem-snippet";
                        snippet.innerHTML = highlightSearchTerm(snippetText, term);
                        summary.appendChild(snippet);
                    }
                }
            }
        }

        const body = document.createElement("div");
        body.className = "poem-body";

        const paragraph = document.createElement("div");
        paragraph.className = "poem-text";
        paragraph.innerHTML = formatPoemContent(poem.content || "", term);

        body.appendChild(createProgressPanel(poem));
        body.appendChild(paragraph);

        const notes = document.createElement("details");
        notes.className = "poem-notes";
        notes.innerHTML = `
            <summary>Under the surface</summary>
            <p>${escapeHtml(poem.notes || "A quiet note on the room, the hour, and what the piece is still carrying.")}</p>
        `;
        body.appendChild(notes);
        body.appendChild(createCommentsSection(poem));

        if (currentUser && poem.userId === currentUser.uid) {
            const editPoemBtn = document.createElement("button");
            editPoemBtn.className = "poem-edit-content-btn";
            editPoemBtn.textContent = "Revise piece";
            editPoemBtn.type = "button";
            editPoemBtn.onclick = (e) => {
                e.stopPropagation();
                editPoem(poem.id, poem.content, card);
            };
            body.appendChild(editPoemBtn);
        }

        card.appendChild(summary);
        card.appendChild(body);
        poemsContainer.appendChild(card);

        card.addEventListener("toggle", () => {
            if (card.open) {
                activeProgressPoemId = poem.id;
                scheduleProgressSave(poem.id, Math.max(10, getProgressPercent(poem.id)));
                document.querySelectorAll(".poem[open]").forEach((other) => {
                    if (other !== card) {
                        other.open = false;
                    }
                });
                window.setTimeout(updateActiveReadingProgress, 120);
            } else if (activeProgressPoemId === poem.id) {
                updateActiveReadingProgress();
                activeProgressPoemId = null;
            }
        });

        // Register for scroll animations
        scrollObserver.observe(card);
    }
}

searchInput.addEventListener("input", renderPoems);
categoryFilter.addEventListener("change", renderPoems);
audioToggleBtn.addEventListener("click", toggleAmbientMode);
rainVolume?.addEventListener("input", applyAmbientVolumes);
pianoVolume?.addEventListener("input", applyAmbientVolumes);
vinylVolume?.addEventListener("input", applyAmbientVolumes);
authToggleBtn?.addEventListener("click", toggleAuthSection);
themeToggleBtn?.addEventListener("click", toggleTheme);
menuToggleBtn?.addEventListener("click", () => {
    const expanded = mobileNav?.classList.toggle("active");
    menuToggleBtn?.setAttribute("aria-expanded", String(Boolean(expanded)));
});
document.querySelectorAll('.nav-links a').forEach((link) => link.addEventListener('click', () => {
    mobileNav?.classList.remove('active');
    menuToggleBtn?.setAttribute('aria-expanded', 'false');
}));

loginBtn.addEventListener("click", handleSignIn);
registerBtn.addEventListener("click", handleRegister);
signOutBtn.addEventListener("click", handleSignOut);
onAuthStateChanged(auth, updateAuthDisplay);
window.addEventListener("scroll", updateActiveReadingProgress, { passive: true });
window.addEventListener("resize", updateActiveReadingProgress);

const storedTheme = localStorage.getItem("lilpoet-theme") || "dark";
applyTheme(storedTheme);
updateAuthDisplay(auth.currentUser);
setAuthSectionExpanded(false);

// Auto-stagger reveal animations and enable subtle CTA float (respect reduced motion)
if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const reveals = document.querySelectorAll('.fade-reveal');
    reveals.forEach((el, i) => {
        if (!el.style.animationDelay && !el.style.getPropertyValue('--reveal-delay')) {
            el.style.setProperty('--reveal-delay', `${i * 0.12}s`);
        }
    });

    const cta = document.querySelector('.hero-cta .btn-primary');
    if (cta) setTimeout(() => cta.classList.add('animated'), 900);
}

// Mobile visual optimizations: reduce heavy visuals on touch/small screens
(function applyMobileOptimizations() {
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const smallScreen = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    if (prefersReduced) {
        document.body.classList.add('no-anim');
    }

    if (smallScreen || coarsePointer) {
        document.body.classList.add('mobile-optimized', 'no-anim', 'no-particles');
        document.querySelectorAll('.hero-particles').forEach(el => el.classList.add('hidden-on-mobile'));
    }
})();

titleInput.addEventListener("input", updateCounters);
contentInput.addEventListener("input", updateCounters);

poemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (saving) return;
    if (!currentUser) {
        showToast("Sign in before placing a piece in the archive.", "error");
        return;
    }

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const author = authorInput.value.trim() || currentUser.email?.split("@")[0] || "Unnamed witness";
    const category = categoryInput.value || "love";
    if (!title || !content) {
        showToast("Give the piece a title and a body before it enters.", "error");
        return;
    }

    try {
        setSavingState(true);

        await addDoc(collection(db, "poems"), {
            title,
            content,
            author,
            category,
            userId: currentUser.uid,
            userEmail: currentUser.email || "",
            createdAt: serverTimestamp()
        });

        poemForm.reset();
        if (currentUser && !authorInput.value.trim()) {
            authorInput.value = currentUser.email?.split("@")[0] || "";
        }
        updateCounters();
        showToast("The piece has entered the archive.", "success");
    } catch (error) {
        console.error("Add poem failed:", error);
        showToast("The piece could not enter the archive.", "error");
    } finally {
        setSavingState(false);
    }
});

const poemsQuery = query(collection(db, "poems"), orderBy("createdAt", "desc"));

onSnapshot(
    poemsQuery,
    (snapshot) => {
        allPoems = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || "",
                content: data.content || "",
                author: data.author || "Unnamed witness",
                category: data.category || "love",
                userId: data.userId || null,
                userEmail: data.userEmail || "",
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
            };
        });

        if (initialLoad) {
            loadingIndicator.classList.remove("show");
            initialLoad = false;
        }

        updateCounters();
        renderPoems();
        checkUrlForPoem();
        migrateOwnedPoemsToLove();
    },
    (error) => {
        console.error("Realtime listener failed:", error);
        loadingIndicator.classList.remove("show");
        initialLoad = false;
        showToast("The live archive is unreachable. Check Firestore rules or indexes.", "error");
    }
);

updateCounters();
setSavingState(false);

// Check for poem ID in URL hash on page load
function checkUrlForPoem() {
    const hash = window.location.hash;
    if (hash.startsWith('#poem-')) {
        const poemId = hash.slice(6); // Remove '#poem-'
        const poem = allPoems.find(p => p.id === poemId);
        if (poem) {
            // Small delay to ensure DOM is ready
            setTimeout(() => openFocusMode(poem), 100);
        }
    }
}

// Listen for hash changes (back/forward navigation)
window.addEventListener('hashchange', checkUrlForPoem);

// Check URL on initial load (after poems are loaded)
setTimeout(checkUrlForPoem, 500);
