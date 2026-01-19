import './style.css';

document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    // Sections
    const phases = {
        setup: document.getElementById('setup-phase'),
        reading: document.getElementById('reading-phase'),
        recall: document.getElementById('recall-phase'),
        compare: document.getElementById('compare-phase'),
        score: document.getElementById('score-phase')
    };

    // Inputs & Displays
    const loadButton = document.getElementById('loadButton');
    const titleDiv = document.getElementById('title');
    const textDiv = document.getElementById('text');
    const statusDiv = document.getElementById('status');
    const languageSelect = document.getElementById('languageSelect');
    const recallInput = document.getElementById('recallInput');
    const finishRecallButton = document.getElementById('finishRecallButton');
    const originalTextDisplay = document.getElementById('originalTextDisplay');
    const userRecallDisplay = document.getElementById('userRecallDisplay');
    const goToScoreButton = document.getElementById('goToScoreButton');
    const restartButton = document.getElementById('restartButton');
    const starRatings = document.querySelectorAll('.star-rating');
    const readingTimeMessage = document.getElementById('readingTimeMessage');
    const historySection = document.getElementById('history-section');
    const historyTimeline = document.getElementById('history-timeline');
    const downloadCsvButton = document.getElementById('downloadCsvButton');

    // === STATE ===
    const AppState = {
        SETUP: 'setup',
        READING: 'reading',
        RECALL: 'recall',
        COMPARE: 'compare',
        SCORE: 'score'
    };

    let currentState = AppState.SETUP;
    let currentArticleTitle = '';
    let currentArticleContent = '';
    let startTime = 0;
    let readingDuration = 0;
    let sessionHistory = JSON.parse(localStorage.getItem('readingSessionHistory') || '[]');

    // === CONFIG ===
    const API_PARAMS = {
        format: 'json',
        action: 'query',
        origin: '*'
    };
    const MAX_RETRIES = 3;

    // === EVENT LISTENERS ===


    // Buttons
    loadButton.addEventListener('click', startReadingSession);

    finishRecallButton.addEventListener('click', () => {
        transitionTo(AppState.COMPARE);
    });

    goToScoreButton.addEventListener('click', () => {
        transitionTo(AppState.SCORE);
    });

    restartButton.addEventListener('click', () => {
        saveSession();
        resetApp();
        transitionTo(AppState.SETUP);
    });

    downloadCsvButton.addEventListener('click', downloadHistoryAsCsv);

    // Keyboard Navigation (Space to finish reading)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && currentState === AppState.READING) {
            e.preventDefault(); // Prevent scrolling
            transitionTo(AppState.RECALL);
        }
    });

    const doneReadingButton = document.getElementById('doneReadingButton');

    doneReadingButton.addEventListener('click', () => {
        if (currentState === AppState.READING) {
            transitionTo(AppState.RECALL);
        }
    });

    // Star Rating Logic
    // Star Rating Logic
    const ratingGroup = document.querySelector('.star-rating');
    const stars = ratingGroup.querySelectorAll('span');

    function updateStars(value) {
        stars.forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.value) <= parseInt(value));
        });
    }

    stars.forEach(star => {
        // Hover effect
        star.addEventListener('mouseenter', function () {
            updateStars(this.dataset.value);
        });

        // Click to set permanent value
        star.addEventListener('click', function () {
            ratingGroup.dataset.selectedValue = this.dataset.value;
            updateStars(this.dataset.value);
            restartButton.disabled = false;
        });
    });

    // Reset to selected value on mouse leave
    ratingGroup.addEventListener('mouseleave', function () {
        const selected = this.dataset.selectedValue || 0;
        updateStars(selected);
    });

    // === FUNCTIONS ===

    /**
     * Handles state transitions and UI updates
     */
    function transitionTo(newState) {
        currentState = newState;

        // Hide all phases
        Object.values(phases).forEach(el => el.classList.add('hidden'));

        // Show target phase
        phases[newState].classList.remove('hidden');

        // State-specific logic
        if (newState === AppState.READING) {
            startTime = Date.now();
            window.scrollTo(0, 0);
        } else if (newState === AppState.RECALL) {
            const endTime = Date.now();
            readingDuration = (endTime - startTime) / 1000;
            readingTimeMessage.textContent = `You read the text in ${readingDuration.toFixed(2)} seconds, write everything you remember now`;

            recallInput.value = ''; // Clear previous input
            recallInput.focus();
            window.scrollTo(0, 0);
        } else if (newState === AppState.COMPARE) {
            originalTextDisplay.textContent = currentArticleContent;
            userRecallDisplay.textContent = recallInput.value;
        } else if (newState === AppState.SCORE) {
            // Reset stars and disable restart button until graded
            delete ratingGroup.dataset.selectedValue;
            document.querySelectorAll('.star-rating span').forEach(s => s.classList.remove('active'));
            restartButton.disabled = true;
        }
    }

    function resetApp() {
        currentArticleTitle = '';
        currentArticleContent = '';
        titleDiv.textContent = '';
        textDiv.textContent = '';
        statusDiv.textContent = '';
        loadButton.disabled = false;
    }

    /**
     * Starts the fetch process and transitions to reading upon success
     */
    async function startReadingSession() {
        statusDiv.textContent = 'Loading article...';
        loadButton.disabled = true;

        const apiUrl = `https://${languageSelect.value}.wikipedia.org/w/api.php`;
        const charLimit = 1200; // Always fetch 1200 characters

        try {
            // Retry logic
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    const title = await fetchRandomTitle(apiUrl);
                    if (!title) throw new Error("No title found");

                    const content = await fetchArticleContent(apiUrl, title, charLimit);
                    if (!content) throw new Error("No content found");

                    // Success!
                    currentArticleTitle = title;
                    currentArticleContent = content;

                    // Display for reading phase
                    processAndDisplayContent(title, content);
                    statusDiv.textContent = '';
                    loadButton.disabled = false;

                    transitionTo(AppState.READING);
                    return; // Exit function

                } catch (innerError) {
                    console.warn(`Attempt ${attempt + 1} failed:`, innerError);
                    if (attempt === MAX_RETRIES - 1) throw innerError;
                    await delay(attempt);
                }
            }
        } catch (error) {
            console.error("Failed to load article:", error);
            statusDiv.textContent = 'Failed to load article. Please try again.';
            loadButton.disabled = false;
        }
    }

    // === API HELPERS (Refactored) ===

    async function fetchRandomTitle(apiUrl) {
        const params = new URLSearchParams({
            ...API_PARAMS,
            list: 'random',
            rnnamespace: 0,
            rnlimit: 1
        });

        const response = await fetch(`${apiUrl}?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data.query?.random?.[0]?.title || null;
    }

    async function fetchArticleContent(apiUrl, title, charLimit) {
        const params = new URLSearchParams({
            ...API_PARAMS,
            prop: 'extracts',
            titles: title,
            explaintext: 1,
            redirects: 1,
            exchars: charLimit,
            exintro: 1 // Optional: Get just the intro or leave to get more
        });

        const response = await fetch(`${apiUrl}?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        return pages[pageId].extract || null;
    }

    function processAndDisplayContent(title, rawContent) {
        // Clean text
        let cleanedText = rawContent
            .replace(/\n\s*\n/g, '\n\n')
            .replace(/\[\d+\]/g, '')
            .trim();

        if (cleanedText.startsWith(title)) {
            cleanedText = cleanedText.substring(cleanedText.indexOf('\n') + 1).trim();
        }

        // Store cleaned version as the "official" content for this session
        currentArticleContent = cleanedText;

        titleDiv.textContent = title;
        textDiv.textContent = cleanedText;
    }

    function delay(attempt) {
        return new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    }

    /**
     * Records the current session data and updates historical view
     */
    function saveSession() {
        const grade = parseInt(ratingGroup.dataset.selectedValue) || 0;
        if (grade === 0 && readingDuration === 0) return;

        const charCount = currentArticleContent.length;
        const score = readingDuration > 0 ? (grade * charCount / readingDuration) : 0;

        const session = {
            attempt: sessionHistory.length + 1,
            title: currentArticleTitle,
            chars: charCount,
            time: readingDuration,
            grade: grade,
            score: score,
            timestamp: new Date().toLocaleString()
        };

        sessionHistory.push(session);
        localStorage.setItem('readingSessionHistory', JSON.stringify(sessionHistory));
        renderHistory();
    }

    function renderHistory() {
        if (sessionHistory.length === 0) {
            historySection.classList.add('hidden');
            return;
        }

        historySection.classList.remove('hidden');
        historyTimeline.innerHTML = '';

        sessionHistory.forEach(session => {
            // Recalculate if it's the old (grade/time) format
            let displayScore = session.score || 0;
            if (displayScore < 10 && session.chars > 0) {
                displayScore = (session.grade * session.chars) / (session.time || 1);
            }
            const displayTime = session.time || 0;
            const displayChars = session.chars || 0;

            const marker = document.createElement('div');
            marker.className = 'history-marker';
            marker.title = "Click to see details";
            marker.innerHTML = `
                <span class="attempt-num">Attempt ${session.attempt}</span>
                <span class="score-val">${Math.round(displayScore)}</span>
                <div class="secondary-metrics">
                    <div>Grade: ${session.grade}/5</div>
                    <div>Time: ${displayTime.toFixed(2)}s</div>
                    <div>Chars: ${displayChars}</div>
                </div>
            `;

            marker.addEventListener('click', () => {
                marker.classList.toggle('expanded');
            });

            historyTimeline.appendChild(marker);
        });

        // Scroll to the end of the timeline
        historyTimeline.scrollLeft = historyTimeline.scrollWidth;
    }

    function downloadHistoryAsCsv() {
        if (sessionHistory.length === 0) return;

        const headers = ['Attempt', 'Date', 'Article', 'Characters', 'Time (s)', 'Grade (out of 5)', 'Raw Score'];
        const rows = sessionHistory.map(s => {
            let displayScore = s.score || 0;
            if (displayScore < 10 && s.chars > 0) {
                displayScore = (s.grade * s.chars) / (s.time || 1);
            }
            const displayTime = s.time || 0;
            return [
                s.attempt,
                `"${s.timestamp}"`,
                `"${s.title}"`,
                s.chars,
                displayTime.toFixed(2),
                s.grade,
                displayScore.toFixed(0)
            ];
        });

        const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "speed_reading_progress.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Init
    renderHistory();
});
