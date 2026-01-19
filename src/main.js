import './style.css';

document.addEventListener('DOMContentLoaded', () => {
    const loadButton = document.getElementById('loadButton');
    const titleDiv = document.getElementById('title');
    const textDiv = document.getElementById('text');
    const statusDiv = document.getElementById('status');
    const languageSelect = document.getElementById('languageSelect');
    const wordSlider = document.getElementById('wordSlider');
    const wordCountDisplay = document.getElementById('wordCountDisplay');

    // Configuration for common API parameters
    const API_PARAMS = {
        format: 'json',
        action: 'query',
        origin: '*' // Required for Cross-Origin requests (CORS)
    };
    const MAX_RETRIES = 3;

    /**
     * Updates the button text to reflect the current slider value and language
     */
    function updateButtonText() {
        const wordCount = wordSlider.value;
        wordCountDisplay.textContent = wordCount;
        const langName = languageSelect.options[languageSelect.selectedIndex].text;
    }

    // Add event listeners for slider and language changes
    wordSlider.addEventListener('input', updateButtonText);
    languageSelect.addEventListener('change', updateButtonText);

    /**
     * Determines the Wikipedia API URL based on user selection.
     * @returns {string} The API URL for the selected language.
     */
    function getCurrentApiUrl() {
        const langCode = languageSelect.value;
        return `https://${langCode}.wikipedia.org/w/api.php`;
    }

    /**
     * Utility function for waiting with exponential backoff.
     * @param {number} attempt The attempt number.
     */
    function delay(attempt) {
        return new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
    }

    /**
     * Main function to fetch a random article.
     */
    async function fetchRandomArticle() {
        // 1. Update interface state
        titleDiv.textContent = '';
        textDiv.textContent = '';
        statusDiv.textContent = 'Loading in progress...';
        loadButton.disabled = true;

        // Determine the API URL for this request
        const apiUrl = getCurrentApiUrl();
        const wordLimit = parseInt(wordSlider.value);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // --- Step 1: Get a random page title ---
                const randomTitle = await fetchRandomTitle(apiUrl, attempt);
                if (!randomTitle) {
                    throw new Error("Unable to get a random title.");
                }

                // --- Step 2: Get the content of this article ---
                const content = await fetchArticleContent(apiUrl, randomTitle, attempt);
                if (!content) {
                    throw new Error(`Content not found for: ${randomTitle}`);
                }

                // --- Step 3: Process and display the content ---
                processAndDisplayContent(randomTitle, content, wordLimit);
                statusDiv.textContent = ''; // Clear status after successful load
                break; // Success, exit the retry loop

            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error.message);
                if (attempt < MAX_RETRIES - 1) {
                    statusDiv.textContent = `Loading error. New attempt in a moment...`;
                    await delay(attempt);
                } else {
                    statusDiv.textContent = 'Loading failed after several attempts. Please try again later.';
                    loadButton.disabled = false;
                }
            }
        }
        loadButton.disabled = false;
    }

    /**
     * API request to get a random page title.
     * @param {string} apiUrl The Wikipedia API URL to use.
     * @param {number} attempt The attempt number.
     * @returns {Promise<string|null>} The article title or null on failure.
     */
    async function fetchRandomTitle(apiUrl, attempt) {
        const params = new URLSearchParams({
            ...API_PARAMS,
            list: 'random',
            rnnamespace: 0,
            rnlimit: 1
        });

        const url = `${apiUrl}?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        const pages = data.query?.random;
        if (pages && pages.length > 0) {
            return pages[0].title;
        }
        return null;
    }

    /**
     * API request to get raw content of an article.
     * @param {string} apiUrl The Wikipedia API URL to use.
     * @param {string} title The article title to retrieve.
     * @param {number} attempt The attempt number.
     * @returns {Promise<string|null>} The text content or null.
     */
    async function fetchArticleContent(apiUrl, title, attempt) {
        const params = new URLSearchParams({
            ...API_PARAMS,
            prop: 'extracts',
            titles: title,
            // The key parameter: returns plain text without HTML/Wiki tags
            explaintext: 1,
            redirects: 1 // Follow redirects
        });

        const url = `${apiUrl}?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        const pages = data.query?.pages;

        if (pages) {
            const pageId = Object.keys(pages)[0];
            return pages[pageId].extract || null;
        }
        return null;
    }

    /**
     * Processes raw text to get the desired word count.
     * @param {string} title The article title.
     * @param {string} rawContent The raw text content.
     * @param {number} wordLimit The maximum number of words to display.
     */
    function processAndDisplayContent(title, rawContent, wordLimit) {
        // Remove empty lines, excessive line breaks, and reference brackets
        let cleanedText = rawContent
            .replace(/\n\s*\n/g, '\n\n') // Replace multiple line breaks with two
            .replace(/\[\d+\]/g, '')     // Remove references ([1], [2], etc.)
            .trim();

        // Remove the first line if it's the article title repeated (often the case)
        if (cleanedText.startsWith(title)) {
            cleanedText = cleanedText.substring(cleanedText.indexOf('\n') + 1).trim();
        }

        // Split text into words for counting and limiting
        const words = cleanedText.split(/\s+/).filter(word => word.length > 0);

        // Take the first N words
        const limitedWords = words.slice(0, wordLimit);
        const finalContent = limitedWords.join(' ');

        // Display
        titleDiv.textContent = title;
        textDiv.textContent = finalContent + (words.length > wordLimit ? '...' : '');
    }

    // Bind the function to the button
    loadButton.addEventListener('click', fetchRandomArticle);

    // Initialize button text on load
    updateButtonText();
});
