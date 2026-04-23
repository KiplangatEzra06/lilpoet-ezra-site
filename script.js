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
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const poemForm = document.getElementById("poemForm");
const authorInput = document.getElementById("authorInput");
const titleInput = document.getElementById("titleInput");
const contentInput = document.getElementById("contentInput");
const poemsContainer = document.getElementById("poemsContainer");
const toast = document.getElementById("toast");
const submitBtn = document.getElementById("submitBtn");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const poemCount = document.getElementById("poemCount");
const charCount = document.getElementById("charCount");
const audioToggleBtn = document.getElementById("audioToggleBtn");
const shell = document.querySelector(".shell");

requestAnimationFrame(() => shell?.classList.add("ready"));

let allPoems = [];
let hideToastTimer = null;
let saving = false;
let audioContext = null;
let audioNodes = null;
let audioActive = false;

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

function createLofiMusic() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const mixFilter = ctx.createBiquadFilter();
    mixFilter.type = "lowpass";
    mixFilter.frequency.value = 580;
    mixFilter.Q.value = 0.8;

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * 0.12;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 980;
    noiseFilter.Q.value = 0.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.018;

    noiseSource.connect(noiseFilter).connect(noiseGain).connect(mixFilter);

    const bass = ctx.createOscillator();
    bass.type = "sine";
    bass.frequency.value = 55;

    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.08;

    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 150;
    bassFilter.Q.value = 0.7;

    bass.connect(bassFilter).connect(bassGain).connect(mixFilter);

    const chord1 = ctx.createOscillator();
    chord1.type = "sine";
    chord1.frequency.value = 110;

    const chord2 = ctx.createOscillator();
    chord2.type = "sine";
    chord2.frequency.value = 138;

    const chord3 = ctx.createOscillator();
    chord3.type = "sine";
    chord3.frequency.value = 165;

    const chordGain = ctx.createGain();
    chordGain.gain.value = 0.011;

    const chordFilter = ctx.createBiquadFilter();
    chordFilter.type = "lowpass";
    chordFilter.frequency.value = 650;
    chordFilter.Q.value = 0.9;

    chord1.connect(chordFilter);
    chord2.connect(chordFilter);
    chord3.connect(chordFilter);
    chordFilter.connect(chordGain).connect(mixFilter);

    const lfo1 = ctx.createOscillator();
    lfo1.type = "sine";
    lfo1.frequency.value = 0.05;

    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 280;
    lfo1.connect(lfo1Gain).connect(mixFilter.frequency);

    const lfo2 = ctx.createOscillator();
    lfo2.type = "sine";
    lfo2.frequency.value = 0.12;

    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 45;
    lfo2.connect(lfo2Gain).connect(bassGain.gain);

    mixFilter.connect(ctx.destination);

    noiseSource.start();
    bass.start();
    chord1.start();
    chord2.start();
    chord3.start();
    lfo1.start();
    lfo2.start();

    return {
        ctx,
        noiseSource,
        bass,
        chord1,
        chord2,
        chord3,
        lfo1,
        lfo2
    };
}

async function startLofiMode() {
    if (!audioContext || audioContext.state === "closed") {
        audioNodes = createLofiMusic();
        audioContext = audioNodes.ctx;
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
        audioNodes?.noiseSource?.stop();
        audioNodes?.bass?.stop();
        audioNodes?.chord1?.stop();
        audioNodes?.chord2?.stop();
        audioNodes?.chord3?.stop();
        audioNodes?.lfo1?.stop();
        audioNodes?.lfo2?.stop();
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

async function editAuthor(poemId, currentAuthor) {
    const newAuthor = prompt("Update author name:", currentAuthor);
    if (newAuthor === null || newAuthor.trim() === "") return;

    try {
        const poemRef = doc(db, "poems", poemId);
        await updateDoc(poemRef, {
            author: newAuthor.trim(),
            updatedAt: serverTimestamp()
        });
        showToast("Author updated!", "success");
    } catch (error) {
        console.error("Update failed:", error);
        showToast("Could not update author. Try again.", "error");
    }
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

function updateCounters() {
    animateMetric(poemCount, allPoems.length);
    animateMetric(charCount, contentInput.value.length);
}

function renderPoems() {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = allPoems.filter((poem) => {
        const title = (poem.title || "").toLowerCase();
        const content = (poem.content || "").toLowerCase();
        return !term || title.includes(term) || content.includes(term);
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
        heading.textContent = poem.title || "Untitled poem";

        const author = document.createElement("span");
        author.className = "poem-author";
        author.textContent = `by ${poem.author}`;

        const editBtn = document.createElement("button");
        editBtn.className = "poem-edit-btn";
        editBtn.textContent = "✎";
        editBtn.type = "button";
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editAuthor(poem.id, poem.author);
        };

        const time = document.createElement("span");
        time.className = "poem-time";
        time.textContent = formatDate(poem.updatedAt || poem.createdAt);

        top.appendChild(heading);
        top.appendChild(author);
        top.appendChild(editBtn);
        top.appendChild(time);

        summary.appendChild(top);

        const body = document.createElement("div");
        body.className = "poem-body";

        const paragraph = document.createElement("p");
        paragraph.className = "poem-text";
        paragraph.textContent = poem.content || "";

        body.appendChild(paragraph);
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

        requestAnimationFrame(() => {
            card.classList.add("animate-in");
            card.style.animationDelay = `${index * 40}ms`;
        });
    }
}

searchInput.addEventListener("input", renderPoems);
audioToggleBtn.addEventListener("click", toggleLofiMode);

titleInput.addEventListener("input", updateCounters);
contentInput.addEventListener("input", updateCounters);

poemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (saving) return;

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const author = authorInput.value.trim();

    if (!title || !content || !author) {
        showToast("Fill all fields first.", "error");
        return;
    }

    try {
        setSavingState(true);

        await addDoc(collection(db, "poems"), {
            title,
            content,
            author,
            createdAt: serverTimestamp()
        });

        poemForm.reset();
        updateCounters();
        showToast("Poem saved ✨", "success");
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
                createdAt: data.createdAt || null,
                updatedAt: data.updatedAt || null
            };
        });

        updateCounters();
        renderPoems();
    },
    (error) => {
        console.error("Realtime listener failed:", error);
        showToast("Live feed error. Check Firestore rules or index settings.", "error");
    }
);

updateCounters();
setSavingState(false);