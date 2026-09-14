/* index.js */
/* Frontend Controller for the Slovenian Sea Level Tracker & Nautical Navigation System */

/* index.js */
/* Frontend Controller for the Slovenian Sea Level Tracker */

// App State
let chartMode = 'level'; // 'level' or 'temp'
let periodHours = 24;   // 24, 72, or 168
let actualData = [];    // Loaded ARSO measurements
let currentChart = null; // Highcharts instance
let meteoForecastMap = new Map(); // Open-Meteo hourly pressure and wind map
let openMeteoHourlyForecast = []; // Global variable to store hourly forecast items
let activeHourlyDayOffset = null; // Track which day's hourly forecast is currently open
let arsoForecastData = null; // Currently active raw ARSO JSON forecast
let arsoForecastDataPortoroz = null; // Stored ARSO forecast for Portorož / Lucija
let arsoForecastDataPiran = null; // Stored ARSO forecast for Piran
let openMeteoDailyData = null; // Global variable to store daily Open-Meteo forecast fallback
let activeWeatherSource = 'portoroz'; // 'vida' or 'portoroz'
let activeMainTab = 'plimovanje';     // 'plimovanje', 'vreme', or 'navigacija'
let gpsWatchId = null;                // Geolocation watch ID
let lastGpsHeading = null;            // Last valid GPS heading
let weatherDataVida = null;       // Cached weather data from Vida buoy
let weatherDataPortoroz = null;   // Cached weather data from Portorož Airport
let currentMarineWaveHeight = null; // Cached current wave height from Open-Meteo forecast
let marineHourlyWaves = new Map();  // Map of timestamp (ms) -> wave height (m)
const PROXY_URL = 'https://script.google.com/macros/s/AKfycbxoILNm85D58iHTxfbE8J_BawhREfiv2q1bUHSED_GqPT2LhUSyFxXjSXEx4cyk9eT8/exec';

// Datum offset constant (Srednja gladina morja / Mean sea level - SVS2010 reference datum is 217.0 cm above gauge zero)
const MEAN_SEA_LEVEL_OFFSET = 217.0;

let deferredPrompt = null;

// Helper to parse ISO strings without timezone (e.g. "2026-09-04T14:00") as exact local device time
function parseIsoLocal(isoStr) {
    if (!isoStr) return new Date();
    if (isoStr instanceof Date) return isoStr;
    const str = String(isoStr).trim();
    if (str.endsWith('Z') || str.includes('+') || (str.lastIndexOf('-') > 7)) {
        return new Date(str);
    }
    const parts = str.split(/[T\s]/);
    if (parts.length >= 2) {
        const dParts = parts[0].split('-').map(Number);
        const tParts = parts[1].split(':').map(Number);
        if (dParts.length === 3 && tParts.length >= 2) {
            return new Date(dParts[0], dParts[1] - 1, dParts[2], tParts[0], tParts[1], tParts[2] || 0);
        }
    }
    return new Date(str);
}

// Helper: Official Douglas Sea Scale
function getDouglasSeaState(heightM) {
    if (heightM === null || heightM === undefined || isNaN(heightM)) {
        return { code: null, text: "--", label: "--" };
    }
    const h = parseFloat(heightM);
    if (h < 0.05) return { code: 0, text: "Mirno morje", label: "Mirno (0)" };
    if (h <= 0.1) return { code: 1, text: "Mirno z zibanjem", label: "Mirno z zibanjem (1)" };
    if (h <= 0.5) return { code: 2, text: "Rahlo vzvalovano", label: "Rahlo vzvalovano (2)" };
    if (h <= 1.25) return { code: 3, text: "Zmerno vzvalovano", label: "Zmerno vzvalovano (3)" };
    if (h <= 2.5) return { code: 4, text: "Vzvalovano morje", label: "Vzvalovano (4)" };
    if (h <= 4.0) return { code: 5, text: "Močno vzvalovano", label: "Močno vzvalovano (5)" };
    if (h <= 6.0) return { code: 6, text: "Zelo močno vzvalovano", label: "Zelo močno vzvalovano (6)" };
    if (h <= 9.0) return { code: 7, text: "Visoko valovito", label: "Visoko valovito (7)" };
    if (h <= 14.0) return { code: 8, text: "Zelo visoko valovito", label: "Zelo visoko valovito (8)" };
    return { code: 9, text: "Izjemno valovito", label: "Izjemno valovito (9)" };
}

// Helper: Option A wave symbol and height
function getWaveIconHtml(heightM) {
    if (heightM === null || heightM === undefined || isNaN(heightM)) {
        return `<span style="color:var(--text-secondary);font-size:0.7rem;">--</span>`;
    }
    const h = parseFloat(heightM);
    if (h <= 0.5) {
        return `<span style="display:inline-flex;align-items:center;gap:3px;color:#22c55e;font-size:0.72rem;font-weight:600;" title="Rahlo vzvalovano (${h.toFixed(2)} m)">
            <svg style="width:13px;height:8px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;" viewBox="0 0 24 12"><path d="M0 6 Q6 0, 12 6 T24 6"/></svg>
            ${h.toFixed(2)} m
        </span>`;
    } else if (h <= 1.25) {
        return `<span style="display:inline-flex;align-items:center;gap:3px;color:#38bdf8;font-size:0.72rem;font-weight:600;" title="Zmerno vzvalovano (${h.toFixed(2)} m)">
            <svg style="width:13px;height:10px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;" viewBox="0 0 24 16"><path d="M0 5 Q6 0, 12 5 T24 5 M0 11 Q6 6, 12 11 T24 11"/></svg>
            ${h.toFixed(2)} m
        </span>`;
    } else if (h <= 2.5) {
        return `<span style="display:inline-flex;align-items:center;gap:3px;color:#f59e0b;font-size:0.72rem;font-weight:600;" title="Vzvalovano (${h.toFixed(2)} m)">
            <svg style="width:13px;height:12px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;" viewBox="0 0 24 20"><path d="M0 4 Q6 -2, 12 4 T24 4 M0 10 Q6 4, 12 10 T24 10 M0 16 Q6 10, 12 16 T24 16"/></svg>
            ${h.toFixed(2)} m
        </span>`;
    } else {
        return `<span style="display:inline-flex;align-items:center;gap:3px;color:#ef4444;font-size:0.72rem;font-weight:700;" title="Močno valovito (${h.toFixed(2)} m)">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:0.65rem;"></i>
            ${h.toFixed(2)} m
        </span>`;
    }
}

// Helper: Clean Unicode wind arrow pointing in direction the wind is blowing TO
function getWindArrowUnicode(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "";
    // deg is direction wind is blowing FROM (0 = North). Wind blows TO (deg + 180).
    const toDeg = (parseFloat(deg) + 180) % 360;
    const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    const idx = Math.round(toDeg / 45) % 8;
    return arrows[idx];
}

// Helper: Pure HTML/CSS wave badge for chart tooltip (100% SVG-free to prevent detachment on mobile)
function getWaveTooltipHtml(heightM) {
    if (heightM === null || heightM === undefined || isNaN(heightM)) return '';
    const h = parseFloat(heightM);
    let color = '#22c55e'; // Green <= 0.5m
    let icon = 'fa-water';
    if (h > 0.5 && h <= 1.25) {
        color = '#38bdf8'; // Blue 0.5 - 1.25m
    } else if (h > 1.25 && h <= 2.5) {
        color = '#f59e0b'; // Amber 1.25 - 2.5m
    } else if (h > 2.5) {
        color = '#ef4444'; // Red > 2.5m
        icon = 'fa-triangle-exclamation';
    }
    return `<span style="display:inline-flex; align-items:center; gap:4px; color:${color}; font-weight:600;"><i class="fa-solid ${icon}" style="font-size:10px;"></i> ${h.toFixed(2)} m</span>`;
}

// Helper: Get active forecast data based on selected location tab
function getActiveForecastData() {
    return (activeWeatherSource === 'vida') ? (arsoForecastDataPiran || arsoForecastDataPortoroz) : (arsoForecastDataPortoroz || arsoForecastDataPiran);
}

// Helper: Closest hourly wave height lookup
function getWaveHeightForTime(targetDate) {
    if (!targetDate || marineHourlyWaves.size === 0) return currentMarineWaveHeight || 0.2;
    const targetMs = targetDate.getTime();
    let closestHeight = currentMarineWaveHeight || 0.2;
    let minDiff = Infinity;
    for (const [timeMs, height] of marineHourlyWaves.entries()) {
        const diff = Math.abs(timeMs - targetMs);
        if (diff < minDiff) {
            minDiff = diff;
            closestHeight = height;
        }
    }
    return closestHeight;
}

// Helper: Maximum wave height for a calendar day (for daily forecast cards)
function getDayMaxWaveHeight(targetDate) {
    if (!targetDate || marineHourlyWaves.size === 0) return currentMarineWaveHeight;
    const targetY = targetDate.getFullYear();
    const targetM = targetDate.getMonth();
    const targetD = targetDate.getDate();
    
    let maxH = 0;
    let found = false;
    
    for (const [timeMs, height] of marineHourlyWaves.entries()) {
        const d = new Date(timeMs);
        if (d.getFullYear() === targetY && d.getMonth() === targetM && d.getDate() === targetD) {
            found = true;
            if (height > maxH) {
                maxH = height;
            }
        }
    }
    return found ? maxH : currentMarineWaveHeight;
}

// Helper: Beaufort scale & Slovene descriptions
function getBeaufortInfo(windSpeedKmh) {
    const kmh = parseFloat(windSpeedKmh) || 0;
    if (kmh < 1) return { bft: 0, text: "tišina" };
    if (kmh <= 5) return { bft: 1, text: "lahka sapa" };
    if (kmh <= 11) return { bft: 2, text: "lahek vetrič" };
    if (kmh <= 19) return { bft: 3, text: "zmeren veter" };
    if (kmh <= 28) return { bft: 4, text: "zmerno močan veter" };
    if (kmh <= 38) return { bft: 5, text: "svež veter" };
    if (kmh <= 49) return { bft: 6, text: "močan veter" };
    if (kmh <= 61) return { bft: 7, text: "zelo močan veter" };
    if (kmh <= 74) return { bft: 8, text: "vihar" };
    if (kmh <= 88) return { bft: 9, text: "močan vihar" };
    if (kmh <= 102) return { bft: 10, text: "polni vihar" };
    if (kmh <= 117) return { bft: 11, text: "orkanski vihar" };
    return { bft: 12, text: "orkan" };
}

// Toggle Sea Scale Legend
function toggleSeaLegend() {
    const content = document.getElementById('sea-legend-content');
    const arrow = document.getElementById('sea-legend-arrow');
    if (!content) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    if (arrow) {
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}
window.toggleSeaLegend = toggleSeaLegend;

document.addEventListener('DOMContentLoaded', () => {
    // Configure Highcharts to use local timezone globally
    if (typeof Highcharts !== 'undefined') {
        Highcharts.setOptions({
            time: {
                useUTC: false
            },
            lang: {
                weekdays: ['Nedelja', 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota'],
                shortWeekdays: ['Ned', 'Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob'],
                months: ['Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij', 'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December'],
                shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec']
            }
        });
    }

    // Initialize Theme (Default is light unless saved as dark)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.remove('light-theme');
    } else {
        document.body.classList.add('light-theme');
    }
    updateThemeIcon();

    // Start clock display
    updateClock();
    setInterval(updateClock, 1000);
    
    // Update moon phase
    updateMoonPhase();
    setInterval(updateMoonPhase, 3600000); // refresh moon phase every hour

    // Load meteorological data from Bazdara Firebase & ARSO
    loadWeather();
    setInterval(loadWeather, 60000); // refresh weather every minute
    
    // Load tide data
    refreshData();
    setInterval(refreshData, 300000); // refresh water data every 5 minutes

    // Load weather forecast asynchronously (does not block tide data)
    loadArsoForecast();
    setInterval(loadArsoForecast, 600000); // refresh weather forecast every 10 minutes

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered successfully!', reg))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }
    
    // Handle PWA Install Prompt
    const installBanner = document.getElementById('pwa-install-banner');
    const installBtn = document.getElementById('pwa-install-btn');
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBanner) {
            installBanner.style.display = 'flex';
        }
    });
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to install prompt: ${outcome}`);
                deferredPrompt = null;
                if (installBanner) {
                    installBanner.style.display = 'none';
                }
            }
        });
    }
    
    window.addEventListener('appinstalled', (evt) => {
        console.log('App was installed successfully!');
        if (installBanner) {
            installBanner.style.display = 'none';
        }
    });

    // Auto-refresh when app comes to foreground (PWA resumes)
    let lastResumeTime = Date.now();
    
    const handleForegroundResume = () => {
        const now = Date.now();
        console.log("App brought to foreground. Checking staleness...");
        // If app was backgrounded for more than 2 minutes, force reset UI to "Nalaganje..."
        if (now - lastResumeTime > 2 * 60 * 1000) {
            weatherDataVida = null;
            weatherDataPortoroz = null;
            renderWeather();
            
            // Reset water values to loading
            document.getElementById('current-level-val').textContent = "Nalaganje...";
            document.getElementById('current-temp-val').textContent = "--";
            document.getElementById('relative-level-val').textContent = "Absolutna gladina: -- cm";
            const levelTimeEl = document.getElementById('level-time-val');
            if (levelTimeEl) levelTimeEl.textContent = "Osveževanje podatkov...";
        }
        lastResumeTime = now;
        refreshData();
        loadWeather(true);
        loadArsoForecast();
        if (activeMainTab === 'navigacija') {
            startGpsNavigation();
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            handleForegroundResume();
        } else {
            lastResumeTime = Date.now();
            if (activeMainTab === 'navigacija') {
                stopGpsNavigation();
            }
        }
    });

    window.addEventListener('focus', () => {
        handleForegroundResume();
    });
});

function updateClock() {
    const timeDisplay = document.getElementById('current-time-display');
    const now = new Date();
    timeDisplay.textContent = now.toLocaleString('sl-SI', { 
        weekday: 'short', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
}

function setChartMode(mode) {
    if (chartMode === mode) return;
    chartMode = mode;
    
    // Update active button
    document.getElementById('mode-level').classList.toggle('active', mode === 'level');
    document.getElementById('mode-temp').classList.toggle('active', mode === 'temp');
    
    // Re-draw chart
    renderChart();
}

function setPeriod(hours) {
    periodHours = hours;
    
    // Update active button
    document.getElementById('period-24h').classList.toggle('active', hours === 24);
    document.getElementById('period-3d').classList.toggle('active', hours === 72);
    document.getElementById('period-7d').classList.toggle('active', hours === 168);
    const btn30 = document.getElementById('period-30d');
    if (btn30) btn30.classList.toggle('active', hours === 720);
    
    if (currentChart && actualData.length > 0) {
        const latestTimeVal = actualData[actualData.length - 1].time.getTime();
        const minTime = latestTimeVal - (periodHours * 60 * 60 * 1000);
        const maxTime = chartMode === 'level' ? latestTimeVal + (periodHours * 60 * 60 * 1000) : latestTimeVal;
        currentChart.xAxis[0].setExtremes(minTime, maxTime);
    }
}

// Custom Date parser for ARSO table string "DD.MM.YYYY HH:MM"
function parseArsoDate(dateStr) {
    const parts = dateStr.split(' ');
    if (parts.length < 2) return new Date();
    
    const dParts = parts[0].split('.');
    const tParts = parts[1].split(':');
    
    if (dParts.length < 3 || tParts.length < 2) return new Date();
    
    // Date arguments: Year, Month (0-11), Day, Hour, Minute
    return new Date(dParts[2], dParts[1] - 1, dParts[0], tParts[0], tParts[1], 0);
}

// Client-side HTML table parser for fallback requests
function parseArsoHtml(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const rows = doc.querySelectorAll('table.podatki tbody tr');
    const parsedData = [];
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
            const time = cells[0].textContent.trim();
            const temp = parseFloat(cells[1].textContent.trim());
            const level = parseFloat(cells[2].textContent.trim());
            if (!isNaN(temp) && !isNaN(level)) {
                parsedData.push({ time, temp, level });
            }
        }
    });
    return parsedData;
}

// Load data with triple redundancy
async function loadWaterData(arsoPeriod) {
    const cb = new Date().getTime();
    const localUrl = `/api/data?period=${arsoPeriod}&cb=${cb}`;
    const publicUrl = `https://www.arso.gov.si/vode/podatki/amp/H9350_t_${arsoPeriod}.html?cb=${cb}`;
    
    const isLocalhost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    
    // Attempt 1: Local server proxy (ONLY if running on localhost to avoid 3s network timeout on live web)
    if (isLocalhost) {
        try {
            const res = await fetch(localUrl);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.log(`Local API endpoint failed for period ${arsoPeriod}, trying direct public CORS proxy...`, e);
        }
    }
    
    // Attempt 2: Google Apps Script CORS proxy (completely free and reliable, hosted on Google Cloud)
    try {
        const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(publicUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            const html = await res.text();
            return parseArsoHtml(html);
        }
    } catch (e) {
        console.log(`Google Apps Script proxy failed for period ${arsoPeriod}, trying backup proxy...`, e);
    }
    
    // Attempt 3: Backup CORS proxy (allorigins.win)
    try {
        const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(publicUrl)}`;
        const res = await fetch(backupUrl);
        if (res.ok) {
            const json = await res.json();
            return parseArsoHtml(json.contents);
        }
    } catch (e) {
        console.error(`All proxies failed to fetch ARSO data for period ${arsoPeriod}`, e);
        throw e;
    }
}

// Load and merge both 24h and 30d tables to avoid lag in the 30d history table
async function loadMergedWaterData(onFirstData) {
    // 1. Fetch 24h table first for fast initial response
    const dayDataPromise = loadWaterData("1").then(dayDataRaw => {
        const dayData = dayDataRaw.map(item => ({
            time: parseArsoDate(item.time),
            temp: item.temp,
            level: item.level
        })).sort((a, b) => a.time - b.time);
        
        if (typeof onFirstData === 'function') {
            onFirstData(dayData);
        }
        return dayData;
    });
    
    // 2. In parallel, fetch 30-day history table
    const historyDataPromise = loadWaterData("30").then(historyDataRaw => {
        return historyDataRaw.map(item => ({
            time: parseArsoDate(item.time),
            temp: item.temp,
            level: item.level
        })).sort((a, b) => a.time - b.time);
    });
    
    const [dayData, historyData] = await Promise.all([dayDataPromise, historyDataPromise]);
    
    // Interpolate hourly history data into 10-minute steps so it matches 10-minute predictions exactly
    const interpolatedHistory = [];
    for (let i = 0; i < historyData.length; i++) {
        const current = historyData[i];
        interpolatedHistory.push(current);
        
        if (i < historyData.length - 1) {
            const next = historyData[i+1];
            const timeDiffMs = next.time.getTime() - current.time.getTime();
            
            // If gap is approximately 1 hour (between 45 and 75 minutes), fill in 10-minute intervals
            if (timeDiffMs > 15 * 60 * 1000 && timeDiffMs < 90 * 60 * 1000) {
                const steps = Math.round(timeDiffMs / (10 * 60 * 1000));
                for (let step = 1; step < steps; step++) {
                    const t = current.time.getTime() + step * 10 * 60 * 1000;
                    const w = step / steps;
                    
                    const interpolatedTemp = current.temp + w * (next.temp - current.temp);
                    const interpolatedLevel = current.level + w * (next.level - current.level);
                    
                    interpolatedHistory.push({
                        time: new Date(t),
                        temp: parseFloat(interpolatedTemp.toFixed(1)),
                        level: parseFloat(interpolatedLevel.toFixed(1))
                    });
                }
            }
        }
    }
    
    // Merge data: Day data (24h) overwrites history data (30d) for same timestamp
    const mergedMap = new Map();
    
    interpolatedHistory.forEach(item => {
        mergedMap.set(item.time.getTime(), item);
    });
    
    dayData.forEach(item => {
        mergedMap.set(item.time.getTime(), item);
    });
    
    return Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
}

// Convert degrees to Slovenian wind direction abbreviation
function getWindDirectionSlo(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "--";
    const directions = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"];
    // Round to closest 45 degree sector (0-360)
    const idx = Math.round(deg / 45) % 8;
    return directions[idx];
}

// Generate HTML for rotated wind arrow indicating direction the wind is blowing to
function getWindArrowHtml(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "";
    // Rotate to point in the direction the wind is blowing to (deg + 180)
    const rotation = (parseFloat(deg) + 180) % 360;
    return `<i class="fa-solid fa-arrow-up wind-arrow" style="transform: rotate(${rotation}deg); font-size: 0.65rem; margin-right: 4px;" title="Smer vetra: ${Math.round(deg)}°"></i>`;
}

// Convert Slovenian wind direction abbreviation (S, SV, V, JV, J, JZ, Z, SZ) to degrees
function getWindDegFromSlo(dirStr) {
    if (!dirStr) return 0;
    const str = dirStr.trim().toUpperCase();
    switch (str) {
        case "S": return 0;
        case "SV": return 45;
        case "V": return 90;
        case "JV": return 135;
        case "J": return 180;
        case "JZ": return 225;
        case "Z": return 270;
        case "SZ": return 315;
        default: return 0;
    }
}

// Store ARSO forecast raw data with proxy fallbacks (to bypass ad-blockers and CORS issues)
async function fetchWeatherWithFallback(targetUrl, isXml = false) {
    const directUrl = PROXY_URL + '?url=' + encodeURIComponent(targetUrl);
    
    // Try 1: Direct fetch to Google Apps Script (fastest ~50ms)
    try {
        const res = await fetch(directUrl);
        if (res.ok) {
            if (isXml) {
                const text = await res.text();
                if (text && text.includes('<metData>')) return text;
            } else {
                const json = await res.json();
                if (json && !json.error) return json;
            }
        }
    } catch (e) {
        console.warn("Direct Google Apps Script fetch failed, trying via CORS proxy fallback...", e);
    }
    
    // Try 2: Via corsproxy.io directly to targetUrl
    try {
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            if (isXml) {
                const text = await res.text();
                if (text && text.includes('<metData>')) return text;
            } else {
                const json = await res.json();
                if (json && !json.error) return json;
            }
        }
    } catch (e) {
        console.warn("CORS proxy fallback failed, trying via AllOrigins fallback...", e);
    }
    
    // Try 3: Via allorigins directly to targetUrl
    try {
        const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(backupUrl);
        if (res.ok) {
            const wrapper = await res.json();
            if (wrapper && wrapper.contents) {
                if (isXml) {
                    if (wrapper.contents.includes('<metData>')) return wrapper.contents;
                } else {
                    const json = typeof wrapper.contents === 'string' ? JSON.parse(wrapper.contents) : wrapper.contents;
                    if (json && !json.error) return json;
                }
            }
        }
    } catch (e) {
        console.error("All weather proxy fallbacks failed", e);
    }
    return null;
}

async function fetchArsoForecastViaProxy() {
    const targetUrl = 'https://vreme.arso.gov.si/api/1.0/location/?location=Piran&format=json';
    return await fetchWeatherWithFallback(targetUrl);
}

async function fetchWaveHeight() {
    try {
        const url = 'https://marine-api.open-meteo.com/v1/marine?latitude=45.527662&longitude=13.598006&hourly=wave_height&timezone=auto';
        const response = await fetch(url);
        if (!response.ok) throw new Error("Marine API response not ok");
        const json = await response.json();
        return json;
    } catch (e) {
        console.error("Could not fetch wave height:", e);
        return null;
    }
}

function mapArsoIconToFa(nnIcon) {
    if (!nnIcon) return { icon: "fa-sun", color: "#f59e0b" };
    const name = nnIcon.toLowerCase();
    
    // Storm, snow, rain, fog
    if (name.includes("ts") || name.includes("bolt") || name.includes("thunder") || name.includes("neviht")) {
        return { icon: "fa-cloud-bolt", color: "#38bdf8" }; // cloud/rain/storm icons are blue
    }
    if (name.includes("sn") || name.includes("snow") || name.includes("flake") || name.includes("sneg")) {
        return { icon: "fa-snowflake", color: "#38bdf8" }; // snow/flake is blue
    }
    if (name.includes("shra") || name.includes("shower") || name.includes("ploh")) {
        return { icon: "fa-cloud-showers-heavy", color: "#38bdf8" }; // showers is blue
    }
    if (name.includes("ra") || name.includes("rain") || name.includes("dz") || name.includes("dež") || name.includes("ros")) {
        return { icon: "fa-cloud-rain", color: "#38bdf8" }; // rain is blue
    }
    if (name.includes("fg") || name.includes("fog") || name.includes("smog") || name.includes("megl")) {
        return { icon: "fa-smog", color: "#38bdf8" }; // fog/smog is blue
    }
    
    // Night icons
    if (name.includes("night") || name.includes("noč")) {
        if (name.includes("overcast") || name.includes("prevcloudy") || name.includes("oblač")) {
            return { icon: "fa-cloud", color: "#38bdf8" }; // cloud is blue
        }
        if (name.includes("partcloudy") || name.includes("modcloudy") || name.includes("delno") || name.includes("zmerno") || name.includes("slightcloudy")) {
            return { icon: "fa-cloud-moon", color: "#38bdf8" }; // cloud-moon is blue
        }
        return { icon: "fa-moon", color: "#f59e0b" }; // moon is yellow
    }
    
    // Day icons / defaults
    if (name.includes("overcast") || name.includes("prevcloudy") || name.includes("oblač")) {
        return { icon: "fa-cloud", color: "#38bdf8" }; // cloud is blue
    }
    if (name.includes("partcloudy") || name.includes("modcloudy") || name.includes("delno") || name.includes("zmerno") || name.includes("slightcloudy")) {
        return { icon: "fa-cloud-sun", color: "#38bdf8" }; // cloud-sun is blue
    }
    
    return { icon: "fa-sun", color: "#f59e0b" }; // sun is yellow
}

function getWeatherIconHtml(nnIcon, sizeStyle = "") {
    if (!nnIcon) nnIcon = "clear";
    const name = nnIcon.toLowerCase();
    
    // Check type of weather
    let type = "sun";
    
    if (name.includes("ts") || name.includes("bolt") || name.includes("thunder") || name.includes("neviht")) {
        type = "cloud-bolt";
    } else if (name.includes("sn") || name.includes("snow") || name.includes("flake") || name.includes("sneg")) {
        type = "snowflake";
    } else if (name.includes("shra") || name.includes("shower") || name.includes("ploh")) {
        type = "cloud-rain";
    } else if (name.includes("ra") || name.includes("rain") || name.includes("dz") || name.includes("dež") || name.includes("ros")) {
        type = "cloud-rain";
    } else if (name.includes("fg") || name.includes("fog") || name.includes("smog") || name.includes("megl")) {
        type = "smog";
    } else if (name.includes("night") || name.includes("noč")) {
        if (name.includes("overcast") || name.includes("prevcloudy") || name.includes("oblač")) {
            type = "cloud";
        } else if (name.includes("partcloudy") || name.includes("modcloudy") || name.includes("delno") || name.includes("zmerno") || name.includes("slightcloudy")) {
            type = "cloud-moon";
        } else {
            type = "moon";
        }
    } else {
        if (name.includes("overcast") || name.includes("prevcloudy") || name.includes("oblač")) {
            type = "cloud";
        } else if (name.includes("partcloudy") || name.includes("modcloudy") || name.includes("delno") || name.includes("zmerno") || name.includes("slightcloudy") || name.includes("mostclear")) {
            type = "cloud-sun";
        } else {
            type = "sun";
        }
    }

    // Return HTML depending on type
    const size = sizeStyle ? `font-size: ${sizeStyle};` : "";
    
    switch (type) {
        case "sun":
            return `<i class="fa-solid fa-sun" style="color: #f59e0b; ${size}"></i>`;
        case "moon":
            return `<i class="fa-solid fa-moon" style="color: #f59e0b; ${size}"></i>`;
        case "cloud":
            return `<i class="fa-solid fa-cloud" style="color: #38bdf8; ${size}"></i>`;
        case "snowflake":
            return `<i class="fa-solid fa-snowflake" style="color: #38bdf8; ${size}"></i>`;
        case "smog":
            return `<i class="fa-solid fa-smog" style="color: #38bdf8; ${size}"></i>`;
        case "cloud-rain":
            return `<i class="fa-solid fa-cloud-rain" style="color: #38bdf8; ${size}"></i>`;
        case "cloud-sun":
            return `<i class="fa-solid fa-cloud-sun" style="color: #f59e0b; ${size}"></i>`;
        case "cloud-moon":
            return `<i class="fa-solid fa-cloud-moon" style="color: #f59e0b; ${size}"></i>`;
        case "cloud-bolt":
            return `<i class="fa-solid fa-cloud-bolt" style="color: #38bdf8; ${size}"></i>`;
    }
}

function updateOpenMeteoFallbackCards() {
    if (!openMeteoDailyData) return;
    try {
        const daily = openMeteoDailyData;
        const dTimes = daily.time;
        
        const getIndexForDate = (dateOffset) => {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + dateOffset);
            const targetStr = targetDate.getFullYear() + '-' + 
                              String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(targetDate.getDate()).padStart(2, '0');
            return dTimes.indexOf(targetStr);
        };
        
        const idxTomorrow = getIndexForDate(1);
        const idxDayAfter = getIndexForDate(2);
        
        const updateForecastCard = (cardPrefix, idx) => {
            if (idx !== -1) {
                const wCode = daily.weather_code[idx];
                const tempMin = daily.temperature_2m_min[idx];
                const tempMax = daily.temperature_2m_max[idx];
                const windSpeed = daily.wind_speed_10m_max[idx];
                const windDir = daily.wind_direction_10m_dominant[idx];
                
                const weatherName = wCode === 0 || wCode === 1 ? "clear" : (wCode === 2 ? "partCloudy" : "overcast");
                const windArrow = getWindArrowHtml(windDir);
                
                const iconBox = document.getElementById(`${cardPrefix}-icon-box`);
                if (iconBox) {
                    iconBox.innerHTML = getWeatherIconHtml(weatherName, "1.5rem");
                }
                
                const tempEl = document.getElementById(`${cardPrefix}-temp`);
                if (tempEl) {
                    tempEl.textContent = `${Math.round(tempMin)} / ${Math.round(tempMax)} °C`;
                }
                
                const windEl = document.getElementById(`${cardPrefix}-wind`);
                if (windEl) {
                    const windDirStr = getWindDirectionSlo(windDir);
                    windEl.innerHTML = `${windArrow}${Math.round(windSpeed)} km/h (${windDirStr})`;
                }
            }
        };
        
        const idxToday = getIndexForDate(0);
        if (idxToday !== -1) {
            const wCode = daily.weather_code[idxToday];
            const weatherName = wCode === 0 || wCode === 1 ? "clear" : (wCode === 2 ? "partCloudy" : "overcast");
            const todayIconBox = document.getElementById('weather-icon-box');
            if (todayIconBox) {
                todayIconBox.innerHTML = getWeatherIconHtml(weatherName, "1.8rem");
            }
        }
        
        updateForecastCard('forecast-day-1', idxTomorrow);
        updateForecastCard('forecast-day-2', idxDayAfter);
    } catch (fallbackErr) {
        console.error("Error populating Open-Meteo fallback cards:", fallbackErr);
    }
}

async function loadArsoForecast() {
    try {
        // Fetch both Portorož and Piran ARSO JSON forecasts and Marine wave height in parallel
        const [portorozJson, piranJson, marineJson] = await Promise.all([
            fetchWeatherWithFallback('https://vreme.arso.gov.si/api/1.0/location/?location=Lucija&format=json'),
            fetchWeatherWithFallback('https://vreme.arso.gov.si/api/1.0/location/?location=Piran&format=json'),
            fetchWaveHeight()
        ]);
        
        if (portorozJson) arsoForecastDataPortoroz = portorozJson;
        if (piranJson) arsoForecastDataPiran = piranJson;
        arsoForecastData = getActiveForecastData();
        
        // Update wave height data & populate hourly marine map
        if (marineJson && marineJson.hourly) {
            try {
                marineHourlyWaves.clear();
                const now = new Date();
                const timeMs = now.getTime();
                let closestIdx = 0;
                let minDiff = Infinity;
                
                for (let i = 0; i < marineJson.hourly.time.length; i++) {
                    const itemTime = parseIsoLocal(marineJson.hourly.time[i]);
                    const whVal = marineJson.hourly.wave_height[i];
                    marineHourlyWaves.set(itemTime.getTime(), whVal);
                    
                    const diff = Math.abs(itemTime.getTime() - timeMs);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIdx = i;
                    }
                }
                
                const wh = marineJson.hourly.wave_height[closestIdx];
                currentMarineWaveHeight = wh;
                renderWeather(); // Update weather UI with new wave height if necessary
            } catch (whErr) {
                console.error("Error setting wave height from forecast:", whErr);
            }
        }
        
        renderArsoForecast();
        if (actualData.length > 0) {
            renderChart();
        }
    } catch (e) {
        console.error("Error loading ARSO forecast:", e);
        updateOpenMeteoFallbackCards();
    }
}

function renderArsoForecast() {
    const arsoForecastData = getActiveForecastData();
    
    // Update Forecast Title according to selected location
    const titleEl = document.getElementById('forecast-section-title');
    if (titleEl) {
        if (activeWeatherSource === 'vida') {
            titleEl.textContent = 'Vremenska napoved Piran (ARSO ALADIN)';
        } else {
            titleEl.textContent = 'Vremenska napoved Letališče Portorož (ARSO ALADIN)';
        }
    }
    
    // Set dynamic Slovenian names of days for Tomorrow and Day After
    const daysSloNominative = ["Nedelja", "Ponedeljek", "Torek", "Sreda", "Četrtek", "Petek", "Sobota"];
    const dateTomorrow = new Date();
    dateTomorrow.setDate(dateTomorrow.getDate() + 1);
    const dateDayAfter = new Date();
    dateDayAfter.setDate(dateDayAfter.getDate() + 2);
    
    const tomorrowDayName = daysSloNominative[dateTomorrow.getDay()];
    const dayAfterDayName = daysSloNominative[dateDayAfter.getDay()];
    
    const tomorrowNameEl = document.getElementById('forecast-day-1-name');
    if (tomorrowNameEl) tomorrowNameEl.textContent = tomorrowDayName;
    
    const dayAfterNameEl = document.getElementById('forecast-day-2-name');
    if (dayAfterNameEl) dayAfterNameEl.textContent = dayAfterDayName;
    
    // Update wave badges in daily cards (use maximum representative wave height for that day)
    const waveCard0 = document.getElementById('forecast-day-0-wave');
    if (waveCard0) waveCard0.innerHTML = getWaveIconHtml(getDayMaxWaveHeight(new Date()));
    
    const waveCard1 = document.getElementById('forecast-day-1-wave');
    if (waveCard1) waveCard1.innerHTML = getWaveIconHtml(getDayMaxWaveHeight(dateTomorrow));
    
    const waveCard2 = document.getElementById('forecast-day-2-wave');
    if (waveCard2) waveCard2.innerHTML = getWaveIconHtml(getDayMaxWaveHeight(dateDayAfter));
    
    let success = false;
    if (arsoForecastData && arsoForecastData.forecast24h?.features?.[0]?.properties?.days) {
        try {
            const days = arsoForecastData.forecast24h.features[0].properties.days;
            
            // Update Danes forecast icon from official ARSO forecast24h
            if (days[0] && days[0].timeline && days[0].timeline.length > 0) {
                const todayForecastIcon = days[0].timeline[0].clouds_icon_wwsyn_icon || "";
                const todayIconBox = document.getElementById('weather-icon-box');
                if (todayIconBox && todayForecastIcon) {
                    todayIconBox.innerHTML = getWeatherIconHtml(todayForecastIcon, "1.8rem");
                }
            }
            
            const updateCardFromArsoJson = (cardPrefix, dayData) => {
                if (!dayData || !dayData.timeline || dayData.timeline.length === 0) return false;
                const timeline = dayData.timeline[0];
                
                const tempMin = parseFloat(timeline.tnsyn);
                const tempMax = parseFloat(timeline.txsyn);
                const windSpeedKmh = parseFloat(timeline.ff_val || "0"); // already in km/h from ARSO API
                const windDir = timeline.dd_shortText || "";
                const windDirDeg = getWindDegFromSlo(windDir);
                const windArrow = getWindArrowHtml(windDirDeg);
                const iconName = timeline.clouds_icon_wwsyn_icon || "";
                
                const iconBox = document.getElementById(`${cardPrefix}-icon-box`);
                if (iconBox) {
                    iconBox.innerHTML = getWeatherIconHtml(iconName, "1.5rem");
                }
                
                const tempEl = document.getElementById(`${cardPrefix}-temp`);
                if (tempEl) {
                    tempEl.textContent = `${Math.round(tempMin)} / ${Math.round(tempMax)} °C`;
                }
                
                const windEl = document.getElementById(`${cardPrefix}-wind`);
                if (windEl) {
                    windEl.innerHTML = `${windArrow}${Math.round(windSpeedKmh)} km/h (${windDir})`;
                }
                return true;
            };
            
            const tomorrowSuccess = updateCardFromArsoJson('forecast-day-1', days[1]);
            const dayAfterSuccess = updateCardFromArsoJson('forecast-day-2', days[2]);
            success = tomorrowSuccess && dayAfterSuccess;
        } catch (jsonErr) {
            console.error("Error parsing ARSO daily forecast:", jsonErr);
        }
    }
    
    if (!success) {
        console.log("Using Open-Meteo daily forecast fallback");
        updateOpenMeteoFallbackCards();
    }
}

function renderArso1hForecast(dayOffset = 0) {
    const container = document.getElementById('hourly-scroll-container');
    const arsoForecastData = getActiveForecastData();
    if (!container || !arsoForecastData) return false;
    
    const days = arsoForecastData.forecast1h?.features?.[0]?.properties?.days;
    if (!days || days.length === 0) return false;
    
    container.innerHTML = '';
    
    // For "Danes" (dayOffset === 0), combine all available 1-hour timeline points across all available days (up to ~36h)
    let allTimeline = [];
    days.forEach(dayItem => {
        if (dayItem.timeline && Array.isArray(dayItem.timeline)) {
            allTimeline = allTimeline.concat(dayItem.timeline);
        }
    });
    
    const now = new Date();
    const nextHour = new Date(now.getTime());
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    
    // Filter out past hours of today, keep all upcoming hours
    const filtered = allTimeline.filter(item => {
        const itemDate = new Date(item.valid);
        return itemDate >= nextHour;
    });
    
    if (filtered.length === 0) {
        return false;
    }
    
    filtered.forEach(item => {
        const itemDate = new Date(item.valid);
        
        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
        const dayDiff = Math.round((itemDay.getTime() - nowDay.getTime()) / 86400000);
        
        let dayPrefix = "";
        if (dayDiff === 1) {
            dayPrefix = `<span style="font-size:0.55rem;opacity:0.85;display:block;line-height:1;">Jutri</span>`;
        } else if (dayDiff === 2) {
            dayPrefix = `<span style="font-size:0.55rem;opacity:0.85;display:block;line-height:1;">Pojutr.</span>`;
        } else if (dayDiff > 2) {
            const daysSloShort = ["Ned", "Pon", "Tor", "Sre", "Čet", "Pet", "Sob"];
            dayPrefix = `<span style="font-size:0.55rem;opacity:0.85;display:block;line-height:1;">${daysSloShort[itemDate.getDay()]}</span>`;
        }
        
        const timeFormatted = itemDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        const timeDisplay = dayPrefix ? `${dayPrefix}${timeFormatted}` : timeFormatted;
        
        const tempVal = parseFloat(item.t);
        const windSpeedKmh = parseFloat(item.ff_val || "0"); // already in km/h from ARSO API
        const windDir = item.dd_shortText || "";
        const windDirDeg = getWindDegFromSlo(windDir);
        const windArrow = getWindArrowHtml(windDirDeg);
        const iconName = item.clouds_icon_wwsyn_icon || "";
        const rain = parseFloat(item.tp_acc || "0");
        const waveH = getWaveHeightForTime(itemDate);
        
        const itemEl = document.createElement('div');
        itemEl.className = 'hourly-item';
        itemEl.innerHTML = `
            <span class="hourly-time">${timeDisplay}</span>
            ${getWeatherIconHtml(iconName, "1.2rem")}
            <span class="hourly-temp">${Math.round(tempVal)}°C</span>
            <span class="hourly-wind">${windArrow}${Math.round(windSpeedKmh)} km/h</span>
            <span class="hourly-rain">${rain > 0 ? rain.toFixed(1) + ' mm' : '0 mm'}</span>
            <div style="margin-top:2px;">${getWaveIconHtml(waveH)}</div>
        `;
        container.appendChild(itemEl);
    });
    
    return true;
}

function renderArso3hForecast(dayOffset) {
    const container = document.getElementById('hourly-scroll-container');
    const arsoForecastData = getActiveForecastData();
    if (!container || !arsoForecastData) return false;
    
    const days = arsoForecastData.forecast3h?.features?.[0]?.properties?.days;
    if (!days) return false;
    
    // Find target day matching local calendar date
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const targetDateStr = d.getFullYear() + '-' + 
                          String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(d.getDate()).padStart(2, '0');
    
    const targetDay = days.find(item => item.date === targetDateStr);
    if (!targetDay) return false;
    
    const timeline = targetDay.timeline || [];
    container.innerHTML = '';
    
    if (timeline.length === 0) {
        return false;
    }
    
    timeline.forEach(item => {
        const itemDate = new Date(item.valid);
        const timeStr = itemDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        
        const tempVal = parseFloat(item.t);
        const windSpeedKmh = parseFloat(item.ff_val || "0"); // already in km/h from ARSO API
        const windDir = item.dd_shortText || "";
        const windDirDeg = getWindDegFromSlo(windDir);
        const windArrow = getWindArrowHtml(windDirDeg);
        const iconName = item.clouds_icon_wwsyn_icon || "";
        const rain = parseFloat(item.tp_acc || "0");
        const waveH = getWaveHeightForTime(itemDate);
        
        const itemEl = document.createElement('div');
        itemEl.className = 'hourly-item';
        itemEl.innerHTML = `
            <span class="hourly-time" style="font-size: 0.68rem; font-weight: 700;">${timeStr}</span>
            ${getWeatherIconHtml(iconName, "1.2rem")}
            <span class="hourly-temp">${Math.round(tempVal)}°C</span>
            <span class="hourly-wind">${windArrow}${Math.round(windSpeedKmh)} km/h</span>
            <span class="hourly-rain">${rain > 0 ? rain.toFixed(1) + ' mm' : '0 mm'}</span>
            <div style="margin-top:2px;">${getWaveIconHtml(waveH)}</div>
        `;
        container.appendChild(itemEl);
    });
    
    return true;
}

function toggleHourlyForecast(dayOffset) {
    const panel = document.getElementById('hourly-forecast-panel');
    const container = document.getElementById('hourly-scroll-container');
    const titleEl = document.getElementById('hourly-forecast-title');
    
    if (!panel || !container || !titleEl) return;
    
    if (activeHourlyDayOffset === dayOffset) {
        panel.style.display = 'none';
        const activeCard = document.getElementById(`forecast-card-${activeHourlyDayOffset}`);
        if (activeCard) activeCard.classList.remove('active');
        activeHourlyDayOffset = null;
        return;
    }
    
    if (activeHourlyDayOffset !== null) {
        const prevCard = document.getElementById(`forecast-card-${activeHourlyDayOffset}`);
        if (prevCard) prevCard.classList.remove('active');
    }
    
    activeHourlyDayOffset = dayOffset;
    const activeCard = document.getElementById(`forecast-card-${dayOffset}`);
    if (activeCard) activeCard.classList.add('active');
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    
    const daysSloNominative = ["Nedelja", "Ponedeljek", "Torek", "Sreda", "Četrtek", "Petek", "Sobota"];
    const daysSloAccusative = ["nedeljo", "ponedeljek", "torek", "sredo", "četrtek", "petek", "soboto"];
    
    let dayTitleText = `Podrobna napoved za danes`;
    if (dayOffset > 0) {
        dayTitleText = `Podrobna napoved za ${daysSloAccusative[targetDate.getDay()]}`;
    }
    titleEl.textContent = dayTitleText;
    
    // Attempt rendering using official ARSO JSON (1h for today 36h continuous track, 3h for tomorrow and day after tomorrow)
    let arsoSuccess = false;
    if (dayOffset === 0) {
        arsoSuccess = renderArso1hForecast(0);
    } else {
        arsoSuccess = renderArso3hForecast(dayOffset);
    }
    
    if (!arsoSuccess) {
        console.log("Using Open-Meteo fallback for detail widget");
        let filtered = [];
        const now = new Date();
        
        if (dayOffset === 0) {
            const nextHour = new Date(now.getTime());
            nextHour.setMinutes(0, 0, 0);
            nextHour.setHours(nextHour.getHours() + 1);
            
            const endOfToday = new Date(now.getTime());
            endOfToday.setHours(23, 59, 59, 999);
            
            filtered = openMeteoHourlyForecast.filter(item => item.time >= nextHour && item.time <= endOfToday);
        } else {
            const startOfDay = new Date(targetDate.getTime());
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(targetDate.getTime());
            endOfDay.setHours(23, 59, 59, 999);
            
            filtered = openMeteoHourlyForecast.filter(item => item.time >= startOfDay && item.time <= endOfDay);
        }
        
        container.innerHTML = '';
        
        if (filtered.length === 0) {
            container.innerHTML = '<div style="font-size:0.8rem;color:var(--text-secondary);width:100%;text-align:center;padding:10px;">Podatki niso na voljo.</div>';
        } else {
            filtered.forEach(item => {
                const timeStr = item.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
                const weatherName = item.weatherCode === 0 || item.weatherCode === 1 ? "clear" : (item.weatherCode === 2 ? "partCloudy" : "overcast");
                const rain = item.rain || 0;
                const windArrow = getWindArrowHtml(item.windDir);
                
                const itemEl = document.createElement('div');
                itemEl.className = 'hourly-item';
                itemEl.innerHTML = `
                    <span class="hourly-time">${timeStr}</span>
                    ${getWeatherIconHtml(weatherName, "1.2rem")}
                    <span class="hourly-temp">${Math.round(item.temp)}°C</span>
                    <span class="hourly-wind">${windArrow}${Math.round(item.windSpeed)} km/h</span>
                    <span class="hourly-rain">${rain > 0 ? rain.toFixed(1) + ' mm' : '0 mm'}</span>
                `;
                container.appendChild(itemEl);
            });
        }
    }
    
    panel.style.display = 'block';
    container.scrollLeft = 0;
    setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

window.toggleHourlyForecast = toggleHourlyForecast;

async function loadOpenMeteoPressures() {
    try {
        // Fetch 31 days of history and 3 days of forecast from Open-Meteo (including sunrise/sunset)
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=45.5469,42.6507&longitude=13.7294,18.0944&hourly=pressure_msl,weather_code,temperature_2m,wind_speed_10m,precipitation,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset&past_days=31&forecast_days=3&timezone=auto';
        const response = await fetch(url);
        if (!response.ok) throw new Error("Meteo API response not ok");
        const json = await response.json();
        
        if (json && json[0] && json[0].hourly && json[1] && json[1].hourly) {
            meteoForecastMap.clear();
            const times = json[0].hourly.time;
            const pressuresKoper = json[0].hourly.pressure_msl;
            const pressuresDubrovnik = json[1].hourly.pressure_msl;
            
            for (let i = 0; i < times.length; i++) {
                const date = parseIsoLocal(times[i]);
                const timeMs = date.getTime();
                meteoForecastMap.set(timeMs, {
                    pressureKoper: pressuresKoper[i],
                    pressureDubrovnik: pressuresDubrovnik[i]
                });
            }
            console.log(`Loaded ${meteoForecastMap.size} Open-Meteo dual-pressure weather points.`);
            
            // Parse and save hourly details for the slider widget (as fallback)
            openMeteoHourlyForecast = [];
            const hourly = json[0].hourly;
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            
            for (let i = 0; i < hourly.time.length; i++) {
                const date = parseIsoLocal(hourly.time[i]);
                if (date >= startOfToday) {
                    openMeteoHourlyForecast.push({
                        time: date,
                        temp: hourly.temperature_2m[i],
                        weatherCode: hourly.weather_code[i],
                        windSpeed: hourly.wind_speed_10m[i],
                        windDir: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : 0,
                        rain: hourly.precipitation ? hourly.precipitation[i] : 0
                    });
                }
            }
            
            // Save daily data for fallback cards
            openMeteoDailyData = json[0].daily || null;
            
            // Update sunrise and sunset widgets
            if (openMeteoDailyData && openMeteoDailyData.sunrise && openMeteoDailyData.sunset) {
                const parseTime = (isoStr) => {
                    if (!isoStr) return "--:--";
                    const d = new Date(isoStr);
                    if (isNaN(d.getTime())) return "--:--";
                    return d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
                };
                
                // Open-Meteo daily arrays contain past_days=31, so today is at index 31.
                // We find it dynamically by matching today's date string in local time.
                const localToday = new Date();
                const todayStr = localToday.getFullYear() + '-' + 
                                 String(localToday.getMonth() + 1).padStart(2, '0') + '-' + 
                                 String(localToday.getDate()).padStart(2, '0');
                
                let todayIdx = openMeteoDailyData.time ? openMeteoDailyData.time.indexOf(todayStr) : -1;
                if (todayIdx === -1 || todayIdx >= openMeteoDailyData.sunrise.length) {
                    todayIdx = Math.min(31, openMeteoDailyData.sunrise.length - 1);
                    if (todayIdx < 0) todayIdx = 0;
                }
                
                document.getElementById('sunrise-time').textContent = parseTime(openMeteoDailyData.sunrise[todayIdx]);
                document.getElementById('sunset-time').textContent = parseTime(openMeteoDailyData.sunset[todayIdx]);
            }
        }
    } catch (e) {
        console.error("Error loading Open-Meteo pressure data:", e);
    }
}

async function refreshData() {
    try {
        // Fetch Open-Meteo dual-pressure data (crucial for chart)
        const meteoPromise = loadOpenMeteoPressures();
        
        const updateUIWithData = (dataList) => {
            if (!dataList || dataList.length === 0) return;
            const latest = dataList[dataList.length - 1];
            const relativeVal = latest.level - MEAN_SEA_LEVEL_OFFSET;
            const relativeSign = relativeVal >= 0 ? '+' : '';
            document.getElementById('current-level-val').textContent = `${relativeSign}${Math.round(relativeVal)}`;
            document.getElementById('relative-level-val').textContent = `Absolutna gladina: ${Math.round(latest.level)} cm`;
            updateWaterGauge(relativeVal);
            
            const timeStr = latest.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
            const timeEl = document.getElementById('level-time-val');
            if (timeEl) timeEl.textContent = `Meritev ARSO ob: ${timeStr}`;
            
            document.getElementById('current-temp-val').textContent = latest.temp.toFixed(1);
            
            // Check for flood warning (level >= 300 cm)
            const warningContainer = document.getElementById('warning-banner-container');
            const levelCard = document.getElementById('card-sea-level');
            
            if (latest.level >= 300.0) {
                if (levelCard) levelCard.classList.add('warning-active');
                if (warningContainer) {
                    warningContainer.innerHTML = `
                        <div class="warning-banner">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>OPOZORILO: Gladina morja presega kritično mejo (300 cm)! Možnost poplavljanja obale.</span>
                        </div>
                    `;
                }
            } else {
                if (levelCard) levelCard.classList.remove('warning-active');
                if (warningContainer) warningContainer.innerHTML = '';
            }
            
            // Calculate sea level trend (raste / pada / stagnira) based on last 3 measurements
            const latestPoints = dataList.slice(-3);
            const trendBadge = document.getElementById('level-trend-badge');
            if (trendBadge && latestPoints.length >= 3) {
                const totalDiff = latestPoints[2].level - latestPoints[0].level;
                trendBadge.className = 'trend-badge'; // Reset state classes
                
                if (totalDiff > 0.4) {
                    trendBadge.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i> raste';
                    trendBadge.classList.add('trend-up');
                } else if (totalDiff < -0.4) {
                    trendBadge.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i> pada';
                    trendBadge.classList.add('trend-down');
                } else {
                    trendBadge.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i> stagnira';
                    trendBadge.classList.add('trend-stable');
                }
            }
            
            // Calculate high/low tide predictions based on current device time
            calculateTideExtrema(new Date());
            
            // Draw the chart immediately
            renderChart();
        };

        // Load 24h table first for instant UI response, then full 30d history in background
        actualData = await loadMergedWaterData((quick24hData) => {
            actualData = quick24hData;
            updateUIWithData(actualData);
        });
        
        if (!actualData || actualData.length === 0) throw new Error("Data empty");
        
        // Wait for pressure data to finish loading (very fast)
        try {
            await meteoPromise;
        } catch (meteoErr) {
            console.error("Failed to load meteo pressures, continuing:", meteoErr);
        }
        
        // Cache full merged data to LocalStorage
        try {
            localStorage.setItem('arso_actual_data', JSON.stringify(actualData));
        } catch (e) {
            console.warn("Could not save to localStorage:", e);
        }
        
        // Update UI & Chart with full 30-day dataset
        updateUIWithData(actualData);
    } catch (err) {
        console.error("Error refreshing data:", err);
        // Show error indicator in cards
        document.getElementById('current-level-val').textContent = "Napaka";
        document.getElementById('current-temp-val').textContent = "Napaka";
    }
}

// Calculate the next high and low tides based on the physical model
function calculateTideExtrema(currentTime) {
    // Generate predictions for the next 36 hours at 5-minute intervals to find peak times precisely
    const start = new Date(currentTime.getTime());
    const end = new Date(currentTime.getTime() + (36 * 60 * 60 * 1000));
    const predictions = TideCalculator.getPredictionsForPeriod(start, end, 5);
    
    let nextHigh = null;
    let nextLow = null;
    
    // Search for peaks in the series
    for (let i = 1; i < predictions.length - 1; i++) {
        const prev = predictions[i-1].level;
        const curr = predictions[i].level;
        const next = predictions[i+1].level;
        
        // High tide peak (local maxima)
        if (curr > prev && curr > next) {
            if (!nextHigh && predictions[i].time > currentTime) {
                nextHigh = predictions[i];
            }
        }
        // Low tide peak (local minima)
        if (curr < prev && curr < next) {
            if (!nextLow && predictions[i].time > currentTime) {
                nextLow = predictions[i];
            }
        }
        
        if (nextHigh && nextLow) break;
    }
    
    console.log("calculateTideExtrema debug:", { 
        currentTime: currentTime.toString(), 
        predictionsLength: predictions.length, 
        nextHigh: nextHigh ? { time: nextHigh.time.toString(), level: nextHigh.level } : null,
        nextLow: nextLow ? { time: nextLow.time.toString(), level: nextLow.level } : null
    });
    
    const SLO_DAYS = ["NED", "PON", "TOR", "SRE", "ČET", "PET", "SOB"];
    
    // Update the widgets
    if (nextHigh) {
        const dayPrefix = SLO_DAYS[nextHigh.time.getDay()];
        const timeStr = nextHigh.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        const highTimeStr = `${dayPrefix} ${timeStr}`;
        document.getElementById('next-high-time').textContent = highTimeStr;
        const relativeVal = nextHigh.level;
        const relativeSign = relativeVal >= 0 ? '+' : '';
        document.getElementById('next-high-height').textContent = `Višina: ${relativeSign}${relativeVal.toFixed(0)} cm`;
    }
    
    if (nextLow) {
        const dayPrefix = SLO_DAYS[nextLow.time.getDay()];
        const timeStr = nextLow.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        const lowTimeStr = `${dayPrefix} ${timeStr}`;
        document.getElementById('next-low-time').textContent = lowTimeStr;
        const relativeVal = nextLow.level;
        const relativeSign = relativeVal >= 0 ? '+' : '';
        document.getElementById('next-low-height').textContent = `Višina: ${relativeSign}${relativeVal.toFixed(0)} cm`;
    }
}
function getArsoDescriptionFromIcon(iconName) {
    if (!iconName) return "jasno";
    const name = iconName.toLowerCase();
    
    if (name.includes("ts") || name.includes("bolt") || name.includes("thunder") || name.includes("neviht")) {
        return "nevihta";
    }
    if (name.includes("snow") || name.includes("sn") || name.includes("sneg")) {
        return "sneženje";
    }
    if (name.includes("shra") || name.includes("shower") || name.includes("ploh")) {
        return "ploha";
    }
    if (name.includes("rain") || name.includes("ra") || name.includes("dež") || name.includes("dz")) {
        return "dež";
    }
    if (name.includes("fog") || name.includes("fg") || name.includes("megl")) {
        return "megla";
    }
    if (name.includes("overcast") || name.includes("oblač")) {
        return "oblačno";
    }
    if (name.includes("prevcloudy")) {
        return "pretežno oblačno";
    }
    if (name.includes("modcloudy")) {
        return "zmerno oblačno";
    }
    if (name.includes("partcloudy") || name.includes("delno")) {
        return "delno oblačno";
    }
    if (name.includes("slightcloudy") || name.includes("rahlo")) {
        return "rahlo oblačno";
    }
    if (name.includes("mostclear")) {
        return "pretežno jasno";
    }
    if (name.includes("clear") || name.includes("jasno")) {
        return "jasno";
    }
    return "jasno";
}

// Helper to parse official ARSO AMS station XML feeds
async function parseArsoAmsXml(stationId, cb) {
    try {
        const targetUrl = `https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/observationAms_${stationId}_latest.xml?cb=${cb}`;
        const xmlText = await fetchWeatherWithFallback(targetUrl, true);
        if (!xmlText || typeof xmlText !== 'string') return null;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const metData = xmlDoc.getElementsByTagName("metData")[0];
        if (!metData) return null;

        const getValue = (tagName, fallback = "") => {
            const node = metData.getElementsByTagName(tagName)[0];
            return node ? (node.textContent || "").trim() : fallback;
        };

        const rawT = getValue("t");
        const tempVal = rawT && !isNaN(parseFloat(rawT)) ? parseFloat(rawT) : null;
        
        const rawRh = getValue("rh");
        const rh = rawRh && !isNaN(parseFloat(rawRh)) ? parseFloat(rawRh) : null;

        // Wind calculations (both buoy and airport use m/s in ffavg_val and km/h in ffavg_val_kmh)
        let rawFfKmh = getValue("ffavg_val_kmh") || getValue("ff_val_kmh");
        let rawFfMs = getValue("ffavg_val") || getValue("ff_val");
        let windSpeedKmh = rawFfKmh && !isNaN(parseFloat(rawFfKmh)) ? parseFloat(rawFfKmh) : null;
        let windSpeedMs = rawFfMs && !isNaN(parseFloat(rawFfMs)) ? parseFloat(rawFfMs) : null;
        
        if (windSpeedKmh === null && windSpeedMs !== null) {
            windSpeedKmh = windSpeedMs * 3.6;
        } else if (windSpeedMs === null && windSpeedKmh !== null) {
            windSpeedMs = windSpeedKmh / 3.6;
        }

        let feelsLike = null;
        if (tempVal !== null && rh !== null && windSpeedMs !== null) {
            const e = (rh / 100.0) * 6.105 * Math.exp((17.27 * tempVal) / (237.7 + tempVal));
            feelsLike = tempVal + 0.33 * e - 0.7 * windSpeedMs - 4.0;
        }

        const rawDd = getValue("dd_val") || getValue("ddavg_val");
        const windDirDeg = rawDd && !isNaN(parseFloat(rawDd)) ? parseFloat(rawDd) : 0;
        let windDirStr = getValue("dd_shortText") || getValue("ddavg_shortText") || "";
        if (!windDirStr || /^\d+°?$/.test(windDirStr)) {
            windDirStr = (windSpeedKmh !== null && (windSpeedKmh > 0 || windSpeedMs > 0)) ? getWindDirectionSlo(windDirDeg) : "Brezvetrje";
        }

        const rawP = getValue("p") || getValue("msl");
        const pressure = rawP && !isNaN(parseFloat(rawP)) && parseFloat(rawP) > 800 ? parseFloat(rawP) : null;
        
        const iconName = getValue("nn_icon-wwsyn_icon") || getValue("clouds_icon_wwsyn_icon") || "";
        let desc = getValue("nn_shortText-wwsyn_longText") || getValue("clouds_shortText") || "";
        if (!desc && iconName) {
            desc = getArsoDescriptionFromIcon(iconName);
        }
        if (!desc) {
            desc = "jasno";
        }
        const validTime = getValue("valid") || "";

        return {
            description: desc,
            temp: tempVal,
            feelsLike: feelsLike,
            pressure: pressure,
            humidity: rh,
            windSpeedMs: windSpeedMs,
            windSpeedKmh: windSpeedKmh,
            windDirDeg: windDirDeg,
            windDirStr: windDirStr,
            iconName: iconName,
            validTime: validTime
        };
    } catch (e) {
        console.error(`Error parsing ARSO AMS XML for ${stationId}:`, e);
        return null;
    }
}

// Helper to manage persistent sensor values with the 60-minute fallback threshold rule
function processSensorValueWithThreshold(stationKey, sensorKey, currentValue, rowDate) {
    const storageValKey = `arso_${stationKey}_last_${sensorKey}`;
    const storageTimeKey = `arso_${stationKey}_last_${sensorKey}_time`;
    
    if (currentValue !== null && currentValue !== undefined && (typeof currentValue !== 'number' || !isNaN(currentValue))) {
        // Fresh measurement from XML
        try {
            localStorage.setItem(storageValKey, JSON.stringify(currentValue));
            localStorage.setItem(storageTimeKey, rowDate.toISOString());
        } catch (e) {}
        return {
            value: currentValue,
            staleNote: null,
            staleType: null,
            isFresh: true
        };
    }
    
    // Missing measurement - check persistent storage
    let lastVal = null;
    let lastTimeIso = null;
    try {
        const storedVal = localStorage.getItem(storageValKey);
        if (storedVal !== null && storedVal !== 'undefined') {
            lastVal = JSON.parse(storedVal);
        }
        lastTimeIso = localStorage.getItem(storageTimeKey);
    } catch (e) {}
    
    if (lastTimeIso && lastVal !== null) {
        const lastDate = new Date(lastTimeIso);
        const ageMinutes = Math.max(0, Math.round((rowDate.getTime() - lastDate.getTime()) / (60 * 1000)));
        const timeStr = lastDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        
        if (ageMinutes < 60) {
            // Under 60 min: retain last known value with amber warning note
            return {
                value: lastVal,
                staleNote: `Ni svežega podatka (zadnja posodobitev ARSO ob ${timeStr})`,
                staleType: 'warning',
                isFresh: false
            };
        } else {
            // 60 min or older: return null with red note
            return {
                value: null,
                staleNote: `Ni svežega podatka (zadnja posodobitev ARSO ob ${timeStr})`,
                staleType: 'error',
                isFresh: false
            };
        }
    }
    
    // No previous history found
    return {
        value: null,
        staleNote: 'Ni svežega podatka',
        staleType: 'error',
        isFresh: false
    };
}

let lastWeatherFetchTime = 0;

// Fetch weather conditions strictly from official ARSO station XML feeds (Piran Boja Vida & Letališče Portorož)
async function loadWeather(forceLoadingState = false) {
    const cb = Date.now();
    
    // Only reset to null if explicitly forced or if both are empty
    if (forceLoadingState || (!weatherDataVida && !weatherDataPortoroz)) {
        weatherDataVida = null;
        weatherDataPortoroz = null;
        renderWeather();
    }
    
    // Fetch official ARSO XML in parallel
    const fetchVidaXml = async () => {
        try {
            return await parseArsoAmsXml("PIRAN_OCEAN-BOJ", cb);
        } catch (e) {
            console.error("Error loading Vida buoy XML:", e);
            return null;
        }
    };

    const fetchPortorozXml = async () => {
        try {
            return await parseArsoAmsXml("PORTOROZ_SECOVLJE", cb);
        } catch (e) {
            console.error("Error loading Portorož Airport data:", e);
            return null;
        }
    };

    // Run XML fetches in parallel
    const [vidaData, portorozData] = await Promise.all([fetchVidaXml(), fetchPortorozXml()]);
    
    // 1. Process Letališče Portorož
    if (portorozData) {
        const portorozRowDate = parseArsoXmlDate(portorozData.validTime) || new Date();
        
        const pTemp = processSensorValueWithThreshold('portoroz', 'temp', portorozData.temp, portorozRowDate);
        const pRh = processSensorValueWithThreshold('portoroz', 'rh', portorozData.humidity, portorozRowDate);
        const pPressure = processSensorValueWithThreshold('portoroz', 'pressure', portorozData.pressure, portorozRowDate);
        
        let pWindInput = (portorozData.windSpeedKmh !== null) ? {
            speedKmh: portorozData.windSpeedKmh,
            speedMs: portorozData.windSpeedMs,
            dirDeg: portorozData.windDirDeg,
            dirStr: portorozData.windDirStr
        } : null;
        const pWind = processSensorValueWithThreshold('portoroz', 'wind', pWindInput, portorozRowDate);
        
        let pFeelsLike = null;
        if (pTemp.value !== null && pRh.value !== null) {
            const windMs = pWind.value ? (pWind.value.speedMs || 0) : 0;
            const e = (pRh.value / 100.0) * 6.105 * Math.exp((17.27 * pTemp.value) / (237.7 + pTemp.value));
            pFeelsLike = pTemp.value + 0.33 * e - 0.7 * windMs - 4.0;
        }

        weatherDataPortoroz = {
            ...portorozData,
            temp: pTemp.value,
            tempStaleNote: pTemp.staleNote,
            tempStaleType: pTemp.staleType,
            humidity: pRh.value,
            humidityStaleNote: pRh.staleNote,
            humidityStaleType: pRh.staleType,
            pressure: pPressure.value,
            pressureStaleNote: pPressure.staleNote,
            pressureStaleType: pPressure.staleType,
            windSpeedKmh: pWind.value ? pWind.value.speedKmh : null,
            windSpeedMs: pWind.value ? pWind.value.speedMs : null,
            windDirDeg: pWind.value ? pWind.value.dirDeg : 0,
            windDirStr: pWind.value ? pWind.value.dirStr : '',
            windStaleNote: pWind.staleNote,
            windStaleType: pWind.staleType,
            feelsLike: pFeelsLike,
            validTime: portorozData.validTime,
            waveHeight: currentMarineWaveHeight || 0.2
        };
    }

    // 2. Process Piran (Boja Vida)
    if (vidaData) {
        const vidaRowDate = parseArsoXmlDate(vidaData.validTime) || new Date();
        
        const vTemp = processSensorValueWithThreshold('vida', 'temp', vidaData.temp, vidaRowDate);
        const vRh = processSensorValueWithThreshold('vida', 'rh', vidaData.humidity, vidaRowDate);
        
        let vWindInput = (vidaData.windSpeedKmh !== null) ? {
            speedKmh: vidaData.windSpeedKmh,
            speedMs: vidaData.windSpeedMs,
            dirDeg: vidaData.windDirDeg,
            dirStr: vidaData.windDirStr
        } : null;
        const vWind = processSensorValueWithThreshold('vida', 'wind', vWindInput, vidaRowDate);
        
        let vFeelsLike = null;
        if (vTemp.value !== null && vRh.value !== null) {
            const windMs = vWind.value ? (vWind.value.speedMs || 0) : 0;
            const e = (vRh.value / 100.0) * 6.105 * Math.exp((17.27 * vTemp.value) / (237.7 + vTemp.value));
            vFeelsLike = vTemp.value + 0.33 * e - 0.7 * windMs - 4.0;
        }

        // Pressure for Boja Vida: ALWAYS borrowed from Portorož Airport!
        let vPress = null;
        let vPressStaleNote = null;
        let vPressStaleType = null;
        if (weatherDataPortoroz && weatherDataPortoroz.pressure !== null) {
            vPress = weatherDataPortoroz.pressure;
            vPressStaleNote = weatherDataPortoroz.pressureStaleNote;
            vPressStaleType = weatherDataPortoroz.pressureStaleType;
        } else if (vidaData.pressure) {
            vPress = vidaData.pressure;
        } else {
            const pStoredPress = processSensorValueWithThreshold('portoroz', 'pressure', null, vidaRowDate);
            vPress = pStoredPress.value || 1018;
            vPressStaleNote = pStoredPress.staleNote;
            vPressStaleType = pStoredPress.staleType;
        }

        const currentDesc = (vidaData.description && vidaData.description !== "jasno") ? vidaData.description : (weatherDataPortoroz ? weatherDataPortoroz.description : "jasno");
        const currentIcon = vidaData.iconName || (weatherDataPortoroz ? weatherDataPortoroz.iconName : "clear");

        weatherDataVida = {
            ...vidaData,
            temp: vTemp.value,
            tempStaleNote: vTemp.staleNote,
            tempStaleType: vTemp.staleType,
            humidity: vRh.value,
            humidityStaleNote: vRh.staleNote,
            humidityStaleType: vRh.staleType,
            windSpeedKmh: vWind.value ? vWind.value.speedKmh : null,
            windSpeedMs: vWind.value ? vWind.value.speedMs : null,
            windDirDeg: vWind.value ? vWind.value.dirDeg : 0,
            windDirStr: vWind.value ? vWind.value.dirStr : '',
            windStaleNote: vWind.staleNote,
            windStaleType: vWind.staleType,
            feelsLike: vFeelsLike,
            pressure: vPress,
            pressureStaleNote: vPressStaleNote,
            pressureStaleType: vPressStaleType,
            validTime: vidaData.validTime,
            description: currentDesc,
            iconName: currentIcon,
            waveHeight: currentMarineWaveHeight || 0.2
        };
    }

    if (weatherDataVida || weatherDataPortoroz) {
        lastWeatherFetchTime = Date.now();
    }
    
    // Re-render the active tab with updated station data
    renderWeather();
}

function parseArsoXmlDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length >= 2) {
        const dateParts = parts[0].split('.');
        const timeParts = parts[1].split(':');
        if (dateParts.length === 3 && timeParts.length >= 2) {
            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const year = parseInt(dateParts[2], 10);
            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);
            const second = timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0;
            return new Date(year, month, day, hour, minute, second);
        }
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(dateStr.trim())) {
        const now = new Date();
        const tParts = dateStr.trim().split(':');
        now.setHours(parseInt(tParts[0], 10), parseInt(tParts[1], 10), 0, 0);
        return now;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

// Find forecast point in ARSO timeline matching a specific time
function getForecastItemForTime(dateObj) {
    const fcData = getActiveForecastData();
    if (!fcData || !dateObj) return null;
    const timeMs = dateObj.getTime();
    
    // 1. Search 1h forecast timeline
    const days1h = fcData.forecast1h?.features?.[0]?.properties?.days;
    if (days1h) {
        let bestItem = null;
        let minDiff = 3600 * 1000 * 1.5;
        for (const day of days1h) {
            if (day.timeline) {
                for (const item of day.timeline) {
                    const itemMs = new Date(item.valid).getTime();
                    const diff = Math.abs(itemMs - timeMs);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestItem = item;
                    }
                }
            }
        }
        if (bestItem) return bestItem;
    }
    
    // 2. Search 3h forecast timeline
    const days3h = fcData.forecast3h?.features?.[0]?.properties?.days;
    if (days3h) {
        let bestItem = null;
        let minDiff = 3600 * 1000 * 3.5;
        for (const day of days3h) {
            if (day.timeline) {
                for (const item of day.timeline) {
                    const itemMs = new Date(item.valid).getTime();
                    const diff = Math.abs(itemMs - timeMs);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestItem = item;
                    }
                }
            }
        }
        if (bestItem) return bestItem;
    }
    
    // 3. Fallback to 24h daily timeline
    const days24h = fcData.forecast24h?.features?.[0]?.properties?.days;
    if (days24h) {
        let bestItem = null;
        let minDiff = 86400 * 1000 * 1.5;
        for (const day of days24h) {
            if (day.timeline && day.timeline.length > 0) {
                const itemDate = new Date(day.date);
                const diff = Math.abs(itemDate.getTime() - timeMs);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestItem = day.timeline[0];
                }
            }
        }
        if (bestItem) return bestItem;
    }
    return null;
}

function renderWeather() {
    // De-activate all tabs, activate current one
    const tabVida = document.getElementById('tab-vida');
    const tabPortoroz = document.getElementById('tab-portoroz');
    
    if (tabVida) tabVida.classList.remove('active');
    if (tabPortoroz) tabPortoroz.classList.remove('active');
    
    if (activeWeatherSource === 'vida') {
        if (tabVida) tabVida.classList.add('active');
    } else {
        if (tabPortoroz) tabPortoroz.classList.add('active');
    }

    const data = (activeWeatherSource === 'vida') ? weatherDataVida : weatherDataPortoroz;
    
    const timeBadge = document.getElementById('weather-time-badge');
    if (timeBadge) {
        if (data && data.validTime) {
            const mDate = parseArsoXmlDate(data.validTime);
            if (mDate) {
                const timeStr = mDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
                timeBadge.textContent = `Meritev ob ${timeStr}`;
                timeBadge.style.display = 'inline';
            } else {
                timeBadge.style.display = 'none';
            }
        } else {
            timeBadge.style.display = 'none';
        }
    }
    
    if (!data) {
        document.getElementById('weather-desc-val').textContent = 'Nalaganje...';
        document.getElementById('air-temp-val').textContent = '--°C';
        document.getElementById('current-air-temp-val').textContent = '--°C';
        document.getElementById('air-temp-feels-val').textContent = 'Obč. --';
        document.getElementById('current-feels-like-val').textContent = 'Obč. --°C';
        document.getElementById('air-pressure-val').textContent = '-- hPa';
        document.getElementById('humidity-val').textContent = '-- %';
        document.getElementById('wind-speed-val').textContent = '-- km/h';
        document.getElementById('wind-dir-val').textContent = '--';
        document.getElementById('wave-height-val').textContent = '-- m';
        const currentIconBox = document.getElementById('current-weather-icon-box');
        if (currentIconBox) {
            currentIconBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: var(--text-secondary); font-size: 2.4rem;"></i>';
        }
        return;
    }

    // Determine common weather condition description and icon name (buoy uses airport description as fallback)
    const descData = weatherDataPortoroz || data;
    const weatherDesc = descData.description || 'jasno';
    const weatherIconName = descData.iconName || '';

    // Populate description
    document.getElementById('weather-desc-val').textContent = weatherDesc;

    // Center weather icon box at the top of the sidebar card
    const currentIconBox = document.getElementById('current-weather-icon-box');
    if (currentIconBox) {
        currentIconBox.innerHTML = getWeatherIconHtml(weatherIconName, "2.8rem");
    }

    // Temperature & Apparent Temp (Emphasized and Bold)
    const elAirTemp = document.getElementById('current-air-temp-val');
    const elForecastAirTemp = document.getElementById('air-temp-val');

    if (data.temp !== null && !isNaN(data.temp)) {
        const formattedTemp = `${data.temp.toFixed(1)}°C`;
        if (elForecastAirTemp) elForecastAirTemp.textContent = formattedTemp;
        
        if (elAirTemp) {
            if (data.tempStaleNote) {
                const noteColor = data.tempStaleType === 'error' ? '#ef4444' : '#f59e0b';
                elAirTemp.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>${formattedTemp}</div>
                        <div style="font-size: 0.72rem; color: ${noteColor}; font-weight: 500; margin-top: 2px;">${data.tempStaleNote}</div>
                    </div>
                `;
            } else {
                elAirTemp.textContent = formattedTemp;
            }
        }
    } else {
        if (elForecastAirTemp) elForecastAirTemp.textContent = '--°C';
        
        if (elAirTemp) {
            if (data.tempStaleNote) {
                const noteColor = '#ef4444';
                elAirTemp.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>-- °C</div>
                        <div style="font-size: 0.72rem; color: ${noteColor}; font-weight: 500; margin-top: 2px;">${data.tempStaleNote}</div>
                    </div>
                `;
            } else {
                elAirTemp.textContent = '--°C';
            }
        }
    }
    
    // Feels Like
    const elFeelsLike = document.getElementById('current-feels-like-val');
    const elForecastFeelsLike = document.getElementById('air-temp-feels-val');
    if (data.feelsLike !== null && !isNaN(data.feelsLike)) {
        const feelsLikeStr = `Obč. ${Math.round(data.feelsLike)}°C`;
        if (elFeelsLike) elFeelsLike.textContent = feelsLikeStr;
        if (elForecastFeelsLike) elForecastFeelsLike.textContent = feelsLikeStr;
    } else {
        if (elFeelsLike) elFeelsLike.textContent = 'Obč. --';
        if (elForecastFeelsLike) elForecastFeelsLike.textContent = 'Obč. --';
    }

    // Pressure
    const elPressure = document.getElementById('air-pressure-val');
    if (elPressure) {
        if (data.pressure !== null && !isNaN(data.pressure)) {
            const formattedPress = `${Math.round(data.pressure)} hPa`;
            if (data.pressureStaleNote) {
                const noteColor = data.pressureStaleType === 'error' ? '#ef4444' : '#f59e0b';
                elPressure.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>${formattedPress}</div>
                        <div style="font-size: 0.72rem; color: ${noteColor}; font-weight: 500; margin-top: 2px;">${data.pressureStaleNote}</div>
                    </div>
                `;
            } else {
                elPressure.textContent = formattedPress;
            }
        } else {
            if (data.pressureStaleNote) {
                elPressure.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>-- hPa</div>
                        <div style="font-size: 0.72rem; color: #ef4444; font-weight: 500; margin-top: 2px;">${data.pressureStaleNote}</div>
                    </div>
                `;
            } else {
                elPressure.textContent = '-- hPa';
            }
        }
    }
    
    // Humidity
    const elHumidity = document.getElementById('humidity-val');
    if (elHumidity) {
        if (data.humidity !== null && !isNaN(data.humidity)) {
            const formattedRh = `${Math.round(data.humidity)}%`;
            if (data.humidityStaleNote) {
                const noteColor = data.humidityStaleType === 'error' ? '#ef4444' : '#f59e0b';
                elHumidity.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>${formattedRh}</div>
                        <div style="font-size: 0.72rem; color: ${noteColor}; font-weight: 500; margin-top: 2px;">${data.humidityStaleNote}</div>
                    </div>
                `;
            } else {
                elHumidity.textContent = formattedRh;
            }
        } else {
            if (data.humidityStaleNote) {
                elHumidity.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>-- %</div>
                        <div style="font-size: 0.72rem; color: #ef4444; font-weight: 500; margin-top: 2px;">${data.humidityStaleNote}</div>
                    </div>
                `;
            } else {
                elHumidity.textContent = '-- %';
            }
        }
    }

    // Wind (dual units + Beaufort scale display in separate line)
    const elWindSpeed = document.getElementById('wind-speed-val');
    const elWindDir = document.getElementById('wind-dir-val');

    if (data.windSpeedKmh !== null && !isNaN(data.windSpeedKmh)) {
        const windArrow = getWindArrowHtml(data.windDirDeg);
        const bft = getBeaufortInfo(data.windSpeedKmh);
        const speedMsVal = (data.windSpeedMs !== null && !isNaN(data.windSpeedMs)) ? data.windSpeedMs : 0;
        
        let noteHtml = '';
        if (data.windStaleNote) {
            const noteColor = data.windStaleType === 'error' ? '#ef4444' : '#f59e0b';
            noteHtml = `<div style="font-size: 0.72rem; color: ${noteColor}; font-weight: 500; margin-top: 2px;">${data.windStaleNote}</div>`;
        }

        if (elWindSpeed) {
            elWindSpeed.innerHTML = `
                <div style="text-align: right; line-height: 1.25;">
                    <div>${windArrow}${speedMsVal.toFixed(1)} m/s (${Math.round(data.windSpeedKmh)} km/h)</div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px;">${bft.bft} Bft - ${bft.text}</div>
                    ${noteHtml}
                </div>
            `;
        }
        if (elWindDir) {
            let windDirDisplay = data.windDirStr;
            if (!windDirDisplay || /^\d+°?$/.test(windDirDisplay)) {
                windDirDisplay = (data.windSpeedKmh > 0 || speedMsVal > 0) ? getWindDirectionSlo(data.windDirDeg) : 'Brezvetrje';
            }
            elWindDir.textContent = windDirDisplay;
        }
    } else {
        if (elWindSpeed) {
            if (data.windStaleNote) {
                elWindSpeed.innerHTML = `
                    <div style="text-align: right; line-height: 1.25;">
                        <div>-- km/h</div>
                        <div style="font-size: 0.72rem; color: #ef4444; font-weight: 500; margin-top: 2px;">${data.windStaleNote}</div>
                    </div>
                `;
            } else {
                elWindSpeed.textContent = '-- km/h';
            }
        }
        if (elWindDir) {
            elWindDir.textContent = '--';
        }
    }

    // Waves (Vida measurement or Open-Meteo model fallback for Portorož)
    let waveH = data.waveHeight;
    if ((waveH === null || waveH === undefined) && activeWeatherSource === 'portoroz') {
        waveH = weatherDataVida ? weatherDataVida.waveHeight : currentMarineWaveHeight;
    }
    if (waveH !== null && waveH !== undefined && !isNaN(waveH)) {
        const seaState = getDouglasSeaState(waveH);
        document.getElementById('wave-height-val').textContent = `${waveH.toFixed(2)} m - ${seaState.label}`;
    } else {
        document.getElementById('wave-height-val').textContent = '-- m';
    }
}

function updateWaterGauge(relativeLevel) {
    const fill = document.getElementById('water-gauge-fill');
    const pointer = document.getElementById('water-gauge-pointer');
    if (!fill || !pointer) return;
    
    // Scale range: -60 cm to +90 cm (150 cm total range)
    const minScale = -60;
    const maxScale = 90;
    const pct = Math.max(0, Math.min(100, ((relativeLevel - minScale) / (maxScale - minScale)) * 100));
    
    // Set heights
    fill.style.height = `${pct}%`;
    pointer.style.bottom = `${pct}%`;
    
    // Set color based on limits:
    // Green: -30 to +40
    // Yellow: -40 to -30 and +40 to +50
    // Red: below -40 or above +50
    let color = '#22c55e'; // green
    if ((relativeLevel >= -40 && relativeLevel < -30) || (relativeLevel > 40 && relativeLevel <= 50)) {
        color = '#eab308'; // yellow
    } else if (relativeLevel < -40 || relativeLevel > 50) {
        color = '#ef4444'; // red
    }
    
    fill.style.backgroundColor = color;
    pointer.style.borderLeftColor = color;
}

// User-facing function to switch sources
function setWeatherSource(source) {
    if (source === 'vida' || source === 'portoroz') {
        activeWeatherSource = source;
        arsoForecastData = getActiveForecastData();
        
        // Toggle tab button visual state immediately
        const btnPortoroz = document.getElementById('tab-portoroz');
        const btnVida = document.getElementById('tab-vida');
        if (btnPortoroz && btnVida) {
            if (source === 'vida') {
                btnVida.classList.add('active');
                btnPortoroz.classList.remove('active');
            } else {
                btnPortoroz.classList.add('active');
                btnVida.classList.remove('active');
            }
        }
        
        renderWeather();
        renderArsoForecast();
        if (activeHourlyDayOffset !== null) {
            if (activeHourlyDayOffset === 0) {
                renderArso1hForecast();
            } else {
                renderArso3hForecast(activeHourlyDayOffset);
            }
        }
        renderChart();
    }
}
window.setWeatherSource = setWeatherSource;

function renderChart() {
    if (actualData.length === 0) return;
    
    const startTime = actualData[0].time;
    const endTime = actualData[actualData.length - 1].time;
    
    // Predictions window: extend predictions 365 days into the future to see forecasted tides
    const forecastEnd = new Date(endTime.getTime() + (365 * 24 * 60 * 60 * 1000));
    
    // Generate astronomical predictions for the chart period (using 10-minute interval to align with ARSO measurements)
    const predictions = TideCalculator.getPredictionsForPeriod(startTime, forecastEnd, 10);
    
    let series = [];
    let yAxisTitle = '';
    let chartTitle = '';
    
    if (chartMode === 'level') {
        // Map actual levels into relative values
        const actualSeriesData = actualData.map(d => [d.time.getTime(), d.level - MEAN_SEA_LEVEL_OFFSET]);
        
        // Map predicted levels (already relative)
        const predictedSeriesData = predictions.map(d => [d.time.getTime(), d.level]);
        
        // Create a fast lookup map for astronomical predictions to optimize lookup speeds
        const predictionMap = new Map();
        predictions.forEach(p => {
            const roundedTimeMs = Math.round(p.time.getTime() / (10 * 60 * 1000)) * (10 * 60 * 1000);
            predictionMap.set(roundedTimeMs, p.level);
        });
        
        // Calculate rolling seasonal bias offset (Actual - Prediction - Weather) over the last 24 hours
        let totalDiffSum = 0;
        let diffCount = 0;
        
        const latestActualTime = actualData[actualData.length - 1].time;
        const oneDayAgoMs = latestActualTime.getTime() - (24 * 60 * 60 * 1000);
        
        actualData.forEach(d => {
            const timeMs = d.time.getTime();
            if (timeMs >= oneDayAgoMs) {
                const roundedTimeMs = Math.round(timeMs / (10 * 60 * 1000)) * (10 * 60 * 1000);
                const predRel = predictionMap.get(roundedTimeMs);
                
                if (predRel !== undefined) {
                    const hourMs = Math.round(timeMs / (3600 * 1000)) * (3600 * 1000);
                    const meteo = meteoForecastMap.get(hourMs);
                    
                    let meteoEffect = 0;
                    if (meteo) {
                        const pCorr = 1013.25 - meteo.pressureKoper;
                        const grad = meteo.pressureDubrovnik - meteo.pressureKoper;
                        const gradCorr = 2.0 * grad; // 2 cm of surge per hPa pressure difference
                        meteoEffect = pCorr + gradCorr;
                    }
                    
                    const actualRel = d.level - MEAN_SEA_LEVEL_OFFSET;
                    
                    // Difference after subtracting both astro prediction and meteo correction
                    const diff = actualRel - (predRel + meteoEffect);
                    totalDiffSum += diff;
                    diffCount++;
                }
            }
        });
        
        const biasOffset = diffCount > 0 ? (totalDiffSum / diffCount) : 0;
        console.log(`Calculated weather-corrected rolling bias: ${biasOffset.toFixed(2)} cm over ${diffCount} points.`);
        
        // Calculate hybrid predictions (astronomical tide + rolling bias + pressure-gradient weather correction)
        const hybridSeriesData = [];
        predictions.forEach(d => {
            const timeMs = d.time.getTime();
            
            // Find closest hourly weather data point (round to nearest hour)
            const hourMs = Math.round(timeMs / (3600 * 1000)) * (3600 * 1000);
            const meteo = meteoForecastMap.get(hourMs);
            
            if (meteo) {
                const pCorr = 1013.25 - meteo.pressureKoper;
                const grad = meteo.pressureDubrovnik - meteo.pressureKoper;
                const gradCorr = 2.0 * grad;
                const meteoEffect = pCorr + gradCorr;
                
                // Hybrid level = astronomical + seasonal bias + meteorological correction
                const hybridVal = d.level + biasOffset + meteoEffect;
                hybridSeriesData.push([timeMs, hybridVal]);
            }
        });
        
        series = [
            {
                name: 'Izmerjena gladina (ARSO)',
                data: actualSeriesData,
                type: 'spline',
                color: '#f97316', // High-contrast orange
                shadow: {
                    color: 'rgba(249, 115, 22, 0.35)',
                    width: 4,
                    offsetX: 0,
                    offsetY: 2
                },
                marker: { enabled: false, states: { hover: { enabled: true, radius: 5 } } }
            },
            {
                name: 'Napovedano plimovanje (NIB MBP)',
                data: predictedSeriesData,
                type: 'spline',
                color: '#10b981', // Distinct green
                dashStyle: 'ShortDash',
                opacity: 0.85,
                marker: { enabled: false }
            },
            {
                name: 'Hibridna napoved (astronomija + zračni tlak in veter)',
                data: hybridSeriesData,
                type: 'spline',
                color: '#eab308', // Vivid yellow
                dashStyle: 'ShortDot',
                opacity: 0.95,
                visible: true,
                marker: { enabled: false }
            }
        ];
        
        yAxisTitle = 'Relativna gladina morja (cm)';
        chartTitle = 'Primerjava izmerjene in napovedane gladine morja';
    } else {
        // Temperature Mode
        const tempSeriesData = actualData.map(d => [d.time.getTime(), d.temp]);
        series = [
            {
                name: 'Temperatura morja (ARSO)',
                data: tempSeriesData,
                type: 'spline',
                color: '#f43f5e',
                shadow: {
                    color: 'rgba(244, 63, 94, 0.4)',
                    width: 4,
                    offsetX: 0,
                    offsetY: 2
                },
                marker: { enabled: false, states: { hover: { enabled: true, radius: 5 } } }
            }
        ];
        
        yAxisTitle = 'Temperatura (°C)';
        chartTitle = 'Temperatura morja v zadnjem obdobju';
    }
    
    // Dynamic theme colors for Highcharts
    const isLight = document.body.classList.contains('light-theme');
    const titleColor = isLight ? '#0f172a' : '#f8fafc';
    const labelColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    const zeroLineCol = isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
    
    // Calculate visible extremes based on periodHours
    const latestTimeVal = endTime.getTime();
    const minTime = latestTimeVal - (periodHours * 60 * 60 * 1000);
    const maxTime = chartMode === 'level' ? latestTimeVal + (periodHours * 60 * 60 * 1000) : latestTimeVal;
    
    // Render Highcharts Stock
    currentChart = Highcharts.stockChart('sea-level-chart', {
        exporting: {
            enabled: false // Disable the exporting burger menu to prevent overlap with fullscreen button
        },
        chart: {
            style: { fontFamily: 'Inter' },
            spacingBottom: 5,
            panning: {
                enabled: true,
                type: 'x'
            },
            pinchType: 'x',
            zoomType: null
        },
        time: {
            useUTC: false
        },
        title: {
            text: null // Disable title entirely for cleaner UI and maximum vertical chart space
        },
        credits: { enabled: false },
        rangeSelector: {
            enabled: false // Custom HTML buttons control this
        },
        scrollbar: {
            enabled: false
        },
        navigator: {
            enabled: false
        },
        xAxis: {
            type: 'datetime',
            gridLineWidth: 1,
            labels: {
                style: { color: labelColor },
                formatter: function () {
                    const date = new Date(this.value);
                    const hours = date.getHours();
                    const minutes = date.getMinutes();
                    
                    // If it is midnight, display day name and date (e.g. Pon 10. 8.)
                    if (hours === 0 && minutes === 0) {
                        const days = ['Ned', 'Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob'];
                        const dayName = days[date.getDay()];
                        const day = date.getDate();
                        const month = date.getMonth() + 1;
                        return `<b>${dayName} ${day}. ${month}.</b>`;
                    }
                    
                    // Otherwise, display time
                    return Highcharts.dateFormat('%H:%M', this.value);
                }
            },
            min: minTime,
            max: maxTime,
            plotLines: [{
                value: endTime.getTime(),
                color: '#ef4444',
                width: 2,
                dashStyle: 'ShortDot',
                label: {
                    text: 'Sedaj',
                    align: 'right',
                    x: -8, // Shift to the left of the line so it doesn't clip on the right edge
                    y: 30, // Move lower to make it fully visible
                    style: { color: '#ef4444', fontWeight: 'bold' }
                },
                zIndex: 5
            }],
            ordinal: false
        },
        yAxis: {
            title: {
                text: yAxisTitle,
                style: { color: labelColor }
            },
            gridLineColor: gridColor,
            labels: { style: { color: labelColor } },
            plotLines: chartMode === 'level' ? [{
                value: 0,
                color: zeroLineCol,
                width: 1.5,
                dashStyle: 'Dash',
                label: {
                    text: 'Srednje morje (0 cm)',
                    align: 'left',
                    style: { color: isLight ? '#475569' : '#64748b', fontSize: '10px' },
                    x: 10
                },
                zIndex: 1
            }] : []
        },
        tooltip: {
            split: false,
            shared: true,
            crosshairs: true,
            useHTML: true,
            followTouchMove: false,
            outside: true,
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: 0,
            shadow: false,
            padding: 0,
            style: {
                color: isLight ? '#0f172a' : '#f8fafc',
                fontSize: '11px',
                fontFamily: 'Inter, sans-serif',
                zIndex: 9999
            },
            formatter: function () {
                const days = ['Nedelja', 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota'];
                const dateObj = new Date(this.x);
                const dayName = days[dateObj.getDay()];
                const dayStr = String(dateObj.getDate()).padStart(2, '0') + '.' + String(dateObj.getMonth() + 1).padStart(2, '0') + '.';
                const timeStr = Highcharts.dateFormat('%H:%M', this.x);
                
                let s = `<div class="chart-custom-tooltip" style="
                    background: ${isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.96)'};
                    border: 1px solid ${isLight ? 'rgba(14, 165, 233, 0.45)' : 'rgba(56, 189, 248, 0.4)'};
                    border-radius: 12px;
                    padding: 8px 10px;
                    min-width: 155px;
                    box-shadow: 0 4px 16px ${isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.65)'};
                    color: ${isLight ? '#0f172a' : '#f8fafc'};
                    box-sizing: border-box;
                ">`;
                
                s += `<div style="font-weight:700; font-size:11px; margin-bottom:4px; color:${isLight ? '#0f172a' : '#f8fafc'}; border-bottom:1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'}; padding-bottom:3px;">
                        ${dayName}, ${dayStr} ob ${timeStr}
                      </div>`;
                
                s += `<div style="display:flex; flex-direction:column; gap:2px; margin-bottom:3px;">`;
                this.points.forEach(point => {
                    if (chartMode === 'level') {
                        const relVal = Math.round(point.y);
                        const sign = relVal >= 0 ? '+' : '';
                        let prefix = 'Napoved';
                        if (point.series.name.includes('Izmerjena')) {
                            prefix = 'Meritev';
                        } else if (point.series.name.includes('Hibridna')) {
                            prefix = 'Hibrid';
                        }
                        s += `<div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                                <span style="font-size:10px;"><span style="color:${point.color}; font-size:12px;">●</span> ${prefix}:</span>
                                <span style="font-weight:700; font-family:'Outfit', sans-serif;">${sign}${relVal} cm</span>
                              </div>`;
                    } else {
                        const val = point.y.toFixed(1);
                        s += `<div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                                <span style="font-size:10px;"><span style="color:${point.color}; font-size:12px;">●</span> Temp:</span>
                                <span style="font-weight:700; font-family:'Outfit', sans-serif;">${val} °C</span>
                              </div>`;
                    }
                });
                s += `</div>`;
                
                // Weather preview lookup for this timestamp - ONLY for current and future points!
                const nowMs = Date.now();
                const pointTimeMs = dateObj.getTime();
                
                if (pointTimeMs >= nowMs - (30 * 60 * 1000)) {
                    const fcItem = getForecastItemForTime(dateObj);
                    if (fcItem) {
                        const tVal = Math.round(parseFloat(fcItem.t));
                        const iconName = fcItem.clouds_icon_wwsyn_icon || "";
                        const windSpeedKmh = Math.round(parseFloat(fcItem.ff_val || "0"));
                        const windDir = fcItem.dd_shortText || "";
                        const windDirDeg = getWindDegFromSlo(windDir);
                        const windArrow = getWindArrowUnicode(windDirDeg);
                        const waveH = getWaveHeightForTime(dateObj);
                        const waveHtml = getWaveTooltipHtml(waveH);
                        
                        s += `<div style="margin-top:8px; padding-top:6px; border-top:1px dashed ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'}; display:flex; flex-direction:column; gap:5px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                                    <div style="display:flex; align-items:center; gap:5px;">
                                        ${getWeatherIconHtml(iconName, "1.15rem")}
                                        <span style="font-weight:700; font-size:11px;">${tVal}°C</span>
                                    </div>
                                    <div style="font-size:10.5px; font-weight:600; display:flex; align-items:center; gap:4px;">
                                        <span style="font-weight:bold; font-size:12px;">${windArrow}</span><span>${windSpeedKmh} km/h</span>
                                    </div>
                                </div>
                                <div style="display:flex; align-items:center; justify-content:flex-end;">
                                    ${waveHtml}
                                </div>
                              </div>`;
                    }
                }
                
                s += `</div>`;
                return s;
            }
        },
        legend: {
            enabled: true,
            align: 'center',
            verticalAlign: 'bottom',
            layout: 'horizontal',
            margin: 5,
            padding: 2,
            itemDistance: 10,
            itemStyle: { color: labelColor, fontSize: '10px' },
            itemHoverStyle: { color: titleColor }
        },
        plotOptions: {
            spline: {
                lineWidth: 2.5
            },
            series: {
                dataGrouping: {
                    enabled: false
                }
            }
        },
        series: series
    });
}

// Toggle custom CSS-based pseudo-fullscreen mode for mobile/desktop
function toggleFullscreen() {
    const chartCard = document.querySelector('.chart-container-card');
    const fsBtn = document.getElementById('fullscreen-btn');
    
    if (!chartCard) return;
    
    const isFullscreen = chartCard.classList.toggle('fullscreen-active');
    document.body.classList.toggle('fullscreen-open', isFullscreen); // Add/remove body layout override class
    
    if (isFullscreen) {
        fsBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        fsBtn.title = "Izhod iz celozaslonskega načina";
    } else {
        fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        fsBtn.title = "Celozaslonski način";
    }
    
    if (currentChart) {
        setTimeout(() => {
            currentChart.reflow();
        }, 150); // Small timeout to allow CSS hide animations/transitions to finish before reflowing the chart size
    }
}

// Draw realistic dynamic moon sphere with exact astronomical terminator shading
function drawRealisticMoon(ageDays) {
    const canvas = document.getElementById('moon-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const r = (w / 2) - 3;
    const cx = w / 2;
    const cy = h / 2;
    
    ctx.clearRect(0, 0, w, h);
    
    // 1. Draw base dark sphere (night side of the Moon)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    
    // Dark surface gradient
    const darkGrad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.1, cx, cy, r);
    darkGrad.addColorStop(0, '#2d3748');
    darkGrad.addColorStop(0.8, '#1e293b');
    darkGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = darkGrad;
    ctx.fill();
    
    // Subtle maria markings on dark side
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(cx - r*0.25, cy - r*0.2, r*0.32, 0, Math.PI * 2);
    ctx.arc(cx + r*0.28, cy + r*0.15, r*0.24, 0, Math.PI * 2);
    ctx.arc(cx - r*0.1, cy + r*0.38, r*0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // 2. Draw illuminated portion
    const synodic = 29.530588853;
    const phase = ((ageDays % synodic) + synodic) % synodic / synodic; // 0.0 to 1.0
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    
    ctx.beginPath();
    if (phase < 0.5) {
        // Waxing (Rastoča): Illuminated on the RIGHT (0 = new, 0.25 = 1st quarter, 0.5 = full)
        ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2, false);
        const k = Math.cos(phase * 2 * Math.PI); // 1 (new) -> 0 (1st quarter) -> -1 (full)
        ctx.ellipse(cx, cy, Math.max(0.1, Math.abs(r * k)), r, 0, Math.PI/2, -Math.PI/2, k > 0);
    } else {
        // Waning (Padajoča): Illuminated on the LEFT (0.5 = full, 0.75 = last quarter, 1.0 = new)
        ctx.arc(cx, cy, r, Math.PI/2, -Math.PI/2, false);
        const k = Math.cos(phase * 2 * Math.PI); // -1 (full) -> 0 (last quarter) -> 1 (new)
        ctx.ellipse(cx, cy, Math.max(0.1, Math.abs(r * k)), r, 0, -Math.PI/2, Math.PI/2, k > 0);
    }
    ctx.closePath();
    
    // Lit moon surface texture & gradient
    const litGrad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.05, cx, cy, r);
    litGrad.addColorStop(0, '#ffffff');
    litGrad.addColorStop(0.3, '#f8fafc');
    litGrad.addColorStop(0.7, '#e2e8f0');
    litGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = litGrad;
    ctx.fill();
    
    // Maria / crater textures on lit side
    ctx.fillStyle = 'rgba(100, 116, 139, 0.28)';
    ctx.beginPath();
    ctx.arc(cx - r*0.28, cy - r*0.22, r*0.3, 0, Math.PI * 2);
    ctx.arc(cx + r*0.25, cy + r*0.12, r*0.24, 0, Math.PI * 2);
    ctx.arc(cx - r*0.08, cy + r*0.35, r*0.22, 0, Math.PI * 2);
    ctx.arc(cx + r*0.15, cy - r*0.32, r*0.16, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // 3. Subtle outer rim glow / 3D sphere illusion
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

// Calculate moon phase client-side based on astronomical cycle
function updateMoonPhase() {
    const now = new Date();
    
    // Reference New Moon: Jan 6, 2000 18:14 UTC (947182440000 ms)
    const refNewMoon = 947182440000;
    const synodicMonth = 2551442977; // ms (29.530588853 days)
    
    const diffMs = now.getTime() - refNewMoon;
    const ageDays = ((diffMs % synodicMonth) + synodicMonth) % synodicMonth / 86400000;
    
    let phaseName = "";
    
    if (ageDays < 1.0 || ageDays >= 28.53) {
        phaseName = "Prazna Luna - Mlaj";
    } else if (ageDays < 6.38) {
        phaseName = "Rastoča Luna";
    } else if (ageDays < 8.38) {
        phaseName = "Prvi krajec";
    } else if (ageDays < 13.76) {
        phaseName = "Rastoča Luna";
    } else if (ageDays < 15.76) {
        phaseName = "Polna Luna - Ščip";
    } else if (ageDays < 21.15) {
        phaseName = "Padajoča Luna";
    } else if (ageDays < 23.15) {
        phaseName = "Zadnji krajec";
    } else {
        phaseName = "Padajoča Luna";
    }
    
    // Draw realistic dynamic moon sphere on Canvas
    drawRealisticMoon(ageDays);
    
    // Calculate Tide Coefficient (0 = Neap, 100 = Spring)
    // Spring tide occurs at New Moon (0) and Full Moon (14.765)
    const cyclePos = ageDays % 14.7654;
    const dist = Math.min(cyclePos, 14.7654 - cyclePos);
    const coeff = Math.round(100 - (dist / 7.3827) * 100);
    
    let coeffDesc = "";
    if (coeff >= 75) {
        coeffDesc = `<span class="coeff-spring">Močno plimovanje</span> (sizigijsko, ${coeff}%)`;
    } else if (coeff <= 25) {
        coeffDesc = `<span class="coeff-neap">ŠŠibko plimovanje</span> (kvadraturno, ${coeff}%)`;
    } else {
        coeffDesc = `Srednje plimovanje (${coeff}%)`;
    }
    
    // Calculate the next principal phase (Mlaj, Prvi krajec, Ščip, Zadnji krajec)
    const cycleProgress = ((diffMs % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
    const principalPhases = [
        { ratio: 0.0, name: "Prazna Luna - Mlaj", prefix: "Naslednja prazna luna - mlaj" },
        { ratio: 0.25, name: "Prvi krajec", prefix: "Naslednji prvi krajec" },
        { ratio: 0.5, name: "Polna Luna - Ščip", prefix: "Naslednja polna luna - ščip" },
        { ratio: 0.75, name: "Zadnji krajec", prefix: "Naslednji zadnji krajec" }
    ];
    
    // If we are currently experiencing a principal phase, announce the SUBSEQUENT one!
    let nextTargetRatio = null;
    if (phaseName === "Prazna Luna - Mlaj") nextTargetRatio = 0.25; // Next is Prvi krajec
    else if (phaseName === "Prvi krajec") nextTargetRatio = 0.5;   // Next is Ščip
    else if (phaseName === "Polna Luna - Ščip") nextTargetRatio = 0.75; // Next is Zadnji krajec
    else if (phaseName === "Zadnji krajec") nextTargetRatio = 0.0;     // Next is Mlaj
    
    let nextP = null;
    if (nextTargetRatio !== null) {
        nextP = principalPhases.find(p => p.ratio === nextTargetRatio);
    } else {
        let minDiff = 2.0;
        for (const p of principalPhases) {
            let diff = p.ratio - cycleProgress;
            if (diff <= 0.001) diff += 1.0; // Wrap around if we are past or at the phase
            if (diff < minDiff) {
                minDiff = diff;
                nextP = p;
            }
        }
    }
    
    let diffToNext = nextP.ratio - cycleProgress;
    if (diffToNext <= 0.001) diffToNext += 1.0;
    const timeToNextMs = diffToNext * synodicMonth;
    const nextPhaseDate = new Date(now.getTime() + timeToNextMs);
    
    const dayStr = String(nextPhaseDate.getDate()).padStart(2, '0') + '.' + 
                   String(nextPhaseDate.getMonth() + 1).padStart(2, '0') + '.' + 
                   nextPhaseDate.getFullYear();
    const hourStr = nextPhaseDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    const nextPhaseText = `${nextP.prefix} ${dayStr} ob ${hourStr}`;
    
    // For principal phases, calculate the exact moment of the current phase
    let currentPhaseExactMoment = "";
    if (phaseName === "Prazna Luna - Mlaj" || phaseName === "Prvi krajec" || phaseName === "Polna Luna - Ščip" || phaseName === "Zadnji krajec") {
        let currentTargetRatio = 0.0;
        if (phaseName === "Prvi krajec") currentTargetRatio = 0.25;
        else if (phaseName === "Polna Luna - Ščip") currentTargetRatio = 0.5;
        else if (phaseName === "Zadnji krajec") currentTargetRatio = 0.75;
        
        let diffToCurrent = currentTargetRatio - cycleProgress;
        if (diffToCurrent > 0.5) diffToCurrent -= 1.0;
        if (diffToCurrent < -0.5) diffToCurrent += 1.0;
        
        const currentPhaseDate = new Date(now.getTime() + (diffToCurrent * synodicMonth));
        const cDayStr = String(currentPhaseDate.getDate()).padStart(2, '0') + '.' + 
                        String(currentPhaseDate.getMonth() + 1).padStart(2, '0') + '.';
        const cHourStr = currentPhaseDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
        
        currentPhaseExactMoment = ` (${cDayStr} ob ${cHourStr})`;
    }
    
    // Update UI elements
    const phaseNameEl = document.getElementById('moon-phase-name');
    const coeffValEl = document.getElementById('moon-coeff-val');
    const nextPhaseEl = document.getElementById('moon-next-phase');
    
    if (phaseNameEl) phaseNameEl.textContent = `${phaseName}${currentPhaseExactMoment}`;
    if (coeffValEl) coeffValEl.innerHTML = `Tip: ${coeffDesc}`;
    if (nextPhaseEl) nextPhaseEl.textContent = nextPhaseText;
}

// Toggle between light and dark themes
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
    
    // Re-render chart to apply new theme colors
    renderChart();
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-icon-indicator');
    if (!icon) return;
    
    if (document.body.classList.contains('light-theme')) {
        // In light theme, show a Moon icon (click to switch to dark theme)
        icon.className = 'fa-solid fa-moon';
        icon.style.color = '#475569';
    } else {
        // In dark theme, show a Sun icon (click to switch to light theme)
        icon.className = 'fa-solid fa-sun';
        icon.style.color = '#e2e8f0';
    }
}

// ==========================================

// =========================================================================
// SECTION 2: NAUTICAL STATE, COMPASS & MATHEMATICAL HELPERS
// =========================================================================

const MAGNETIC_DECLINATION_SLOVENIA = 4.0;
let phoneMagneticHeading = 0;
let orientationActive = false;
let lastGpsSpeedKnots = 0;
let currentDialAngle = 0;
let currentNeedleAngle = 0;
let lastGpsCoords = null;
let hasCenteredInitialGps = false;
let plannedSpeedKnots = 5.0;

let navMap = null;
let navMapLayers = {};
let currentNavMapLayerType = 'cmap';
let showNauticalChart = true;
let showEmodnetBathymetry = false;
let showDepthContours = true;
let depthVectorLayerGroup = null;
let guide200mLayerGroup = null;
let isGuide103Visible = false;

let navBoatMarker = null;
let navPlannedRoutePolyline = null;
let navRecordedTrackPolyline = null;
let navPastCruisePolyline = null;
let navPastCruiseMarkers = [];

let routeWaypoints = [
    { id: 'start', type: 'start', lat: null, lon: null, isGps: true, label: 'Moja lokacija (GPS)' },
    { id: 'dest', type: 'dest', lat: null, lon: null, label: 'Kliknite na karto za izbiro cilja' }
];
let activeWaypointTargetId = 'dest';
let intermediateWpCounter = 1;
let waypointMarkers = {};
let currentCalculatedRouteCoords = [];

let isCruiseActive = false;
let cruiseStartTime = null;
let cruiseDurationTimer = null;
let cruiseTrackPoints = [];
let cruiseTotalDistanceNm = 0;
let cruiseMaxSpeedKnots = 0;
let lastRecordedGpsPos = null;
let cruiseWakeLock = null;

function getShortestAngleDelta(fromAngle, toAngle) {
    return ((toAngle - fromAngle) % 360 + 540) % 360 - 180;
}

function formatNauticalCoord(degDec, isLat) {
    if (degDec === null || degDec === undefined || isNaN(degDec)) {
        return isLat ? "--° --.---' N" : "---° --.---' E";
    }
    const absVal = Math.abs(degDec);
    const degrees = Math.floor(absVal);
    const minutes = (absVal - degrees) * 60;
    const hemisphere = isLat ? (degDec >= 0 ? 'N' : 'S') : (degDec >= 0 ? 'E' : 'W');
    const degStr = isLat ? String(degrees).padStart(2, '0') : String(degrees).padStart(3, '0');
    const minStr = minutes.toFixed(3).padStart(6, '0');
    return `${degStr}° ${minStr}' ${hemisphere}`;
}

function getHeadingCardinal(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return '--';
    const cardinals = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
    const normalized = (deg % 360 + 360) % 360;
    const idx = Math.round(normalized / 22.5) % 16;
    return cardinals[idx];
}

function handleDeviceOrientation(event) {
    let heading = null;
    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
        heading = (360 - event.alpha) % 360;
    }
    if (heading !== null && !isNaN(heading)) {
        phoneMagneticHeading = (heading % 360 + 360) % 360;
        updateCompassOrientation();
    }
}

function updateCompassOrientation() {
    const targetDial = -phoneMagneticHeading;
    currentDialAngle += getShortestAngleDelta(currentDialAngle, targetDial);
    const compassDial = document.getElementById('compass-dial-group');
    if (compassDial) {
        compassDial.style.transform = `rotate(${currentDialAngle}deg)`;
    }

    const compassNeedle = document.getElementById('compass-needle-group');
    if (compassNeedle) {
        if (lastGpsHeading !== null && lastGpsSpeedKnots >= 0.4) {
            const targetNeedle = (lastGpsHeading - phoneMagneticHeading);
            currentNeedleAngle += getShortestAngleDelta(currentNeedleAngle, targetNeedle);
            compassNeedle.style.transform = `rotate(${currentNeedleAngle}deg)`;
            compassNeedle.style.opacity = '1';
        } else {
            compassNeedle.style.opacity = '0.35';
        }
    }
}

function startOrientationTracking() {
    if (orientationActive) return;
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                    orientationActive = true;
                }
            })
            .catch(err => console.warn('DeviceOrientation permission request failed:', err));
    } else if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        orientationActive = true;
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        orientationActive = true;
    }
}

function stopOrientationTracking() {
    if (!orientationActive) return;
    window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    orientationActive = false;
}

const SLO_COAST_200M_GUIDE_NODES = [
    [45.594560, 13.720400],
    [45.593786, 13.718967],
    [45.594435, 13.715360],
    [45.595396, 13.710560],
    [45.595007, 13.706276],
    [45.593502, 13.702531],
    [45.589501, 13.700685],
    [45.585941, 13.705510],
    [45.582904, 13.711294],
    [45.581717, 13.716564],
    [45.578180, 13.724363],
    [45.578115, 13.728455],
    [45.573179, 13.732743],
    [45.572556, 13.739323],
    [45.568104, 13.737157],
    [45.562189, 13.731849],
    [45.552214, 13.724362],
    [45.549799, 13.720293],
    [45.546639, 13.721603],
    [45.544708, 13.718903],
    [45.548610, 13.711700],
    [45.549265, 13.705626],
    [45.550165, 13.691433],
    [45.546855, 13.676613],
    [45.542018, 13.670182],
    [45.541174, 13.667549],
    [45.542556, 13.667035],
    [45.544069, 13.664312],
    [45.543676, 13.655941],
    [45.542575, 13.653442],
    [45.539267, 13.652564],
    [45.538055, 13.651645],
    [45.537724, 13.648538],
    [45.535516, 13.644758],
    [45.535287, 13.638965],
    [45.534727, 13.636008],
    [45.535014, 13.632409],
    [45.536455, 13.627692],
    [45.537744, 13.623997],
    [45.538943, 13.622039],
    [45.540280, 13.620473],
    [45.541783, 13.618348],
    [45.542159, 13.613606],
    [45.541775, 13.611261],
    [45.539297, 13.601081],
    [45.536961, 13.598593],
    [45.534158, 13.598232],
    [45.530889, 13.597427],
    [45.528267, 13.600487],
    [45.527674, 13.599782],
    [45.528088, 13.598228],
    [45.528394, 13.595803],
    [45.528363, 13.593658],
    [45.528120, 13.590806],
    [45.527962, 13.589501],
    [45.528369, 13.586217],
    [45.527751, 13.582433],
    [45.527130, 13.581031],
    [45.527909, 13.580058],
    [45.529630, 13.576925],
    [45.531043, 13.573428],
    [45.531559, 13.570629],
    [45.532412, 13.566540],
    [45.532644, 13.563513],
    [45.531609, 13.560444],
    [45.529912, 13.559867],
    [45.528250, 13.561703],
    [45.527468, 13.563728],
    [45.526055, 13.563911],
    [45.524503, 13.564127],
    [45.521811, 13.563541],
    [45.519399, 13.564652],
    [45.515977, 13.566164],
    [45.513087, 13.569936],
    [45.511871, 13.572993],
    [45.513336, 13.576169],
    [45.513843, 13.577335],
    [45.512303, 13.580328],
    [45.511458, 13.582658],
    [45.510755, 13.587434],
    [45.510599, 13.589365],
    [45.510546, 13.591050],
    [45.508670, 13.590728],
    [45.507332, 13.592042],
    [45.506464, 13.592067],
    [45.505369, 13.591794],
    [45.505108, 13.591199],
    [45.504917, 13.588373],
    [45.503385, 13.585435],
    [45.501920, 13.584209],
    [45.500497, 13.583928],
    [45.499450, 13.582395],
    [45.497862, 13.581808],
    [45.495526, 13.584108],
    [45.494240, 13.585576],
    [45.492375, 13.585607],
    [45.490621, 13.587525],
    [45.488732, 13.589453],
    [45.486646, 13.589527],
    [45.484172, 13.589854],
    [45.482396, 13.588688],
    [45.481762, 13.586959],
    [45.480198, 13.584447],
];


// High-precision Slovenian Coastline Closed Polygon (OSM Verified)
const SLO_COASTLINE_POLYGON = [
    [45.60370, 13.79734],
    [45.60236, 13.79222],
    [45.60218, 13.79052],
    [45.60188, 13.79031],
    [45.60154, 13.79038],
    [45.60121, 13.79008],
    [45.60092, 13.79048],
    [45.60125, 13.78830],
    [45.60013, 13.78647],
    [45.59943, 13.78571],
    [45.59845, 13.78570],
    [45.59795, 13.78587],
    [45.59784, 13.78546],
    [45.59870, 13.78416],
    [45.59861, 13.78236],
    [45.59982, 13.78004],
    [45.59946, 13.77976],
    [45.59951, 13.77961],
    [45.59973, 13.77976],
    [45.59966, 13.77948],
    [45.60015, 13.77878],
    [45.60118, 13.77779],
    [45.60141, 13.77800],
    [45.60146, 13.77769],
    [45.60195, 13.77779],
    [45.60198, 13.77752],
    [45.60203, 13.77781],
    [45.60256, 13.77781],
    [45.60281, 13.77617],
    [45.60338, 13.77658],
    [45.60422, 13.77500],
    [45.60364, 13.77430],
    [45.60401, 13.77345],
    [45.60424, 13.77363],
    [45.60445, 13.77292],
    [45.60429, 13.77276],
    [45.60432, 13.77249],
    [45.60476, 13.77202],
    [45.60484, 13.77160],
    [45.60447, 13.77094],
    [45.60446, 13.77009],
    [45.60413, 13.77004],
    [45.60412, 13.76980],
    [45.60451, 13.76983],
    [45.60470, 13.76903],
    [45.60500, 13.76917],
    [45.60471, 13.76897],
    [45.60492, 13.76848],
    [45.60503, 13.76854],
    [45.60506, 13.76819],
    [45.60520, 13.76828],
    [45.60520, 13.76811],
    [45.60567, 13.76794],
    [45.60565, 13.76779],
    [45.60713, 13.76725],
    [45.60715, 13.76617],
    [45.60709, 13.76720],
    [45.60510, 13.76790],
    [45.60491, 13.76783],
    [45.60475, 13.76802],
    [45.60473, 13.76747],
    [45.60491, 13.76730],
    [45.60494, 13.76776],
    [45.60533, 13.76762],
    [45.60522, 13.76708],
    [45.60563, 13.76683],
    [45.60581, 13.76734],
    [45.60564, 13.76657],
    [45.60622, 13.76551],
    [45.60655, 13.76585],
    [45.60674, 13.76661],
    [45.60660, 13.76581],
    [45.60623, 13.76542],
    [45.60638, 13.76442],
    [45.60630, 13.76393],
    [45.60696, 13.76156],
    [45.60715, 13.75923],
    [45.60734, 13.75906],
    [45.60760, 13.75749],
    [45.60848, 13.75656],
    [45.60886, 13.75668],
    [45.60940, 13.75383],
    [45.61012, 13.75184],
    [45.61001, 13.75176],
    [45.60989, 13.75208],
    [45.60965, 13.75190],
    [45.60959, 13.75206],
    [45.60977, 13.75219],
    [45.60976, 13.75247],
    [45.60930, 13.75377],
    [45.60881, 13.75632],
    [45.60718, 13.75584],
    [45.60723, 13.75498],
    [45.60605, 13.75359],
    [45.60632, 13.75367],
    [45.60707, 13.75439],
    [45.60721, 13.75317],
    [45.60692, 13.75297],
    [45.60753, 13.75120],
    [45.60863, 13.75129],
    [45.60921, 13.75171],
    [45.60877, 13.75128],
    [45.60927, 13.74987],
    [45.61064, 13.75137],
    [45.61040, 13.75260],
    [45.61059, 13.75255],
    [45.61079, 13.75169],
    [45.61068, 13.75119],
    [45.60901, 13.74949],
    [45.60907, 13.74892],
    [45.60855, 13.74696],
    [45.60853, 13.74394],
    [45.60873, 13.74304],
    [45.60875, 13.74182],
    [45.60894, 13.74184],
    [45.60897, 13.74162],
    [45.60880, 13.74151],
    [45.60904, 13.74065],
    [45.60942, 13.74100],
    [45.60949, 13.74074],
    [45.60906, 13.74061],
    [45.60909, 13.74051],
    [45.60931, 13.74064],
    [45.60940, 13.74037],
    [45.60930, 13.74028],
    [45.60980, 13.73926],
    [45.61057, 13.73695],
    [45.61062, 13.73470],
    [45.60997, 13.73257],
    [45.60840, 13.73090],
    [45.60802, 13.73076],
    [45.60806, 13.73052],
    [45.60748, 13.72984],
    [45.60729, 13.72980],
    [45.60639, 13.72837],
    [45.60601, 13.72726],
    [45.60598, 13.72690],
    [45.60619, 13.72685],
    [45.60596, 13.72581],
    [45.60616, 13.72447],
    [45.60606, 13.72387],
    [45.60577, 13.72354],
    [45.60580, 13.72302],
    [45.60550, 13.72262],
    [45.60555, 13.72225],
    [45.60542, 13.72236],
    [45.60536, 13.72211],
    [45.60554, 13.72203],
    [45.60541, 13.72167],
    [45.60550, 13.72089],
    [45.60582, 13.71997],
    [45.60573, 13.71914],
    [45.60474, 13.71905],
    [45.60293, 13.71950],
    [45.60200, 13.72039],
    [45.60090, 13.72103],
    [45.60075, 13.72093],
    [45.60052, 13.71991],
    [45.59970, 13.72030],
    [45.59961, 13.71996],
    [45.59802, 13.72072],
    [45.59808, 13.72107],
    [45.59726, 13.72145],
    [45.59734, 13.72177],
    [45.59650, 13.72200],
    [45.59681, 13.72213],
    [45.59731, 13.72188],
    [45.59750, 13.72252],
    [45.59676, 13.72295],
    [45.59665, 13.72253],
    [45.59667, 13.72317],
    [45.59599, 13.72342],
    [45.59498, 13.72330],
    [45.59481, 13.72298],
    [45.59489, 13.72240],
    [45.59472, 13.72282],
    [45.59433, 13.72319],
    [45.59428, 13.72298],
    [45.59359, 13.72305],
    [45.59318, 13.72351],
    [45.59249, 13.72325],
    [45.59216, 13.72283],
    [45.59196, 13.72216],
    [45.59153, 13.72192],
    [45.59119, 13.72080],
    [45.59134, 13.72047],
    [45.59153, 13.72059],
    [45.59181, 13.72047],
    [45.59194, 13.71992],
    [45.59079, 13.71969],
    [45.59068, 13.71955],
    [45.59066, 13.71811],
    [45.59156, 13.71528],
    [45.59218, 13.71455],
    [45.59251, 13.71470],
    [45.59256, 13.71501],
    [45.59238, 13.71517],
    [45.59254, 13.71513],
    [45.59285, 13.71394],
    [45.59301, 13.71405],
    [45.59290, 13.71391],
    [45.59336, 13.71248],
    [45.59364, 13.71266],
    [45.59339, 13.71240],
    [45.59368, 13.70845],
    [45.59247, 13.70448],
    [45.59201, 13.70407],
    [45.59095, 13.70357],
    [45.58994, 13.70338],
    [45.58867, 13.70535],
    [45.58819, 13.70686],
    [45.58767, 13.70709],
    [45.58773, 13.70675],
    [45.58735, 13.70730],
    [45.58755, 13.70705],
    [45.58766, 13.70717],
    [45.58736, 13.70785],
    [45.58746, 13.70774],
    [45.58764, 13.70800],
    [45.58748, 13.70876],
    [45.58686, 13.70932],
    [45.58671, 13.70908],
    [45.58682, 13.70943],
    [45.58519, 13.71132],
    [45.58439, 13.71280],
    [45.58330, 13.71835],
    [45.58300, 13.71878],
    [45.58291, 13.71928],
    [45.58312, 13.71973],
    [45.58248, 13.72132],
    [45.58210, 13.72119],
    [45.58261, 13.72146],
    [45.58261, 13.72164],
    [45.58193, 13.72372],
    [45.58133, 13.72451],
    [45.58093, 13.72481],
    [45.58084, 13.72468],
    [45.58037, 13.72510],
    [45.58004, 13.72506],
    [45.57973, 13.72551],
    [45.57974, 13.72586],
    [45.57978, 13.72563],
    [45.58037, 13.72564],
    [45.58036, 13.72584],
    [45.58015, 13.72569],
    [45.58014, 13.72583],
    [45.58036, 13.72587],
    [45.58048, 13.72652],
    [45.58052, 13.72799],
    [45.58012, 13.72920],
    [45.57923, 13.73066],
    [45.57866, 13.73122],
    [45.57824, 13.73157],
    [45.57792, 13.73070],
    [45.57820, 13.73159],
    [45.57681, 13.73245],
    [45.57664, 13.73243],
    [45.57636, 13.73164],
    [45.57659, 13.73242],
    [45.57540, 13.73325],
    [45.57458, 13.73432],
    [45.57430, 13.73408],
    [45.57426, 13.73417],
    [45.57468, 13.73459],
    [45.57429, 13.73602],
    [45.57443, 13.73704],
    [45.57470, 13.73765],
    [45.57418, 13.74062],
    [45.57365, 13.74165],
    [45.57290, 13.74242],
    [45.57274, 13.74244],
    [45.57263, 13.74224],
    [45.57174, 13.74273],
    [45.57113, 13.74185],
    [45.57188, 13.74329],
    [45.57152, 13.74350],
    [45.57058, 13.74217],
    [45.57074, 13.74093],
    [45.57028, 13.74002],
    [45.57058, 13.74077],
    [45.57053, 13.74230],
    [45.56962, 13.74279],
    [45.56875, 13.74242],
    [45.56853, 13.74199],
    [45.56798, 13.74170],
    [45.56796, 13.74088],
    [45.56795, 13.74653],
    [45.56764, 13.74639],
    [45.56729, 13.74649],
    [45.56720, 13.74626],
    [45.56636, 13.74630],
    [45.56631, 13.74650],
    [45.56606, 13.74649],
    [45.56598, 13.74563],
    [45.56567, 13.74566],
    [45.56569, 13.74622],
    [45.56544, 13.74678],
    [45.56431, 13.74626],
    [45.56404, 13.73966],
    [45.56374, 13.73650],
    [45.56307, 13.73583],
    [45.56303, 13.73486],
    [45.56272, 13.73426],
    [45.55965, 13.73284],
    [45.55946, 13.73329],
    [45.55960, 13.73969],
    [45.55919, 13.73971],
    [45.55925, 13.74226],
    [45.55967, 13.74224],
    [45.55967, 13.74239],
    [45.55941, 13.74288],
    [45.55924, 13.74289],
    [45.55919, 13.74422],
    [45.55867, 13.74590],
    [45.55833, 13.74599],
    [45.55839, 13.74496],
    [45.55822, 13.74494],
    [45.55815, 13.74463],
    [45.55837, 13.74462],
    [45.55836, 13.74405],
    [45.55804, 13.74407],
    [45.55802, 13.74357],
    [45.55776, 13.74316],
    [45.55757, 13.73650],
    [45.55727, 13.73652],
    [45.55739, 13.73885],
    [45.55707, 13.73886],
    [45.55703, 13.73691],
    [45.55730, 13.73628],
    [45.55724, 13.73335],
    [45.55620, 13.73167],
    [45.55525, 13.73079],
    [45.55521, 13.72883],
    [45.55311, 13.72896],
    [45.55339, 13.73789],
    [45.55365, 13.73787],
    [45.55364, 13.73799],
    [45.55338, 13.73835],
    [45.55337, 13.73797],
    [45.55319, 13.73799],
    [45.55321, 13.73839],
    [45.55296, 13.73833],
    [45.55284, 13.73849],
    [45.55266, 13.73851],
    [45.55265, 13.73820],
    [45.55247, 13.73821],
    [45.55248, 13.73851],
    [45.55225, 13.73863],
    [45.55047, 13.73403],
    [45.55031, 13.72866],
    [45.55059, 13.72782],
    [45.55076, 13.72813],
    [45.55085, 13.72597],
    [45.55050, 13.72568],
    [45.55080, 13.72600],
    [45.55072, 13.72760],
    [45.55041, 13.72763],
    [45.55038, 13.72696],
    [45.55038, 13.72763],
    [45.55021, 13.72766],
    [45.55019, 13.72745],
    [45.55012, 13.72766],
    [45.55008, 13.72692],
    [45.55019, 13.72688],
    [45.55003, 13.72689],
    [45.55001, 13.72654],
    [45.55045, 13.72648],
    [45.55049, 13.72661],
    [45.55047, 13.72633],
    [45.55028, 13.72635],
    [45.54990, 13.72586],
    [45.54959, 13.72515],
    [45.54976, 13.72482],
    [45.54903, 13.72293],
    [45.54841, 13.72204],
    [45.54832, 13.72219],
    [45.54882, 13.72292],
    [45.54895, 13.72349],
    [45.54879, 13.72450],
    [45.54823, 13.72454],
    [45.54814, 13.72377],
    [45.54816, 13.72457],
    [45.54792, 13.72458],
    [45.54792, 13.72498],
    [45.54807, 13.72512],
    [45.54797, 13.72525],
    [45.54774, 13.72534],
    [45.54762, 13.72506],
    [45.54695, 13.72530],
    [45.54778, 13.72462],
    [45.54688, 13.72521],
    [45.54647, 13.72466],
    [45.54702, 13.72407],
    [45.54780, 13.72384],
    [45.54780, 13.72372],
    [45.54700, 13.72401],
    [45.54644, 13.72461],
    [45.54295, 13.71985],
    [45.54287, 13.71881],
    [45.54399, 13.71713],
    [45.54392, 13.71657],
    [45.54562, 13.71409],
    [45.54582, 13.71410],
    [45.54601, 13.71384],
    [45.54573, 13.71353],
    [45.54573, 13.71298],
    [45.54680, 13.71050],
    [45.54670, 13.71010],
    [45.54694, 13.70934],
    [45.54683, 13.70854],
    [45.54711, 13.70719],
    [45.54717, 13.70532],
    [45.54736, 13.70533],
    [45.54717, 13.70529],
    [45.54722, 13.70491],
    [45.54739, 13.70496],
    [45.54737, 13.70527],
    [45.54742, 13.70494],
    [45.54723, 13.70489],
    [45.54808, 13.70118],
    [45.54801, 13.69355],
    [45.54827, 13.69155],
    [45.54820, 13.69082],
    [45.54616, 13.68318],
    [45.54584, 13.68029],
    [45.54505, 13.67797],
    [45.54448, 13.67722],
    [45.54266, 13.67573],
    [45.54198, 13.67495],
    [45.54052, 13.67197],
    [45.53913, 13.67021],
    [45.53890, 13.66922],
    [45.53883, 13.66856],
    [45.53986, 13.66454],
    [45.53997, 13.66484],
    [45.54001, 13.66453],
    [45.54001, 13.66490],
    [45.54005, 13.66456],
    [45.54224, 13.66450],
    [45.54223, 13.66435],
    [45.54159, 13.66438],
    [45.54164, 13.66395],
    [45.54132, 13.66382],
    [45.54150, 13.66317],
    [45.54161, 13.66307],
    [45.54169, 13.66326],
    [45.54203, 13.66321],
    [45.54218, 13.66296],
    [45.54215, 13.66221],
    [45.54186, 13.66145],
    [45.54214, 13.65978],
    [45.54198, 13.65879],
    [45.54210, 13.65855],
    [45.54193, 13.65848],
    [45.54171, 13.65707],
    [45.54174, 13.65594],
    [45.54148, 13.65576],
    [45.54100, 13.65627],
    [45.54024, 13.65618],
    [45.53975, 13.65640],
    [45.53940, 13.65636],
    [45.53933, 13.65513],
    [45.53921, 13.65515],
    [45.53928, 13.65632],
    [45.53872, 13.65610],
    [45.53745, 13.65411],
    [45.53716, 13.65223],
    [45.53704, 13.65212],
    [45.53695, 13.65232],
    [45.53731, 13.65415],
    [45.53852, 13.65612],
    [45.53846, 13.65642],
    [45.53876, 13.65632],
    [45.53890, 13.65643],
    [45.53892, 13.65699],
    [45.53849, 13.65718],
    [45.53835, 13.65689],
    [45.53839, 13.65646],
    [45.53824, 13.65674],
    [45.53741, 13.65725],
    [45.53676, 13.65876],
    [45.53578, 13.65788],
    [45.53580, 13.65753],
    [45.53533, 13.65714],
    [45.53540, 13.65695],
    [45.53531, 13.65714],
    [45.53501, 13.65686],
    [45.53487, 13.65693],
    [45.53502, 13.65617],
    [45.53492, 13.65592],
    [45.53473, 13.65599],
    [45.53487, 13.65584],
    [45.53407, 13.65385],
    [45.53364, 13.65396],
    [45.53344, 13.65345],
    [45.53365, 13.65276],
    [45.53378, 13.65102],
    [45.53418, 13.65102],
    [45.53420, 13.64996],
    [45.53584, 13.64990],
    [45.53646, 13.65367],
    [45.53637, 13.65384],
    [45.53649, 13.65391],
    [45.53663, 13.65373],
    [45.53606, 13.64970],
    [45.53478, 13.64968],
    [45.53449, 13.64943],
    [45.53450, 13.64978],
    [45.53403, 13.64972],
    [45.53391, 13.64875],
    [45.53411, 13.64862],
    [45.53386, 13.64863],
    [45.53385, 13.64657],
    [45.53328, 13.64631],
    [45.53236, 13.64520],
    [45.53213, 13.64525],
    [45.53186, 13.64426],
    [45.53245, 13.64118],
    [45.53322, 13.63958],
    [45.53334, 13.63893],
    [45.53323, 13.63798],
    [45.53281, 13.63690],
    [45.53274, 13.63556],
    [45.53299, 13.63260],
    [45.53362, 13.62973],
    [45.53549, 13.62468],
    [45.53534, 13.62400],
    [45.53623, 13.62207],
    [45.53773, 13.61955],
    [45.53876, 13.61852],
    [45.53977, 13.61700],
    [45.54000, 13.61370],
    [45.53971, 13.61297],
    [45.53884, 13.61261],
    [45.53813, 13.61202],
    [45.53762, 13.61104],
    [45.53746, 13.60941],
    [45.53781, 13.60785],
    [45.53794, 13.60614],
    [45.53772, 13.60427],
    [45.53731, 13.60252],
    [45.53693, 13.60184],
    [45.53576, 13.60225],
    [45.53475, 13.60192],
    [45.53339, 13.60097],
    [45.53241, 13.60064],
    [45.53238, 13.60043],
    [45.53234, 13.60064],
    [45.53120, 13.60077],
    [45.53105, 13.60042],
    [45.53109, 13.60101],
    [45.53076, 13.60125],
    [45.53080, 13.60137],
    [45.53036, 13.60153],
    [45.52881, 13.60310],
    [45.52831, 13.60338],
    [45.52817, 13.60334],
    [45.52817, 13.60303],
    [45.52801, 13.60371],
    [45.52787, 13.60368],
    [45.52789, 13.60315],
    [45.52664, 13.60220],
    [45.52672, 13.60189],
    [45.52658, 13.60225],
    [45.52643, 13.60215],
    [45.52649, 13.60191],
    [45.52597, 13.60167],
    [45.52588, 13.60087],
    [45.52541, 13.59974],
    [45.52558, 13.59907],
    [45.52607, 13.59817],
    [45.52642, 13.59629],
    [45.52651, 13.59255],
    [45.52610, 13.59137],
    [45.52573, 13.59097],
    [45.52569, 13.59057],
    [45.52617, 13.58868],
    [45.52628, 13.58742],
    [45.52622, 13.58399],
    [45.52588, 13.58343],
    [45.52569, 13.58248],
    [45.52550, 13.58274],
    [45.52538, 13.58251],
    [45.52516, 13.58105],
    [45.52552, 13.57986],
    [45.52857, 13.57401],
    [45.52991, 13.56860],
    [45.53024, 13.56631],
    [45.53038, 13.56633],
    [45.53047, 13.56520],
    [45.53060, 13.56505],
    [45.53040, 13.56302],
    [45.53016, 13.56297],
    [45.52867, 13.56594],
    [45.52752, 13.56691],
    [45.52723, 13.56690],
    [45.52711, 13.56674],
    [45.52704, 13.56686],
    [45.52619, 13.56628],
    [45.52614, 13.56641],
    [45.52746, 13.56730],
    [45.52741, 13.56755],
    [45.52750, 13.56732],
    [45.52800, 13.56754],
    [45.52817, 13.56783],
    [45.52805, 13.56810],
    [45.52737, 13.56785],
    [45.52740, 13.56764],
    [45.52700, 13.56853],
    [45.52644, 13.56863],
    [45.52546, 13.56761],
    [45.52616, 13.56676],
    [45.52570, 13.56718],
    [45.52429, 13.56666],
    [45.52299, 13.56673],
    [45.52245, 13.56640],
    [45.52186, 13.56628],
    [45.52114, 13.56641],
    [45.51876, 13.56799],
    [45.51872, 13.56818],
    [45.51672, 13.56883],
    [45.51583, 13.57009],
    [45.51569, 13.57001],
    [45.51582, 13.57041],
    [45.51545, 13.57093],
    [45.51490, 13.57147],
    [45.51465, 13.57146],
    [45.51393, 13.57250],
    [45.51376, 13.57299],
    [45.51417, 13.57396],
    [45.51461, 13.57348],
    [45.51437, 13.57333],
    [45.51430, 13.57272],
    [45.51450, 13.57258],
    [45.51481, 13.57298],
    [45.51482, 13.57340],
    [45.51448, 13.57401],
    [45.51466, 13.57404],
    [45.51520, 13.57470],
    [45.51509, 13.57488],
    [45.51542, 13.57569],
    [45.51570, 13.57563],
    [45.51591, 13.57756],
    [45.51577, 13.57751],
    [45.51595, 13.57767],
    [45.51588, 13.57795],
    [45.51567, 13.57779],
    [45.51585, 13.57799],
    [45.51511, 13.57972],
    [45.51396, 13.58157],
    [45.51347, 13.58291],
    [45.51330, 13.58260],
    [45.51317, 13.58298],
    [45.51327, 13.58285],
    [45.51345, 13.58298],
    [45.51302, 13.58454],
    [45.51285, 13.58666],
    [45.51295, 13.58799],
    [45.51270, 13.58807],
    [45.51296, 13.58805],
    [45.51304, 13.58858],
    [45.51280, 13.58869],
    [45.51304, 13.58863],
    [45.51341, 13.58918],
    [45.51352, 13.59037],
    [45.51254, 13.58969],
    [45.51249, 13.58982],
    [45.51349, 13.59052],
    [45.51328, 13.59278],
    [45.51247, 13.59372],
    [45.51201, 13.59396],
    [45.51128, 13.59402],
    [45.50962, 13.59336],
    [45.50886, 13.59358],
    [45.50800, 13.59487],
    [45.50774, 13.59431],
    [45.50795, 13.59488],
    [45.50740, 13.59482],
    [45.50707, 13.59553],
    [45.50706, 13.59877],
    [45.50613, 13.60124],
    [45.50591, 13.60104],
    [45.50602, 13.60030],
    [45.50686, 13.59871],
    [45.50694, 13.59474],
    [45.50557, 13.59469],
    [45.50554, 13.59457],
    [45.50543, 13.59521],
    [45.50548, 13.59499],
    [45.50686, 13.59505],
    [45.50686, 13.59543],
    [45.50577, 13.59545],
    [45.50571, 13.59534],
    [45.50571, 13.59562],
    [45.50686, 13.59550],
    [45.50685, 13.59594],
    [45.50577, 13.59593],
    [45.50572, 13.59580],
    [45.50571, 13.59612],
    [45.50577, 13.59600],
    [45.50685, 13.59601],
    [45.50685, 13.59663],
    [45.50549, 13.59664],
    [45.50550, 13.59585],
    [45.50532, 13.59583],
    [45.50546, 13.59592],
    [45.50545, 13.59664],
    [45.50533, 13.59682],
    [45.50525, 13.59650],
    [45.50520, 13.59696],
    [45.50507, 13.59693],
    [45.50507, 13.59583],
    [45.50503, 13.59692],
    [45.50469, 13.59746],
    [45.50456, 13.59738],
    [45.50450, 13.59763],
    [45.50450, 13.59736],
    [45.50442, 13.59760],
    [45.50412, 13.59744],
    [45.50449, 13.59589],
    [45.50470, 13.59593],
    [45.50433, 13.59576],
    [45.50445, 13.59587],
    [45.50406, 13.59748],
    [45.50356, 13.59723],
    [45.50395, 13.59561],
    [45.50411, 13.59564],
    [45.50383, 13.59551],
    [45.50393, 13.59560],
    [45.50353, 13.59721],
    [45.50312, 13.59701],
    [45.50351, 13.59540],
    [45.50363, 13.59539],
    [45.50338, 13.59527],
    [45.50348, 13.59537],
    [45.50308, 13.59700],
    [45.50274, 13.59682],
    [45.50312, 13.59521],
    [45.50324, 13.59520],
    [45.50299, 13.59508],
    [45.50309, 13.59518],
    [45.50270, 13.59680],
    [45.50237, 13.59664],
    [45.50269, 13.59521],
    [45.50232, 13.59674],
    [45.50206, 13.59658],
    [45.50231, 13.59545],
    [45.50277, 13.59438],
    [45.50470, 13.59532],
    [45.50511, 13.59516],
    [45.50535, 13.59451],
    [45.50389, 13.59382],
    [45.50360, 13.59350],
    [45.50293, 13.59440],
    [45.50278, 13.59433],
    [45.50321, 13.59379],
    [45.50308, 13.59377],
    [45.50313, 13.59356],
    [45.50326, 13.59368],
    [45.50305, 13.59033],
    [45.50318, 13.59031],
    [45.50320, 13.58998],
    [45.50254, 13.58813],
    [45.50182, 13.58714],
    [45.50128, 13.58668],
    [45.50077, 13.58659],
    [45.50010, 13.58702],
    [45.49967, 13.58664],
    [45.49811, 13.58440],
    [45.49489, 13.58888],
    [45.49454, 13.58854],
    [45.49302, 13.58804],
    [45.49179, 13.58955],
    [45.49220, 13.59029],
    [45.48894, 13.59240],
    [45.48525, 13.59233],
    [45.48512, 13.59280],
    [45.48332, 13.59292],
    [45.48340, 13.59245],
    [45.47929, 13.58989],
    [45.47921, 13.58967],
    [45.48007, 13.58846],
    [45.47849, 13.58573],
    [45.47454, 13.59039],
    [45.47329, 13.59225],
    [45.47228, 13.59041],
    [45.47228, 13.59006],
    [45.47268, 13.58987],
    [45.47305, 13.58937],
    [45.47308, 13.58802],
    [45.47383, 13.58792],
    [45.47405, 13.58768],
    [45.47433, 13.58636],
    [45.47518, 13.58622],
    [45.47605, 13.58528],
    [45.47602, 13.58475],
    [45.47571, 13.58403],
    [45.47608, 13.58351],
    [45.47631, 13.58204],
    [45.47652, 13.58189],
    [45.47724, 13.58268],
    [45.47757, 13.58263],
    [45.47751, 13.58110],
    [45.47776, 13.58077],
    [45.47831, 13.58100],
    [45.47850, 13.58081],
    [45.47867, 13.58029],
    [45.47864, 13.57901],
    [45.47883, 13.57876],
    [45.47988, 13.57841],
    [45.48005, 13.57714],
    [45.48088, 13.57591],
    [45.48057, 13.57488],
    [45.48096, 13.57456],
    [45.48114, 13.57367],
    [45.48207, 13.57332],
    [45.48274, 13.57086],
    [45.48334, 13.57021],
    [45.48467, 13.56724],
    [45.48512, 13.56712],
    [45.48537, 13.56665],
    [45.48548, 13.56681],
    [45.48537, 13.56646],
    [45.48556, 13.56604],
    [45.48574, 13.56622],
    [45.48566, 13.56586],
    [45.48684, 13.56263],
    [45.48717, 13.56181],
    [45.48752, 13.56161],
    [45.48766, 13.56125],
    [45.48795, 13.55957],
    [45.48819, 13.55926],
    [45.48833, 13.55939],
    [45.48863, 13.55881],
    [45.48940, 13.55815],
    [45.49015, 13.55684],
    [45.49260, 13.55038],
    [45.49360, 13.54565],
    [45.49487, 13.54194],
    [45.49548, 13.54080],
    [45.49579, 13.53950],
    [45.49653, 13.53789],
    [45.49789, 13.53364],
    [45.49883, 13.53175],
    [45.49870, 13.53131],
    [45.49917, 13.53096],
    [45.50003, 13.52905],
    [45.50029, 13.52768],
    [45.50021, 13.52729],
    [45.50038, 13.52674],
    [45.50066, 13.52665],
    [45.50084, 13.52625],
    [45.50068, 13.52487],
    [45.50149, 13.52356],
    [45.50167, 13.52248],
    [45.45000, 13.65000],
    [45.45000, 13.95000],
    [45.62000, 13.95000],
    [45.60500, 13.79734],
    [45.60370, 13.79734],
];



// =========================================================================
// SECTION 4: ROUTING ENGINE, GPS UI & CRUISE RECORDER
// =========================================================================

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
}

function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Precompute 100m dense interpolation along the 200m chain (~280 points)
function generateDenseCoastalChain(guideNodes, maxSpacingMeters) {
    const dense = [];
    for (let i = 0; i < guideNodes.length - 1; i++) {
        const pA = guideNodes[i];
        const pB = guideNodes[i + 1];
        const dist = haversineDistanceMeters(pA[0], pA[1], pB[0], pB[1]);
        const steps = Math.max(1, Math.ceil(dist / maxSpacingMeters));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const lat = pA[0] + t * (pB[0] - pA[0]);
            const lon = pA[1] + t * (pB[1] - pA[1]);
            dense.push([lat, lon]);
        }
    }
    dense.push(guideNodes[guideNodes.length - 1]);
    return dense;
}

const SLO_COAST_200M_CHAIN = generateDenseCoastalChain(SLO_COAST_200M_GUIDE_NODES, 50);

function segmentsIntersect2D(lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4) {
    function ccw(ax, ay, bx, by, cx, cy) {
        return ((cy - ay) * (bx - ax)) - ((by - ay) * (cx - ax));
    }
    const ccw1 = ccw(lon1, lat1, lon3, lat3, lon4, lat4);
    const ccw2 = ccw(lon2, lat2, lon3, lat3, lon4, lat4);
    const ccw3 = ccw(lon1, lat1, lon2, lat2, lon3, lat3);
    const ccw4 = ccw(lon1, lat1, lon2, lat2, lon4, lat4);
    return ((ccw1 * ccw2 < 0) && (ccw3 * ccw4 < 0));
}

function isPointInPolygon(lat, lon, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > lon) !== (yj > lon)) && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function distToSegmentMeters(lat, lon, lat1, lon1, lat2, lon2) {
    const lat0 = (lat1 + lat2) / 2.0;
    const mPerLat = 111139.0;
    const mPerLon = 111139.0 * Math.cos(lat0 * Math.PI / 180.0);

    const px = (lon - lon1) * mPerLon;
    const py = (lat - lat1) * mPerLat;
    const sx = (lon2 - lon1) * mPerLon;
    const sy = (lat2 - lat1) * mPerLat;

    const segLenSq = sx * sx + sy * sy;
    if (segLenSq < 1e-6) return Math.sqrt(px * px + py * py);

    let t = (px * sx + py * sy) / segLenSq;
    t = Math.max(0.0, Math.min(1.0, t));

    const projX = t * sx;
    const projY = t * sy;
    const dx = px - projX;
    const dy = py - projY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getMinDistanceToCoastMeters(lat, lon) {
    if (isPointInPolygon(lat, lon, SLO_COASTLINE_POLYGON)) return 0;
    let minDist = Infinity;
    for (let i = 0; i < SLO_COASTLINE_POLYGON.length - 1; i++) {
        const pA = SLO_COASTLINE_POLYGON[i];
        const pB = SLO_COASTLINE_POLYGON[i + 1];
        const d = distToSegmentMeters(lat, lon, pA[0], pA[1], pB[0], pB[1]);
        if (d < minDist) minDist = d;
    }
    return minDist;
}

// Strogo preverjanje bližnjice: dovoljena IZKLJUČNO na zunanji (morski) strani!
function canChordSeaward(lat1, lon1, lat2, lon2, polyCoast, chain, fromIdx, toIdx) {
    // 1. Ne sme sekati suhega kopna (0m obala)
    for (let i = 0; i < polyCoast.length - 1; i++) {
        if (segmentsIntersect2D(lat1, lon1, lat2, lon2, polyCoast[i][0], polyCoast[i][1], polyCoast[i + 1][0], polyCoast[i + 1][1])) {
            return false;
        }
    }

    // 2. Preverjanje smeri (morska vs. kopenska stran):
    // Vzdolž slovenske obale (od severa proti jugu) je kopno na LEVI, odprto morje na DESNI.
    // Če potujemo naprej (fromIdx < toIdx):
    // Bližnjica čez zaliv poteka po morski strani, če so vse vmesne točke na LEVI strani (ccw > 0).
    // Če je katerakoli vmesna točka na DESNI strani (ccw < 0), to pomeni, da daljica seka ovinek po KOPENSKI strani (prepovedano)!
    if (fromIdx !== null && toIdx !== null && chain && chain.length > 0) {
        const minI = Math.min(fromIdx, toIdx);
        const maxI = Math.max(fromIdx, toIdx);
        const forward = (fromIdx <= toIdx);

        for (let s = minI; s < maxI; s++) {
            if (s === minI || s === maxI - 1) continue;
            if (segmentsIntersect2D(lat1, lon1, lat2, lon2, chain[s][0], chain[s][1], chain[s + 1][0], chain[s + 1][1])) {
                return false;
            }
        }

        // Vector A->B: dx = lon2 - lon1, dy = lat2 - lat1
        // Vector A->K: dx_k = chain[k][1] - lon1, dy_k = chain[k][0] - lat1
        // 2D Cross product: (dx * dy_k) - (dy * dx_k)
        // Traversal N->S (forward): land on left (cross > 0), sea on right (cross < 0).
        // If an intermediate point K has cross < -1e-9, K is on seaward side of chord => chord cuts behind cape landward => REJECT!
        // Traversal S->N (!forward): land on right (cross < 0), sea on left (cross > 0).
        // If an intermediate point K has cross > 1e-9, K is on seaward side of chord => chord cuts behind cape landward => REJECT!
        for (let k = minI + 1; k < maxI; k++) {
            const dx = lon2 - lon1;
            const dy = lat2 - lat1;
            const dx_k = chain[k][1] - lon1;
            const dy_k = chain[k][0] - lat1;
            const cross = (dx * dy_k) - (dy * dx_k);
            if (forward && cross < -1e-9) {
                return false; // Seče po notranji (kopenski) strani rta
            } else if (!forward && cross > 1e-9) {
                return false;
            }
        }
    }

    // 3. Razdalja od obale vzdolž celotne daljice ne sme pasti pod 190m
    const totalDist = haversineDistanceMeters(lat1, lon1, lat2, lon2);
    const steps = Math.max(2, Math.ceil(totalDist / 50.0));
    for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const lat = lat1 + t * (lat2 - lat1);
        const lon = lon1 + t * (lon2 - lon1);
        if (getMinDistanceToCoastMeters(lat, lon) < 190.0) {
            return false;
        }
    }

    // 4. Središče daljice ne sme biti na kopnem
    const midLat = (lat1 + lat2) / 2.0;
    const midLon = (lon1 + lon2) / 2.0;
    if (isPointInPolygon(midLat, midLon, polyCoast)) {
        return false;
    }

    return true;
}

function hasLineOfSight(lat1, lon1, lat2, lon2) {
    return canChordSeaward(lat1, lon1, lat2, lon2, SLO_COASTLINE_POLYGON, null, null, null);
}

// Zagotovi, da točka ni na suhem (če je uporabnik kliknil na kopno/obalo, jo projicira v vodo)
function ensureWaterPoint(lat, lon) {
    if (!isPointInPolygon(lat, lon, SLO_COASTLINE_POLYGON)) return [lat, lon];
    const mPerLat = 111139.0;
    const mPerLon = 77900.0;
    for (let d = 20; d <= 400; d += 20) {
        for (let ang = 0; ang < 360; ang += 15) {
            const r = ang * Math.PI / 180.0;
            const tLat = lat + (Math.sin(r) * d) / mPerLat;
            const tLon = lon + (Math.cos(r) * d) / mPerLon;
            if (!isPointInPolygon(tLat, tLon, SLO_COASTLINE_POLYGON)) {
                return [tLat, tLon];
            }
        }
    }
    return [lat, lon];
}

// Poišče 2 najbližji točki na gosti verigi (500+ točk) in izbere tisto, ki je v smeri cilja (brez obračanja nazaj)
function findSmartEntryNode(lat, lon, targetDestIdx, chain) {
    let c1 = 0, c2 = 1;
    let d1 = Infinity, d2 = Infinity;
    for (let i = 0; i < chain.length; i++) {
        const d = haversineDistanceMeters(lat, lon, chain[i][0], chain[i][1]);
        if (d < d1) {
            d2 = d1; c2 = c1;
            d1 = d; c1 = i;
        } else if (d < d2) {
            d2 = d; c2 = i;
        }
    }

    if (targetDestIdx > Math.min(c1, c2)) {
        return Math.max(c1, c2); // Smer naprej proti cilju
    } else {
        return Math.min(c1, c2); // Smer nazaj proti cilju
    }
}

// Izračun varne pomorske poti z uporabo goste 200m verige (500+ točk)
function getSafeMarineSegment(lat1, lon1, lat2, lon2, useRules) {
    if (!useRules) {
        return [[lat1, lon1], [lat2, lon2]];
    }

    const pStart = ensureWaterPoint(lat1, lon1);
    const pDest = ensureWaterPoint(lat2, lon2);
    const chain = SLO_COAST_200M_CHAIN;

    const startDistToCoast = getMinDistanceToCoastMeters(pStart[0], pStart[1]);
    const isStartOutside200 = (startDistToCoast >= 200.0);

    // 1. Določi najbližjo točko na gosti 200m verigi za cilj
    let idxB = -1;
    let minDB = Infinity;
    for (let i = 0; i < chain.length; i++) {
        const dB = haversineDistanceMeters(pDest[0], pDest[1], chain[i][0], chain[i][1]);
        if (dB < minDB) {
            minDB = dB;
            idxB = i;
        }
    }

    // 2. Določi pametno vstopno točko na 200m koridor izmed 2 najbližjih v smeri cilja
    const idxA = findSmartEntryNode(pStart[0], pStart[1], idxB, chain);

    // Če med točkama obstaja neovirana direktna linija po varnem odprtem morju, pluje direktno
    if (canChordSeaward(pStart[0], pStart[1], pDest[0], pDest[1], SLO_COASTLINE_POLYGON, chain, idxA, idxB)) {
        return [pStart, pDest];
    }

    // Podveriga točk od vstopa (idxA) do izstopa (idxB)
    const subChainIndices = [];
    const step = (idxA <= idxB) ? 1 : -1;
    for (let i = idxA; i !== idxB + step; i += step) {
        subChainIndices.push(i);
    }

    const route = [pStart];
    let curr = 0;

    // Če je start že na odprtem morju (izven 200m pasu), se ne vrača nazaj na obalno točko idxA,
    // temveč poišče najbolj oddaljeno točko naprej na verigi, ki jo lahko doseže naravnost po odprtem morju!
    if (isStartOutside200) {
        let bestStartConnect = 0;
        for (let k = subChainIndices.length - 1; k >= 0; k--) {
            const nodeK = subChainIndices[k];
            if (canChordSeaward(pStart[0], pStart[1], chain[nodeK][0], chain[nodeK][1], SLO_COASTLINE_POLYGON, chain, idxA, nodeK)) {
                bestStartConnect = k;
                break;
            }
        }
        route.push(chain[subChainIndices[bestStartConnect]]);
        curr = bestStartConnect;
    } else {
        route.push(chain[subChainIndices[0]]);
        curr = 0;
    }

    // Vodenje po 200m liniji:
    // - Išče najbolj oddaljeno točko naprej, do katere lahko zapluje naravnost po ZUNANJI (morski) strani.
    // - Po NOTRANJI (kopenski) strani je preskakovanje točk strogo blokirano!
    while (curr < subChainIndices.length - 1) {
        const nodeFrom = subChainIndices[curr];
        if (canChordSeaward(chain[nodeFrom][0], chain[nodeFrom][1], pDest[0], pDest[1], SLO_COASTLINE_POLYGON, chain, nodeFrom, idxB)) {
            break;
        }

        let furthest = curr + 1;
        for (let k = subChainIndices.length - 1; k > curr + 1; k--) {
            const nodeTo = subChainIndices[k];
            if (canChordSeaward(chain[nodeFrom][0], chain[nodeFrom][1], chain[nodeTo][0], chain[nodeTo][1], SLO_COASTLINE_POLYGON, chain, nodeFrom, nodeTo)) {
                furthest = k;
                break;
            }
        }
        route.push(chain[subChainIndices[furthest]]);
        curr = furthest;
    }

    route.push(pDest);
    return route;
}

// 3-Tab Main Tab Switching
function setActiveMainTab(tabName) {
    activeMainTab = tabName;
    
    // 1. Update Tab Bar Buttons
    const btnTides = document.getElementById('btn-tab-tides');
    const btnWeather = document.getElementById('btn-tab-weather');
    const btnNav = document.getElementById('btn-tab-nav');
    
    if (btnTides) btnTides.classList.toggle('active', tabName === 'plimovanje');
    if (btnWeather) btnWeather.classList.toggle('active', tabName === 'vreme');
    if (btnNav) btnNav.classList.toggle('active', tabName === 'navigacija');
    
    // 2. Update Tab Panes
    const paneTides = document.getElementById('pane-tides');
    const paneWeather = document.getElementById('pane-weather');
    const paneNav = document.getElementById('pane-navigation');
    
    if (paneTides) {
        paneTides.classList.toggle('active', tabName === 'plimovanje');
        paneTides.style.display = tabName === 'plimovanje' ? 'flex' : 'none';
    }
    if (paneWeather) {
        paneWeather.classList.toggle('active', tabName === 'vreme');
        paneWeather.style.display = tabName === 'vreme' ? 'flex' : 'none';
    }
    if (paneNav) {
        paneNav.classList.toggle('active', tabName === 'navigacija');
        paneNav.style.display = tabName === 'navigacija' ? 'flex' : 'none';
    }
    
    // 3. Manage GPS & Sensor Tracking Lifecycle
    if (tabName === 'navigacija') {
        startGpsNavigation(true);
        setTimeout(() => {
            initNavMap();
            if (navMap) {
                navMap.invalidateSize();
            }
        }, 120);
    } else if (!isCruiseActive) {
        stopGpsNavigation();
    }
    
    // 4. If returning to Plimovanje chart, trigger reflow to fix Highcharts sizing
    if (tabName === 'plimovanje' && currentChart) {
        setTimeout(() => {
            if (currentChart) {
                currentChart.reflow();
            }
        }, 60);
    }
}
window.setActiveMainTab = setActiveMainTab;

// Format decimal coordinates to Nautical DMM format: DD° MM.mmm' N/S & DDD° MM.mmm' E/W
function formatNauticalCoord(degDec, isLat) {
    if (degDec === null || degDec === undefined || isNaN(degDec)) {
        return isLat ? "--° --.---' N" : "---° --.---' E";
    }
    const absVal = Math.abs(degDec);
    const degrees = Math.floor(absVal);
    const minutes = (absVal - degrees) * 60;
    const hemisphere = isLat ? (degDec >= 0 ? 'N' : 'S') : (degDec >= 0 ? 'E' : 'W');
    const degStr = isLat ? String(degrees).padStart(2, '0') : String(degrees).padStart(3, '0');
    const minStr = minutes.toFixed(3).padStart(6, '0');
    return `${degStr}° ${minStr}' ${hemisphere}`;
}

// Calculate shortest angular difference between two angles in degrees (-180 to +180)

// Convert degrees to 16-point cardinal compass text
function getHeadingCardinal(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "--";
    const cardinals = ["S", "SSV", "SV", "VSV", "V", "VJV", "JV", "JJV", "J", "JJZ", "JZ", "ZJZ", "Z", "ZSZ", "SZ", "SSZ"];
    const normalized = (deg % 360 + 360) % 360;
    const idx = Math.round(normalized / 22.5) % 16;
    return cardinals[idx];
}

// Device Orientation Tracker with Magnetic Declination Correction
function handleDeviceOrientation(event) {
    let heading = null;
    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
        heading = (360 - event.alpha) % 360;
    }

    if (heading !== null && !isNaN(heading)) {
        phoneMagneticHeading = (heading + MAGNETIC_DECLINATION_SLOVENIA + 360) % 360;
        updateCompassOrientation();
    }
}

function updateCompassOrientation() {
    try {
        // 1. Rotate the compass dial smoothly with shortest-angle unwrapping
        const targetDial = -phoneMagneticHeading;
        currentDialAngle += getShortestAngleDelta(currentDialAngle, targetDial);
        const compassDial = document.getElementById('compass-dial-group');
        if (compassDial) {
            compassDial.style.transform = `rotate(${currentDialAngle}deg)`;
        }

        // 2. Rotate the GPS COG pointer relative to the dial
        const compassNeedle = document.getElementById('compass-needle-group');
        if (compassNeedle) {
            if (lastGpsHeading !== null && lastGpsSpeedKnots >= 0.4) {
                const targetNeedle = (lastGpsHeading - phoneMagneticHeading);
                currentNeedleAngle += getShortestAngleDelta(currentNeedleAngle, targetNeedle);
                compassNeedle.style.transform = `rotate(${currentNeedleAngle}deg)`;
                compassNeedle.style.opacity = '1';
            } else {
                compassNeedle.style.opacity = '0.35';
            }
        }

        // 3. In stationary mode (< 0.4 kt), show current phone magnetic heading on the compass center
        const headingDegEl = document.getElementById('nav-heading-deg');
        const headingCardEl = document.getElementById('nav-heading-cardinal');
        if (lastGpsSpeedKnots < 0.4 && headingDegEl) {
            if (phoneMagneticHeading !== null && !isNaN(phoneMagneticHeading)) {
                headingDegEl.textContent = `${Math.round(phoneMagneticHeading)}°`;
                headingDegEl.classList.remove('status-text');
                if (headingCardEl) {
                    headingCardEl.textContent = getHeadingCardinal(phoneMagneticHeading);
                }
            } else {
                headingDegEl.textContent = 'MIROVANJE';
                headingDegEl.classList.add('status-text');
                if (headingCardEl) headingCardEl.textContent = '';
            }
        }
    } catch (e) {
        console.warn('Compass orientation update error:', e);
    }
}

function requestCompassPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    startOrientationTracking();
                } else {
                    console.warn('Compass permission state:', permissionState);
                }
            })
            .catch(err => {
                console.warn('DeviceOrientation permission error:', err);
                startOrientationTracking();
            });
    } else {
        startOrientationTracking();
    }
}
window.requestCompassPermission = requestCompassPermission;

function startOrientationTracking() {
    if (orientationActive) return;

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                    orientationActive = true;
                }
            })
            .catch(err => console.warn('DeviceOrientation permission request deferred:', err));
    } else if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        orientationActive = true;
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        orientationActive = true;
    }
}

function stopOrientationTracking() {
    if (!orientationActive) return;
    window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    orientationActive = false;
}

// Share current nautical coordinates via native Web Share API
function shareCurrentLocation() {
    if (!lastGpsCoords) {
        alert('GPS lokacija še ni pridobljena. Preverite, da je GPS vklopljen.');
        return;
    }
    const lat = lastGpsCoords.latitude;
    const lon = lastGpsCoords.longitude;
    const dmmLat = formatNauticalCoord(lat, true);
    const dmmLon = formatNauticalCoord(lon, false);
    const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
    const shareText = `Moja trenutna lokacija na morju:\n${dmmLat}, ${dmmLon}\n(${lat.toFixed(5)}°, ${lon.toFixed(5)}°)\n${mapsUrl}`;

    if (navigator.share) {
        navigator.share({
            title: 'Moja lokacija na morju',
            text: `Moja lokacija: ${dmmLat}, ${dmmLon}`,
            url: mapsUrl
        }).catch(err => {
            if (err.name !== 'AbortError') {
                copyTextToClipboard(shareText);
            }
        });
    } else {
        copyTextToClipboard(shareText);
    }
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Lokacija s koordinatami in povezavo je kopirana v odložišče!');
        }).catch(() => {
            prompt('Kopirajte koordinate:', text);
        });
    } else {
        prompt('Kopirajte koordinate:', text);
    }
}
window.shareCurrentLocation = shareCurrentLocation;

//// Official S-57 ENC Digital Nautical Chart Datasets & Hydrographic Features (IHO S-57 / INT-1)
// 1. S-57 Depth Contours (DEPCNT: Zvezne izobate 2m, 5m, 10m, 15m, 20m, 25m, 30m)
const NAUTICAL_ISOBATHS = [
    {
        depth: '2m',
        name: 'Izobata 2 m (Obalna plitvina)',
        color: '#38bdf8',
        weight: 1.3,
        dashArray: '4, 4',
        opacity: 0.65,
        lines: [
            // Greben Debeli rtič
            [[45.5955, 13.7080], [45.5942, 13.7020], [45.5930, 13.6965], [45.5918, 13.6948], [45.5902, 13.6960], [45.5895, 13.7010], [45.5908, 13.7070], [45.5925, 13.7110]],
            // Koprski zaliv & Žusterna & Viližan
            [[45.5840, 13.7120], [45.5780, 13.7190], [45.5720, 13.7250], [45.5650, 13.7290], [45.5560, 13.7310], [45.5500, 13.7220], [45.5485, 13.7120], [45.5480, 13.7020], [45.5490, 13.6900], [45.5495, 13.6780], [45.5470, 13.6710]],
            // Izola (Rt Petelin, Marina, Simonov zaliv, Rt Ronek)
            [[45.5430, 13.6680], [45.5445, 13.6580], [45.5430, 13.6520], [45.5400, 13.6470], [45.5385, 13.6410], [45.5375, 13.6330], [45.5382, 13.6240], [45.5390, 13.6170]],
            // Strunjanski zaliv & Mesečev zaliv & Pacug
            [[45.5392, 13.6120], [45.5380, 13.6020], [45.5350, 13.5995], [45.5332, 13.5992], [45.5312, 13.5940], [45.5298, 13.5870], [45.5280, 13.5810], [45.5270, 13.5760]],
            // Piran Punta (Rt Madona, Mandrač, Bernardin)
            [[45.5285, 13.5700], [45.5298, 13.5660], [45.5304, 13.5642], [45.5292, 13.5628], [45.5275, 13.5645], [45.5255, 13.5680], [45.5220, 13.5715]],
            // Portorož & Piranski zaliv & Sečovlje
            [[45.5185, 13.5765], [45.5140, 13.5850], [45.5110, 13.5910], [45.5075, 13.5960], [45.5010, 13.5965], [45.4950, 13.5920], [45.4900, 13.5830], [45.4870, 13.5720]]
        ],
        labelPositions: [
            [45.5925, 13.6965],
            [45.5720, 13.7250],
            [45.5400, 13.6470],
            [45.5380, 13.6020],
            [45.5304, 13.5642],
            [45.5075, 13.5960]
        ]
    },
    {
        depth: '5m',
        name: 'Izobata 5 m',
        color: '#0284c7',
        weight: 1.4,
        dashArray: '6, 4',
        opacity: 0.70,
        lines: [
            // Debeli rtič
            [[45.5975, 13.7080], [45.5955, 13.6980], [45.5942, 13.6920], [45.5910, 13.6905], [45.5870, 13.6940], [45.5835, 13.7020], [45.5810, 13.7080]],
            // Koprski zaliv / Luka Koper / Žusterna
            [[45.5780, 13.7140], [45.5700, 13.7210], [45.5620, 13.7220], [45.5560, 13.7160], [45.5515, 13.7010], [45.5525, 13.6880], [45.5510, 13.6760]],
            // Izola / Rt Ronek
            [[45.5465, 13.6650], [45.5480, 13.6550], [45.5460, 13.6460], [45.5440, 13.6380], [45.5422, 13.6260], [45.5420, 13.6150]],
            // Strunjan / Mesečev zaliv / Pacug
            [[45.5420, 13.6100], [45.5405, 13.5980], [45.5370, 13.5890], [45.5348, 13.5810], [45.5330, 13.5720]],
            // Piran Punta (Rt Madona)
            [[45.5320, 13.5660], [45.5318, 13.5630], [45.5290, 13.5595], [45.5260, 13.5620], [45.5230, 13.5655], [45.5200, 13.5690]],
            // Portorož / Piranski zaliv
            [[45.5165, 13.5730], [45.5115, 13.5820], [45.5060, 13.5865], [45.4980, 13.5850], [45.4920, 13.5760], [45.4880, 13.5640]]
        ],
        labelPositions: [
            [45.5942, 13.6920],
            [45.5700, 13.7210],
            [45.5460, 13.6460],
            [45.5405, 13.5980],
            [45.5290, 13.5595],
            [45.5060, 13.5865]
        ]
    },
    {
        depth: '10m',
        name: 'Izobata 10 m',
        color: '#0369a1',
        weight: 1.5,
        dashArray: '8, 4',
        opacity: 0.75,
        lines: [
            // Debeli rtič & Koper zunanji bazen
            [[45.6010, 13.6920], [45.5940, 13.6845], [45.5860, 13.6870], [45.5780, 13.6960], [45.5680, 13.7080], [45.5600, 13.7080], [45.5565, 13.6820]],
            // Koprski zaliv sredina / Rex / Izola sever
            [[45.5550, 13.6680], [45.5535, 13.6520], [45.5500, 13.6360], [45.5475, 13.6200], [45.5460, 13.6050]],
            // Strunjanski klif / Mesečev zaliv / Pacug
            [[45.5450, 13.5950], [45.5420, 13.5800], [45.5385, 13.5680], [45.5365, 13.5610]],
            // Piran Punta (Rt Madona)
            [[45.5350, 13.5585], [45.5310, 13.5535], [45.5255, 13.5545], [45.5205, 13.5580], [45.5170, 13.5620]],
            // Piranski zaliv vhod (pri gojišču Fonda)
            [[45.5125, 13.5650], [45.5060, 13.5690], [45.4990, 13.5660], [45.4930, 13.5570], [45.4880, 13.5420]]
        ],
        labelPositions: [
            [45.5940, 13.6845],
            [45.5535, 13.6520],
            [45.5450, 13.5950],
            [45.5310, 13.5535],
            [45.5060, 13.5690]
        ]
    },
    {
        depth: '15m',
        name: 'Izobata 15 m',
        color: '#075985',
        weight: 1.6,
        opacity: 0.80,
        lines: [
            [[45.6055, 13.6780], [45.5930, 13.6710], [45.5810, 13.6760], [45.5690, 13.6680], [45.5610, 13.6480], [45.5565, 13.6260], [45.5520, 13.5980], [45.5470, 13.5710], [45.5405, 13.5510], [45.5320, 13.5450], [45.5230, 13.5455], [45.5120, 13.5475], [45.5010, 13.5430], [45.4900, 13.5280], [45.4840, 13.5120]]
        ],
        labelPositions: [
            [45.5930, 13.6710],
            [45.5610, 13.6480],
            [45.5520, 13.5980],
            [45.5320, 13.5450]
        ]
    },
    {
        depth: '20m',
        name: 'Izobata 20 m',
        color: '#0c4a6e',
        weight: 1.7,
        opacity: 0.85,
        lines: [
            [[45.6140, 13.6580], [45.6000, 13.6510], [45.5860, 13.6540], [45.5720, 13.6410], [45.5635, 13.6120], [45.5570, 13.5750], [45.5480, 13.5430], [45.5390, 13.5330], [45.5280, 13.5310], [45.5150, 13.5330], [45.5030, 13.5260], [45.4900, 13.5060], [45.4820, 13.4880]]
        ],
        labelPositions: [
            [45.6000, 13.6510],
            [45.5720, 13.6410],
            [45.5570, 13.5750],
            [45.5280, 13.5310]
        ]
    },
    {
        depth: '25m',
        name: 'Izobata 25 m (Osrednji bazen)',
        color: '#1e3a8a',
        weight: 1.8,
        opacity: 0.90,
        lines: [
            [[45.6220, 13.6330], [45.6060, 13.6260], [45.5910, 13.6210], [45.5760, 13.5930], [45.5650, 13.5510], [45.5550, 13.5220], [45.5420, 13.5120], [45.5280, 13.5080], [45.5120, 13.5070], [45.4960, 13.4890], [45.4830, 13.4650]]
        ],
        labelPositions: [
            [45.6060, 13.6260],
            [45.5760, 13.5930],
            [45.5420, 13.5120]
        ]
    }
];

// 2. S-57 Depth Soundings (SOUNDG: Točne uradne izmerjene točke globin)
const NAUTICAL_SOUNDINGS = [
    // Koprski zaliv & Debeli rtič
    { lat: 45.5925, lon: 13.6980, depth: '1.6', name: 'Greben Debeli rtič' },
    { lat: 45.5960, lon: 13.7080, depth: '3.8', name: 'Debeli rtič V' },
    { lat: 45.5880, lon: 13.7050, depth: '4.5', name: 'Valdoltra pličina' },
    { lat: 45.5820, lon: 13.7140, depth: '6.2', name: 'Valdoltra zaliv' },
    { lat: 45.5740, lon: 13.7250, depth: '7.5', name: 'Ankaran zaliv' },
    { lat: 45.5650, lon: 13.7200, depth: '12.0', name: 'Luka Koper zunanji bazen' },
    { lat: 45.5560, lon: 13.7220, depth: '14.5', name: 'Luka Koper plovni kanal' },
    { lat: 45.5490, lon: 13.7170, depth: '4.2', name: 'Koper Mandrač vhod' },
    { lat: 45.5485, lon: 13.7050, depth: '2.4', name: 'Žusterna plitvina' },
    { lat: 45.5550, lon: 13.6950, depth: '9.8', name: 'Koprski zaliv - SS Rex' },
    { lat: 45.5680, lon: 13.6800, depth: '18.5', name: 'Koprski zaliv sredina' },
    { lat: 45.5800, lon: 13.6600, depth: '20.2', name: 'Koprski zaliv zahod' },

    // Izola & Simonov zaliv & Rt Ronek
    { lat: 45.5440, lon: 13.6760, depth: '6.5', name: 'Viližan' },
    { lat: 45.5460, lon: 13.6520, depth: '8.4', name: 'Izola severni greben' },
    { lat: 45.5420, lon: 13.6560, depth: '3.8', name: 'Izola marina vhod' },
    { lat: 45.5390, lon: 13.6420, depth: '3.1', name: 'Simonov zaliv' },
    { lat: 45.5410, lon: 13.6260, depth: '8.5', name: 'Bele skale' },
    { lat: 45.5430, lon: 13.6050, depth: '14.2', name: 'Rt Ronek klif' },
    { lat: 45.5490, lon: 13.6300, depth: '16.5', name: 'Pred Izolo odprto' },
    { lat: 45.5550, lon: 13.6000, depth: '21.0', name: 'Severno od Roneka' },

    // Strunjanski zaliv & Fiesa & Pacug
    { lat: 45.5385, lon: 13.6050, depth: '4.2', name: 'Mesečev zaliv' },
    { lat: 45.5340, lon: 13.5970, depth: '2.8', name: 'Strunjan vhodni kanal' },
    { lat: 45.5360, lon: 13.5850, depth: '11.2', name: 'Strunjanski zaliv sredina' },
    { lat: 45.5290, lon: 13.5820, depth: '5.0', name: 'Pacug' },
    { lat: 45.5300, lon: 13.5720, depth: '6.2', name: 'Fiesa zaliv' },
    { lat: 45.5380, lon: 13.5650, depth: '18.0', name: 'Severno od Fiese' },

    // Piran Punta & Bernardin & Fornače
    { lat: 45.5295, lon: 13.5615, depth: '2.1', name: 'Punta Piran greben' },
    { lat: 45.5320, lon: 13.5590, depth: '7.5', name: 'Punta Piran pličina' },
    { lat: 45.5270, lon: 13.5660, depth: '4.8', name: 'Piran mandrač' },
    { lat: 45.5220, lon: 13.5620, depth: '9.5', name: 'Jugozahodno od Pirana' },
    { lat: 45.5160, lon: 13.5680, depth: '5.5', name: 'Bernardin pomol' },
    { lat: 45.5140, lon: 13.5750, depth: '6.8', name: 'Portoroški zaliv sever' },

    // Piranski zaliv, Portorož & Seča & Fonda
    { lat: 45.5130, lon: 13.5820, depth: '2.6', name: 'Portorož centralna plaža' },
    { lat: 45.5040, lon: 13.5900, depth: '3.5', name: 'Marina Portorož vhod' },
    { lat: 45.4975, lon: 13.5840, depth: '2.2', name: 'Rt Seča greben' },
    { lat: 45.4880, lon: 13.5900, depth: '1.8', name: 'Krajinski park Sečovlje vhod' },
    { lat: 45.4930, lon: 13.5780, depth: '11.5', name: 'Ribogojnica Fonda' },
    { lat: 45.4950, lon: 13.5780, depth: '7.2', name: 'Piranski zaliv jug' },
    { lat: 45.5050, lon: 13.5650, depth: '12.4', name: 'Piranski zaliv sredina' },
    { lat: 45.5120, lon: 13.5480, depth: '16.8', name: 'Piranski zaliv zahod' },
    { lat: 45.4900, lon: 13.5600, depth: '14.5', name: 'Pred Savudrijo / meja' },

    // Odprti Tržaški zaliv (18 - 32 m)
    { lat: 45.5480, lon: 13.5280, depth: '22.3', name: 'Difuzor izpusta Piran (22m)' },
    { lat: 45.6050, lon: 13.6600, depth: '22.5', name: 'Tržaški zaliv sever' },
    { lat: 45.5800, lon: 13.6200, depth: '24.8', name: 'Tržaški zaliv sredina' },
    { lat: 45.5600, lon: 13.5600, depth: '26.5', name: 'Odprto morje pred Ronekom' },
    { lat: 45.5450, lon: 13.5350, depth: '28.2', name: 'Odprto morje pred Piranom' },
    { lat: 45.5250, lon: 13.5200, depth: '31.5', name: 'Odprto morje globoko' },
    { lat: 45.5000, lon: 13.5100, depth: '32.0', name: 'Odprto morje JZ' }
];

// 3. S-57 Official Navigational Lights (LIGHTS: Uradni svetilniki z utripi in sektorji)
const NAUTICAL_LIGHTS = [
    // Strunjan - 2x2 lateralni par svetlobnih oznak vstopnega kanala
    { lat: 45.5348, lon: 13.5964, name: 'Strunjan kanal zunanji Z', char: 'Z Bl 3s 5m 3M', color: 'green', type: 'Zeleni lateralni svetilnik (zunanji vhod)' },
    { lat: 45.5345, lon: 13.5960, name: 'Strunjan kanal zunanji R', char: 'R Bl 3s 5m 3M', color: 'red', type: 'Rdeči lateralni svetilnik (zunanji vhod)' },
    { lat: 45.5338, lon: 13.5985, name: 'Strunjan kanal notranji Z', char: 'Z Bl 2s 4m 2M', color: 'green', type: 'Zeleni lateralni svetilnik (notranji prehod)' },
    { lat: 45.5335, lon: 13.5982, name: 'Strunjan kanal notranji R', char: 'R Bl 2s 4m 2M', color: 'red', type: 'Rdeči lateralni svetilnik (notranji prehod)' },

    // Piran & Bernardin
    { lat: 45.5288, lon: 13.5644, name: 'Svetilnik Rt Madona (Punta Piran)', char: 'B Bl(2) 15s 10m 15M', color: 'white', type: 'Glavni obalni svetilnik na rtu Madona (Punta Piran)' },
    { lat: 45.5280, lon: 13.5670, name: 'Piran mandrač vhod Z', char: 'Z Bl 3s 6m 3M', color: 'green', type: 'Zeleni svetilnik mestnega pristanišča Piran' },
    { lat: 45.5275, lon: 13.5665, name: 'Piran valobran R', char: 'R Bl 3s 6m 3M', color: 'red', type: 'Rdeči svetilnik na valobranu Piran' },
    { lat: 45.5162, lon: 13.5705, name: 'Bernardin pomol', char: 'Z Bl 2s 5m 3M', color: 'green', type: 'Zeleni svetilnik na pomolu Bernardin' },

    // Portorož & Marina
    { lat: 45.5135, lon: 13.5855, name: 'Portorož osrednji pomol', char: 'Z Bl 3s 6m 3M', color: 'green', type: 'Zeleni svetilnik na glavnem pomolu Portorož' },
    { lat: 45.5025, lon: 13.5935, name: 'Marina Portorož kanal S (zeleni)', char: 'Z Bl 3s 5m 3M', color: 'green', type: 'Vstopni kanal marina Portorož (desna stran)' },
    { lat: 45.5020, lon: 13.5930, name: 'Marina Portorož kanal J (rdeči)', char: 'R Bl 3s 5m 3M', color: 'red', type: 'Vstopni kanal marina Portorož (leva stran)' },

    // Izola
    { lat: 45.5422, lon: 13.6558, name: 'Izola Rt Petelin', char: 'Z Bl(3) 10s 7m 4M', color: 'green', type: 'Zeleni svetilnik na rtu Petelin' },
    { lat: 45.5410, lon: 13.6580, name: 'Izola severni valobran marine', char: 'R Bl 4s 7m 4M', color: 'red', type: 'Rdeči svetilnik na severnem valobranu marine' },
    { lat: 45.5385, lon: 13.6605, name: 'Izola mandrač', char: 'Z Bl 2s 5m 2M', color: 'green', type: 'Zeleni svetilnik mestnega pristanišča' },
    { lat: 45.5428, lon: 13.6065, name: 'Rtič Ronek (Klif)', char: 'B Bl 5s 7m 6M', color: 'white', type: 'Beli obalni svetilnik pod klifom' },

    // Koper
    { lat: 45.5600, lon: 13.7215, name: 'Luka Koper severni valobran', char: 'R Bl 5s 9m 6M', color: 'red', type: 'Rdeči vstopni svetilnik Luke Koper' },
    { lat: 45.5535, lon: 13.7225, name: 'Luka Koper južni valobran', char: 'Z Bl 5s 9m 6M', color: 'green', type: 'Zeleni vstopni svetilnik Luke Koper' },
    { lat: 45.5488, lon: 13.7265, name: 'Koper mandrač (Glavni pomol)', char: 'Z Bl 3s 7m 4M', color: 'green', type: 'Zeleni svetilnik mestnega pristanišča Koper' }
];

// 4. S-57 Navigational Buoys (BOYCAR / BOYSPP: Kardinalne, specialne in oceanografske boje)
const NAUTICAL_BUOYS = [
    {
        lat: 45.5925,
        lon: 13.6930,
        name: 'Zahodna kardinalna boja Debeli rtič',
        char: 'Q(9) 15s 8m 8M',
        type: 'Zahodna kardinalna boja (West Cardinal) - varna plovba zahodno od grebena',
        desc: 'Rumeno-črna kardinalna boja z dvojnim navznoter obrnjenim stožcem. Označuje nevaren skalni greben Debelega rtiča.'
    },
    {
        lat: 45.5488,
        lon: 13.5510,
        name: 'Oceanografska boja Vida (MBP NIB)',
        char: 'Fl.Y.5s 5m 4M',
        type: 'Specialna oceanografska boja (Special Mark)',
        desc: 'Rumena oceanografska raziskovalna boja Morske biološke postaje Piran s meteorološko-oceanografskimi senzorji. Prepovedano privezovanje in oviranje.'
    }
];

// 5. S-57 Underwater Hazards & Shoals (UWTROC / OBSTRN: Podvodne čeri in grebeni)
const NAUTICAL_HAZARDS = [
    {
        lat: 45.5925,
        lon: 13.6965,
        name: 'Greben Debeli rtič',
        type: 'Skalni greben / čer',
        depth: '1.6 m',
        desc: 'Nevaren plitev skalnati greben. Varna plovba zahodno od zahodne kardinalne boje.'
    },
    {
        lat: 45.5295,
        lon: 13.5605,
        name: 'Greben Punta Piran (Rt Madona)',
        type: 'Podvodni greben & čer',
        depth: '2.1 m',
        desc: 'Podvodna čer in greben, ki se razteza z rta Madona. Prepovedana plovba v neposredni bližini rta.'
    },
    {
        lat: 45.5425,
        lon: 13.6070,
        name: 'Čeri pod klifom Rt Ronek',
        type: 'Podvodne skale & čeri',
        depth: '1.5 m',
        desc: 'Skalnate podvodne čeri pod flišnim klifom v Krajinskem parku Strunjan.'
    },
    {
        lat: 45.4960,
        lon: 13.5825,
        name: 'Plitvina Rt Seča',
        type: 'Pličina & solinski greben',
        depth: '1.2 m',
        desc: 'Izrazita blatna plitvina pred kanalom sv. Jerneja in Sečoveljskimi solinami.'
    },
    {
        lat: 45.5450,
        lon: 13.6740,
        name: 'Pličina Rtič Viližan',
        type: 'Obalna pličina',
        depth: '1.8 m',
        desc: 'Pličina in podvodni ostanki rimskega pristanišča Viližan.'
    }
];

// 6. S-57 Shipwrecks (WRECKS: Uradne potopljene ladje)
const NAUTICAL_WRECKS = [
    {
        lat: 45.5489,
        lon: 13.6920,
        name: 'Razbitina SS Rex',
        type: 'Čezoceanska potopljena ladja (1944)',
        depth: '9.8 m',
        desc: 'Največja italijanska čezoceanska potniška ladja Rex, potopljena 8. septembra 1944. Podvodno arheološko najdišče in nevarnost za sidranje.'
    },
    {
        lat: 45.5215,
        lon: 13.5520,
        name: 'Razbitina tovorne ladje pred Piranom',
        type: 'Potopljena razbitina',
        depth: '14.2 m',
        desc: 'Potopljeni ostanki tovorne ladje na vstopu v Piranski zaliv. Prepovedano sidranje.'
    }
];

// 7. S-57 Submarine Pipelines & Outfalls (PIPSOL / CBLSUB: Podmorski izpusti)
const NAUTICAL_PIPELINES_CABLES = [
    {
        name: 'Podmorski izpust CČN Piran (Fornače)',
        type: 'Podvodni kanalizacijski cevovod (3,5 km)',
        color: '#c026d3', // Official nautical magenta
        dashArray: '8, 6',
        coords: [
            [45.5220, 13.5700], // Črpališče Fornače
            [45.5310, 13.5550],
            [45.5410, 13.5390],
            [45.5480, 13.5280]  // Difuzor na globini 22m
        ],
        desc: 'Glavni podmorski izpust Centralne čistilne naprave Piran od Fornač proti SZ v Tržaški zaliv (dolžina 3,5 km). Na koncu sta nameščena globokomorska difuzorja. Prepovedano sidranje.'
    },
    {
        name: 'Podmorski izpust CČN Koper',
        type: 'Podvodni izpust čistilne naprave',
        color: '#c026d3',
        dashArray: '8, 6',
        coords: [
            [45.5480, 13.7080],
            [45.5580, 13.6950],
            [45.5650, 13.6840]
        ],
        desc: 'Podmorski izpust komunalne čistilne naprave Koper v Koprski zaliv. Prepovedano sidranje.'
    }
];

// 8. S-57 Marine Reserves & Protected Areas (RESARE: Zavarovana morska območja)
const NAUTICAL_RESERVES = [
    {
        name: 'Krajinski park Strunjan & Mesečev zaliv',
        type: 'Morski naravni rezervat',
        center: [45.5390, 13.6010],
        coords: [
            [45.5435, 13.5930], [45.5430, 13.6120],
            [45.5380, 13.6140], [45.5360, 13.5940],
            [45.5435, 13.5930]
        ],
        desc: 'Morski naravni rezervat pod strunjanskim flišnim klifom. Prepovedano sidranje zunaj označenih boj, glisiranje in ribolov.'
    },
    {
        name: 'Naravni spomenik Rt Madona (Punta Piran)',
        type: 'Morski podvodni park',
        center: [45.5295, 13.5630],
        coords: [
            [45.5320, 13.5620], [45.5315, 13.5665],
            [45.5270, 13.5660], [45.5275, 13.5615],
            [45.5320, 13.5620]
        ],
        desc: 'Podvodni naravni spomenik z izjemno biotsko raznovrstnostjo. Strogo zavarovano območje.'
    }
];

// 9. S-57 Mariculture Zones (MARCUL: Gojišča školjk in rib)
const NAUTICAL_MARICULTURE = [
    {
        name: 'Školjčišče Debeli rtič (sv. Jernej)',
        type: 'Koncesijsko območje marikulture',
        center: [45.5870, 13.7080],
        coords: [
            [45.5890, 13.7060], [45.5850, 13.7100],
            [45.5840, 13.7060], [45.5880, 13.7020],
            [45.5890, 13.7060]
        ],
        buoys: [
            [45.5890, 13.7060], [45.5850, 13.7100],
            [45.5840, 13.7060], [45.5880, 13.7020]
        ],
        desc: 'Zavarovano območje gojenja školjk. Označeno z rumenimi specialnimi navigacijskimi bojami (Fl.Y) s križcem (X). Prepovedana plovba in sidranje.'
    },
    {
        name: 'Školjčišče Strunjan',
        type: 'Koncesijsko območje marikulture',
        center: [45.5340, 13.5980],
        coords: [
            [45.5355, 13.5960], [45.5325, 13.6000],
            [45.5315, 13.5970], [45.5345, 13.5930],
            [45.5355, 13.5960]
        ],
        buoys: [
            [45.5355, 13.5960], [45.5325, 13.6000],
            [45.5315, 13.5970], [45.5345, 13.5930]
        ],
        desc: 'Gojišče školjk v Strunjanskem zalivu, označeno z rumenimi boji s križcem. Prepovedano sidranje.'
    },
    {
        name: 'Ribogojnica in školjčišče Fonda (Seča)',
        type: 'Koncesijsko območje marikulture',
        center: [45.4930, 13.5800],
        coords: [
            [45.4955, 13.5780], [45.4905, 13.5820],
            [45.4895, 13.5780], [45.4945, 13.5740],
            [45.4955, 13.5780]
        ],
        buoys: [
            [45.4955, 13.5780], [45.4905, 13.5820],
            [45.4895, 13.5780], [45.4945, 13.5740]
        ],
        desc: 'Morska ribogojnica piranskega brancina in školjčišče Fonda. Zavarovano območje z rumenimi navigacijskimi bojami (Fl.Y) s križcem (X).'
    }
];

function buildNauticalChartLayer() {
    if (depthVectorLayerGroup) return depthVectorLayerGroup;
    depthVectorLayerGroup = L.layerGroup([]);

    // 1. S-57 Depth Contours (DEPCNT: Zvezne izobate z antialiasingom)
    NAUTICAL_ISOBATHS.forEach(iso => {
        iso.lines.forEach(coords => {
            const polyline = L.polyline(coords, {
                color: iso.color,
                weight: iso.weight,
                dashArray: iso.dashArray || null,
                opacity: iso.opacity,
                smoothFactor: 1.0
            });
            polyline.bindPopup(`<b>${iso.name}</b><br>Globina: <b>${iso.depth}</b> pod hidrografsko nulo.`);
            depthVectorLayerGroup.addLayer(polyline);
        });

        // Discrete depth contour badges
        if (iso.labelPositions) {
            iso.labelPositions.forEach(pos => {
                const labelIcon = L.divIcon({
                    className: 'nautical-isobath-divicon',
                    html: `<span class="nautical-isobath-badge">${iso.depth}</span>`,
                    iconSize: [22, 12],
                    iconAnchor: [11, 6]
                });
                const labelMarker = L.marker(pos, { icon: labelIcon, interactive: false });
                depthVectorLayerGroup.addLayer(labelMarker);
            });
        }
    });

    // 2. S-57 Depth Soundings (SOUNDG: Drobne poševne številke globin)
    NAUTICAL_SOUNDINGS.forEach(snd => {
        const icon = L.divIcon({
            className: 'nautical-sounding-divicon',
            html: `<div class="nautical-sounding-num">${snd.depth}</div>`,
            iconSize: [28, 16],
            iconAnchor: [14, 8]
        });
        const marker = L.marker([snd.lat, snd.lon], { icon: icon });
        marker.bindPopup(`<b>Globina: ${snd.depth} m</b><br><small>${snd.name}</small>`);
        depthVectorLayerGroup.addLayer(marker);
    });

    // 3. S-57 Navigational Lights (LIGHTS: Svetilniki s svetlobnimi utripi)
    NAUTICAL_LIGHTS.forEach(lit => {
        const colorClass = `nautical-light-${lit.color}`;
        const lightSvg = `
            <svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align:middle; filter:drop-shadow(0 0 3px currentColor);">
                <polygon points="8,1 10,6 15,6 11,9 13,15 8,11 3,15 5,9 1,6 6,6" fill="currentColor"/>
                <circle cx="8" cy="8" r="2.5" fill="#ffffff"/>
            </svg>
        `;
        const icon = L.divIcon({
            className: 'nautical-light-divicon',
            html: `<div class="nautical-light-int1 ${colorClass}" title="${lit.name}">${lightSvg}<span>${lit.char}</span></div>`,
            iconSize: [85, 18],
            iconAnchor: [42, 9]
        });
        const marker = L.marker([lit.lat, lit.lon], { icon: icon });
        marker.bindPopup(`
            <div style="font-size:0.85rem;">
                <b style="color:var(--text-primary);"><i class="fa-solid fa-tower-observation"></i> ${lit.name}</b><br>
                <span>Karakteristika: <b style="font-family:monospace;">${lit.char}</b></span><br>
                <p style="margin:4px 0 0 0; font-size:0.75rem; color:#475569;">${lit.type}</p>
            </div>
        `);
        depthVectorLayerGroup.addLayer(marker);
    });

    // 4. S-57 Buoys (BOYCAR / BOYSPP: Kardinalne in posebne navigacijske boje)
    NAUTICAL_BUOYS.forEach(buoy => {
        const buoySvg = `
            <svg viewBox="0 0 20 20" width="18" height="18" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">
                <!-- Double cone topmark (West cardinal: point-to-point) -->
                <polygon points="10,1 6,7 14,7" fill="#0f172a" stroke="#ca8a04" stroke-width="1"/>
                <polygon points="10,13 6,7 14,7" fill="#0f172a" stroke="#ca8a04" stroke-width="1"/>
                <!-- Buoy pillar body (Yellow-Black-Yellow) -->
                <rect x="7" y="10" width="6" height="3" fill="#facc15"/>
                <rect x="7" y="13" width="6" height="3" fill="#0f172a"/>
                <rect x="7" y="16" width="6" height="3" fill="#facc15"/>
            </svg>
        `;
        const icon = L.divIcon({
            className: 'nautical-buoy-divicon',
            html: `<div class="nautical-buoy-int1" title="${buoy.name}">${buoySvg}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        const marker = L.marker([buoy.lat, buoy.lon], { icon: icon });
        marker.bindPopup(`
            <div style="font-size:0.85rem;">
                <b style="color:#d97706;"><i class="fa-solid fa-diamond"></i> ${buoy.name}</b><br>
                <span>Oznaka: <b>${buoy.char}</b></span><br>
                <span>Tip: <b>${buoy.type}</b></span><br>
                <p style="margin:4px 0 0 0; font-size:0.75rem; color:#475569;">${buoy.desc}</p>
            </div>
        `);
        depthVectorLayerGroup.addLayer(marker);
    });

    // 5. S-57 Underwater Hazards & Shoals (UWTROC / OBSTRN: Drobni križci +)
    NAUTICAL_HAZARDS.forEach(haz => {
        const rockSvg = `
            <svg viewBox="0 0 14 14" width="12" height="12" style="vertical-align:middle;">
                <circle cx="7" cy="7" r="5.5" fill="none" stroke="#475569" stroke-width="1" stroke-dasharray="2,2"/>
                <line x1="7" y1="3" x2="7" y2="11" stroke="#dc2626" stroke-width="1.8"/>
                <line x1="3" y1="7" x2="11" y2="7" stroke="#dc2626" stroke-width="1.8"/>
            </svg>
        `;
        const icon = L.divIcon({
            className: 'nautical-hazard-divicon',
            html: `<div class="nautical-rock-int1" title="${haz.name} (${haz.depth})">${rockSvg}<span>${haz.depth}</span></div>`,
            iconSize: [46, 16],
            iconAnchor: [23, 8]
        });
        const marker = L.marker([haz.lat, haz.lon], { icon: icon });
        marker.bindPopup(`
            <div style="font-size:0.85rem;">
                <b style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> ${haz.name}</b><br>
                <span>Tip: <b>${haz.type}</b></span><br>
                <span>Najmanjša globina: <b style="color:#dc2626;">${haz.depth}</b></span><br>
                <p style="margin:4px 0 0 0; font-size:0.75rem; color:#475569;">${haz.desc}</p>
            </div>
        `);
        depthVectorLayerGroup.addLayer(marker);
    });

    // 6. S-57 Shipwrecks (WRECKS: Wk. simbol)
    NAUTICAL_WRECKS.forEach(wrk => {
        const wreckHtml = `
            <div class="nautical-wreck-int1" title="${wrk.name} (${wrk.depth})">
                <svg viewBox="0 0 20 12" width="18" height="11">
                    <line x1="2" y1="6" x2="18" y2="6" stroke="#0f172a" stroke-width="1.8"/>
                    <line x1="4" y1="2" x2="4" y2="10" stroke="#0f172a" stroke-width="1.5"/>
                    <line x1="10" y1="1" x2="10" y2="11" stroke="#0f172a" stroke-width="1.5"/>
                    <line x1="16" y1="2" x2="16" y2="10" stroke="#0f172a" stroke-width="1.5"/>
                </svg>
                <span>Wk. ${wrk.depth}</span>
            </div>
        `;
        const icon = L.divIcon({
            className: 'nautical-wreck-divicon',
            html: wreckHtml,
            iconSize: [68, 16],
            iconAnchor: [34, 8]
        });
        const m = L.marker([wrk.lat, wrk.lon], { icon: icon });
        m.bindPopup(`
            <div style="font-size:0.85rem;">
                <b style="color:#0f172a;"><i class="fa-solid fa-ship"></i> ${wrk.name}</b><br>
                <span>Oznaka: <b>Wk. (INT-1 K28/29)</b></span><br>
                <span>Globina: <b>${wrk.depth}</b></span><br>
                <p style="margin:4px 0 0 0; font-size:0.75rem; color:#475569;">${wrk.desc}</p>
            </div>
        `);
        depthVectorLayerGroup.addLayer(m);
    });

    // 7. S-57 Submarine Pipelines & Outfalls (PIPSOL: Magenta črtkane črte)
    NAUTICAL_PIPELINES_CABLES.forEach(pipe => {
        const line = L.polyline(pipe.coords, {
            color: pipe.color,
            weight: 2.2,
            dashArray: pipe.dashArray,
            opacity: 0.95
        });
        line.bindPopup(`
            <div style="font-size:0.85rem;">
                <b style="color:${pipe.color};"><i class="fa-solid fa-bolt"></i> ${pipe.name}</b><br>
                <span>Tip: <b>${pipe.type}</b></span><br>
                <p style="margin:4px 0 0 0; font-size:0.75rem; color:#475569;">${pipe.desc}</p>
            </div>
        `);
        depthVectorLayerGroup.addLayer(line);
    });

    // 8. S-57 Marine Protected Areas (RESARE: Naravni rezervati)
    NAUTICAL_RESERVES.forEach(res => {
        const poly = L.polygon(res.coords, {
            color: '#10b981',
            weight: 1.5,
            dashArray: '6, 6',
            fillColor: '#10b981',
            fillOpacity: 0.04
        });
        poly.bindPopup(`<b><i class="fa-solid fa-leaf" style="color:#10b981;"></i> ${res.name}</b><br>${res.desc}`);
        depthVectorLayerGroup.addLayer(poly);
    });

    // 9. S-57 Mariculture (MARCUL: Gojišča školjk in rib z rumenimi boji)
    NAUTICAL_MARICULTURE.forEach(mari => {
        const poly = L.polygon(mari.coords, {
            color: '#0284c7',
            weight: 1.5,
            dashArray: '5, 5',
            fillColor: '#0284c7',
            fillOpacity: 0.05
        });
        poly.bindPopup(`<b><i class="fa-solid fa-fish" style="color:#0284c7;"></i> ${mari.name}</b><br>${mari.desc}`);
        depthVectorLayerGroup.addLayer(poly);

        // Discrete Area Label
        const labelIcon = L.divIcon({
            className: 'nautical-mariculture-divicon',
            html: `<div class="nautical-mariculture-label">${mari.name.split('(')[0].trim()}</div>`,
            iconSize: [120, 16],
            iconAnchor: [60, 8]
        });
        const labelMarker = L.marker(mari.center, { icon: labelIcon, interactive: false });
        depthVectorLayerGroup.addLayer(labelMarker);

        // Yellow Special Mark Buoys on Corners
        if (mari.buoys) {
            mari.buoys.forEach((bPos) => {
                const buoySvg = `
                    <div class="nautical-buoy-special" title="Specialna boja (Fl.Y)">
                        <svg viewBox="0 0 12 12" width="10" height="10">
                            <!-- Yellow X topmark -->
                            <line x1="2" y1="2" x2="10" y2="10" stroke="#ca8a04" stroke-width="2"/>
                            <line x1="10" y1="2" x2="2" y2="10" stroke="#ca8a04" stroke-width="2"/>
                            <circle cx="6" cy="6" r="2" fill="#facc15"/>
                        </svg>
                    </div>
                `;
                const bIcon = L.divIcon({
                    className: 'nautical-buoy-divicon',
                    html: buoySvg,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                const bMarker = L.marker(bPos, { icon: bIcon });
                bMarker.bindPopup(`<b>Specialna označevalna boja (Fl.Y)</b><br>Meja območja: ${mari.name}`);
                depthVectorLayerGroup.addLayer(bMarker);
            });
        }
    });

    return depthVectorLayerGroup;
}

/// Toggle Nautical Chart Layer (S-57 ENC Vector Layer: Contours, Soundings, Lights, Hazards, Cables, Mariculture)
function toggleNauticalChartLayer() {
    if (!navMap) initNavMap();
    showNauticalChart = !showNauticalChart;
    showDepthContours = showNauticalChart;
    const btn = document.getElementById('pill-layer-nautical');
    if (btn) btn.classList.toggle('active', showNauticalChart);

    const chartLayer = buildNauticalChartLayer();
    if (showNauticalChart) {
        chartLayer.addTo(navMap);
    } else if (navMap.hasLayer(chartLayer)) {
        navMap.removeLayer(chartLayer);
    }
}
window.toggleNauticalChartLayer = toggleNauticalChartLayer;
window.toggleDepthContours = toggleNauticalChartLayer;

// Toggle Official EMODnet Bathymetry Layer (Depth Contours & Bathymetric Relief)
function toggleEmodnetBathymetry() {
    if (!navMap) initNavMap();
    showEmodnetBathymetry = !showEmodnetBathymetry;
    const btn = document.getElementById('pill-layer-emodnet');
    if (btn) btn.classList.toggle('active', showEmodnetBathymetry);

    if (showEmodnetBathymetry) {
        if (navMapLayers.emodnetMean && !navMap.hasLayer(navMapLayers.emodnetMean)) navMapLayers.emodnetMean.addTo(navMap);
        if (navMapLayers.emodnetContours && !navMap.hasLayer(navMapLayers.emodnetContours)) navMapLayers.emodnetContours.addTo(navMap);
    } else {
        if (navMapLayers.emodnetMean && navMap.hasLayer(navMapLayers.emodnetMean)) navMap.removeLayer(navMapLayers.emodnetMean);
        if (navMapLayers.emodnetContours && navMap.hasLayer(navMapLayers.emodnetContours)) navMap.removeLayer(navMapLayers.emodnetContours);
    }
}
window.toggleEmodnetBathymetry = toggleEmodnetBathymetry;

// 103 Guide Points Demarcation (200m Coastal Corridor)
function build103GuideDemarcationLayer() {
    if (guide200mLayerGroup) return guide200mLayerGroup;
    guide200mLayerGroup = L.layerGroup([]);

    // 1. Vibrant continuous cyan demarcation line
    const guideLine = L.polyline(SLO_COAST_200M_GUIDE_NODES, {
        color: '#00e5ff',
        weight: 3,
        dashArray: '6, 4',
        opacity: 0.95
    });
    guideLine.bindPopup('<b>200m Obalni koridor (103 točk)</b><br>Zakonsko določena meja varne plovbe z glisiranjem');
    guide200mLayerGroup.addLayer(guideLine);

    // 2. Numbered badges for each of the 103 points
    SLO_COAST_200M_GUIDE_NODES.forEach((pt, idx) => {
        const numIcon = L.divIcon({
            className: 'guide103-divicon',
            html: `<div class="guide103-num-badge">${idx + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
        const marker = L.marker(pt, { icon: numIcon });
        marker.bindPopup(`<b>200m Točka ${idx + 1} / 103</b><br>Širina: ${formatNauticalCoord(pt[0], true)}<br>Dolžina: ${formatNauticalCoord(pt[1], false)}<br><small>(${pt[0].toFixed(5)}°, ${pt[1].toFixed(5)}°)</small>`);
        guide200mLayerGroup.addLayer(marker);
    });

    return guide200mLayerGroup;
}

function toggleGuideDemarcation103() {
    if (!navMap) initNavMap();
    isGuide103Visible = !isGuide103Visible;
    const btn = document.getElementById('pill-layer-guide103');
    if (btn) btn.classList.toggle('active', isGuide103Visible);

    const layer = build103GuideDemarcationLayer();
    if (isGuide103Visible) {
        layer.addTo(navMap);
    } else if (navMap.hasLayer(layer)) {
        navMap.removeLayer(layer);
    }
}
window.toggleGuideDemarcation103 = toggleGuideDemarcation103;

// Start GPS hardware tracking with immediate fallback and high accuracy
function startGpsNavigation(isUserGesture = false) {
    const banner = document.getElementById('nav-status-banner');
    const bannerText = document.getElementById('nav-status-text');
    const toggleBtn = document.getElementById('nav-gps-toggle-btn');

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        if (banner) banner.className = 'nav-status-banner error';
        if (bannerText) bannerText.textContent = 'GPS zahteva HTTPS varno povezavo';
        if (toggleBtn) toggleBtn.style.display = 'none';
        return;
    }

    if (!('geolocation' in navigator)) {
        if (banner) banner.className = 'nav-status-banner error';
        if (bannerText) bannerText.textContent = 'GPS ni podprt v tem brskalniku';
        if (toggleBtn) toggleBtn.style.display = 'none';
        return;
    }

    if (banner) banner.className = 'nav-status-banner';
    if (bannerText) bannerText.textContent = 'Iskanje GPS signala...';
    if (toggleBtn) toggleBtn.style.display = 'none';

    startOrientationTracking();

    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }

    // Stage 1: Fast initial location (Wi-Fi/Cell)
    navigator.geolocation.getCurrentPosition(
        updateGpsUI,
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );

    // Stage 2: High accuracy satellite GPS fix
    if (isUserGesture) {
        navigator.geolocation.getCurrentPosition(
            updateGpsUI,
            handleGpsError,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    // Continuous watch with high accuracy
    try {
        gpsWatchId = navigator.geolocation.watchPosition(
            updateGpsUI,
            handleGpsError,
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
        );
    } catch (e) {
        console.warn('Geolocation error starting watch:', e);
    }
}
window.startGpsNavigation = startGpsNavigation;

// Stop GPS tracking to conserve device battery
function stopGpsNavigation() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    stopOrientationTracking();
}

function handleGpsError(err) {
    console.warn('GPS Error:', err);
    const banner = document.getElementById('nav-status-banner');
    const bannerText = document.getElementById('nav-status-text');
    const toggleBtn = document.getElementById('nav-gps-toggle-btn');

    if (banner) {
        banner.className = 'nav-status-banner error';
        if (bannerText) {
            if (err.code === 1) {
                bannerText.textContent = 'Dostop do lokacije je zavrnjen v nastavitvah';
            } else if (err.code === 2) {
                bannerText.textContent = 'Iskanje GPS satelitov (preverite pogled v nebo)...';
            } else if (err.code === 3) {
                bannerText.textContent = 'Časovna omejitev GPS signala';
            } else {
                bannerText.textContent = 'Napaka pri branju GPS podatkov';
            }
        }
        if (toggleBtn) {
            toggleBtn.style.display = 'inline-block';
            toggleBtn.textContent = (err.code === 1) ? 'Omogoči GPS' : 'Poskusi znova';
        }
    }
}

// Leaflet Nautical Map Initialization
function initNavMap() {
    if (navMap) return;
    const mapContainer = document.getElementById('nav-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const initialLat = lastGpsCoords ? lastGpsCoords.latitude : 45.545;
    const initialLon = lastGpsCoords ? lastGpsCoords.longitude : 13.650;

    navMap = L.map('nav-map', {
        center: [initialLat, initialLon],
        zoom: 13,
        minZoom: 10,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: false
    });

    // Dedicated High Z-Index Panes so seamarks and depth lines NEVER get hidden under Satellite tiles
    const seamarksPane = navMap.createPane('seamarksPane');
    seamarksPane.style.zIndex = '450';
    seamarksPane.style.pointerEvents = 'none';

    const depthPane = navMap.createPane('depthPane');
    depthPane.style.zIndex = '420';

    // Base Tile Layers
    navMapLayers.cmap = L.tileLayer('./tiles_cmap/{z}/{x}/{y}.png', {
        minZoom: 10,
        maxZoom: 18,
        maxNativeZoom: 16,
        bounds: [[45.38, 13.35], [45.78, 13.92]],
        attribution: 'C-Map / Navico'
    });

    navMapLayers.navionics = L.tileLayer('./tiles/{z}/{x}/{y}.png', {
        minZoom: 10,
        maxZoom: 18,
        maxNativeZoom: 16,
        bounds: [[45.38, 13.35], [45.78, 13.92]],
        attribution: 'Navionics / Garmin'
    });

    navMapLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        crossOrigin: true
    });

    navMapLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        crossOrigin: true
    });

    // Default: C-Map Chart Layer
    navMapLayers.cmap.addTo(navMap);

    // Map click handler for waypoint placement
    navMap.on('click', function(e) {
        handleMapClickForWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Custom boat icon with neon glow
    const boatIconHtml = `
        <div id="leaflet-boat-icon" style="transform-origin: center; transition: transform 0.3s ease; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 40 40" width="34" height="34" style="filter: drop-shadow(0 0 6px rgba(56,189,248,0.9));">
                <circle cx="20" cy="20" r="18" fill="rgba(14, 165, 233, 0.25)" stroke="#38bdf8" stroke-width="2"/>
                <polygon points="20,4 32,34 20,26 8,34" fill="#0284c7" stroke="#ffffff" stroke-width="1.5"/>
                <circle cx="20" cy="20" r="3.5" fill="#38bdf8"/>
            </svg>
        </div>
    `;

    const boatIcon = L.divIcon({
        className: 'leaflet-boat-divicon',
        html: boatIconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });

    navBoatMarker = L.marker([initialLat, initialLon], { icon: boatIcon, zIndexOffset: 1000 }).addTo(navMap);

    // Polylines
    navPlannedRoutePolyline = L.polyline([], {
        color: '#0284c7',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.9
    }).addTo(navMap);

    navRecordedTrackPolyline = L.polyline([], {
        color: '#22c55e',
        weight: 5,
        opacity: 0.95
    }).addTo(navMap);

    renderLogbook();
}

// Layer Switching (C-Map / Navionics / Zemljevid / Satelit)
function setNavMapLayer(layerType) {
    if (!navMap) return;
    currentNavMapLayerType = layerType;

    const btnCmap = document.getElementById('pill-layer-cmap');
    const btnNavionics = document.getElementById('pill-layer-navionics');
    const btnOsm = document.getElementById('pill-layer-osm');
    const btnSat = document.getElementById('pill-layer-satellite');

    if (btnCmap) btnCmap.classList.toggle('active', layerType === 'cmap');
    if (btnNavionics) btnNavionics.classList.toggle('active', layerType === 'navionics');
    if (btnOsm) btnOsm.classList.toggle('active', layerType === 'osm');
    if (btnSat) btnSat.classList.toggle('active', layerType === 'satellite');

    if (navMap.hasLayer(navMapLayers.cmap)) navMap.removeLayer(navMapLayers.cmap);
    if (navMap.hasLayer(navMapLayers.navionics)) navMap.removeLayer(navMapLayers.navionics);
    if (navMap.hasLayer(navMapLayers.osm)) navMap.removeLayer(navMapLayers.osm);
    if (navMap.hasLayer(navMapLayers.satellite)) navMap.removeLayer(navMapLayers.satellite);

    if (layerType === 'satellite') {
        navMapLayers.satellite.addTo(navMap);
    } else if (layerType === 'osm') {
        navMapLayers.osm.addTo(navMap);
    } else if (layerType === 'navionics') {
        navMapLayers.navionics.addTo(navMap);
    } else {
        navMapLayers.cmap.addTo(navMap);
    }
}
window.setNavMapLayer = setNavMapLayer;

// Fullscreen Map Controller (Native + CSS Mobile Overlay Fallback)
function toggleMapFullscreen() {
    const wrapper = document.getElementById('nav-map-wrapper');
    const icon = document.getElementById('map-fullscreen-icon');
    if (!wrapper) return;

    const isNativeFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const isCssFull = wrapper.classList.contains('is-fullscreen');

    if (!isNativeFull && !isCssFull) {
        if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen().catch(() => {});
        } else if (wrapper.webkitRequestFullscreen) {
            wrapper.webkitRequestFullscreen();
        }
        wrapper.classList.add('is-fullscreen');
        if (icon) icon.className = 'fa-solid fa-compress';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        wrapper.classList.remove('is-fullscreen');
        if (icon) icon.className = 'fa-solid fa-expand';
    }
    setTimeout(() => { if (navMap) navMap.invalidateSize(); }, 250);
}
window.toggleMapFullscreen = toggleMapFullscreen;

// Synchronize fullscreen exit on ESC or system gesture
document.addEventListener('fullscreenchange', () => {
    const wrapper = document.getElementById('nav-map-wrapper');
    const icon = document.getElementById('map-fullscreen-icon');
    if (!document.fullscreenElement && wrapper) {
        wrapper.classList.remove('is-fullscreen');
        if (icon) icon.className = 'fa-solid fa-expand';
        if (navMap) setTimeout(() => navMap.invalidateSize(), 200);
    }
});

function centerMapOnBoat() {
    if (!navMap) initNavMap();
    if (lastGpsCoords && navMap) {
        navMap.setView([lastGpsCoords.latitude, lastGpsCoords.longitude], 15, { animate: true });
    } else {
        startGpsNavigation(true);
        if (navMap) {
            navMap.setView([45.545, 13.650], 12, { animate: true });
        }
    }
}
window.centerMapOnBoat = centerMapOnBoat;

// Multi-Waypoint Planner Interactions
function setActiveWaypointTarget(id) {
    activeWaypointTargetId = id;
    updateWaypointRowsUI();
}
window.setActiveWaypointTarget = setActiveWaypointTarget;

function resetStartToGps(event) {
    if (event) event.stopPropagation();
    const startWp = routeWaypoints.find(w => w.type === 'start');
    if (startWp) {
        startWp.isGps = true;
        startWp.lat = lastGpsCoords ? lastGpsCoords.latitude : null;
        startWp.lon = lastGpsCoords ? lastGpsCoords.longitude : null;
        startWp.label = 'Moja lokacija (GPS)';
    }
    updateWaypointRowsUI();
    updateWaypointMarkersOnMap();
    recalculateCurrentRoute();
}
window.resetStartToGps = resetStartToGps;

function clearWaypointTarget(id, event) {
    if (event) event.stopPropagation();
    const wp = routeWaypoints.find(w => w.id === id);
    if (wp) {
        wp.lat = null;
        wp.lon = null;
        wp.label = (wp.type === 'dest') ? 'Kliknite na karto za izbiro cilja' : 'Kliknite na karto za izbiro';
    }
    updateWaypointRowsUI();
    updateWaypointMarkersOnMap();
    recalculateCurrentRoute();
}
window.clearWaypointTarget = clearWaypointTarget;

function addWaypointRow() {
    const newId = 'wp_' + Date.now() + '_' + intermediateWpCounter++;
    const newWp = {
        id: newId,
        type: 'intermediate',
        lat: null,
        lon: null,
        label: 'Kliknite na karto za izbiro'
    };
    const destIdx = routeWaypoints.findIndex(w => w.type === 'dest');
    if (destIdx !== -1) {
        routeWaypoints.splice(destIdx, 0, newWp);
    } else {
        routeWaypoints.push(newWp);
    }
    setActiveWaypointTarget(newId);
    updateWaypointRowsUI();
}
window.addWaypointRow = addWaypointRow;

function removeWaypointRow(id, event) {
    if (event) event.stopPropagation();
    routeWaypoints = routeWaypoints.filter(w => w.id !== id);
    if (activeWaypointTargetId === id) {
        activeWaypointTargetId = 'dest';
    }
    updateWaypointRowsUI();
    updateWaypointMarkersOnMap();
    recalculateCurrentRoute();
}
window.removeWaypointRow = removeWaypointRow;

function updateWaypointRowsUI() {
    const startText = document.getElementById('wp-text-start');
    const startRow = document.getElementById('wp-row-start');
    const destText = document.getElementById('wp-text-dest');
    const destRow = document.getElementById('wp-row-dest');
    const interContainer = document.getElementById('wp-intermediate-container');

    const startWp = routeWaypoints.find(w => w.type === 'start');
    const destWp = routeWaypoints.find(w => w.type === 'dest');

    if (startText && startWp) startText.textContent = startWp.label;
    if (startRow) startRow.classList.toggle('active', activeWaypointTargetId === 'start');

    if (destText && destWp) destText.textContent = destWp.label;
    if (destRow) destRow.classList.toggle('active', activeWaypointTargetId === 'dest');

    if (interContainer) {
        let html = '';
        const interWps = routeWaypoints.filter(w => w.type === 'intermediate');
        interWps.forEach((wp, idx) => {
            const isActive = activeWaypointTargetId === wp.id;
            html += `
                <div class="waypoint-row ${isActive ? 'active' : ''}" onclick="setActiveWaypointTarget('${wp.id}')">
                    <span class="wp-icon intermediate-icon"><b>${idx + 1}</b></span>
                    <div class="wp-details">
                        <span class="wp-label">Vmesna točka ${idx + 1}</span>
                        <span class="wp-coord-text">${wp.label}</span>
                    </div>
                    <button type="button" class="wp-action-btn delete-btn" onclick="removeWaypointRow('${wp.id}', event)" title="Izbriši točko">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        });
        interContainer.innerHTML = html;
    }
}

function handleMapClickForWaypoint(lat, lon) {
    const targetWp = routeWaypoints.find(w => w.id === activeWaypointTargetId);
    if (!targetWp) return;

    targetWp.lat = lat;
    targetWp.lon = lon;
    const formatted = `${formatNauticalCoord(lat, true)}, ${formatNauticalCoord(lon, false)}`;

    if (targetWp.type === 'start') {
        targetWp.isGps = false;
        targetWp.label = `Začetek: ${formatted}`;
    } else if (targetWp.type === 'dest') {
        targetWp.label = `Cilj: ${formatted}`;
    } else {
        targetWp.label = formatted;
    }

    updateWaypointRowsUI();
    updateWaypointMarkersOnMap();
    recalculateCurrentRoute();

    const unassigned = routeWaypoints.find(w => w.lat === null && w.type !== 'start');
    if (unassigned) {
        setActiveWaypointTarget(unassigned.id);
    }
}

function updateWaypointMarkersOnMap() {
    if (!navMap) return;

    for (const id in waypointMarkers) {
        if (waypointMarkers[id]) {
            navMap.removeLayer(waypointMarkers[id]);
        }
    }
    waypointMarkers = {};

    routeWaypoints.forEach((wp, idx) => {
        if (wp.lat === null || wp.lon === null) return;
        if (wp.type === 'start' && wp.isGps) return;

        let iconHtml = '';
        if (wp.type === 'start') {
            iconHtml = `<div style="font-size:22px; color:#22c55e; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.5)); transform:translate(-2px,-6px);"><i class="fa-solid fa-location-dot"></i></div>`;
        } else if (wp.type === 'dest') {
            iconHtml = `<div style="font-size:24px; color:#ef4444; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.5)); transform:translate(-2px,-8px);"><i class="fa-solid fa-flag-checkered"></i></div>`;
        } else {
            iconHtml = `<div style="width:22px; height:22px; border-radius:50%; background:#0284c7; border:2px solid #ffffff; color:#ffffff; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.4);">${idx}</div>`;
        }

        const icon = L.divIcon({
            className: 'wp-map-divicon',
            html: iconHtml,
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        });

        const marker = L.marker([wp.lat, wp.lon], { icon: icon }).addTo(navMap);
        marker.bindPopup(`<b>${wp.type === 'start' ? 'Začetek' : wp.type === 'dest' ? 'Cilj' : 'Točka ' + idx}</b><br><small>${wp.lat.toFixed(4)}° N, ${wp.lon.toFixed(4)}° E</small>`);
        waypointMarkers[wp.id] = marker;
    });
}

function recalculateCurrentRoute() {
    if (!navMap) return;

    const chkRules = document.getElementById('chk-route-rules');
    const useRules = (chkRules && chkRules.type === 'checkbox') ? chkRules.checked : true;

    const activePoints = [];
    const startWp = routeWaypoints.find(w => w.type === 'start');
    if (startWp) {
        if (startWp.isGps) {
            if (lastGpsCoords) {
                activePoints.push({ lat: lastGpsCoords.latitude, lon: lastGpsCoords.longitude });
            } else if (navBoatMarker) {
                const pos = navBoatMarker.getLatLng();
                activePoints.push({ lat: pos.lat, lon: pos.lng });
            } else {
                activePoints.push({ lat: 45.545, lon: 13.650 });
            }
        } else if (startWp.lat !== null && startWp.lon !== null) {
            activePoints.push({ lat: startWp.lat, lon: startWp.lon });
        }
    }

    const intermediateWps = routeWaypoints.filter(w => w.type === 'intermediate' && w.lat !== null && w.lon !== null);
    intermediateWps.forEach(w => activePoints.push({ lat: w.lat, lon: w.lon }));

    const destWp = routeWaypoints.find(w => w.type === 'dest');
    if (destWp && destWp.lat !== null && destWp.lon !== null) {
        activePoints.push({ lat: destWp.lat, lon: destWp.lon });
    }

    if (activePoints.length < 2) {
        currentCalculatedRouteCoords = [];
        if (navPlannedRoutePolyline) navPlannedRoutePolyline.setLatLngs([]);
        const clearBtn = document.getElementById('map-clear-btn');
        if (clearBtn) clearBtn.style.display = 'none';
        const widget = document.getElementById('map-guidance-widget');
        if (widget) widget.style.display = 'none';
        resetRouteTelemetryDisplay();
        return;
    }

    const fullRoute = [];
    for (let i = 0; i < activePoints.length - 1; i++) {
        const seg = getSafeMarineSegment(
            activePoints[i].lat, activePoints[i].lon,
            activePoints[i+1].lat, activePoints[i+1].lon,
            useRules
        );
        if (i === 0) {
            fullRoute.push(...seg);
        } else {
            fullRoute.push(...seg.slice(1));
        }
    }

    currentCalculatedRouteCoords = fullRoute;
    if (navPlannedRoutePolyline) {
        navPlannedRoutePolyline.setLatLngs(currentCalculatedRouteCoords);
    }

    const clearBtn = document.getElementById('map-clear-btn');
    if (clearBtn) clearBtn.style.display = 'flex';

    if (fullRoute.length > 0) {
        const bounds = L.latLngBounds(fullRoute);
        navMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    updateLiveRouteTelemetry();
}
window.recalculateCurrentRoute = recalculateCurrentRoute;

function clearNavRoute() {
    routeWaypoints = [
        { id: 'start', type: 'start', lat: null, lon: null, isGps: true, label: 'Moja lokacija (GPS)' },
        { id: 'dest', type: 'dest', lat: null, lon: null, label: 'Kliknite na karto za izbiro cilja' }
    ];
    activeWaypointTargetId = 'dest';
    currentCalculatedRouteCoords = [];

    if (navPlannedRoutePolyline) navPlannedRoutePolyline.setLatLngs([]);
    if (navPastCruisePolyline && navMap) {
        navMap.removeLayer(navPastCruisePolyline);
        navPastCruisePolyline = null;
    }
    navPastCruiseMarkers.forEach(m => navMap && navMap.removeLayer(m));
    navPastCruiseMarkers = [];

    updateWaypointRowsUI();
    updateWaypointMarkersOnMap();

    const clearBtn = document.getElementById('map-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    const widget = document.getElementById('map-guidance-widget');
    if (widget) widget.style.display = 'none';

    resetRouteTelemetryDisplay();
}
window.clearNavRoute = clearNavRoute;

function resetRouteTelemetryDisplay() {
    const dtgEl = document.getElementById('telem-dtg');
    const dtgKmEl = document.getElementById('telem-dtg-km');
    const ttgEl = document.getElementById('telem-ttg');
    const etaEl = document.getElementById('telem-eta');
    const brgEl = document.getElementById('telem-brg');
    const brgCardEl = document.getElementById('telem-brg-card');

    if (dtgEl) dtgEl.textContent = '--';
    if (dtgKmEl) dtgKmEl.textContent = '-- km';
    if (ttgEl) ttgEl.textContent = '--';
    if (etaEl) etaEl.textContent = 'ETA: --:--';
    if (brgEl) brgEl.textContent = '--°';
    if (brgCardEl) brgCardEl.textContent = '--';
}

function onPlannedSpeedChange() {
    const inputEl = document.getElementById('input-planned-speed');
    if (inputEl) {
        const val = parseFloat(inputEl.value);
        if (!isNaN(val) && val > 0) {
            plannedSpeedKnots = val;
            updateLiveRouteTelemetry();
        }
    }
}
window.onPlannedSpeedChange = onPlannedSpeedChange;

function updatePlannedSpeedRowVisibility() {
    const speedRow = document.getElementById('planner-speed-row');
    if (!speedRow) return;
    const currentSpeedKnots = lastGpsSpeedKnots || 0;
    if (isCruiseActive && currentSpeedKnots >= 0.4) {
        speedRow.style.display = 'none';
    } else {
        speedRow.style.display = 'flex';
    }
}

function updateLiveRouteTelemetry() {
    const bLat = lastGpsCoords ? lastGpsCoords.latitude : (routeWaypoints && routeWaypoints[0] ? routeWaypoints[0].lat : 45.548);
    const bLon = lastGpsCoords ? lastGpsCoords.longitude : (routeWaypoints && routeWaypoints[0] ? routeWaypoints[0].lon : 13.725);
    const sog = lastGpsCoords && lastGpsCoords.speed !== null && !isNaN(lastGpsCoords.speed) ? (lastGpsCoords.speed * 1.94384) : 0;
    const hdg = lastGpsHeading || 0;
    updateNavigationGuidanceWidget(bLat, bLon, sog, hdg);
    updatePlannedSpeedRowVisibility();
    if (!currentCalculatedRouteCoords || currentCalculatedRouteCoords.length < 2) {
        resetRouteTelemetryDisplay();
        return;
    }

    const currentSpeedKnots = lastGpsSpeedKnots || 0;

    let totalDtgM = 0;
    for (let i = 0; i < currentCalculatedRouteCoords.length - 1; i++) {
        totalDtgM += haversineDistanceMeters(
            currentCalculatedRouteCoords[i][0], currentCalculatedRouteCoords[i][1],
            currentCalculatedRouteCoords[i+1][0], currentCalculatedRouteCoords[i+1][1]
        );
    }

    const dtgNm = totalDtgM / 1852;
    const dtgKm = totalDtgM / 1000;

    const dtgEl = document.getElementById('telem-dtg');
    const dtgKmEl = document.getElementById('telem-dtg-km');
    if (dtgEl) dtgEl.textContent = `${dtgNm.toFixed(2)} NM`;
    if (dtgKmEl) dtgKmEl.textContent = `${dtgKm.toFixed(2)} km`;

    // BRG to immediate next waypoint on active leg
    const nextWp = currentCalculatedRouteCoords[1];
    const boatLat = (lastGpsCoords && isCruiseActive) ? lastGpsCoords.latitude : currentCalculatedRouteCoords[0][0];
    const boatLon = (lastGpsCoords && isCruiseActive) ? lastGpsCoords.longitude : currentCalculatedRouteCoords[0][1];
    const brg = calculateBearing(boatLat, boatLon, nextWp[0], nextWp[1]);
    const brgEl = document.getElementById('telem-brg');
    const brgCardEl = document.getElementById('telem-brg-card');
    if (brgEl) brgEl.textContent = `${Math.round(brg)}°`;
    if (brgCardEl) brgCardEl.textContent = getHeadingCardinal(brg);

    // TTG & ETA:
    // If moving actively (>= 0.4 kt), TTG & ETA use real GPS speed.
    // If stationary (< 0.4 kt), TTG is estimated using planned speed, but ETA advances with current real-time clock!
    const ttgEl = document.getElementById('telem-ttg');
    const etaEl = document.getElementById('telem-eta');
    const effectiveSpeedKnots = (isCruiseActive && currentSpeedKnots >= 0.4) ? currentSpeedKnots : (plannedSpeedKnots > 0 ? plannedSpeedKnots : 6.0);

    if (effectiveSpeedKnots >= 0.3) {
        const ttgHours = dtgNm / effectiveSpeedKnots;
        const ttgSec = Math.round(ttgHours * 3600);
        if (ttgEl) ttgEl.textContent = formatDuration(ttgSec);

        const etaDate = new Date(Date.now() + ttgSec * 1000);
        const etaH = String(etaDate.getHours()).padStart(2, '0');
        const etaM = String(etaDate.getMinutes()).padStart(2, '0');
        if (etaEl) etaEl.textContent = `ETA: ${etaH}:${etaM}`;
    } else {
        if (ttgEl) ttgEl.textContent = '--';
        if (etaEl) etaEl.textContent = 'ETA: --:--';
    }
}

// Screen Wake Lock API
async function requestCruiseWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            cruiseWakeLock = await navigator.wakeLock.request('screen');
            cruiseWakeLock.addEventListener('release', () => {
                cruiseWakeLock = null;
            });
        } catch (e) {
            console.warn('Wake Lock request failed:', e);
        }
    }
}

function releaseCruiseWakeLock() {
    if (cruiseWakeLock !== null) {
        cruiseWakeLock.release().then(() => {
            cruiseWakeLock = null;
        }).catch(() => {});
    }
}

// Cruise Tracking Controller
function toggleCruiseRecording() {
    if (!isCruiseActive) {
        startCruise();
    } else {
        stopCruisePrompt();
    }
}
window.toggleCruiseRecording = toggleCruiseRecording;

function startCruise() {
    isCruiseActive = true;
    cruiseStartTime = Date.now();
    cruiseTrackPoints = [];
    cruiseTotalDistanceNm = 0;
    cruiseMaxSpeedKnots = lastGpsSpeedKnots || 0;

    startGpsNavigation(true);

    if (lastGpsCoords) {
        lastRecordedGpsPos = { lat: lastGpsCoords.latitude, lon: lastGpsCoords.longitude };
        cruiseTrackPoints.push([lastGpsCoords.latitude, lastGpsCoords.longitude]);
    } else {
        lastRecordedGpsPos = null;
    }

    if (navRecordedTrackPolyline) {
        navRecordedTrackPolyline.setLatLngs(cruiseTrackPoints);
    }

    requestCruiseWakeLock();

    updatePlannedSpeedRowVisibility();

    const btn = document.getElementById('btn-cruise-toggle');
    const icon = document.getElementById('cruise-btn-icon');
    const text = document.getElementById('cruise-btn-text');
    if (btn) btn.classList.add('active');
    if (icon) icon.className = 'fa-solid fa-stop';
    if (text) text.textContent = 'Zaključi';

    if (cruiseDurationTimer) clearInterval(cruiseDurationTimer);
    cruiseDurationTimer = setInterval(() => {
        if (!isCruiseActive || !cruiseStartTime) return;
        const sec = Math.floor((Date.now() - cruiseStartTime) / 1000);
        const durationEl = document.getElementById('telem-duration');
        if (durationEl) durationEl.textContent = formatDuration(sec);

        const hrs = sec / 3600;
        const avgSpeed = (hrs > 0 && cruiseTotalDistanceNm > 0) ? (cruiseTotalDistanceNm / hrs) : 0;
        const avgSpeedEl = document.getElementById('telem-avg-speed');
        if (avgSpeedEl) avgSpeedEl.textContent = `${avgSpeed.toFixed(1)} kt`;
    }, 1000);
}

async function stopCruisePrompt() {
    const sec = cruiseStartTime ? Math.floor((Date.now() - cruiseStartTime) / 1000) : 0;
    const hrs = sec / 3600;
    const avgSpeed = (hrs > 0 && cruiseTotalDistanceNm > 0) ? (cruiseTotalDistanceNm / hrs) : 0;
    const distKm = (cruiseTotalDistanceNm * 1.852).toFixed(2);

    const destWp = routeWaypoints.find(w => w.type === 'dest');
    const destLabel = (destWp && destWp.lat !== null) ? destWp.label : 'Prosta plovba';

    const saveConfirmed = confirm(
        `PLOVBA ZAKLJUČENA\n` +
        `-----------------------------\n` +
        `• Relacija: ${destLabel}\n` +
        `• Čas plovbe: ${formatDuration(sec)}\n` +
        `• Prepluto: ${cruiseTotalDistanceNm.toFixed(2)} NM (${distKm} km)\n` +
        `• Povprečna hitrost: ${avgSpeed.toFixed(1)} kt\n` +
        `• Najvišja hitrost: ${cruiseMaxSpeedKnots.toFixed(1)} kt\n\n` +
        `Ali želite to plovbo shraniti v Dnevnik plovb?`
    );

    if (saveConfirmed) {
        await saveCruiseToIndexedDB({
            id: 'cruise_' + Date.now(),
            timestamp: Date.now(),
            date: new Date().toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            durationSec: sec,
            distanceNm: cruiseTotalDistanceNm,
            avgSpeedKnots: avgSpeed,
            maxSpeedKnots: cruiseMaxSpeedKnots,
            destName: destLabel,
            trackPoints: [...cruiseTrackPoints]
        });
        renderLogbook();
    }

    endCruiseState();
}

function endCruiseState() {
    isCruiseActive = false;
    cruiseStartTime = null;
    if (cruiseDurationTimer) {
        clearInterval(cruiseDurationTimer);
        cruiseDurationTimer = null;
    }
    releaseCruiseWakeLock();

    // Show planned speed row again for planning
    const speedRow = document.getElementById('planner-speed-row');
    if (speedRow) speedRow.style.display = 'flex';
    updateLiveRouteTelemetry();

    const btn = document.getElementById('btn-cruise-toggle');
    const icon = document.getElementById('cruise-btn-icon');
    const text = document.getElementById('cruise-btn-text');
    if (btn) btn.classList.remove('active');
    if (icon) icon.className = 'fa-solid fa-play';
    if (text) text.textContent = 'Začni';

    if (activeMainTab !== 'navigacija') {
        stopGpsNavigation();
    }
}

// Local IndexedDB Database Management (with Persistent Storage API)
const DB_NAME = 'PlimaNautikaDB';
const DB_VERSION = 1;
const STORE_NAME = 'cruises';

function openNautikaDB() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = function(e) {
            const db = e.target.result;
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage.persist().catch(() => {});
            }
            resolve(db);
        };
        request.onerror = function() {
            resolve(null);
        };
    });
}

async function saveCruiseToIndexedDB(record) {
    const db = await openNautikaDB();
    if (db) {
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(record);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } else {
        try {
            const list = JSON.parse(localStorage.getItem('plima_cruise_logbook') || '[]');
            list.unshift(record);
            localStorage.setItem('plima_cruise_logbook', JSON.stringify(list));
        } catch (e) {}
    }
}

async function getAllCruisesFromIndexedDB() {
    const db = await openNautikaDB();
    if (db) {
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const list = req.result || [];
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                resolve(list);
            };
            req.onerror = () => resolve([]);
        });
    } else {
        try {
            return JSON.parse(localStorage.getItem('plima_cruise_logbook') || '[]');
        } catch (e) {
            return [];
        }
    }
}

async function deleteCruiseFromIndexedDB(id) {
    if (!confirm('Ali res želite izbrisati ta zapis iz dnevnika?')) return;
    const db = await openNautikaDB();
    if (db) {
        await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } else {
        try {
            let list = JSON.parse(localStorage.getItem('plima_cruise_logbook') || '[]');
            list = list.filter(item => item.id !== id);
            localStorage.setItem('plima_cruise_logbook', JSON.stringify(list));
        } catch (e) {}
    }
    renderLogbook();
}
window.deleteCruiseFromIndexedDB = deleteCruiseFromIndexedDB;

function toggleLogbookDrawer() {
    const listEl = document.getElementById('logbook-list');
    const chevron = document.getElementById('logbook-chevron');
    if (!listEl) return;
    const isHidden = listEl.style.display === 'none';
    listEl.style.display = isHidden ? 'flex' : 'none';
    if (chevron) {
        chevron.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }
    if (isHidden) {
        renderLogbook();
    }
}
window.toggleLogbookDrawer = toggleLogbookDrawer;

async function renderLogbook() {
    const container = document.getElementById('logbook-list');
    if (!container) return;
    const list = await getAllCruisesFromIndexedDB();

    if (list.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:12px; color:var(--text-secondary); font-size:0.8rem;">Dnevnik je prazen. Shranjene plovbe se bodo prikazale tukaj.</div>`;
        return;
    }

    let html = '';
    list.forEach(item => {
        const distKm = (item.distanceNm * 1.852).toFixed(1);
        html += `
            <div class="logbook-item" onclick="drawLoggedCruiseOnMap('${item.id}')" title="Kliknite za prikaz poti na karti">
                <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                    <strong style="color:var(--text-primary); font-size:0.85rem;"><i class="fa-solid fa-ship" style="color:var(--accent-blue); margin-right:4px;"></i> ${item.destName || 'Plovba'}</strong>
                    <span style="color:var(--text-secondary); font-size:0.72rem;">${item.date} • ${formatDuration(item.durationSec)}</span>
                    <span style="color:var(--text-primary); font-size:0.75rem; font-weight:600;">${item.distanceNm.toFixed(2)} NM (${distKm} km) • Ø ${item.avgSpeedKnots.toFixed(1)} kt • MAX ${(item.maxSpeedKnots || 0).toFixed(1)} kt</span>
                </div>
                <button type="button" class="logbook-item-btn" onclick="event.stopPropagation(); deleteCruiseFromIndexedDB('${item.id}')" title="Izbriši zapis">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function drawLoggedCruiseOnMap(id) {
    if (!navMap) initNavMap();
    const list = await getAllCruisesFromIndexedDB();
    const cruise = list.find(item => item.id === id);
    if (!cruise || !cruise.trackPoints || cruise.trackPoints.length === 0) {
        alert('Ta plovba nima shranjenih koordinat poti.');
        return;
    }

    if (navPastCruisePolyline && navMap) {
        navMap.removeLayer(navPastCruisePolyline);
        navPastCruisePolyline = null;
    }
    navPastCruiseMarkers.forEach(m => navMap && navMap.removeLayer(m));
    navPastCruiseMarkers = [];

    navPastCruisePolyline = L.polyline(cruise.trackPoints, {
        color: '#f59e0b',
        weight: 5,
        opacity: 0.95
    }).addTo(navMap);

    const startPt = cruise.trackPoints[0];
    const endPt = cruise.trackPoints[cruise.trackPoints.length - 1];

    const startIcon = L.divIcon({
        className: 'wp-start-icon',
        html: `<div style="font-size:20px; color:#22c55e;"><i class="fa-solid fa-play"></i></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    const endIcon = L.divIcon({
        className: 'wp-end-icon',
        html: `<div style="font-size:20px; color:#ef4444;"><i class="fa-solid fa-flag-checkered"></i></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const mStart = L.marker(startPt, { icon: startIcon }).addTo(navMap).bindPopup(`<b>Začetek plovbe</b><br>${cruise.date}`);
    const mEnd = L.marker(endPt, { icon: endIcon }).addTo(navMap).bindPopup(`<b>Konec plovbe</b><br>${cruise.distanceNm.toFixed(2)} NM`);
    navPastCruiseMarkers.push(mStart, mEnd);

    const clearBtn = document.getElementById('map-clear-btn');
    if (clearBtn) clearBtn.style.display = 'flex';

    navMap.fitBounds(navPastCruisePolyline.getBounds(), { padding: [40, 40], maxZoom: 15 });
}
window.drawLoggedCruiseOnMap = drawLoggedCruiseOnMap;

// Process GPS position and update gauges, coordinates, boat marker and telemetry
function updateGpsUI(pos) {
    if (!pos || !pos.coords) return;
    const coords = pos.coords;
    lastGpsCoords = coords;

    // Status Banner update
    const banner = document.getElementById('nav-status-banner');
    const bannerText = document.getElementById('nav-status-text');
    const toggleBtn = document.getElementById('nav-gps-toggle-btn');
    if (banner) banner.className = 'nav-status-banner connected';
    if (bannerText) bannerText.textContent = 'GPS signal aktiven';
    if (toggleBtn) toggleBtn.style.display = 'none';

    // 1. SPEED (SOG)
    let speedMs = coords.speed;
    let speedKnots = 0;
    let speedKmh = 0;

    if (speedMs !== null && !isNaN(speedMs) && speedMs >= 0) {
        speedKnots = speedMs * 1.943844;
        speedKmh = speedMs * 3.6;
    }
    lastGpsSpeedKnots = speedKnots;

    if (isCruiseActive && speedKnots > cruiseMaxSpeedKnots) {
        cruiseMaxSpeedKnots = speedKnots;
    }

    const clampedKnots = Math.min(Math.max(speedKnots, 0), 20);
    const speedRatio = clampedKnots / 20;

    const maxArcDash = 447.67;
    const currentOffset = maxArcDash * (1 - speedRatio);
    const speedArcEl = document.getElementById('speed-gauge-arc');
    if (speedArcEl) {
        speedArcEl.style.strokeDashoffset = currentOffset;
    }

    const needleDeg = -135 + (speedRatio * 270);
    const speedNeedle = document.getElementById('speed-needle-group');
    if (speedNeedle) {
        speedNeedle.style.transform = `rotate(${needleDeg}deg)`;
    }

    const knotsValEl = document.getElementById('nav-speed-knots');
    const kmhValEl = document.getElementById('nav-speed-kmh');
    if (knotsValEl) knotsValEl.textContent = speedKnots.toFixed(1);
    if (kmhValEl) kmhValEl.textContent = `${speedKmh.toFixed(1)} km/h`;

    // Max speed in telemetry
    const maxSpeedEl = document.getElementById('telem-max-speed');
    const maxSpeedKmhEl = document.getElementById('telem-max-speed-kmh');
    if (maxSpeedEl) maxSpeedEl.textContent = `${cruiseMaxSpeedKnots.toFixed(1)} kt`;
    if (maxSpeedKmhEl) maxSpeedKmhEl.textContent = `${(cruiseMaxSpeedKnots * 1.852).toFixed(1)} km/h`;

    // 2. HEADING (COG / Hibridni Kompas)
    let heading = coords.heading;
    const headingDegEl = document.getElementById('nav-heading-deg');
    const headingCardEl = document.getElementById('nav-heading-cardinal');

    if (speedKnots < 0.4) {
        if (headingDegEl) {
            headingDegEl.textContent = 'MIROVANJE';
            headingDegEl.classList.add('status-text');
        }
        if (headingCardEl) {
            headingCardEl.textContent = '';
        }
    } else if (heading !== null && !isNaN(heading) && heading >= 0) {
        lastGpsHeading = heading;
        if (headingDegEl) {
            headingDegEl.textContent = `${Math.round(heading)}°`;
            headingDegEl.classList.remove('status-text');
        }
        if (headingCardEl) {
            headingCardEl.textContent = getHeadingCardinal(heading);
        }
    } else if (lastGpsHeading !== null) {
        if (headingDegEl) {
            headingDegEl.textContent = `${Math.round(lastGpsHeading)}°`;
            headingDegEl.classList.remove('status-text');
        }
        if (headingCardEl) {
            headingCardEl.textContent = getHeadingCardinal(lastGpsHeading);
        }
    } else {
        if (headingDegEl) {
            headingDegEl.textContent = 'MIROVANJE';
            headingDegEl.classList.add('status-text');
        }
        if (headingCardEl) {
            headingCardEl.textContent = '';
        }
    }

    updateCompassOrientation();

    // 3. NAUTICAL COORDINATES (DMM)
    const latValEl = document.getElementById('nav-lat-val');
    const lonValEl = document.getElementById('nav-lon-val');
    if (latValEl) latValEl.textContent = formatNauticalCoord(coords.latitude, true);
    if (lonValEl) lonValEl.textContent = formatNauticalCoord(coords.longitude, false);

    // Auto-center map on initial GPS fix
    if (!hasCenteredInitialGps && navMap) {
        navMap.setView([coords.latitude, coords.longitude], 15, { animate: true });
        hasCenteredInitialGps = true;
    }

    // Update GPS Start point in planner if start is set to GPS
    const startWp = routeWaypoints.find(w => w.type === 'start');
    if (startWp && startWp.isGps) {
        startWp.lat = coords.latitude;
        startWp.lon = coords.longitude;
        const startTextEl = document.getElementById('wp-text-start');
        if (startTextEl && activeWaypointTargetId !== 'start') {
            startTextEl.textContent = 'Moja lokacija (' + formatNauticalCoord(coords.latitude, true) + ', ' + formatNauticalCoord(coords.longitude, false) + ')';
        }
    }

    // 4. MAP BOAT MARKER UPDATE
    if (navMap) {
        if (!navBoatMarker) {
            initNavMap();
        }
        if (navBoatMarker) {
            navBoatMarker.setLatLng([coords.latitude, coords.longitude]);
            const boatIconEl = document.getElementById('leaflet-boat-icon');
            if (boatIconEl && (heading !== null || lastGpsHeading !== null)) {
                const rot = (heading !== null && !isNaN(heading)) ? heading : (lastGpsHeading || 0);
                boatIconEl.style.transform = `rotate(${rot}deg)`;
            }
        }
    }

    // 5. CRUISE RECORDING TRACK ACCUMULATION
    if (isCruiseActive) {
        if (lastRecordedGpsPos) {
            const deltaMeters = haversineDistanceMeters(lastRecordedGpsPos.lat, lastRecordedGpsPos.lon, coords.latitude, coords.longitude);
            if (deltaMeters >= 3) {
                const deltaNm = deltaMeters / 1852;
                cruiseTotalDistanceNm += deltaNm;
                cruiseTrackPoints.push([coords.latitude, coords.longitude]);
                lastRecordedGpsPos = { lat: coords.latitude, lon: coords.longitude };
                if (navRecordedTrackPolyline) {
                    navRecordedTrackPolyline.setLatLngs(cruiseTrackPoints);
                }
            }
        } else {
            lastRecordedGpsPos = { lat: coords.latitude, lon: coords.longitude };
            cruiseTrackPoints.push([coords.latitude, coords.longitude]);
            if (navRecordedTrackPolyline) {
                navRecordedTrackPolyline.setLatLngs(cruiseTrackPoints);
            }
        }

        const distEl = document.getElementById('telem-dist');
        const distKmEl = document.getElementById('telem-dist-km');
        if (distEl) distEl.textContent = `${cruiseTotalDistanceNm.toFixed(2)} NM`;
        if (distKmEl) distKmEl.textContent = `${(cruiseTotalDistanceNm * 1.852).toFixed(2)} km`;
    }

    // 6. ROUTE TELEMETRY UPDATE
    updateLiveRouteTelemetry();
    updateNavigationGuidanceWidget(coords.latitude, coords.longitude, sogKnots, heading);

}

// Pause GPS & orientation on app minimize/background and resume when foregrounded (keeps running if cruise recording is active)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (!isCruiseActive) {
            stopGpsNavigation();
        }
    } else {
        if (activeMainTab === 'navigacija' || isCruiseActive) {
            startGpsNavigation(false);
            if (isCruiseActive) {
                requestCruiseWakeLock();
            }
            if (navMap) {
                setTimeout(() => navMap.invalidateSize(), 100);
            }
        }
    }
});





// Tactical Cruise Navigation Guidance Compass & Target Steering Arrow Widget
function updateNavigationGuidanceWidget(boatLat, boatLon, currentSogKnots, currentHeadingDeg) {
    const widget = document.getElementById('map-guidance-widget');
    if (!widget) return;

    // Display widget if cruise is active OR if route/destination exists
    const hasRoute = currentCalculatedRouteCoords && currentCalculatedRouteCoords.length > 0;
    const destWp = routeWaypoints && routeWaypoints.find(w => w.type === 'dest' && w.lat !== null && w.lon !== null);
    const shouldShow = isCruiseActive || hasRoute || !!destWp;

    if (!shouldShow) {
        widget.style.display = 'none';
        return;
    }
    widget.style.display = 'flex';

    // Fallback boat position if GPS not yet fixed: use start waypoint or first route point
    if (!boatLat || !boatLon) {
        if (lastGpsCoords) {
            boatLat = lastGpsCoords.latitude;
            boatLon = lastGpsCoords.longitude;
        } else if (routeWaypoints && routeWaypoints[0] && routeWaypoints[0].lat) {
            boatLat = routeWaypoints[0].lat;
            boatLon = routeWaypoints[0].lon;
        } else if (currentCalculatedRouteCoords && currentCalculatedRouteCoords.length > 0) {
            boatLat = currentCalculatedRouteCoords[0][0];
            boatLon = currentCalculatedRouteCoords[0][1];
        } else {
            boatLat = 45.548;
            boatLon = 13.725;
        }
    }

    const isMoving = (currentSogKnots !== null && !isNaN(currentSogKnots) && currentSogKnots >= 0.4);
    
    // Effective reference heading: GPS COG if moving, else Phone Magnetic orientation, else 0
    let effectiveHeading = 0;
    if (isMoving && currentHeadingDeg !== null && !isNaN(currentHeadingDeg)) {
        effectiveHeading = currentHeadingDeg;
    } else if (phoneMagneticHeading !== null && !isNaN(phoneMagneticHeading)) {
        effectiveHeading = phoneMagneticHeading;
    } else if (lastGpsHeading !== null && !isNaN(lastGpsHeading)) {
        effectiveHeading = lastGpsHeading;
    }

    // Find the next target waypoint along currentCalculatedRouteCoords
    let targetBearing = null;
    if (currentCalculatedRouteCoords && currentCalculatedRouteCoords.length > 0) {
        let targetPt = null;
        for (let i = 0; i < currentCalculatedRouteCoords.length; i++) {
            const pt = currentCalculatedRouteCoords[i];
            const d = haversineDistanceMeters(boatLat, boatLon, pt[0], pt[1]);
            if (d > 25) { // Target point at least 25m ahead
                targetPt = pt;
                break;
            }
        }
        if (!targetPt && currentCalculatedRouteCoords.length > 0) {
            targetPt = currentCalculatedRouteCoords[currentCalculatedRouteCoords.length - 1];
        }
        if (targetPt) {
            targetBearing = calculateBearing(boatLat, boatLon, targetPt[0], targetPt[1]);
        }
    }

    if (targetBearing === null && destWp) {
        targetBearing = calculateBearing(boatLat, boatLon, destWp.lat, destWp.lon);
    }

    // Relative angle delta between current course and bearing to next target
    let relDelta = 0;
    if (targetBearing !== null) {
        relDelta = getShortestAngleDelta(effectiveHeading, targetBearing);
    }
    const absDelta = Math.abs(relDelta);

    // Determine status color: <= 5 deg Green, <= 30 deg Yellow, > 30 deg Red
    let statusColor = '#22c55e'; // Green
    if (absDelta > 30) {
        statusColor = '#ef4444'; // Red
    } else if (absDelta > 5) {
        statusColor = '#f59e0b'; // Yellow
    }

    // Outer Circle Ring: White (#ffffff) when stationary (< 0.4 kt), dynamic statusColor when moving (>= 0.4 kt)
    const ringEl = document.getElementById('guidance-ring');
    if (ringEl) {
        ringEl.setAttribute('stroke', isMoving ? statusColor : '#ffffff');
    }

    // Outer Rim Marker Pip: White (#ffffff) pointing at 0° (top of phone) when stationary, dynamic statusColor when moving
    const rimMarker = document.getElementById('guidance-rim-marker');
    if (rimMarker) {
        rimMarker.style.transform = 'rotate(0deg)';
        const rimPip = document.getElementById('guidance-rim-pip');
        if (rimPip) {
            rimPip.setAttribute('fill', isMoving ? statusColor : '#ffffff');
        }
    }

    // Central Guidance Arrow: Points towards target waypoint relative to current heading
    const arrowGroup = document.getElementById('guidance-target-arrow');
    const arrowPoly = document.getElementById('guidance-arrow-poly');
    if (arrowGroup && arrowPoly) {
        arrowGroup.style.transform = `rotate(${relDelta}deg)`;
        arrowPoly.setAttribute('fill', statusColor);
    }

    // Digital text badge
    const deltaTextEl = document.getElementById('guidance-delta-text');
    if (deltaTextEl) {
        deltaTextEl.style.color = statusColor;
        if (absDelta <= 2) {
            deltaTextEl.textContent = '\u2713 0\u00B0';
        } else if (relDelta > 0) {
            deltaTextEl.textContent = `${Math.round(absDelta)}\u00B0 \u25B6`;
        } else {
            deltaTextEl.textContent = `\u25C0 ${Math.round(absDelta)}\u00B0`;
        }
    }
}

// Make all essential functions explicitly global on window
window.setActiveMainTab = setActiveMainTab;
window.startGpsNavigation = startGpsNavigation;
window.stopGpsNavigation = stopGpsNavigation;
window.toggleCruiseRecording = toggleCruiseRecording;
window.toggleLogbookDrawer = toggleLogbookDrawer;
window.deleteCruiseFromIndexedDB = deleteCruiseFromIndexedDB;
window.drawLoggedCruiseOnMap = drawLoggedCruiseOnMap;
window.onPlannedSpeedChange = onPlannedSpeedChange;
window.clearNavRoute = clearNavRoute;
window.centerMapOnBoat = centerMapOnBoat;
window.resetStartToGps = resetStartToGps;
window.clearWaypointTarget = clearWaypointTarget;
window.setActiveWaypointTarget = setActiveWaypointTarget;
window.addWaypointRow = addWaypointRow;
window.removeWaypointRow = removeWaypointRow;
window.recalculateCurrentRoute = recalculateCurrentRoute;
window.shareCurrentLocation = shareCurrentLocation;
window.requestCompassPermission = requestCompassPermission;
window.toggleMapFullscreen = toggleMapFullscreen;

