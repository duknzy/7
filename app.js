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
    initAuth();
    initEvents();
});

function initAuth() {
    if (!auth) return;
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

    document.getElementById('btnLogin').addEventListener('click', (e) => handleAuth(e, 'login'));
    document.getElementById('btnSignUp').addEventListener('click', (e) => handleAuth(e, 'signup'));
    document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());
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

    document.getElementById('btnStopwatch').addEventListener('click', toggleStopwatch);

    document.getElementById('btnSearch').addEventListener('click', () => { play8BitSound('click'); searchAndStart(); });
    document.getElementById('btnSectorStart').addEventListener('click', () => { play8BitSound('click'); startSectorAttack(); });
    document.getElementById('btnRandom').addEventListener('click', () => { play8BitSound('click'); startRandom(); });
    document.getElementById('btnNext').addEventListener('click', () => {
        play8BitSound('click');
        const cat = document.getElementById('selectCategory').value;
        if (cat === 'ALL') startRandom();
        else startSectorAttack();
    });

    document.getElementById('addForm').addEventListener('submit', handleAddForm);
    document.getElementById('btnExport').addEventListener('click', () => { play8BitSound('click'); exportDataJSON(); });

    document.addEventListener('keydown', (e) => {
        const quizCard = document.getElementById('quizContainer');
        const resultCard = document.getElementById('resultContainer');
        if (quizCard.style.display !== 'none') {
            if (['1', '2', '3'].includes(e.key)) {
                const idx = parseInt(e.key) - 1;
                const btns = document.querySelectorAll('#optionsContainer .option-btn');
                if (btns[idx]) btns[idx].click();
            }
        } else if (resultCard.style.display !== 'none') {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('btnNext').click();
            }
        }
    });
}

// ==========================================
// 6. CATEGORY FILTER & ATTACK LOGIC
// ==========================================
function setupCategoryFilter() {
    const select = document.getElementById('selectCategory');
    if (!select) return;
    const categories = [...new Set(problemDB.map(p => p.category))];
    select.innerHTML = '<option value="ALL">ALL SECTORS</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
        const sideCat = document.getElementById('sideSector');
        if (sideCat) sideCat.innerText = e.target.value === 'ALL' ? 'ALL' : 'FILTERED';
    });
}

function startSectorAttack() {
    const selectedCat = document.getElementById('selectCategory').value;
    let pool = problemDB;
    if (selectedCat !== 'ALL') {
        pool = problemDB.filter(p => p.category === selectedCat);
    }
    if (pool.length === 0) {
        alert("該当する問題がありません");
        return;
    }
    const idx = Math.floor(Math.random() * pool.length);
    startQuiz(pool[idx]);
}

function startRandom() {
    if (problemDB.length === 0) return;
    const idx = Math.floor(Math.random() * problemDB.length);
    startQuiz(problemDB[idx]);
}

function searchAndStart() {
    const no = parseInt(document.getElementById('searchNo').value);
    const found = problemDB.find(p => p.id === no);
    if (found) startQuiz(found);
    else alert(`No.${no} の問題は見つかりませんでした`);
}

// ==========================================
// 7. QUIZ RUNNER & DYNAMIC TIMER
// ==========================================
function startQuiz(problem) {
    currentProblem = problem;
    userSelectedIndex = null;
    document.getElementById('quizContainer').style.display = 'block';
    document.getElementById('resultContainer').style.display = 'none';

    document.getElementById('pNo').innerText = `No.${problem.id}`;
    document.getElementById('pCategory').innerText = problem.category;
    document.getElementById('pTitle').innerText = problem.title;

    // コンパウンド（難易度）のUI反映
    const diffEl = document.getElementById('pDifficulty');
    if (diffEl) {
        const diff = problem.difficulty || 'medium';
        diffEl.innerText = diff.toUpperCase();
        
        // タイヤの色を再現 (Soft=赤, Medium=黄, Hard=白)
        if (diff === 'soft') {
            diffEl.style.backgroundColor = 'var(--accent-red)';
            diffEl.style.color = '#fff';
        } else if (diff === 'medium') {
            diffEl.style.backgroundColor = 'var(--accent-yellow)';
            diffEl.style.color = '#000';
        } else if (diff === 'hard') {
            diffEl.style.backgroundColor = '#ffffff';
            diffEl.style.color = '#000';
        }
    }

    // 【重要】数式(KaTeX)を破壊しないよう、タイピング演出を廃止して即時表示
    const scenarioEl = document.getElementById('pScenario');
    scenarioEl.innerText = problem.scenario;

    const tagsContainer = document.getElementById('pTags');
    tagsContainer.innerHTML = '';
    (problem.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'badge';
        span.style.background = '#21262d';
        span.innerText = `#${t}`;
        tagsContainer.appendChild(span);
    });

    // Fisher-Yates シャッフル（偏り防止）
    currentShuffledOptions = problem.options.map((opt, i) => ({
        text: opt,
        originalIndex: i,
        isCorrect: i === problem.correctIndex
    }));
    
    for (let i = currentShuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentShuffledOptions[i], currentShuffledOptions[j]] = [currentShuffledOptions[j], currentShuffledOptions[i]];
    }

    const optsContainer = document.getElementById('optionsContainer');
    optsContainer.innerHTML = '';
    currentShuffledOptions.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span style="color:var(--accent-yellow); font-weight:bold; margin-right:8px;">[${idx + 1}]</span>${opt.text}`;
        btn.addEventListener('click', () => selectOption(opt.isCorrect, false, idx));
        optsContainer.appendChild(btn);
    });

    // 文字列のセットが完全に終わった後に1回だけ数式をレンダリングする
    renderMath();
    
    currentLimitSec = parseFloat((12.0 + (problem.scenario.length * 0.08)).toFixed(1));
    startTimer(currentLimitSec);
}

function startTimer(limitSec) {
    clearInterval(timerId);
    const timerBar = document.getElementById('timerBar');
    timerBar.style.width = '100%';
    timerBar.className = 'timer-bar';

    startTime = Date.now();
    timerId = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, limitSec - elapsed);
        const pct = (remaining / limitSec) * 100;
        timerBar.style.width = `${pct}%`;

        if (pct < 50 && pct > 20) {
            timerBar.className = 'timer-bar warning';
        } else if (pct <= 20) {
            timerBar.className = 'timer-bar danger';
        }

        if (remaining <= 0) {
            clearInterval(timerId);
            selectOption(false, true, null);
        }
    }, 30);
}

// ==========================================
// 8. RESULT, REVIEW & TELEMETRY UPDATES
// ==========================================
function selectOption(isCorrect, isTimeout = false, selectedIdx = null) {
    clearInterval(timerId);
    clearInterval(typewriterInterval);
    userSelectedIndex = selectedIdx;
    
    const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const finalReaction = isTimeout ? currentLimitSec : elapsed;

    sessionStats.attempts++;
    if (isCorrect) sessionStats.corrects++;
    sessionStats.totalTime += finalReaction;
    updateSidebarTelemetry();

    document.getElementById('quizContainer').style.display = 'none';
    document.getElementById('resultContainer').style.display = 'block';

    const resHeader = document.getElementById('resultHeader');
    const splitText = document.getElementById('splitTime');

    if (isTimeout) {
        play8BitSound('wrong');
        resHeader.innerText = "TIME OVER";
        resHeader.className = "result-header lose";
        splitText.innerText = `Reaction Time: ${currentLimitSec}s`;
    } else if (isCorrect) {
        play8BitSound('correct');
        resHeader.innerText = "PURPLE SECTOR!";
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
        const acc = Math.round((sessionStats.corrects / sessionStats.attempts) * 100);
        accuracyEl.innerText = `${acc}%`;
    }
    if (avgTimeEl) {
        const avg = (sessionStats.totalTime / sessionStats.attempts).toFixed(1);
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