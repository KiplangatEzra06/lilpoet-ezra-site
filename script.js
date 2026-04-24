import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    doc,
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
const shell = document.querySelector(".shell");
const introScreen = document.getElementById("intro-screen");
const enterBtn = document.getElementById("enter-btn");
const focusOverlay = document.getElementById("focus-overlay");
const closeFocusBtn = document.getElementById("close-focus");
const focusPoem = document.getElementById("focus-poem");
const loadingIndicator = document.getElementById("loadingIndicator");

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
        <h2>${escapeHtml(poem.title || "Untitled Poem")}</h2>
        <div class="focus-author">by ${escapeHtml(poem.author)}</div>
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
    let message = "Could not sign in.";
    if (!error || !error.code) {
        return message;
    }

    if (error.code === "auth/user-not-found") {
        return "No account found with this email.";
    }
    if (error.code === "auth/wrong-password") {
        return "Incorrect password.";
    }
    if (error.code === "auth/invalid-email") {
        return "Invalid email address.";
    }
    if (error.code === "auth/weak-password") {
        return "Password is too weak.";
    }
    if (error.code === "auth/email-already-in-use") {
        return "An account with this email already exists.";
    }
    if (error.code === "auth/invalid-credential") {
        const diag = getAuthDiagnostic();
        console.warn("Firebase invalid credential details:", { error, diag });
        return "Firebase rejected the sign-in request. Check that Email/Password auth is enabled and that your Firebase configuration matches the project.";
    }
    if (error.code === "auth/configuration-not-found") {
        const diag = getAuthDiagnostic();
        console.warn("Firebase auth configuration diagnostics:", diag);
        if (diag.protocol === "file:") {
            return "Firebase auth cannot run from a file:// page. Use a local web server or localhost origin.";
        }
        return "Firebase auth configuration not found. Check your Firebase project settings, Email/Password auth enablement, and authorized origin.";
    }

    return message;
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
        console.log("No poems need Love & Romance category migration.");
        return;
    }

    console.log(`Migrating ${poemsToUpdate.length} poem(s) to Love & Romance...`);

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
        const message = `Moved ${count} poem${count === 1 ? "" : "s"} to Love & Romance.`;
        console.log("Migration complete:", message);
        showToast(message, "success");
    } catch (error) {
        console.error("Poem migration failed:", error);

        // Provide specific error feedback
        let errorMsg = "Could not update existing poem categories.";
        if (error.code === "permission-denied") {
            errorMsg = "Permission denied. Make sure Firestore rules allow poem updates.";
        } else if (error.code === "unavailable") {
            errorMsg = "Firestore temporarily unavailable. Try again later.";
        }

        showToast(errorMsg, "error");
    }
}

function updateAuthDisplay(user) {
    currentUser = user;
    const signedIn = !!user;

    authState.textContent = signedIn
        ? `Signed in as ${user.email || "your account"}`
        : "Sign in to add your poem. Your creations stay linked to your account.";

    // Hide entire auth section when signed in
    authSection?.classList.toggle("hidden", signedIn);

    signOutBtn.classList.toggle("hidden", !signedIn);
    poemForm.classList.toggle("disabled", !signedIn);
    submitBtn.disabled = !signedIn || saving;
    authorInput.disabled = !signedIn;
    titleInput.disabled = !signedIn;
    contentInput.disabled = !signedIn;
    statusText.textContent = signedIn ? "Ready to write." : "Sign in to add your poem.";

    renderPoems();
    migrateOwnedPoemsToLove();
}

async function handleSignIn() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showToast("Enter both email and password.", "error");
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Signed in successfully.", "success");
    } catch (error) {
        console.error("Sign in failed:", error);
        const message = formatFirebaseAuthError(error);
        showToast(message, "error");
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign in";
    }
}

async function handleRegister() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showToast("Enter both email and password.", "error");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters.", "error");
        return;
    }

    try {
        registerBtn.disabled = true;
        registerBtn.textContent = "Creating account...";
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("Account created. You are signed in.", "success");
    } catch (error) {
        console.error("Registration failed:", error);
        const message = formatFirebaseAuthError(error) || "Could not create an account.";
        showToast(message, "error");
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = "Create account";
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
        showToast("Signed out successfully.", "success");
    } catch (error) {
        console.error("Sign out failed:", error);
        showToast("Could not sign out. Try again.", "error");
    }
}

async function deletePoem(poemId) {
    if (!currentUser) {
        showToast("Sign in to delete your poem.", "error");
        return;
    }

    try {
        await deleteDoc(doc(db, "poems", poemId));
        showToast("Poem deleted.", "success");
    } catch (error) {
        console.error("Delete failed:", error);
        showToast("Could not delete poem. Try again.", "error");
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

    if (start > 0) snippet = `… ${snippet}`;
    if (end < text.length) snippet = `${snippet} …`;
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
    submitBtn.disabled = isSaving;
    submitBtn.textContent = isSaving ? "Saving..." : "Save poem";
    statusText.textContent = isSaving ? "Saving to Firestore..." : "Ready to write.";
}

async function createLofiMusic() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Load your audio file from the audio folder
    // Replace 'beat.mp3' with your audio file name
    const response = await fetch('audio/beat.mp3');
    if (!response.ok) {
        throw new Error(`Failed to load audio file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    source.connect(gain).connect(ctx.destination);
    source.start();

    return {
        ctx,
        source
    };
}

async function startLofiMode() {
    if (!audioContext || audioContext.state === "closed") {
        try {
            audioNodes = await createLofiMusic();
            audioContext = audioNodes.ctx;
        } catch (error) {
            console.error("Failed to load audio:", error);
            showToast("Could not load audio file. Make sure audio/beat.mp3 exists.", "error");
            return;
        }
    }

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    audioActive = true;
    audioToggleBtn.classList.add("active");
    audioToggleBtn.textContent = "Stop lofi mode";
    audioToggleBtn.setAttribute("aria-pressed", "true");
    showToast("Lofi poetry mode enabled.", "success");
}

async function stopLofiMode() {
    if (!audioContext) return;

    try {
        audioNodes?.source?.stop();
        await audioContext.close();
    } catch (error) {
        console.warn("Audio stop error:", error);
    }

    audioContext = null;
    audioNodes = null;
    audioActive = false;

    audioToggleBtn.classList.remove("active");
    audioToggleBtn.textContent = "Play lofi mode";
    audioToggleBtn.setAttribute("aria-pressed", "false");
    showToast("Lofi poetry mode paused.", "success");
}

function toggleLofiMode() {
    if (audioActive) {
        stopLofiMode();
    } else {
        startLofiMode();
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
            showToast("Poem updated!", "success");
        } catch (error) {
            console.error("Update failed:", error);
            showToast("Could not update poem. Try again.", "error");
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

function updateCounters() {
    animateMetric(poemCount, allPoems.length);
    animateMetric(charCount, contentInput.value.length);
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
        empty.textContent = term ? "No poems matched your search." : "Your poem feed is empty right now.";
        poemsContainer.appendChild(empty);
        return;
    }

    for (const [index, poem] of filtered.entries()) {
        const card = document.createElement("details");
        card.className = "poem";

        const summary = document.createElement("summary");
        summary.className = "poem-summary";

        const top = document.createElement("div");
        top.className = "poem-top";

        const heading = document.createElement("h3");
        heading.innerHTML = term
            ? highlightSearchTerm(poem.title || "Untitled Poem", term)
            : escapeHtml(poem.title || "Untitled Poem");
        heading.style.cursor = "pointer";
        heading.addEventListener("click", (e) => {
            e.stopPropagation();
            openFocusMode(poem);
        });

        const author = document.createElement("span");
        author.className = "poem-author";
        author.textContent = `crafted by ${poem.author}`;
        author.style.cursor = "pointer";
        author.addEventListener("click", (e) => {
            e.stopPropagation();
            openFocusMode(poem);
        });

        const category = document.createElement("span");
        category.className = "poem-category";
        if (poem.category) {
            const categoryNames = {
                love: "Love & Romance",
                nature: "Nature & Environment",
                life: "Life & Reflection",
                social: "Social & Political",
                spiritual: "Spiritual & Faith",
                personal: "Personal Growth",
                other: "Other"
            };
            category.textContent = categoryNames[poem.category] || poem.category;
        }

        const isOwnPoem = currentUser && poem.userId === currentUser.uid;
        let deleteBtn = null;
        let editBtn = null;
        if (isOwnPoem) {
            editBtn = document.createElement("button");
            editBtn.className = "poem-edit-btn";
            editBtn.textContent = "✎";
            editBtn.type = "button";
            editBtn.title = "Edit this poem";
            editBtn.onclick = (e) => {
                e.stopPropagation();
                editAuthor(poem.id, poem.author);
            };

            deleteBtn = document.createElement("button");
            deleteBtn.className = "poem-delete-btn";
            deleteBtn.textContent = "🗑";
            deleteBtn.type = "button";
            deleteBtn.title = "Delete this poem";
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
        time.title = `Created: ${createdDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })}${poem.updatedAt ? `\nUpdated: ${fullDate}` : ''}`;

        top.appendChild(heading);
        top.appendChild(author);
        if (poem.category) {
            top.appendChild(category);
        }
        if (deleteBtn) {
            top.appendChild(editBtn);
            top.appendChild(deleteBtn);
        }
        top.appendChild(time);

        summary.appendChild(top);

        if (term) {
            const titleMatch = (poem.title || "").toLowerCase().includes(term);
            const contentMatch = (poem.content || "").toLowerCase().includes(term);
            if (titleMatch || contentMatch) {
                const matchLabel = document.createElement("div");
                matchLabel.className = "poem-match";
                const matchedSections = [];
                if (titleMatch) matchedSections.push("title");
                if (contentMatch) matchedSections.push("content");
                matchLabel.textContent = `Found in ${matchedSections.join(" and ")}`;
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

        const paragraph = document.createElement("p");
        paragraph.className = "poem-text";
        paragraph.innerHTML = term
            ? highlightSearchTerm(poem.content || "", term)
            : escapeHtml(poem.content || "");

        body.appendChild(paragraph);
        if (currentUser && poem.userId === currentUser.uid) {
            const editPoemBtn = document.createElement("button");
            editPoemBtn.className = "poem-edit-content-btn";
            editPoemBtn.textContent = "Edit poem";
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
                document.querySelectorAll(".poem[open]").forEach((other) => {
                    if (other !== card) {
                        other.open = false;
                    }
                });
            }
        });

        // Register for scroll animations
        scrollObserver.observe(card);
    }
}

searchInput.addEventListener("input", renderPoems);
categoryFilter.addEventListener("change", renderPoems);
audioToggleBtn.addEventListener("click", toggleLofiMode);
authToggleBtn?.addEventListener("click", toggleAuthSection);

loginBtn.addEventListener("click", handleSignIn);
registerBtn.addEventListener("click", handleRegister);
signOutBtn.addEventListener("click", handleSignOut);
onAuthStateChanged(auth, updateAuthDisplay);
updateAuthDisplay(auth.currentUser);
setAuthSectionExpanded(false);

titleInput.addEventListener("input", updateCounters);
contentInput.addEventListener("input", updateCounters);

poemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (saving) return;
    if (!currentUser) {
        showToast("Please sign in before sharing a poem.", "error");
        return;
    }

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const author = authorInput.value.trim() || currentUser.email?.split("@")[0] || "Anonymous";
    const category = "love";
    if (!title || !content) {
        showToast("Complete your creation first.", "error");
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
        showToast("Poem shared ✨", "success");
    } catch (error) {
        console.error("Add poem failed:", error);
        showToast("Could not save the poem. Check the console.", "error");
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
                author: data.author || "Anonymous",
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
        migrateOwnedPoemsToLove();
    },
    (error) => {
        console.error("Realtime listener failed:", error);
        loadingIndicator.classList.remove("show");
        initialLoad = false;
        showToast("Live feed error. Check Firestore rules or index settings.", "error");
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
