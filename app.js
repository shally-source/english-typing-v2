// ============================================
// State
// ============================================
const state = {
    targetText: CONFIG.DEFAULT_TEXT,
    userInput: '',
    timerInterval: null,
    gameActive: false,
    isPaused: false,
    errors: 0,
    totalKeysPressed: 0,
    correctKeys: 0,
    currentStreak: 0,
    bestStreak: 0,
    startTime: null,
    pausedTime: 0,
    student: {
        name: '',
        id: '',           // 班級座號識別碼 (如 P2A01)
        studentId: '',    // 官方學號 (如 2026001)
        account: '',      // 登入帳號
        grade: '',        // 年級
        className: '',    // 班別
        number: ''        // 座號
    }
};

// 全域儲存由線上/本地載入的學生動態名單
let dynamicStudentList = [];

// ============================================
// DOM Elements
// ============================================
const dom = {
    textDisplay: document.getElementById('textDisplay'),
    hiddenInput: document.getElementById('hiddenInput'),
    timerDisplay: document.getElementById('timer'),
    speedDisplay: document.getElementById('speedDisplay'),
    accuracyDisplay: document.getElementById('accuracyDisplay'),
    errorDisplay: document.getElementById('errorDisplay'),
    progressDisplay: document.getElementById('progressDisplay'),
    comboDisplay: document.getElementById('comboDisplay'),
    progressBar: document.getElementById('progressBar'),
    studentInfoDisplay: document.getElementById('studentInfoDisplay'),
    resultModal: document.getElementById('resultModal'),
    articleModal: document.getElementById('articleModal'),
    articleGrid: document.getElementById('articleGrid'),
    uploadStatus: document.getElementById('uploadStatus'),
    resultStats: document.getElementById('resultStats'),
    resultTitle: document.getElementById('resultTitle'),
    resultGrade: document.getElementById('resultGrade'),
    keyboard: document.getElementById('keyboard'),
    loginModal: document.getElementById('loginModal'),
    loginAccount: document.getElementById('loginAccount'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    loginError: document.getElementById('loginError'),
    loggedInInfo: document.getElementById('loggedInInfo'),
    loggedInName: document.getElementById('loggedInName'),
    userAvatar: document.getElementById('userAvatar'),
    logoutBtn: document.getElementById('logoutBtn'),
    openLoginBtn: document.getElementById('openLoginBtn'),
    actionBtnText: document.getElementById('actionBtnText'),
    pauseBtn: document.getElementById('pauseBtn'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    resumeBtn: document.getElementById('resumeBtn'),
    restartBtn: document.getElementById('restartBtn'),
    countdownOverlay: document.getElementById('countdownOverlay'),
    countdownNumber: document.getElementById('countdownNumber'),
    confettiCanvas: document.getElementById('confettiCanvas')
};

// ============================================
// Dynamic Student Data Loader (Google Sheets CSV)
// ============================================
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(',').map(item => item.trim().replace(/^["']|["']$/g, '').replace(/\r/g, ''));
        if (cols.length >= 4) {
            result.push({
                account: cols[0],
                student_id: cols[1] || cols[0],
                name: cols[2],
                classId: cols[3],
                password: cols[4] || '123456',
                grade: cols[5] || '',
                className: cols[6] || '',
                number: cols[7] || ''
            });
        }
    }
    return result;
}

async function fetchLatestStudentList() {
    const configObj = (typeof window !== 'undefined' && window.CONFIG) ? window.CONFIG : (typeof CONFIG !== 'undefined' ? CONFIG : {});
    const csvUrl = configObj.GOOGLE_SHEET_CSV_URL;

    if (!csvUrl) {
        console.warn('未設定 CONFIG.GOOGLE_SHEET_CSV_URL，退回使用本地預設名單');
        fallbackToDefaultStudents();
        return;
    }

    try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error('雲端學生名單回應異常');
        const csvText = await response.text();
        const parsedList = parseCSV(csvText);
        
        if (parsedList.length > 0) {
            dynamicStudentList = parsedList;
            console.log(`成功同步雲端學生名單共 ${dynamicStudentList.length} 位（含學號）`);
        } else {
            fallbackToDefaultStudents();
        }
    } catch (error) {
        console.error('線上學生名單載入失敗，採用本地名單備份:', error);
        fallbackToDefaultStudents();
    }
}

function fallbackToDefaultStudents() {
    if (typeof STUDENT_ACCOUNTS !== 'undefined') {
        dynamicStudentList = Object.keys(STUDENT_ACCOUNTS).map(key => ({
            account: key,
            student_id: STUDENT_ACCOUNTS[key].student_id || STUDENT_ACCOUNTS[key].studentId || key,
            ...STUDENT_ACCOUNTS[key]
        }));
    } else {
        dynamicStudentList = [];
    }
}

// ============================================
// Audio System
// ============================================
const AudioSystem = {
    ctx: null,
    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    play(type) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        switch(type) {
            case 'correct':
                osc.frequency.value = 600 + Math.random() * 200;
                gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                gain.gain.exponentialDecayTo && gain.gain.exponentialDecayTo(0.01, this.ctx.currentTime + 0.1);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.08);
                break;
            case 'error':
                osc.frequency.value = 150;
                osc.type = 'square';
                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.12);
                break;
            case 'combo':
                osc.frequency.value = 800 + state.currentStreak * 50;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.1);
                break;
            case 'start':
                osc.frequency.value = 440;
                gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.15);
                break;
            case 'end':
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.3);
                break;
        }
    }
};

// ============================================
// Confetti System
// ============================================
const ConfettiSystem = {
    particles: [],
    ctx: null,
    init() {
        this.ctx = dom.confettiCanvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },
    resize() {
        this.ctx.canvas.width = window.innerWidth;
        this.ctx.canvas.height = window.innerHeight;
    },
    burst() {
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 10,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                gravity: 0.3
            });
        }
        this.animate();
    },
    animate() {
        if (this.particles.length === 0) return;
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotationSpeed;
            
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();
            
            return p.y < window.innerHeight + 50;
        });
        
        requestAnimationFrame(() => this.animate());
    }
};

// ============================================
// Login Functions
// ============================================
function parseStudentIdentity(studentData, account) {
    const classId = studentData.classId || studentData.id || '';
    const normalized = String(classId).trim().toUpperCase();
    const match = normalized.match(/^([A-Z0-9]+?)([A-Z])([0-9]*)$/);

    const explicitNumber = [
        studentData.Number,
        studentData.number,
        studentData.studentNumber,
        studentData.studentNo,
        studentData.stuNo,
        studentData.num
    ].find(value => value !== undefined && value !== null && String(value).trim() !== '');

    const parsedNumber = explicitNumber !== undefined
        ? String(explicitNumber).trim()
        : (match && match[3] ? match[3] : '');

    // 抓取官方學號（student_id）
    const studentIdVal = studentData.student_id || studentData.studentId || classId || account;

    return {
        name: studentData.name || '',
        id: classId,
        studentId: String(studentIdVal).trim(), // 保存官方學號
        account: account || '',
        grade: String(studentData.grade || (match ? match[1] : '') || '').toUpperCase(),
        className: String(studentData.className || (match ? match[2] : '') || '').toUpperCase(),
        number: parsedNumber
    };
}

function formatStudentInfoLabel(student) {
    const classLabel = [student.grade, student.className].filter(Boolean).join('').toUpperCase();
    const numberLabel = student.number ? `(${student.number})` : '';
    const classPart = classLabel ? `${classLabel}${numberLabel}` : '';
    return classPart ? `${classPart} ${student.name}`.trim() : student.name;
}

function handleLogin() {
    const inputAccount = dom.loginAccount.value.replace(/\s+/g, '').toLowerCase();
    const inputPassword = dom.loginPassword.value.replace(/\s+/g, '');

    if (!inputAccount || !inputPassword) {
        dom.loginError.textContent = '請輸入帳號和密碼';
        dom.loginError.classList.add('show');
        return;
    }

    // 從動態名單中查找匹配帳號
    const foundStudent = dynamicStudentList.find(s => String(s.account).toLowerCase() === inputAccount);

    if (!foundStudent) {
        dom.loginError.textContent = '帳號不存在';
        dom.loginError.classList.add('show');
        return;
    }

    if (String(foundStudent.password) !== inputPassword) {
        dom.loginError.textContent = '密碼錯誤';
        dom.loginError.classList.add('show');
        return;
    }

    loginSuccess(foundStudent.account, foundStudent);
}

function loginSuccess(account, studentData) {
    state.student = parseStudentIdentity(studentData, account);

    dom.loginError.classList.remove('show');
    dom.studentInfoDisplay.textContent = formatStudentInfoLabel(state.student);

    dom.loggedInName.textContent = studentData.name;
    dom.userAvatar.textContent = studentData.name.charAt(0);
    dom.loggedInInfo.classList.remove('hidden');
    dom.openLoginBtn.classList.add('hidden');
    dom.actionBtnText.textContent = '選擇文章 📚';

    dom.loginAccount.value = '';
    dom.loginPassword.value = '';

    dom.loginModal.classList.add('hidden');
    
    const previewEl = document.getElementById('textPreview');
    if (previewEl) previewEl.classList.add('hidden');
    
    state.targetText = CONFIG.DEFAULT_ARTICLE;
    state.userInput = '';
    renderText();
    updateHint();
    
    dom.timerDisplay.textContent = '05:00';
    dom.speedDisplay.textContent = '0.00';
    dom.accuracyDisplay.textContent = '100%';
    dom.errorDisplay.textContent = '0';
    dom.progressDisplay.textContent = '0%';
    dom.comboDisplay.textContent = '0';
    dom.pauseBtn.classList.add('hidden');
    
    setTimeout(() => {
        dom.hiddenInput.focus();
    }, 100);
}

function handleLogout() {
    state.student = { name: '', id: '', studentId: '', account: '', grade: '', className: '', number: '' };
    dom.studentInfoDisplay.textContent = '未登錄';
    dom.loggedInInfo.classList.add('hidden');
    dom.openLoginBtn.classList.remove('hidden');
    dom.loginAccount.value = '';
    dom.loginPassword.value = '';
    dom.loginError.classList.remove('show');
    dom.actionBtnText.textContent = '自訂文章';
    dom.pauseBtn.classList.add('hidden');
    
    state.targetText = CONFIG.DEFAULT_TEXT;
    initGame();
}

// ============================================
// Article Selection
// ============================================
function renderArticleModal() {
    dom.articleGrid.innerHTML = ARTICLES.map(article => {
        const catClass = article.category === 'P2' ? 'p2' : 'p3plus';
        return `
            <div class="article-card ${catClass}" data-id="${article.id}">
                <div class="article-card-category">${article.category}</div>
                <div class="article-card-title">${article.title}</div>
                <div class="article-card-desc">${article.description}</div>
                <div class="article-card-chars">${article.content.length} 字</div>
            </div>
        `;
    }).join('');
}

function openArticleModal() {
    if (!state.student.name) {
        dom.loginModal.classList.remove('hidden');
        dom.loginAccount.focus();
        return;
    }
    renderArticleModal();
    dom.articleModal.classList.remove('hidden');
}

function selectArticle(articleId) {
    const article = ARTICLES.find(a => a.id === articleId);
    if (!article) return;

    state.targetText = article.content;
    state.userInput = '';
    state.gameActive = false;
    state.isPaused = false;
    state.errors = 0;
    state.totalKeysPressed = 0;
    state.correctKeys = 0;
    state.currentStreak = 0;
    state.bestStreak = 0;
    state.startTime = null;
    state.pausedTime = 0;
    clearInterval(state.timerInterval);
    state.timerInterval = null;

    dom.timerDisplay.textContent = '05:00';
    dom.speedDisplay.textContent = '0.00';
    dom.accuracyDisplay.textContent = '100%';
    dom.errorDisplay.textContent = '0';
    dom.progressDisplay.textContent = '0%';
    dom.comboDisplay.textContent = '0';
    dom.pauseBtn.classList.add('hidden');

    dom.articleModal.classList.add('hidden');
    renderText();
    updateHint();
    dom.hiddenInput.focus();
}

// ============================================
// Keyboard Rendering
// ============================================
function renderKeyboard() {
    dom.keyboard.innerHTML = KEYBOARD_LAYOUT.map(row => {
        const keys = row.map(key => {
            const widthClass = key.width ? `key-${key.width}` : '';
            return `<div class="key ${key.finger} ${widthClass}" id="${key.id}">${key.label}</div>`;
        }).join('');
        return `<div class="kb-row">${keys}</div>`;
    }).join('');
}

// ============================================
// Core Functions
// ============================================
function initGame() {
    state.gameActive = false;
    state.isPaused = false;
    state.userInput = '';
    state.errors = 0;
    state.totalKeysPressed = 0;
    state.correctKeys = 0;
    state.currentStreak = 0;
    state.bestStreak = 0;
    state.startTime = null;
    state.pausedTime = 0;
    clearInterval(state.timerInterval);
    state.timerInterval = null;

    dom.timerDisplay.textContent = '05:00';
    dom.speedDisplay.textContent = '0.00';
    dom.accuracyDisplay.textContent = '100%';
    dom.errorDisplay.textContent = '0';
    dom.progressDisplay.textContent = '0%';
    dom.comboDisplay.textContent = '0';
    dom.hiddenInput.value = '';
    dom.pauseBtn.classList.add('hidden');

    renderText();
    updateHint();
}

function startCountdown(callback) {
    dom.countdownOverlay.classList.remove('hidden');
    let count = 3;
    dom.countdownNumber.textContent = count;
    
    const tick = setInterval(() => {
        count--;
        if (count > 0) {
            dom.countdownNumber.textContent = count;
            dom.countdownNumber.style.animation = 'none';
            void dom.countdownNumber.offsetWidth;
            dom.countdownNumber.style.animation = 'pulse 0.3s ease-out';
        } else {
            clearInterval(tick);
            dom.countdownNumber.textContent = 'GO!';
            AudioSystem.play('start');
            setTimeout(() => {
                dom.countdownOverlay.classList.add('hidden');
                callback();
            }, 500);
        }
    }, 800);
}

function scrollToCurrentChar() {
    const textContent = dom.textDisplay.querySelector('.text-content');
    const currentChar = dom.textDisplay.querySelector('.current');
    if (!textContent || !currentChar) return;

    const currentLine = currentChar.closest('.line-block');
    if (!currentLine) return;

    const lineTop = currentLine.offsetTop;
    const lineHeight = currentLine.offsetHeight;
    const containerTop = textContent.scrollTop;
    const containerHeight = textContent.clientHeight;

    if (lineTop < containerTop) {
        textContent.scrollTop = lineTop - 40;
    } else if (lineTop + lineHeight > containerTop + containerHeight - lineHeight) {
        textContent.scrollTop = lineTop - lineHeight - 40;
    }
}

function renderText() {
    dom.textDisplay.innerHTML = '';

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.id = 'progressBar';
    progressContainer.appendChild(progressBar);
    dom.textDisplay.appendChild(progressContainer);

    const textContent = document.createElement('div');
    textContent.className = 'text-content';

    const lines = state.targetText.split('\n');
    let lineStart = 0;

    lines.forEach((line, lineIndex) => {
        const hasNewline = lineIndex < lines.length - 1;
        const lineEnd = lineStart + line.length;
        const lineInputEnd = lineEnd + (hasNewline ? 1 : 0);
        const lineContainer = document.createElement('div');
        lineContainer.className = 'line-container line-block';
        lineContainer.style.cssText = 'display: block; width: 100%; margin-bottom: 16px;';

        const targetLine = document.createElement('div');
        targetLine.className = 'target-line';
        targetLine.style.cssText = 'display: block; width: 100%; font-size: 24px; font-weight: bold; color: #333; margin-bottom: 8px; letter-spacing: 1px; min-height: 36px; line-height: 1.5; white-space: pre-wrap;';

        const inputLine = document.createElement('div');
        inputLine.className = 'user-input-line';
        inputLine.style.cssText = 'display: block; clear: both; width: 100%; box-sizing: border-box; margin-top: 4px; font-size: 24px; font-weight: bold; color: #2563eb; background: #eff6ff; padding: 8px; border: 2px solid #93c5fd; border-radius: 6px; min-height: 48px; line-height: 1.5; word-break: break-all; white-space: pre-wrap;';

        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const targetIndex = lineStart + charIndex;
            const char = line[charIndex];
            const span = document.createElement('span');
            span.textContent = char;

            if (targetIndex < state.userInput.length) {
                const isCorrect = state.userInput[targetIndex] === char;
                span.style.color = isCorrect ? '#10b981' : '#ef4444';
                if (!isCorrect) span.style.textDecoration = 'underline';
            } else if (targetIndex === state.userInput.length) {
                span.className = 'current';
                span.style.background = '#fef08a';
                span.style.borderRadius = '3px';
            }

            targetLine.appendChild(span);
        }

        if (hasNewline) {
            const newlineIndex = lineEnd;
            const newlineMarker = document.createElement('span');
            newlineMarker.textContent = '↵';
            newlineMarker.style.color = newlineIndex < state.userInput.length
                ? (state.userInput[newlineIndex] === '\n' ? '#10b981' : '#ef4444')
                : '#94a3b8';

            if (newlineIndex < state.userInput.length && state.userInput[newlineIndex] !== '\n') {
                newlineMarker.style.textDecoration = 'underline';
            } else if (newlineIndex === state.userInput.length) {
                newlineMarker.className = 'current';
                newlineMarker.style.background = '#fef08a';
                newlineMarker.style.borderRadius = '3px';
            }

            targetLine.appendChild(newlineMarker);
        }

        const lineInput = state.userInput
            .slice(lineStart, Math.min(lineInputEnd, state.userInput.length))
            .replace(/\n/g, '↵');
        inputLine.textContent = lineInput || '（請在此處打字...）';

        lineContainer.appendChild(targetLine);
        lineContainer.appendChild(inputLine);
        textContent.appendChild(lineContainer);
        lineStart = lineInputEnd;
    });

    dom.textDisplay.appendChild(textContent);
    dom.progressBar = progressBar;

    requestAnimationFrame(() => scrollToCurrentChar());
}

function createCharSpan(char, index, isNewline = false) {
    const span = document.createElement('span');
    span.className = 'char' + (isNewline ? ' newline' : '');
    span.textContent = isNewline ? '' : char;

    if (index < state.userInput.length) {
        const inputChar = state.userInput[index];
        const isCorrect = inputChar === char; 
        span.classList.add(isCorrect ? 'correct' : 'incorrect');
    } else if (index === state.userInput.length) {
        span.classList.add('current');
    }

    return span;
}

function updateHint() {
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active-hint'));

    if (state.userInput.length >= state.targetText.length) return;

    const nextChar = state.targetText[state.userInput.length];

    if (nextChar === '\n') {
        getKey('key-enter')?.classList.add('active-hint');
        return;
    }

    if (nextChar === '\t') {
        getKey('key-tab')?.classList.add('active-hint');
        return;
    }

    let keyId;
    if (nextChar === ' ') {
        keyId = 'key-space';
    } else {
        keyId = PUNC_MAP[nextChar] || PUNC_MAP[nextChar.toLowerCase()] || `key-${nextChar.toLowerCase()}`;
    }

    const keyEl = getKey(keyId);
    if (keyEl) keyEl.classList.add('active-hint');

    if (nextChar === nextChar.toUpperCase() && nextChar !== nextChar.toLowerCase()) {
        const shiftKeyId = 'key-shift-l';
        getKey(shiftKeyId)?.classList.add('active-hint');
    }
}

function getKey(id) {
    return document.getElementById(id);
}

function updateStats() {
    const progress = state.targetText.length > 0 
        ? Math.round((state.userInput.length / state.targetText.length) * 100) 
        : 0;
    dom.progressDisplay.textContent = `${progress}%`;
    if (dom.progressBar) {
        dom.progressBar.style.width = `${progress}%`;
    }
    
    dom.comboDisplay.textContent = state.currentStreak;
    const comboCard = dom.comboDisplay.closest('.stat-card');
    if (comboCard) {
        if (state.currentStreak >= 10) {
            comboCard.classList.add('streak-hot');
        } else {
            comboCard.classList.remove('streak-hot');
        }
    }
    
    const accuracy = state.totalKeysPressed > 0 
        ? Math.round((state.correctKeys / state.totalKeysPressed) * 100) 
        : 100;
    dom.accuracyDisplay.textContent = `${accuracy}%`;
}

function handleInput(char) {
    if (state.userInput.length >= state.targetText.length) return;
    if (state.isPaused) return;

    if (!state.gameActive) {
        state.gameActive = true;
        dom.pauseBtn.classList.remove('hidden');
        startTimer();
    }

    state.totalKeysPressed++;
    const targetChar = state.targetText[state.userInput.length];

    if (char === '\t') {
        state.totalKeysPressed++;
        if (targetChar === '\t') {
            state.correctKeys++;
            state.currentStreak++;
            if (state.currentStreak > state.bestStreak) {
                state.bestStreak = state.currentStreak;
            }
            if (state.currentStreak % 10 === 0) {
                AudioSystem.play('combo');
            } else {
                AudioSystem.play('correct');
            }
        } else {
            state.errors++;
            state.currentStreak = 0;
            AudioSystem.play('error');
            dom.errorDisplay.textContent = state.errors;
        }
        state.userInput += char;
        renderText();
        updateHint();
        updateStats();

        if (state.userInput.length >= state.targetText.length) {
            endGame();
        }
        return;
    }

    const isCorrect = char === targetChar;

    if (isCorrect) {
        state.correctKeys++;
        state.currentStreak++;
        if (state.currentStreak > state.bestStreak) {
            state.bestStreak = state.currentStreak;
        }
        if (state.currentStreak % 10 === 0) {
            AudioSystem.play('combo');
        } else {
            AudioSystem.play('correct');
        }
    } else {
        state.errors++;
        state.currentStreak = 0;
        AudioSystem.play('error');
        dom.errorDisplay.textContent = state.errors;
    }

    state.userInput += char;
    renderText();
    updateHint();
    updateStats();

    if (state.userInput.length >= state.targetText.length) {
        endGame();
    }
}

function startTimer() {
    if (state.timerInterval) return;
    state.startTime = Date.now() - state.pausedTime * 1000;

    state.timerInterval = setInterval(() => {
        if (state.isPaused) return;
        
        const elapsed = (Date.now() - state.startTime) / 1000;
        const remain = Math.max(0, CONFIG.GAME_DURATION - elapsed);

        dom.timerDisplay.textContent = formatTime(remain);

        if (state.userInput.length > 0) {
            dom.speedDisplay.textContent = (state.userInput.length / elapsed).toFixed(2);
        }

        if (remain <= 0) endGame();
    }, 100);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function calculateScore(speed) {
    if (speed >= 1.0) return Math.max(0, 100 - state.errors);
    const base = speed >= 0.1 ? 40 + Math.floor((speed - 0.1) * 60 / 0.9) : 0;
    return Math.max(0, base - state.errors);
}

function getGrade(score, accuracy) {
    if (score >= 90 && accuracy >= 95) return { grade: 'S', color: '#ffd700', message: '完美表現！🌟' };
    if (score >= 80) return { grade: 'A', color: '#10b981', message: '太棒了！💪' };
    if (score >= 70) return { grade: 'B', color: '#3b82f6', message: '做得很好！👏' };
    if (score >= 60) return { grade: 'C', color: '#f59e0b', message: '繼續加油！💪' };
    if (score >= 40) return { grade: 'D', color: '#ef4444', message: '需要多練習📝' };
    return { grade: 'F', color: '#6b7280', message: '別放棄！🔥' };
}

function endGame() {
    state.gameActive = false;
    state.isPaused = false;
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    dom.pauseBtn.classList.add('hidden');

    const duration = (Date.now() - state.startTime) / 1000;
    const finalSpeed = (state.userInput.length / duration).toFixed(2);
    const finalAcc = state.totalKeysPressed > 0
        ? Math.round(((state.totalKeysPressed - state.errors) / state.totalKeysPressed) * 100)
        : 0;
    const finalScore = calculateScore(parseFloat(finalSpeed));
    const gradeInfo = getGrade(finalScore, finalAcc);

    dom.resultTitle.textContent = `🏆 ${gradeInfo.message}`;
    
    dom.resultStats.innerHTML = `
        <div class="result-stats">
            <div class="result-hero">
                <div class="result-student">${state.student.name} (學號: ${state.student.studentId})</div>
                <div class="result-score" style="color: ${gradeInfo.color}">${finalScore}</div>
                <div class="result-score-label">總分</div>
            </div>
            <div class="result-details">
                <div class="result-detail speed">
                    <div class="result-detail-value">${finalSpeed}</div>
                    <div class="result-detail-label">字/秒</div>
                </div>
                <div class="result-detail accuracy">
                    <div class="result-detail-value">${finalAcc}%</div>
                    <div class="result-detail-label">準確度</div>
                </div>
                <div class="result-detail errors">
                    <div class="result-detail-value">${state.errors}</div>
                    <div class="result-detail-label">錯字數</div>
                </div>
                <div class="result-detail combo">
                    <div class="result-detail-value">${state.bestStreak}</div>
                    <div class="result-detail-label">最佳連續</div>
                </div>
            </div>
        </div>
    `;
    
    dom.resultGrade.innerHTML = `<span class="grade-badge" style="background: ${gradeInfo.color}">${gradeInfo.grade}</span>`;

    AudioSystem.play('end');
    if (finalScore >= 70) {
        ConfettiSystem.burst();
    }
    
    dom.resultModal.classList.remove('hidden');
    uploadResults({ score: finalScore, speed: finalSpeed, accuracy: finalAcc, errors: state.errors, bestStreak: state.bestStreak });
}

function togglePause() {
    if (!state.gameActive) return;
    
    if (state.isPaused) {
        state.isPaused = false;
        state.startTime = Date.now() - state.pausedTime * 1000;
        dom.pauseOverlay.classList.add('hidden');
        dom.pauseBtn.querySelector('span:first-child').textContent = '⏸️';
        dom.pauseBtn.querySelector('span:last-child').textContent = '暫停';
    } else {
        state.isPaused = true;
        const elapsed = (Date.now() - state.startTime) / 1000;
        state.pausedTime = elapsed;
        dom.pauseOverlay.classList.remove('hidden');
        dom.pauseBtn.querySelector('span:first-child').textContent = '▶️';
        dom.pauseBtn.querySelector('span:last-child').textContent = '繼續';
    }
}

// ============================================
// 成績雲端同步 Function (含學號 student_id)
// ============================================
async function uploadResults(results) {
    // 1. 檢查是否為 DEMO
    if (state.student.id === 'DEMO' || state.student.studentId === 'DEMO') {
        dom.uploadStatus.textContent = '✅ 示範模式（成績不記錄）';
        dom.uploadStatus.className = 'upload-status success';
        return;
    }
    
    dom.uploadStatus.textContent = '正在同步成績至雲端總表...';
    dom.uploadStatus.className = 'upload-status uploading';

    // 2. 組裝 Payload
    const payload = {
        student_id: state.student.studentId || state.student.id || '',
        account: state.student.account || '',
        name: state.student.name || '',
        grade: state.student.grade || '',
        className: state.student.className || '',
        number: state.student.number || '',
        accuracy: results.accuracy,
        speed: results.speed,
        errors: results.errors,
        score: results.score,
        timestamp: new Date().toLocaleString()
    };

    console.log('正在上傳 Output 總表成績:', payload);
    
    // 3. 發送請求 (安全讀取 CONFIG)
    try {
        const configObj = (typeof window !== 'undefined' && window.CONFIG) ? window.CONFIG : (typeof CONFIG !== 'undefined' ? CONFIG : {});
        
        await fetch(configObj.SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // 避開 CORS 阻擋
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });
        
        dom.uploadStatus.textContent = '✅ 成績已成功寫入總表！';
        dom.uploadStatus.className = 'upload-status success';
        console.log('✅ 成績已成功發送至 GAS');
    } catch (error) {
        console.error('上傳總表失敗:', error);
        dom.uploadStatus.textContent = '❌ 同步失敗，請截圖聯繫老師';
        dom.uploadStatus.className = 'upload-status error';
    }
}

// ============================================
// Event Handlers
// ============================================
function setupEventListeners() {
    dom.loginBtn.addEventListener('click', handleLogin);
    dom.logoutBtn.addEventListener('click', handleLogout);
    dom.openLoginBtn.addEventListener('click', () => {
        dom.loginModal.classList.remove('hidden');
        dom.loginAccount.focus();
    });

    dom.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    dom.loginAccount.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') dom.loginPassword.focus();
    });

    dom.loginAccount.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.target.focus();
    });

    dom.loginPassword.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.target.focus();
    });

    document.getElementById('articleModalClose').addEventListener('click', () => {
        dom.articleModal.classList.add('hidden');
    });

    dom.articleModal.addEventListener('click', (e) => {
        if (e.target === dom.articleModal) dom.articleModal.classList.add('hidden');
    });

    dom.articleGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.article-card');
        if (card) selectArticle(card.dataset.id);
    });

    document.getElementById('openArticleBtn').addEventListener('click', openArticleModal);

    dom.pauseBtn.addEventListener('click', togglePause);
    dom.resumeBtn.addEventListener('click', togglePause);

    window.addEventListener('keydown', (e) => {
        const keyId = e.key === ' ' ? 'key-space' :
                      e.key === 'Enter' ? 'key-enter' :
                      e.key === 'Backspace' ? 'key-backspace' :
                      e.key === 'Tab' ? 'key-tab' :
                      PUNC_MAP[e.key] || `key-${e.key.toLowerCase()}`;
        const keyEl = document.getElementById(keyId);
        if (keyEl) {
            keyEl.classList.add('pressed');
            setTimeout(() => keyEl.classList.remove('pressed'), 100);
        }

        if (!dom.articleModal.classList.contains('hidden') ||
            !dom.resultModal.classList.contains('hidden') ||
            !dom.loginModal.classList.contains('hidden')) return;

        if (e.key === ' ' && state.isPaused) {
            togglePause();
            e.preventDefault();
            return;
        }

        if (e.key === 'Escape' && state.gameActive && !state.isPaused) {
            togglePause();
            return;
        }

        if (state.isPaused) return;

        if (e.key === 'Backspace') {
            if (state.userInput.length > 0) {
                state.userInput = state.userInput.slice(0, -1);
                renderText();
                updateHint();
            }
            e.preventDefault();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            handleInput('\n');
            dom.hiddenInput.dataset.blocked = 'true';
            setTimeout(() => { dom.hiddenInput.dataset.blocked = ''; }, 100);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            handleInput('\t');
            dom.hiddenInput.dataset.blocked = 'true';
            setTimeout(() => { dom.hiddenInput.dataset.blocked = ''; }, 100);
            return;
        }
    });

    dom.hiddenInput.addEventListener('input', (e) => {
        if (dom.hiddenInput.dataset.blocked === 'true') return;

        if (e.data) {
            for (const ch of e.data) {
                if (ch) handleInput(ch);
            }
        } else if (e.inputType === 'insertFromPaste' && dom.hiddenInput.value) {
            for (const ch of dom.hiddenInput.value) {
                handleInput(ch);
            }
        }
        dom.hiddenInput.value = '';

        if (state.userInput.length >= state.targetText.length && state.gameActive) {
            endGame();
        }
    });

    dom.restartBtn.addEventListener('click', () => {
        dom.resultModal.classList.add('hidden');
        initGame();
    });

    window.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (!dom.loginModal.classList.contains('hidden')) {
            dom.loginAccount.focus();
            return;
        }
        if (dom.articleModal.classList.contains('hidden') &&
            dom.resultModal.classList.contains('hidden') &&
            !state.isPaused && state.student.name) {
            dom.hiddenInput.focus();
        }
    });
}

// ============================================
// Initialization
// ============================================
async function init() {
    try {
        renderKeyboard();
        ConfettiSystem.init();
        setupEventListeners();
        
        // 1. 先同步雲端試算表學生名單（含學號）
        await fetchLatestStudentList();

        // 2. 初始化遊戲狀態
        initGame();

        // 3. 顯示登入 Modal
        setTimeout(() => {
            if (state.student.name) return;
            
            if (dom.loginModal) dom.loginModal.classList.remove('hidden');
            if (dom.openLoginBtn) dom.openLoginBtn.classList.add('hidden');
            if (dom.loginAccount) dom.loginAccount.focus();
        }, 100);
    } catch (e) {
        console.error('初始化錯誤:', e);
    }
}

init();

// ============================================
// 動態新增「自選 txt 文章」功能 (換行格式修正版)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 建立自選文章卡片
    const customBtn = document.createElement('button');
    customBtn.id = 'btn-custom-article';
    customBtn.className = 'article-card custom-article-btn';
    customBtn.innerHTML = `
        <div class="article-icon">📁</div>
        <div class="article-info">
            <h3 class="article-title">自選文章 (.txt)</h3>
            <div class="article-meta">從電腦上傳純文字檔</div>
        </div>
    `;

    const articleGrid = document.getElementById('articleGrid');
    const fileInput = document.getElementById('txt-file-input');

    // 自動將卡片插入文章選單
    if (articleGrid) {
        const observer = new MutationObserver(() => {
            if (articleGrid.children.length > 0 && !document.getElementById('btn-custom-article')) {
                articleGrid.appendChild(customBtn);
            }
        });
        observer.observe(articleGrid, { childList: true });
    }

    if (customBtn && fileInput) {
        customBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.name.endsWith('.txt')) {
                alert('請選擇副檔名為 .txt 的純文字檔案！');
                fileInput.value = '';
                return;
            }

            const reader = new FileReader();

            reader.onload = (event) => {
                let rawText = event.target.result;
                
                if (!rawText || !rawText.trim()) {
                    alert('此 .txt 檔案內容為空，請重新選擇！');
                    return;
                }

                // ============================================
                // 🛠️ 關鍵修正：清理換行符號與行尾空格
                // ============================================
                // 1. 將 Windows 換行 (\r\n) 或 Mac 舊版換行 (\r) 統一轉換為 \n
                let textContent = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                // 2. 逐行清理每行末尾多餘的「真實空格」，確保每一行結尾直接對接 \n (Enter)
                textContent = textContent
                    .split('\n')
                    .map(line => line.trimEnd()) // 清除行尾隱藏空格
                    .join('\n')
                    .trim();                   // 清除文章最前與最後的空行

                const customId = 'custom_' + Date.now();
                const articleTitle = file.name.replace('.txt', '');

                // 1. 建立標準文章物件
                const customArticle = {
                    id: customId,
                    title: articleTitle,
                    content: textContent,
                    category: '自選文章',
                    level: '自訂'
                };

                // 2. 塞入全域 ARTICLES 陣列中
                if (typeof ARTICLES !== 'undefined' && Array.isArray(ARTICLES)) {
                    // 先清空舊的自選文章，保持陣列乾淨
                    const existingIndex = ARTICLES.findIndex(a => a.id && a.id.startsWith('custom_'));
                    if (existingIndex !== -1) {
                        ARTICLES.splice(existingIndex, 1);
                    }
                    ARTICLES.push(customArticle);
                }

                // 3. 呼叫系統原生的 selectArticle 載入文章
                if (typeof selectArticle === 'function') {
                    selectArticle(customId);
                } else {
                    if (typeof state !== 'undefined') state.targetText = textContent;
                    if (typeof renderText === 'function') renderText();
                    if (typeof updateHint === 'function') updateHint();
                }

                console.log('✅ 自選文章已清理換行符號並順利載入！');
            };

            reader.readAsText(file, 'UTF-8');
            fileInput.value = ''; // 清空選擇器
        });
    }
});

