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
// 2. GLOBAL STATE & TELEMETRY
// ==========================================
let problemDB = [];
let currentProblem = null;
let currentShuffledOptions = [];
let userSelectedIndex = null;
let timerId = null;
let startTime = 0;
let currentLimitSec = 12.0;

// サイドバー集計用データ
let sessionStats = {
    attempts: 0,
    corrects: 0,
    totalTime: 0
};

// ==========================================
// 3. INITIALIZATION & AUTH
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initEvents();
});

function initAuth() {
    if (!auth) return;

    // 認証ステータスの変化を即座に検知して画面を切り替える
    auth.onAuthStateChanged(user => {
        const authContainer = document.getElementById('authContainer');
        const mainApp = document.getElementById('mainApp');
        const userBadge = document.getElementById('userEmailBadge');

        if (user) {
            currentUser = user;
            if (authContainer) authContainer.style.display = 'none';
            if (mainApp) mainApp.style.display = 'flex';
            if (userBadge) userBadge.innerText = user.email.split('@')[0].toUpperCase();
            
            // 認証後に問題データを読み込む
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
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        alert("メールアドレスとパスワードを入力しろ。");
        return;
    }

    try {
        if (mode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            await auth.createUserWithEmailAndPassword(email, password);
            alert("ドライバー登録完了だ。そのままコースインするぞ。");
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
// 4. EVENT BINDING & SHORTCUTS
// ==========================================
function initEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
            const target = e.target.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');
            e.target.classList.add('active');
        });
    });

    document.getElementById('btnSearch').addEventListener('click', searchAndStart);
    document.getElementById('btnSectorStart').addEventListener('click', startSectorAttack);
    document.getElementById('btnRandom').addEventListener('click', startRandom);
    document.getElementById('btnNext').addEventListener('click', () => {
        const cat = document.getElementById('selectCategory').value;
        if (cat === 'ALL') startRandom();
        else startSectorAttack();
    });
    document.getElementById('addForm').addEventListener('submit', handleAddForm);
    document.getElementById('btnExport').addEventListener('click', exportDataJSON);

    // ショートカットキー操作
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
// 5. CATEGORY FILTER & ATTACK LOGIC
// ==========================================
function setupCategoryFilter() {
    const select = document.getElementById('selectCategory');
    if (!select) return;

    const categories = [...new Set(problemDB.map(p => p.category))];
    select.innerHTML = '<option value="ALL">ALL SECTORS (全単元)</option>';
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
        alert("選択された単元の問題データが存在しないぞ。");
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
    else alert(`No.${no} の問題データが存在しないぞ。`);
}

// ==========================================
// 6. QUIZ RUNNER & DYNAMIC TIMER
// ==========================================
function startQuiz(problem) {
    currentProblem = problem;
    userSelectedIndex = null;

    document.getElementById('quizContainer').style.display = 'block';
    document.getElementById('resultContainer').style.display = 'none';

    document.getElementById('pNo').innerText = `No.${problem.id}`;
    document.getElementById('pCategory').innerText = problem.category;
    document.getElementById('pTitle').innerText = problem.title;
    document.getElementById('pScenario').innerText = problem.scenario;

    const tagsContainer = document.getElementById('pTags');
    tagsContainer.innerHTML = '';
    (problem.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerText = `#${t}`;
        tagsContainer.appendChild(span);
    });

    currentShuffledOptions = problem.options.map((opt, i) => ({
        text: opt,
        originalIndex: i,
        isCorrect: i === problem.correctIndex
    }));
    currentShuffledOptions.sort(() => Math.random() - 0.5);

    const optsContainer = document.getElementById('optionsContainer');
    optsContainer.innerHTML = '';

    currentShuffledOptions.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span style="color:var(--accent-yellow); font-weight:bold; margin-right:8px;">[${idx + 1}]</span>${opt.text}`;
        btn.addEventListener('click', () => selectOption(opt.isCorrect, false, idx));
        optsContainer.appendChild(btn);
    });

    renderMath();

    // 動的制限時間（基本12秒 ＋ シナリオ文字数 × 0.08秒）
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
// 7. RESULT, REVIEW & TELEMETRY UPDATES
// ==========================================
function selectOption(isCorrect, isTimeout = false, selectedIdx = null) {
    clearInterval(timerId);
    userSelectedIndex = selectedIdx;
    const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const finalReaction = isTimeout ? currentLimitSec : elapsed;

    // サイドバーのデータ更新
    sessionStats.attempts++;
    if (isCorrect) sessionStats.corrects++;
    sessionStats.totalTime += finalReaction;
    updateSidebarTelemetry();

    document.getElementById('quizContainer').style.display = 'none';
    document.getElementById('resultContainer').style.display = 'block';

    const resHeader = document.getElementById('resultHeader');
    const splitText = document.getElementById('splitTime');

    if (isTimeout) {
        resHeader.innerText = "TIME OVER (思考遅延)";
        resHeader.className = "result-header lose";
        splitText.innerText = `Reaction Time: ${currentLimitSec}s 超過 | ピットストップ遅延`;
    } else if (isCorrect) {
        resHeader.innerText = "PURPLE SECTOR (最速正解)";
        resHeader.className = "result-header win";
        splitText.innerText = `Reaction Time: ${finalReaction}s | 理想的な思考ルート！`;
    } else {
        resHeader.innerText = "BOX BOX (誤った解法を選択)";
        resHeader.className = "result-header lose";
        splitText.innerText = `Reaction Time: ${finalReaction}s | トラップ解法に突入！`;
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
            div.innerHTML = `<strong>【正解の解法】</strong> ${opt.text}`;
        } else if (idx === userSelectedIndex && !opt.isCorrect) {
            div.classList.add('user-wrong');
            div.innerHTML = `<strong>【あなたの選択】</strong> ${opt.text}`;
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
// 8. GROUPED PROBLEM LIST & MANAGEMENT
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
        groupCard.className = 'category-group';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerText = `${cat} (${grouped[cat].length}問)`;
        groupCard.appendChild(header);

        grouped[cat].sort((a,b) => a.id - b.id).forEach(p => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div>
                    <strong style="color:var(--accent-yellow)">No.${p.id}</strong> ${p.title}
                </div>
                <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.8rem;">挑む</button>
            `;
            item.querySelector('button').addEventListener('click', () => {
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
    const no = parseInt(document.getElementById('addNo').value);

    const newProblem = {
        id: no,
        category: document.getElementById('addCategory').value || "力学（物体の運動）",
        title: document.getElementById('addTitle').value,
        scenario: document.getElementById('addScenario').value,
        tags: document.getElementById('addTags').value.split(',').map(s => s.trim()).filter(s => s),
        options: [
            document.getElementById('addOpt0').value,
            document.getElementById('addOpt1').value || "無関係な公式を適用する",
            document.getElementById('addOpt2').value || "計算ミスを誘発する解法"
        ],
        correctIndex: 0,
        keyPoint: document.getElementById('addKeyPoint').value || "着眼点を意識せよ！"
    };

    if (db) {
        db.collection("problems").doc(`problem_${no}`).set(newProblem);
    }

    let customData = JSON.parse(localStorage.getItem('custom_physics_db')) || [];
    customData = customData.filter(p => p.id !== no);
    customData.push(newProblem);
    localStorage.setItem('custom_physics_db', JSON.stringify(customData));

    alert(`No.${no} の問題を保存したぞ。`);
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