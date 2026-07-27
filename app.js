// ==========================================
// 1. FIREBASE INITIALIZATION & AUTH
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAsmP30vutYGSqm6v4vb12h3mKoE3JW_4U",
    authDomain: "buturi-e9f8e.firebaseapp.com",
    projectId: "buturi-e9f8e",
    storageBucket: "buturi-e9f8e.firebasestorage.app",
    messagingSenderId: "488832079942",
    appId: "1:488832079942:web:665565bb1b985f62841247",
    measurementId: "G-R7QBYEVJHN"
};

let db = null;
let auth = null;
let currentUser = null;

if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("[SYSTEM] Firebase Initialized.");
}

// ==========================================
// 2. 8BIT SOUND ENGINE (Web Audio API)
// ==========================================
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function play8BitSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'click') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'correct') { // PURPLE SECTOR (ファンファーレ風)
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'wrong') { // BOX BOX (ブブー)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.setValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
    } else if (type === 'type') { // 文字打鍵音
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.02);
        osc.start(now);
        osc.stop(now + 0.02);
    }
}

// ==========================================
// 3. GLOBAL STATE & TELEMETRY
// ==========================================
let problemDB = [];
let currentProblem = null;
let currentShuffledOptions = [];
let userSelectedIndex = null;
let timerId = null;
let startTime = 0;
let currentLimitSec = 12.0;
let typewriterInterval = null;

let sessionStats = {
    attempts: 0,
    corrects: 0,
    totalTime: 0
};

let swInterval = null;
let swStartTime = 0;
let swElapsed = 0;
let isSwRunning = false;

// ==========================================
// 4. INITIALIZATION & AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    initAuth();
});

function initAuth() {
    // ✅ 修正: if (!auth) return の前にボタンイベントを設定
    const btnLogin = document.getElementById('btnLogin');
    const btnSignUp = document.getElementById('btnSignUp');
    const btnLogout = document.getElementById('btnLogout');

    if (btnLogin) {
        btnLogin.addEventListener('click', (e) => handleAuth(e, 'login'));
    }
    if (btnSignUp) {
        btnSignUp.addEventListener('click', (e) => handleAuth(e, 'signup'));
    }
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (auth) auth.signOut();
        });
    }

    // ✅ Firebase認証が有効な場合のみ onAuthStateChanged を設定
    if (!auth) {
        console.warn("[SYSTEM] Firebase not available. Running in offline mode.");
        // オフラインモード: ダミーユーザーでメインアプリを表示
        const mainApp = document.getElementById('mainApp');
        const authContainer = document.getElementById('authContainer');
        if (authContainer) authContainer.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';
        loadProblemPackage();
        return;
    }

    auth.onAuthStateChanged(user => {
        const authContainer = document.getElementById('authContainer');
        const mainApp = document.getElementById('mainApp');
        const userBadge = document.getElementById('userEmailBadge');
        if (user) {
            currentUser = user;
            if (authContainer) authContainer.style.display = 'none';
            if (mainApp) mainApp.style.display = 'flex';
            if (userBadge) userBadge.innerText = user.email.split('@')[0].toUpperCase();
            loadProblemPackage();
        } else {
            currentUser = null;
            if (authContainer) authContainer.style.display = 'flex';
            if (mainApp) mainApp.style.display = 'none';
        }
    });
}

async function handleAuth(e, mode) {
    e.preventDefault();
    play8BitSound('click');
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) {
        alert("EMAILとPASSWORDを入力してください");
        return;
    }
    if (!auth) {
        alert("Firebase認証が利用できません");
        return;
    }
    try {
        if (mode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            await auth.createUserWithEmailAndPassword(email, password);
            alert("アカウントを作成しました");
        }
    } catch (error) {
        alert(`認証エラー: ${error.message}`);
    }
}

async function loadProblemPackage() {
    try {
        let loadedData = [];
        if (db) {
            const snapshot = await db.collection("problems").get();
            snapshot.forEach(doc => loadedData.push(doc.data()));
        }
        if (loadedData.length === 0) {
            const response = await fetch('problems.json');
            const jsonPackage = await response.json();
            const customData = JSON.parse(localStorage.getItem('custom_physics_db')) || [];
            const combined = [...jsonPackage];
            customData.forEach(c => {
                if (!combined.some(p => p.id === c.id)) combined.push(c);
            });
            loadedData = combined;
        }
        problemDB = loadedData;
        setupCategoryFilter();
        renderGroupedProblemList();
    } catch (error) {
        console.warn("[SYSTEM] Load error.", error);
    }
}

// ==========================================
// 5. EVENT BINDING & SHORTCUTS
// ==========================================
function initEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            play8BitSound('click');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
            const target = e.target.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');
            e.target.classList.add('active');
        });
    });
    

    // サウンド切り替えボタン
    const soundBtn = document.getElementById('btnSoundToggle');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundBtn.innerText = soundEnabled ? "🔊 SOUND: ON" : "🔇 SOUND: OFF";
            if (soundEnabled) play8BitSound('click');
        });
    }

    const btnStopwatch = document.getElementById('btnStopwatch');
    if (btnStopwatch) {
        btnStopwatch.addEventListener('click', toggleStopwatch);
    }

    const btnSearch = document.getElementById('btnSearch');
    if (btnSearch) {
        btnSearch.addEventListener('click', () => { play8BitSound('click'); searchAndStart(); });
    }

    const btnSectorStart = document.getElementById('btnSectorStart');
    if (btnSectorStart) {
        btnSectorStart.addEventListener('click', () => { play8BitSound('click'); startWithCategory(); });
    }

    const btnRandom = document.getElementById('btnRandom');
    if (btnRandom) {
        btnRandom.addEventListener('click', () => { play8BitSound('click'); startRandom(); });
    }

    const btnNext = document.getElementById('btnNext');
    if (btnNext) {
        btnNext.addEventListener('click', () => { play8BitSound('click'); hideResult(); });
    }

    const addForm = document.getElementById('addForm');
    if (addForm) {
        addForm.addEventListener('submit', handleAddForm);
    }

    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
        btnExport.addEventListener('click', () => { play8BitSound('click'); exportDataJSON(); });
    }

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === '1' || e.key === '2' || e.key === '3') {
            const idx = parseInt(e.key) - 1;
            if (currentProblem && idx < currentShuffledOptions.length) {
                play8BitSound('click');
                selectOption(idx);
            }
        }
        if (e.key === ' ' || e.key === 'Enter') {
            const resultDiv = document.getElementById('resultContainer');
            if (resultDiv && resultDiv.style.display !== 'none') {
                play8BitSound('click');
                hideResult();
            }
        }
    });
}

// ==========================================
// 6. PROBLEM SELECTION & QUIZ
// ==========================================
function setupCategoryFilter() {
    const categorySet = new Set();
    problemDB.forEach(p => categorySet.add(p.category));
    const categorySelect = document.getElementById('selectCategory');
    const sorted = Array.from(categorySet).sort();
    sorted.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        categorySelect.appendChild(opt);
    });
}

function startWithCategory() {
    const cat = document.getElementById('selectCategory').value;
    const filtered = problemDB.filter(p => p.category === cat || cat === 'ALL');
    if (filtered.length === 0) {
        alert("問題がありません");
        return;
    }
    const chosen = filtered[Math.floor(Math.random() * filtered.length)];
    startQuiz(chosen);
}

function startRandom() {
    if (problemDB.length === 0) {
        alert("問題がありません");
        return;
    }
    const chosen = problemDB[Math.floor(Math.random() * problemDB.length)];
    startQuiz(chosen);
}

function searchAndStart() {
    const noStr = document.getElementById('searchNo').value.trim();
    if (!noStr) {
        alert("問題番号を入力してください");
        return;
    }
    const no = parseInt(noStr);
    const found = problemDB.find(p => p.id === no);
    if (!found) {
        alert(`No.${no} が見つかりません`);
        return;
    }
    startQuiz(found);
}

function startQuiz(problem) {
    currentProblem = problem;
    userSelectedIndex = null;
    startTime = Date.now();
    currentLimitSec = 12.0;

    const quizDiv = document.getElementById('quizContainer');
    const resultDiv = document.getElementById('resultContainer');
    quizDiv.style.display = 'block';
    resultDiv.style.display = 'none';

    document.getElementById('pNo').innerText = `No.${problem.id}`;
    document.getElementById('pCategory').innerText = problem.category;
    document.getElementById('pDifficulty').innerText = problem.difficulty ? problem.difficulty.toUpperCase() : "MEDIUM";
    document.getElementById('pTitle').innerText = problem.title;
    document.getElementById('pScenario').innerText = problem.scenario;

    const tagsDiv = document.getElementById('pTags');
    tagsDiv.innerHTML = '';
    if (problem.tags && problem.tags.length > 0) {
        problem.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.innerText = tag;
            tagsDiv.appendChild(tagSpan);
        });
    }

    currentShuffledOptions = problem.options.map((opt, idx) => ({
        text: opt,
        isCorrect: idx === problem.correctIndex
    }));
    currentShuffledOptions.sort(() => Math.random() - 0.5);

    const optionsDiv = document.getElementById('optionsContainer');
    optionsDiv.innerHTML = '';
    currentShuffledOptions.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.innerText = opt.text;
        btn.addEventListener('click', () => {
            play8BitSound('click');
            selectOption(idx);
        });
        optionsDiv.appendChild(btn);
    });

    updateSidebarTelemetry();
    renderMath();

    if (timerId) clearInterval(timerId);
    timerId = setInterval(updateTimer, 50);
}

function updateTimer() {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = currentLimitSec - elapsed;
    const timerBar = document.getElementById('timerBar');
    const ratio = Math.max(0, remaining / currentLimitSec);
    timerBar.style.width = (ratio * 100) + '%';

    if (ratio > 0.3) {
        timerBar.className = 'timer-bar';
    } else if (ratio > 0.1) {
        timerBar.className = 'timer-bar warning';
    } else {
        timerBar.className = 'timer-bar danger';
    }

    if (remaining <= 0) {
        clearInterval(timerId);
        userSelectedIndex = null;
        showResult();
    }
}

function selectOption(idx) {
    clearInterval(timerId);
    userSelectedIndex = idx;
    showResult();
}

function showResult() {
    const isCorrect = currentShuffledOptions[userSelectedIndex]?.isCorrect || false;
    const elapsed = (Date.now() - startTime) / 1000;
    const finalReaction = Math.min(elapsed, currentLimitSec).toFixed(2);

    sessionStats.attempts++;
    sessionStats.totalTime += parseFloat(finalReaction);
    if (isCorrect) sessionStats.corrects++;

    const quizDiv = document.getElementById('quizContainer');
    const resultDiv = document.getElementById('resultContainer');
    quizDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    const resHeader = document.getElementById('resultHeader');
    const splitText = document.getElementById('splitTime');

    if (isCorrect) {
        play8BitSound('correct');
        resHeader.innerText = "PURPLE SECTOR";
        resHeader.className = "result-header win";
        splitText.innerText = `Reaction Time: ${finalReaction}s`;
    } else {
        play8BitSound('wrong');
        resHeader.innerText = "BOX BOX (CRASH)";
        resHeader.className = "result-header lose";
        splitText.innerText = `Reaction Time: ${finalReaction}s`;
    }

    renderReview();
    renderMath();
    saveUserLog(currentProblem.id, isCorrect, finalReaction);
}

function updateSidebarTelemetry() {
    const attemptsEl = document.getElementById('sideAttempts');
    const accuracyEl = document.getElementById('sideAccuracy');
    const avgTimeEl = document.getElementById('sideAvgTime');
    if (attemptsEl) attemptsEl.innerText = sessionStats.attempts;
    if (accuracyEl) {
        const acc = sessionStats.attempts > 0 ? Math.round((sessionStats.corrects / sessionStats.attempts) * 100) : 0;
        accuracyEl.innerText = `${acc}%`;
    }
    if (avgTimeEl) {
        const avg = sessionStats.attempts > 0 ? (sessionStats.totalTime / sessionStats.attempts).toFixed(1) : 0;
        avgTimeEl.innerText = `${avg}s`;
    }
}

function renderReview() {
    document.getElementById('reviewTitle').innerText = `[${currentProblem.category}] No.${currentProblem.id} ${currentProblem.title}`;
    document.getElementById('reviewScenario').innerText = currentProblem.scenario;

    const reviewOptsContainer = document.getElementById('reviewOptions');
    reviewOptsContainer.innerHTML = '';
    currentShuffledOptions.forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'review-opt';
        if (opt.isCorrect) {
            div.classList.add('correct');
            div.innerHTML = `<strong>✔ </strong> ${opt.text}`;
        } else if (idx === userSelectedIndex && !opt.isCorrect) {
            div.classList.add('user-wrong');
            div.innerHTML = `<strong>✖ </strong> ${opt.text}`;
        } else {
            div.innerText = opt.text;
        }
        reviewOptsContainer.appendChild(div);
    });
    document.getElementById('keyPointText').innerText = currentProblem.keyPoint;
}

function hideResult() {
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'none';
}

function saveUserLog(problemId, isCorrect, reactionTime) {
    if (!db || !currentUser) return;
    db.collection("user_logs").add({
        uid: currentUser.uid,
        email: currentUser.email,
        problemId: problemId,
        category: currentProblem.category,
        isCorrect: isCorrect,
        reactionTime: reactionTime,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("[FIREBASE] Log save failed:", err));
}

// ==========================================
// 9. GROUPED PROBLEM LIST & MANAGEMENT
// ==========================================
function renderGroupedProblemList() {
    const listDiv = document.getElementById('problemList');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    const grouped = {};
    problemDB.forEach(p => {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(p);
    });

    Object.keys(grouped).forEach(cat => {
        const groupCard = document.createElement('div');
        groupCard.className = 'card';
        groupCard.style.marginBottom = '16px';

        const header = document.createElement('div');
        header.className = 'sidebar-title';
        header.innerText = `${cat} (${grouped[cat].length})`;
        groupCard.appendChild(header);

        grouped[cat].sort((a,b) => a.id - b.id).forEach(p => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 0';
            item.style.borderBottom = '1px solid #21262d';

            item.innerHTML = `
                <div>
                    <strong style="color:var(--accent-yellow)">No.${p.id}</strong> ${p.title}
                </div>
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;">START</button>
            `;
            item.querySelector('button').addEventListener('click', () => {
                play8BitSound('click');
                document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
                document.getElementById('attack-tab').classList.add('active');
                document.querySelector('[data-tab="attack-tab"]').classList.add('active');
                startQuiz(p);
            });
            groupCard.appendChild(item);
        });
        listDiv.appendChild(groupCard);
    });
    renderMath();
}

function handleAddForm(e) {
    e.preventDefault();
    play8BitSound('click');
    const no = parseInt(document.getElementById('addNo').value);
    const correctIdx = parseInt(document.getElementById('addCorrectIndex').value);
    const diff = document.getElementById('addDifficulty').value; // コンパウンド値を取得

    // 未入力の選択肢を配列から除外するフィルター処理を追加
    const rawOptions = [
        document.getElementById('addOpt0').value,
        document.getElementById('addOpt1').value,
        document.getElementById('addOpt2').value
    ];
    const filteredOptions = rawOptions.filter(opt => opt.trim() !== "");

    const newProblem = {
        id: no,
        category: document.getElementById('addCategory').value || "未分類",
        difficulty: diff, // データに難易度を保存
        title: document.getElementById('addTitle').value,
        scenario: document.getElementById('addScenario').value,
        tags: document.getElementById('addTags').value.split(',').map(s => s.trim()).filter(s => s),
        options: filteredOptions, // 空文字が除去されたクリーンな配列
        correctIndex: correctIdx,
        keyPoint: document.getElementById('addKeyPoint').value || ""
    };

    if (db) {
        db.collection("problems").doc(`problem_${no}`).set(newProblem);
    }

    let customData = JSON.parse(localStorage.getItem('custom_physics_db')) || [];
    customData = customData.filter(p => p.id !== no);
    customData.push(newProblem);
    localStorage.setItem('custom_physics_db', JSON.stringify(customData));

    alert(`No.${no} を追加・更新しました`);
    loadProblemPackage();
    document.getElementById('addForm').reset();
}

function exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(problemDB, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "problems.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function renderMath() {
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
    }
}

// ==========================================
// 10. STOPWATCH LOGIC
// ==========================================
function toggleStopwatch() {
    play8BitSound('click');
    const btn = document.getElementById('btnStopwatch');
    
    if (isSwRunning) {
        // 計測ストップ
        clearInterval(swInterval);
        isSwRunning = false;
        btn.innerText = "START TIMER";
        btn.classList.remove('btn-secondary');
        btn.style.backgroundColor = "var(--accent-red)";
    } else {
        // 計測スタート
        swStartTime = Date.now() - swElapsed;
        swInterval = setInterval(updateStopwatch, 1000);
        isSwRunning = true;
        btn.innerText = "STOP TIMER";
        btn.classList.add('btn-secondary');
        btn.style.backgroundColor = "#1c2128";
    }
}

function updateStopwatch() {
    swElapsed = Date.now() - swStartTime;
    const totalSec = Math.floor(swElapsed / 1000);
    
    // 時・分・秒をそれぞれ計算し、2桁のゼロ埋め（00:00:00）にする
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    
    document.getElementById('stopwatchDisplay').innerText = `${h}:${m}:${s}`;
}