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
const authNavLink = document.getElementById("authNavLink");
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

// ── Like helpers (localStorage, no login required) ───────────────────────────
const likesStorageKey = "lilpoet-likes";

function loadLikes() {
    try { return JSON.parse(localStorage.getItem(likesStorageKey) || "{}"); }
    catch (e) { return {}; }
}
function saveLikes(data) {
    try { localStorage.setItem(likesStorageKey, JSON.stringify(data)); } catch (e) { }
}
function getLikeCount(poemId) { return loadLikes()[poemId] || 0; }
function hasLiked(poemId) { return Boolean(loadLikes()[poemId + "_liked"]); }
function toggleLike(poemId) {
    const data = loadLikes();
    const liked = Boolean(data[poemId + "_liked"]);
    const count = data[poemId] || 0;
    if (liked) { data[poemId] = Math.max(0, count - 1); delete data[poemId + "_liked"]; }
    else { data[poemId] = count + 1; data[poemId + "_liked"] = true; }
    saveLikes(data);
    return !liked;
}
// ─────────────────────────────────────────────────────────────────────────────

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
loadingIndicator.classList.add("show");

enterBtn?.addEventListener("click", () => {
    introScreen.classList.add("fade-out");
    setTimeout(() => { introScreen.style.display = "none"; shell.classList.add("ready"); }, 800);
});

function openFocusMode(poem) {
    focusPoem.innerHTML = `
        <h2>${escapeHtml(poem.title || "Untitled Piece")}</h2>
        <div class="focus-author">by ${escapeHtml(poem.author)}</div>
        <div class="focus-text">${escapeHtml(poem.content || "")}</div>
    `;
    focusOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
    const url = new URL(window.location);
    url.hash = `#poem-${poem.id}`;
    window.history.replaceState(null, '', url);
}

function closeFocusMode() {
    focusOverlay.classList.remove("active");
    document.body.style.overflow = "";
    const url = new URL(window.location);
    url.hash = '';
    window.history.replaceState(null, '', url);
}

closeFocusBtn?.addEventListener("click", closeFocusMode);
focusOverlay?.addEventListener("click", (e) => { if (e.target === focusOverlay) closeFocusMode(); });
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focusOverlay.classList.contains("active")) closeFocusMode();
});

let allPoems = [];
let hideToastTimer = null;
let saving = false;
let currentUser = null;
let initialLoad = true;
let authSectionExpanded = false;
let migratedUserId = null;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function normalizeText(value) { return (value || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function escapeCssIdentifier(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
}
function loadFavoritePoems() {
    try { return JSON.parse(localStorage.getItem(favoriteStorageKey) || "[]"); }
    catch (e) { return []; }
}
function saveFavoritePoems() {
    try { localStorage.setItem(favoriteStorageKey, JSON.stringify([...favoritePoemIds])); } catch (e) { }
}
function interactionDocId(userId, poemId) { return `${userId}_${poemId}`; }

function stopInteractionListeners() {
    unsubscribeFavorites?.(); unsubscribeComments?.(); unsubscribeProgress?.();
    unsubscribeFavorites = null; unsubscribeComments = null; unsubscribeProgress = null;
}

function subscribeInteractionData(user) {
    stopInteractionListeners();
    unsubscribeFavorites = onSnapshot(collection(db, "favorites"), (snapshot) => {
        const nextCounts = new Map();
        const nextUserFavorites = new Set();
        snapshot.forEach((d) => {
            const f = d.data();
            if (!f.poemId) return;
            nextCounts.set(f.poemId, (nextCounts.get(f.poemId) || 0) + 1);
            if (user && f.userId === user.uid) nextUserFavorites.add(f.poemId);
        });
        favoriteCountsByPoem = nextCounts;
        favoritePoemIds = user ? nextUserFavorites : new Set(loadFavoritePoems());
        if (user) saveFavoritePoems();
        renderPoems();
    }, (err) => { console.error("Favorites listener failed:", err); showToast("The saved pieces could not be reached.", "error"); });

    unsubscribeComments = onSnapshot(query(collection(db, "comments"), orderBy("createdAt", "asc")), (snapshot) => {
        const grouped = new Map();
        snapshot.forEach((d) => {
            const data = d.data();
            if (!data.poemId) return;
            const c = {
                id: d.id, poemId: data.poemId, userId: data.userId || "", userEmail: data.userEmail || "",
                author: data.author || "Night reader", text: data.text || "", createdAt: data.createdAt || null
            };
            const list = grouped.get(c.poemId) || [];
            list.push(c);
            grouped.set(c.poemId, list);
        });
        commentsByPoem = grouped;
        renderPoems();
    }, (err) => { console.error("Comments listener failed:", err); showToast("The responses could not be reached.", "error"); });

    if (!user) { readingProgressByPoem = new Map(); renderPoems(); return; }

    unsubscribeProgress = onSnapshot(query(collection(db, "readingProgress"), where("userId", "==", user.uid)), (snapshot) => {
        const nextProgress = new Map();
        snapshot.forEach((d) => {
            const data = d.data();
            if (data.userId === user.uid && data.poemId) {
                nextProgress.set(data.poemId, { progress: Number(data.progress) || 0, completed: Boolean(data.completed), updatedAt: data.updatedAt || null });
            }
        });
        readingProgressByPoem = nextProgress;
        renderPoems();
    }, (err) => { console.error("Reading progress listener failed:", err); showToast("Your place could not be found.", "error"); });
}

function getMetaChip(label) {
    const chip = document.createElement("span");
    chip.className = "poem-meta-chip";
    chip.textContent = label;
    return chip;
}

function getCategoryLabel(category) {
    const names = {
        love: "Love & Longing", nature: "Earth & Weather", life: "Life & Becoming",
        social: "City & Witness", spiritual: "Spirit & Silence", personal: "Self & Survival", other: "Elsewhere"
    };
    return names[category] || category;
}

function getProgressPercent(poemId) {
    return Math.max(0, Math.min(100, Math.round(readingProgressByPoem.get(poemId)?.progress || 0)));
}

function scheduleProgressSave(poemId, progress) {
    if (!currentUser) return;
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
    if (safeProgress <= getProgressPercent(poemId) && safeProgress !== 100) return;
    clearTimeout(progressSaveTimers.get(poemId));
    progressSaveTimers.set(poemId, window.setTimeout(async () => {
        try {
            await setDoc(doc(db, "readingProgress", interactionDocId(currentUser.uid, poemId)), {
                poemId, userId: currentUser.uid, userEmail: currentUser.email || "",
                progress: safeProgress, completed: safeProgress >= 100, updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error("Progress save failed:", e); }
    }, 450));
}

function updateActiveReadingProgress() {
    if (!activeProgressPoemId || !currentUser) return;
    const card = document.querySelector(`[data-poem-id="${escapeCssIdentifier(activeProgressPoemId)}"]`);
    const text = card?.querySelector(".poem-text");
    if (!text) return;
    const rect = text.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const progress = Math.max(10, Math.min(100, ((vh - rect.top) / Math.max(1, rect.height + vh * 0.5)) * 100));
    scheduleProgressSave(activeProgressPoemId, progress);
}

async function addComment(poemId, textarea) {
    if (!currentUser) { showToast("Return before leaving a reply.", "error"); return; }
    const text = textarea.value.trim();
    if (!text) { showToast("Leave one line first.", "error"); return; }
    try {
        textarea.disabled = true;
        await addDoc(collection(db, "comments"), {
            poemId, text, userId: currentUser.uid, userEmail: currentUser.email || "",
            author: currentUser.email?.split("@")[0] || "Night reader", createdAt: serverTimestamp()
        });
        textarea.value = "";
        showToast("Left here.", "success");
    } catch (e) { console.error("Comment add failed:", e); showToast("The response could not be placed.", "error"); }
    finally { textarea.disabled = false; }
}

async function deleteComment(commentId) {
    if (!currentUser) return;
    try { await deleteDoc(doc(db, "comments", commentId)); showToast("The response has been withdrawn.", "success"); }
    catch (e) { console.error("Comment delete failed:", e); showToast("The response could not be withdrawn.", "error"); }
}

function createCommentsSection(poem) {
    const comments = commentsByPoem.get(poem.id) || [];
    const section = document.createElement("section");
    section.className = "comments-section";
    section.setAttribute("aria-label", `Responses for ${poem.title || "piece"}`);
    const title = document.createElement("h4");
    title.textContent = `Responses (${comments.length})`;
    section.appendChild(title);
    const list = document.createElement("div");
    list.className = "comment-list";
    if (comments.length === 0) {
        const empty = document.createElement("p");
        empty.className = "comment-empty";
        empty.textContent = "Still waiting.";
        list.appendChild(empty);
    } else {
        comments.forEach((comment) => {
            const item = document.createElement("article");
            item.className = "comment";
            item.innerHTML = `<div class="comment-head"><strong>${escapeHtml(comment.author)}</strong><span>${formatDate(comment.createdAt)}</span></div><p>${escapeHtml(comment.text)}</p>`;
            if (currentUser && comment.userId === currentUser.uid) {
                const removeBtn = document.createElement("button");
                removeBtn.type = "button"; removeBtn.className = "comment-delete-btn"; removeBtn.textContent = "Withdraw";
                removeBtn.addEventListener("click", () => deleteComment(comment.id));
                item.appendChild(removeBtn);
            }
            list.appendChild(item);
        });
    }
    section.appendChild(list);
    const form = document.createElement("form");
    form.className = "comment-form";
    form.innerHTML = `<label><span>Leave a response</span><textarea rows="3" maxlength="600" placeholder="${currentUser ? "A line is enough." : "Return to reply"}"></textarea></label><button type="submit" class="poem-action-btn" ${currentUser ? "" : "disabled"}>Add</button>`;
    const textarea = form.querySelector("textarea");
    textarea.disabled = !currentUser;
    form.addEventListener("submit", (e) => { e.preventDefault(); addComment(poem.id, textarea); });
    section.appendChild(form);
    return section;
}

function getAuthDiagnostic() {
    return {
        origin: window.location.origin, protocol: window.location.protocol,
        authDomain: firebaseConfig.authDomain, projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey, appId: firebaseConfig.appId
    };
}

function formatFirebaseAuthError(error) {
    if (!error || !error.code) return "The door would not open.";
    if (error.code === "auth/user-not-found") return "No account is tied to that address.";
    if (error.code === "auth/wrong-password") return "That passphrase does not match.";
    if (error.code === "auth/invalid-email") return "That address does not look right.";
    if (error.code === "auth/weak-password") return "Choose a passphrase with more weight.";
    if (error.code === "auth/email-already-in-use") return "That address already has a place here.";
    if (error.code === "auth/invalid-credential") {
        console.warn("Firebase invalid credential:", { error, diag: getAuthDiagnostic() });
        return "The sign-in was refused. Check the Firebase email/password settings.";
    }
    if (error.code === "auth/configuration-not-found") {
        const diag = getAuthDiagnostic();
        console.warn("Firebase auth config diagnostics:", diag);
        if (diag.protocol === "file:") return "Sign-in needs a local server or hosted page, not a file opened directly.";
        return "The account doorway is not configured yet. Check Firebase auth settings and allowed origins.";
    }
    return "The door would not open.";
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
    localStorage.setItem("lilpoet-theme", document.documentElement.dataset.theme);
}

function setAuthSectionExpanded(expanded) {
    authSectionExpanded = expanded;
    authSection?.classList.toggle("collapsed", !expanded);
    authForm?.classList.toggle("hidden", !expanded);
    authToggleBtn?.setAttribute("aria-expanded", String(expanded));
}

function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openSignIn() { setAuthSectionExpanded(true); scrollToSection("authSection"); }
function toggleAuthSection() { setAuthSectionExpanded(!authSectionExpanded); }

async function migrateOwnedPoemsToLove() {
    if (!currentUser || migratedUserId === currentUser.uid) return;
    if (allPoems.length === 0) { migratedUserId = currentUser.uid; return; }
    const toUpdate = allPoems.filter(p => p.userId === currentUser.uid && (!p.category || p.category !== "love"));
    migratedUserId = currentUser.uid;
    if (toUpdate.length === 0) return;
    try {
        await Promise.all(toUpdate.map(p => updateDoc(doc(db, "poems", p.id), { category: "love", updatedAt: serverTimestamp() })));
        showToast(`Moved ${toUpdate.length} piece${toUpdate.length === 1 ? "" : "s"} to Love & Longing.`, "success");
    } catch (e) {
        console.error("Poem migration failed:", e);
        showToast(e.code === "permission-denied" ? "Permission was denied. Check the Firestore rules." : "The older pieces could not be re-shelved.", "error");
    }
}

function updateAuthDisplay(user) {
    currentUser = user;
    const signedIn = !!user;
    subscribeInteractionData(user);
    authState.textContent = signedIn ? `You returned as ${user.email || "your account"}.` : "Open to anyone who writes quietly.";
    authSection?.classList.toggle("hidden", signedIn);
    signOutBtn.classList.toggle("hidden", !signedIn);
    if (authNavLink) {
        authNavLink.textContent = signedIn ? "Sign Out" : "Sign In";
        authNavLink.setAttribute("href", signedIn ? "#hero" : "#authSection");
    }
    poemForm.classList.toggle("disabled", !signedIn);
    submitBtn.disabled = !signedIn || saving;
    authorInput.disabled = !signedIn;
    titleInput.disabled = !signedIn;
    categoryInput.disabled = !signedIn;
    contentInput.disabled = !signedIn;
    statusText.textContent = signedIn ? "Still waiting." : "Return before leaving a piece.";
    sessionHint.textContent = signedIn
        ? `${user.email?.split("@")[0] || "your account"} is back in the room. Saved pieces and progress will hold.`
        : "A room for what survives the night.";
    renderPoems();
    migrateOwnedPoemsToLove();
}

async function handleSignIn() {
    const email = emailInput.value.trim(), password = passwordInput.value.trim();
    if (!email || !password) { showToast("Enter an address and a passphrase.", "error"); return; }
    try {
        loginBtn.disabled = true; loginBtn.textContent = "Returning...";
        await signInWithEmailAndPassword(auth, email, password);
        showToast("You are back in the room.", "success");
    } catch (e) { console.error("Sign in failed:", e); showToast(formatFirebaseAuthError(e), "error"); }
    finally { loginBtn.disabled = false; loginBtn.textContent = "Sign In"; }
}

async function handleRegister() {
    const email = emailInput.value.trim(), password = passwordInput.value.trim();
    if (!email || !password) { showToast("Enter an address and a passphrase.", "error"); return; }
    if (password.length < 6) { showToast("Let the passphrase hold at least six characters.", "error"); return; }
    try {
        registerBtn.disabled = true; registerBtn.textContent = "Making room...";
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("You can add your drop now.", "success");
    } catch (e) { console.error("Registration failed:", e); showToast(formatFirebaseAuthError(e) || "The account could not be made.", "error"); }
    finally { registerBtn.disabled = false; registerBtn.textContent = "Start here"; }
}

async function handleSignOut() {
    try { await signOut(auth); showToast("You have stepped back into the night.", "success"); }
    catch (e) { console.error("Sign out failed:", e); showToast("You could not leave just yet.", "error"); }
}

async function deletePoem(poemId) {
    if (!currentUser) { showToast("Return before removing a piece.", "error"); return; }
    try { await deleteDoc(doc(db, "poems", poemId)); showToast("The piece is gone.", "success"); }
    catch (e) { console.error("Delete failed:", e); showToast("The piece could not leave.", "error"); }
}

function highlightSearchTerm(text, term) {
    if (!term) return escapeHtml(text);
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escapeHtml(text).replace(new RegExp(`(${escapedTerm})`, "gi"), "<mark>$1</mark>");
}

function snippetForTerm(text, term) {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return "";
    const start = Math.max(0, index - 32), end = Math.min(text.length, index + term.length + 32);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = `... ${snippet}`;
    if (end < text.length) snippet = `${snippet} ...`;
    return snippet;
}

function formatDate(ts) {
    if (!ts) return "Just now";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    if (hideToastTimer) clearTimeout(hideToastTimer);
    hideToastTimer = setTimeout(() => { toast.className = "toast"; }, 2200);
}

function setSavingState(isSaving) {
    saving = isSaving;
    submitBtn.disabled = isSaving || !currentUser;
    submitBtn.textContent = isSaving ? "Holding..." : "Add";
    statusText.textContent = isSaving ? "Adding your drop..." : currentUser ? "Still waiting." : "Return before leaving a piece.";
}

async function editPoem(poemId, currentContent, poemElement) {
    const poemText = poemElement.querySelector('.poem-text');
    const originalContent = poemText.textContent;
    poemText.contentEditable = true;
    poemText.focus();
    const range = document.createRange();
    range.selectNodeContents(poemText);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    poemText.classList.add('editing');

    const saveEdit = async () => {
        const newContent = poemText.textContent.trim();
        if (newContent === originalContent || newContent === "") {
            poemText.textContent = originalContent; poemText.contentEditable = false; poemText.classList.remove('editing'); return;
        }
        try {
            await updateDoc(doc(db, "poems", poemId), { content: newContent, updatedAt: serverTimestamp() });
            showToast("The piece has been revised.", "success");
        } catch (e) {
            console.error("Update failed:", e); showToast("The revision would not hold.", "error");
            poemText.textContent = originalContent;
        }
        poemText.contentEditable = false; poemText.classList.remove('editing');
    };

    poemText.addEventListener('keydown', function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); poemText.removeEventListener('keydown', handleKeydown); }
        else if (e.key === 'Escape') {
            poemText.textContent = originalContent; poemText.contentEditable = false; poemText.classList.remove('editing');
            poemText.removeEventListener('keydown', handleKeydown); poemText.removeEventListener('blur', handleBlur);
        }
    }, { once: true });
    const handleBlur = () => { saveEdit(); poemText.removeEventListener('blur', handleBlur); };
    poemText.addEventListener('blur', handleBlur);
}

function animateMetric(el, value) {
    const start = Number(el.textContent) || 0;
    if (start === value) return;
    const duration = 260, startTime = performance.now();
    function tick(now) {
        const p = Math.min((now - startTime) / duration, 1);
        el.textContent = String(Math.round(start + (value - start) * p));
        if (p < 1) requestAnimationFrame(tick);
    }
    el.animate([{ transform: "translateY(0)" }, { transform: "translateY(-6px)" }, { transform: "translateY(0)" }], { duration: 280, easing: "ease-out" });
    requestAnimationFrame(tick);
}

const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) setTimeout(() => entry.target.classList.add('animate-in'), index * 100);
    });
}, { threshold: 0.1, rootMargin: '50px' });

document.addEventListener('DOMContentLoaded', () => {
    try { document.querySelectorAll('.fade-reveal').forEach(el => scrollObserver.observe(el)); }
    catch (e) { console.warn('Scroll reveal setup failed:', e); }
});

function updateCounters() { return; }

function formatPoemContent(text, term) {
    if (!text) return "";
    return String(text).replace(/\r\n/g, "\n").split(/\n\s*\n/)
        .map(p => { const esc = escapeHtml(p.trim()); return term ? highlightSearchTerm(esc, term) : esc; })
        .map(p => `<p>${p}</p>`).join("\n");
}

function renderPoems() {
    const term = searchInput.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;
    const filtered = allPoems.filter((poem) => {
        const matchesSearch = !term || (poem.title || "").toLowerCase().includes(term) || (poem.content || "").toLowerCase().includes(term);
        const matchesCategory = !selectedCategory || poem.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    poemsContainer.innerHTML = "";
    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = term ? "That line has not surfaced yet." : "Still waiting.";
        poemsContainer.appendChild(empty);
        return;
    }

    for (const [index, poem] of filtered.entries()) {
        const card = document.createElement("article");
        card.className = "poem";
        card.dataset.poemId = poem.id;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Open ${poem.title || "Untitled Piece"}`);

        const summary = document.createElement("div");
        summary.className = "poem-summary";

        const top = document.createElement("div");
        top.className = "poem-top";

        const heading = document.createElement("h3");
        heading.innerHTML = term ? highlightSearchTerm(poem.title || "Untitled Piece", term) : escapeHtml(poem.title || "Untitled Piece");
        heading.style.cursor = "pointer";
        heading.addEventListener("click", (e) => { e.stopPropagation(); openFocusMode(poem); });

        const author = document.createElement("span");
        author.className = "poem-author";
        author.textContent = `by ${poem.author}`;

        // Category chip only — no read-time label
        const metaRow = document.createElement("div");
        metaRow.className = "poem-meta";
        if (poem.category) metaRow.appendChild(getMetaChip(getCategoryLabel(poem.category)));

        const isOwnPoem = currentUser && poem.userId === currentUser.uid;
        let editBtn = null, deleteBtn = null;
        if (isOwnPoem) {
            editBtn = document.createElement("button");
            editBtn.className = "poem-edit-btn"; editBtn.textContent = "Revise"; editBtn.type = "button";
            editBtn.title = "Revise this piece";
            editBtn.onclick = (e) => { e.stopPropagation(); editPoem(poem.id, poem.content, card); };

            deleteBtn = document.createElement("button");
            deleteBtn.className = "poem-delete-btn"; deleteBtn.textContent = "Remove"; deleteBtn.type = "button";
            deleteBtn.title = "Remove this piece";
            deleteBtn.addEventListener("click", async (e) => { e.stopPropagation(); await deletePoem(poem.id); });
        }

        // Timestamp — right-padded so it never clips
        const time = document.createElement("span");
        time.className = "poem-time";
        const createdDate = poem.createdAt ? new Date(poem.createdAt.toDate ? poem.createdAt.toDate() : poem.createdAt) : new Date();
        const updatedDate = poem.updatedAt ? new Date(poem.updatedAt.toDate ? poem.updatedAt.toDate() : poem.updatedAt) : createdDate;
        time.textContent = formatDate(updatedDate);
        time.title = `Entered: ${createdDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}${poem.updatedAt ? `\nRevised: ${updatedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`;

        // Like button — localStorage, no login required
        const likeBtn = document.createElement("button");
        likeBtn.type = "button";
        likeBtn.className = "poem-like-btn" + (hasLiked(poem.id) ? " liked" : "");
        likeBtn.setAttribute("aria-label", "Like this poem");
        likeBtn.innerHTML = `<span class="like-heart">${hasLiked(poem.id) ? "♥" : "♡"}</span><span class="like-count">${getLikeCount(poem.id)}</span>`;
        likeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const nowLiked = toggleLike(poem.id);
            likeBtn.classList.toggle("liked", nowLiked);
            likeBtn.querySelector(".like-heart").textContent = nowLiked ? "♥" : "♡";
            likeBtn.querySelector(".like-count").textContent = getLikeCount(poem.id);
            likeBtn.classList.add("pulse");
            setTimeout(() => likeBtn.classList.remove("pulse"), 350);
        });

        top.appendChild(heading);
        top.appendChild(author);
        top.appendChild(metaRow);
        if (editBtn) top.appendChild(editBtn);
        if (deleteBtn) top.appendChild(deleteBtn);
        top.appendChild(likeBtn);
        top.appendChild(time);
        summary.appendChild(top);

        if (term) {
            const titleMatch = (poem.title || "").toLowerCase().includes(term);
            const contentMatch = (poem.content || "").toLowerCase().includes(term);
            if (titleMatch || contentMatch) {
                const matchLabel = document.createElement("div");
                matchLabel.className = "poem-match";
                const sections = [];
                if (titleMatch) sections.push("title");
                if (contentMatch) sections.push("body");
                matchLabel.textContent = `Found in the ${sections.join(" and ")}`;
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

        card.appendChild(summary);
        poemsContainer.appendChild(card);

        card.addEventListener("click", () => {
            activeProgressPoemId = poem.id;
            scheduleProgressSave(poem.id, Math.max(10, getProgressPercent(poem.id)));
            openFocusMode(poem);
        });
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activeProgressPoemId = poem.id;
                scheduleProgressSave(poem.id, Math.max(10, getProgressPercent(poem.id)));
                openFocusMode(poem);
            }
        });
        scrollObserver.observe(card);
    }
}

// ── Event listeners ──────────────────────────────────────────────────────────
searchInput.addEventListener("input", renderPoems);
categoryFilter.addEventListener("change", renderPoems);
authToggleBtn?.addEventListener("click", toggleAuthSection);
menuToggleBtn?.addEventListener("click", () => {
    const expanded = mobileNav?.classList.toggle("active");
    menuToggleBtn?.setAttribute("aria-expanded", String(Boolean(expanded)));
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => {
    mobileNav?.classList.remove('active');
    menuToggleBtn?.setAttribute('aria-expanded', 'false');
}));
authNavLink?.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentUser) handleSignOut();
    else openSignIn();
});
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

if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.fade-reveal').forEach((el, i) => {
        if (!el.style.animationDelay && !el.style.getPropertyValue('--reveal-delay'))
            el.style.setProperty('--reveal-delay', `${i * 0.12}s`);
    });
    const cta = document.querySelector('.hero-cta .btn-primary');
    if (cta) setTimeout(() => cta.classList.add('animated'), 900);
}

(function applyMobileOptimizations() {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const smallScreen = window.matchMedia?.('(max-width: 760px)').matches;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    if (prefersReduced) document.body.classList.add('no-anim');
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
    if (!currentUser) { showToast("Return before leaving a piece.", "error"); return; }
    const title = titleInput.value.trim(), content = contentInput.value.trim();
    const author = authorInput.value.trim() || currentUser.email?.split("@")[0] || "Unnamed witness";
    const category = categoryInput.value || "love";
    if (!title || !content) { showToast("Give the piece a title and a body before it enters.", "error"); return; }
    try {
        setSavingState(true);
        await addDoc(collection(db, "poems"), {
            title, content, author, category,
            userId: currentUser.uid, userEmail: currentUser.email || "", createdAt: serverTimestamp()
        });
        poemForm.reset();
        if (currentUser && !authorInput.value.trim()) authorInput.value = currentUser.email?.split("@")[0] || "";
        updateCounters();
        showToast("The piece is here.", "success");
    } catch (e) { console.error("Add poem failed:", e); showToast("The piece could not be left here.", "error"); }
    finally { setSavingState(false); }
});

const poemsQuery = query(collection(db, "poems"), orderBy("createdAt", "desc"));
onSnapshot(poemsQuery, (snapshot) => {
    allPoems = snapshot.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id, title: data.title || "", content: data.content || "",
            author: data.author || "Unnamed witness", category: data.category || "love",
            userId: data.userId || null, userEmail: data.userEmail || "",
            createdAt: data.createdAt || null, updatedAt: data.updatedAt || null
        };
    });
    if (initialLoad) { loadingIndicator.classList.remove("show"); initialLoad = false; }
    updateCounters();
    renderPoems();
    checkUrlForPoem();
    migrateOwnedPoemsToLove();
}, (error) => {
    console.error("Realtime listener failed:", error);
    loadingIndicator.classList.remove("show");
    initialLoad = false;
    showToast("The poems are out of reach for now.", "error");
});

updateCounters();
setSavingState(false);

function checkUrlForPoem() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#poem-")) return;
    const poemId = hash.replace("#poem-", "");
    const poem = allPoems.find(p => p.id === poemId);
    if (poem) openFocusMode(poem);
}
