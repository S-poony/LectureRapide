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
    const wordSlider = document.getElementById('wordSlider');
    const wordCountDisplay = document.getElementById('wordCountDisplay');
    const recallInput = document.getElementById('recallInput');
    const finishRecallButton = document.getElementById('finishRecallButton');
    const originalTextDisplay = document.getElementById('originalTextDisplay');
    const userRecallDisplay = document.getElementById('userRecallDisplay');
    const goToScoreButton = document.getElementById('goToScoreButton');
    const restartButton = document.getElementById('restartButton');
    const starRatings = document.querySelectorAll('.star-rating');

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

    // === CONFIG ===
    const API_PARAMS = {
        format: 'json',
        action: 'query',
        origin: '*'
    };
    const MAX_RETRIES = 3;

    // === EVENT LISTENERS ===

    // Slider & Input Sync
    function updateFromSlider() { wordCountDisplay.value = wordSlider.value; }
    function updateFromInput() {
        let value = parseInt(wordCountDisplay.value) || 0;
        const min = parseInt(wordSlider.min);
        const max = parseInt(wordSlider.max);
        value = Math.max(min, Math.min(max, value));
        wordCountDisplay.value = value;
        wordSlider.value = value;
    }
    wordSlider.addEventListener('input', updateFromSlider);
    wordCountDisplay.addEventListener('input', updateFromInput);
    wordCountDisplay.addEventListener('blur', updateFromInput);

    // Buttons
    loadButton.addEventListener('click', startReadingSession);

    finishRecallButton.addEventListener('click', () => {
        transitionTo(AppState.COMPARE);
    });

    goToScoreButton.addEventListener('click', () => {
        transitionTo(AppState.SCORE);
    });

    restartButton.addEventListener('click', () => {
        resetApp();
        transitionTo(AppState.SETUP);
    });

    // Keyboard Navigation (Space to finish reading)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && currentState === AppState.READING) {
            e.preventDefault(); // Prevent scrolling
            transitionTo(AppState.RECALL);
        }
    });

    // Mobile specific: Tap to finish reading
    phases.reading.addEventListener('click', (e) => {
        // Only trigger if clicking the main reading area, not metadata links if any existed
        if (currentState === AppState.READING) {
            transitionTo(AppState.RECALL);
        }
    });

    // Star Rating Logic
    starRatings.forEach(ratingGroup => {
        const stars = ratingGroup.querySelectorAll('span');

        stars.forEach(star => {
            star.addEventListener('click', function () {
                const value = this.dataset.value;
                // Update visual state (fill all stars up to clicked one)
                stars.forEach(s => {
                    s.classList.toggle('active', s.dataset.value <= value);
                });
            });

            // Hover effect handled purely in CSS mostly, but could enhance here if needed
        });
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
            window.scrollTo(0, 0);
        } else if (newState === AppState.RECALL) {
            recallInput.value = ''; // Clear previous input
            recallInput.focus();
            window.scrollTo(0, 0);
        } else if (newState === AppState.COMPARE) {
            originalTextDisplay.textContent = currentArticleContent;
            userRecallDisplay.textContent = recallInput.value;
        } else if (newState === AppState.SCORE) {
            // Reset stars
            document.querySelectorAll('.star-rating span').forEach(s => s.classList.remove('active'));
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
        const charLimit = parseInt(wordSlider.value);

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

    // Init
    updateFromSlider();
});
