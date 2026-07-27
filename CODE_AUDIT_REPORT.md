# 🔍 PHYSICS TELEMETRY 8-BIT コード全面点検レポート

## 検出された不具合と改善案

---

## 🔴 **重大度: 高** (機能に直結する問題)

### 1️⃣ **setupCategoryFilter() で既存オプションが削除されない**
**ファイル:** `app.js` (行 299-310)
**問題内容:**
```javascript
function setupCategoryFilter() {
    const categorySet = new Set();
    problemDB.forEach(p => categorySet.add(p.category));
    const categorySelect = document.getElementById('selectCategory');
    const sorted = Array.from(categorySet).sort();
    sorted.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        categorySelect.appendChild(opt);  // ← ❌ 既存オプションは削除されない
    });
}
```

**影響:** `loadProblemPackage()` が複数回呼ばれると、カテゴリドロップダウンに重複したオプションが追加される

**修正案:**
```javascript
function setupCategoryFilter() {
    const categorySet = new Set();
    problemDB.forEach(p => categorySet.add(p.category));
    const categorySelect = document.getElementById('selectCategory');
    
    // ✅ 既存のカテゴリオプション（"ALL SECTORS"以外）を削除
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }
    
    const sorted = Array.from(categorySet).sort();
    sorted.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        categorySelect.appendChild(opt);
    });
}
```

---

### 2️⃣ **toggleStopwatch() の null チェック不足**
**ファイル:** `app.js` (行 639-659)
**問題内容:**
```javascript
function toggleStopwatch() {
    play8BitSound('click');
    const btn = document.getElementById('btnStopwatch');
    // ❌ btn が null の場合、以下でエラーが発生
    if (isSwRunning) {
        // ...
        btn.innerText = "START TIMER";  // TypeError
    }
}
```

**影響:** モバイルやレスポンシブ表示で「btnStopwatch」がない場合、コンソールエラーが発生

**修正案:**
```javascript
function toggleStopwatch() {
    play8BitSound('click');
    const btn = document.getElementById('btnStopwatch');
    
    if (!btn) {
        console.warn("[WARNING] btnStopwatch element not found");
        return;  // ✅ 追加
    }
    
    if (isSwRunning) {
        // ...
    }
}
```

---

### 3️⃣ **startQuiz() で初期状態が不完全**
**ファイル:** `app.js` (行 347-400)
**問題内容:**
```javascript
function startQuiz(problem) {
    currentProblem = problem;
    userSelectedIndex = null;
    startTime = Date.now();
    currentLimitSec = 12.0;
    // ❌ 以下の初期化がない
    // - 前回のタイマーが残る可能性
    // - タイムアウト時に userSelectedIndex が null のまま
}
```

**影響:** 連続してクイズを実行する場合、タイマーが正常に動作しない可能性がある

**修正案:**
```javascript
function startQuiz(problem) {
    // ✅ 前回のタイマーをクリア
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    
    currentProblem = problem;
    userSelectedIndex = null;
    startTime = Date.now();
    currentLimitSec = 12.0;
    
    // ... 以下同じ
}
```

---

### 4️⃣ **updateTimer() でタイムアウト時の選択肢チェックなし**
**ファイル:** `app.js` (行 402-422)
**問題内容:**
```javascript
function updateTimer() {
    // ...
    if (remaining <= 0) {
        clearInterval(timerId);
        userSelectedIndex = null;  // ❌ この状態で showResult() を呼ぶ
        showResult();
    }
}

function showResult() {
    const isCorrect = currentShuffledOptions[userSelectedIndex]?.isCorrect || false;  // null! 
    // ❌ userSelectedIndex が null の場合、正解判定ができない
}
```

**影響:** タイムアウト時に「ユーザーが選択をしていない」というデータが失われる

**修正案:**
```javascript
function updateTimer() {
    // ...
    if (remaining <= 0) {
        clearInterval(timerId);
        // ✅ タイムアウト時は選択肢を記録しない（-1 で示す）
        userSelectedIndex = -1;
        showResult();
    }
}

function showResult() {
    // ✅ userSelectedIndex が -1 の場合はタイムアウトと判定
    const isCorrect = userSelectedIndex >= 0 ? currentShuffledOptions[userSelectedIndex]?.isCorrect : false;
    // ...
}
```

---

### 5️⃣ **renderReview() で XSS 脆弱性の可能性**
**ファイル:** `app.js` (行 479-500)
**問題内容:**
```javascript
function renderReview() {
    document.getElementById('reviewTitle').innerText = `[${currentProblem.category}] No.${currentProblem.id} ${currentProblem.title}`;
    // ❌ innerText は大丈夫だが、 innerHTML を使う箇所がある
    div.innerHTML = `<strong>✔ </strong> ${opt.text}`;  // 行 490
    // ユーザー入力がサニタイズされていない
}
```

**影響:** 悪意のあるHTML/JSが問題データに含まれた場合、スクリプトが実行される可能性

**修正案:**
```javascript
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
            // ✅ textContent を使用（XSS対策）
            div.textContent = `✔ ${opt.text}`;
            const strong = document.createElement('strong');
            strong.textContent = '✔ ';
            div.textContent = '';
            div.appendChild(strong);
            div.appendChild(document.createTextNode(opt.text));
        } else if (idx === userSelectedIndex && !opt.isCorrect) {
            div.classList.add('user-wrong');
            const strong = document.createElement('strong');
            strong.textContent = '✖ ';
            div.appendChild(strong);
            div.appendChild(document.createTextNode(opt.text));
        } else {
            div.textContent = opt.text;  // ✅ textContent を使用
        }
        reviewOptsContainer.appendChild(div);
    });
    document.getElementById('keyPointText').textContent = currentProblem.keyPoint;  // ✅ textContent に変更
}
```

---

## 🟡 **重大度: 中** (ユーザー体験に影響)

### 6️⃣ **handleAddForm() で correctIndex の範囲チェックなし**
**ファイル:** `app.js` (行 573-612)
**問題内容:**
```javascript
function handleAddForm(e) {
    // ...
    const filteredOptions = rawOptions.filter(opt => opt.trim() !== "");
    
    const newProblem = {
        id: no,
        // ...
        correctIndex: correctIdx,  // ❌ correctIdx の範囲チェックなし
    };
    // filteredOptions の長さが correctIdx より小さい場合、バグになる
}
```

**修正案:**
```javascript
function handleAddForm(e) {
    e.preventDefault();
    play8BitSound('click');
    const no = parseInt(document.getElementById('addNo').value);
    const correctIdx = parseInt(document.getElementById('addCorrectIndex').value);
    const diff = document.getElementById('addDifficulty').value;

    const rawOptions = [
        document.getElementById('addOpt0').value,
        document.getElementById('addOpt1').value,
        document.getElementById('addOpt2').value
    ];
    const filteredOptions = rawOptions.filter(opt => opt.trim() !== "");

    // ✅ 入力値の検証を追加
    if (filteredOptions.length < 2) {
        alert("最低2つの選択肢が必要です");
        return;
    }

    if (correctIdx < 0 || correctIdx >= filteredOptions.length) {
        alert(`正解の番号は0～${filteredOptions.length - 1}である必要があります`);
        return;
    }

    const newProblem = {
        id: no,
        category: document.getElementById('addCategory').value || "未分類",
        difficulty: diff,
        title: document.getElementById('addTitle').value,
        scenario: document.getElementById('addScenario').value,
        tags: document.getElementById('addTags').value.split(',').map(s => s.trim()).filter(s => s),
        options: filteredOptions,
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
```

---

### 7️⃣ **startQuiz() でオプションのシャッフルがランダムでない**
**ファイル:** `app.js` (行 375-379)
**問題内容:**
```javascript
currentShuffledOptions = problem.options.map((opt, idx) => ({
    text: opt,
    isCorrect: idx === problem.correctIndex
}));
currentShuffledOptions.sort(() => Math.random() - 0.5);  // ❌ 悪い乱数アルゴリズム
```

**影響:** Fisher-Yates シャッフルより分布が不均等。連続実行でパターンが見える可能性

**修正案:**
```javascript
// ✅ Fisher-Yates シャッフル
function fisherYatesShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// startQuiz() 内
currentShuffledOptions = problem.options.map((opt, idx) => ({
    text: opt,
    isCorrect: idx === problem.correctIndex
}));
currentShuffledOptions = fisherYatesShuffle(currentShuffledOptions);
```

---

### 8️⃣ **loadProblemPackage() で重複チェックが id のみ**
**ファイル:** `app.js` (行 191-214)
**問題内容:**
```javascript
async function loadProblemPackage() {
    // ...
    if (loadedData.length === 0) {
        const response = await fetch('problems.json');
        const jsonPackage = await response.json();
        const customData = JSON.parse(localStorage.getItem('custom_physics_db')) || [];
        const combined = [...jsonPackage];
        customData.forEach(c => {
            if (!combined.some(p => p.id === c.id)) combined.push(c);  // id だけで判定
            // ❌ id が同じなのに内容が異なる場合、古い方が残る
        });
        loadedData = combined;
    }
    problemDB = loadedData;
    // ...
}
```

**修正案:**
```javascript
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
                // ✅ id が重複している場合は置き換える
                const index = combined.findIndex(p => p.id === c.id);
                if (index >= 0) {
                    combined[index] = c;
                } else {
                    combined.push(c);
                }
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
```

---

## 🟢 **重大度: 低** (コード品質)

### 9️⃣ **typewriterInterval 変数が使われていない**
**ファイル:** `app.js` (行 97)
**問題:**
```javascript
let typewriterInterval = null;  // ❌ 定義されているが使われていない
```

**修正:** 削除するか、将来の機能用にコメント追加

---

### 🔟 **hideResult() が結果とクイズの両方を隠す**
**ファイル:** `app.js` (行 502-505)
**問題:**
```javascript
function hideResult() {
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'none';  // ❌ 両方隠す
}
```

**意図:** 「次へ」ボタン押下後、両方を隠すのが正しいのか確認が必要

**推奨:** コメント追加で意図を明確化
```javascript
function hideResult() {
    // ✅ 結果表示を隠す。クイズ画面は他の開始機能が表示する
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'none';
}
```

---

### 1️⃣1️⃣ **play8BitSound('type') が使われていない**
**ファイル:** `app.js` (行 77-84)
**問題:**
```javascript
} else if (type === 'type') { // 文字打鍵音
    // ...
}
// ❌ この機能は定義されているが呼ばれていない
```

**推奨:** 不要であれば削除、または future feature としてコメント化

---

## 📊 **修正優先度**

| 優先度 | 番号 | 内容 | 影響範囲 |
|-------|------|------|---------|
| 🔴 高 | 1 | setupCategoryFilter の重複 | カテゴリドロップダウン |
| 🔴 高 | 2 | toggleStopwatch のnull check | ストップウォッチ機能 |
| 🔴 高 | 3 | startQuiz の初期化不完全 | クイズ連続実行時 |
| 🔴 高 | 4 | updateTimer のタイムアウト処理 | 採点ロジック |
| 🔴 高 | 5 | renderReview の XSS脆弱性 | セキュリティ |
| 🟡 中 | 6 | handleAddForm の入力検証 | データ追加機能 |
| 🟡 中 | 7 | シャッフルアルゴリズム | ユーザー体験 |
| 🟡 中 | 8 | 問題ロード時の重複処理 | データ管理 |
| 🟢 低 | 9 | 未使用変数の削除 | コード整理 |
| 🟢 低 | 10 | hideResult の意図明確化 | コード可読性 |
| 🟢 低 | 11 | 未使用音声機能 | コード整理 |

---

## 📝 **まとめ**

✅ **すぐに修正すべき（重大度: 高）**
- setupCategoryFilter の重複問題
- ボタン null チェック
- タイマー初期化
- タイムアウト時の選択肢記録
- XSS対策

🔧 **次のアップデートで修正すべき（重大度: 中）**
- 入力値検証の強化
- シャッフルアルゴリズム改善
- 問題ロード時の重複処理

🧹 **コード整理（重大度: 低）**
- 未使用変数の削除
- 関数の意図をコメント化
