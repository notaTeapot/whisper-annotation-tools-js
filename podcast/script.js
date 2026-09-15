let episodesData = [];
let currentPodcastMeta = {};

// UI Elemente
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const rssInput = document.getElementById('rss-input');
const loadRssBtn = document.getElementById('load-rss-btn');
const rssFileInput = document.getElementById('rss-file-input');

const podcastHeader = document.getElementById('podcast-header');
const podTitle = document.getElementById('pod-title');
const podAuthor = document.getElementById('pod-author');
const podImage = document.getElementById('pod-image');
const loadingInd = document.getElementById('loading-indicator');
const episodesTable = document.getElementById('episodes-table');
const episodesBody = document.getElementById('episodes-body');
const noEpMsg = document.getElementById('no-episodes-msg');
const checkAll = document.getElementById('check-all');
const downloadBtn = document.getElementById('download-btn');
const selCount = document.getElementById('sel-count');
const episodeSearchInput = document.getElementById('episode-search');

// ==========================================
// 1. ITUNES SEARCH API
// ==========================================
searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    
    searchResults.innerHTML = '<li style="padding:10px;text-align:center;">Suche...</li>';
    
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&limit=15`);
        const data = await res.json();
        
        searchResults.innerHTML = '';
        if (data.results.length === 0) {
            searchResults.innerHTML = '<li style="padding:10px;text-align:center;">Nichts gefunden.</li>';
            return;
        }

        data.results.forEach(pod => {
            const li = document.createElement('li');
            li.className = 'podcast-item';
            li.innerHTML = `
                <img src="${pod.artworkUrl60}" alt="Cover">
                <div>
                    <div class="podcast-title">${pod.collectionName}</div>
                    <div class="podcast-author">${pod.artistName}</div>
                </div>
            `;
            li.addEventListener('click', () => {
                rssInput.value = pod.feedUrl; 
                // Wir nutzen iTunes nur für die Meta-Daten/Suche, laden aber den echten RSS Feed,
                // um das 200 Episoden Limit von Apple zu umgehen.
                loadRSSUrl(pod.feedUrl, pod.collectionName, pod.artistName, pod.artworkUrl100);
            });
            searchResults.appendChild(li);
        });
    } catch (err) {
        searchResults.innerHTML = `<li style="padding:10px;color:red;text-align:center;">Fehler: ${err.message}</li>`;
    }
});

searchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchBtn.click(); });


// ==========================================
// 2. RSS URL LADEN & PAGINIERUNG (CORS Bypasses)
// ==========================================
loadRssBtn.addEventListener('click', () => {
    const url = rssInput.value.trim();
    if(url) loadRSSUrl(url);
});

// Stufenweises Fetching zur maximalen Kompatibilität
async function fetchXML(url) {
    try {
        const directRes = await fetch(url);
        if (directRes.ok) return await directRes.text();
    } catch (e) {}

    try {
        const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
        if (res.ok) return await res.text();
    } catch (e) {}

    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        if (data.contents) return data.contents;
    } catch (e) {
        throw new Error("Der Server blockiert alle Anfragen oder der Feed ist zu groß.");
    }
    throw new Error("Feed konnte nicht geladen werden.");
}

async function loadRSSUrl(feedUrl, fallbackTitle = "", fallbackAuthor = "", fallbackImg = "") {
    podcastHeader.style.display = 'none';
    episodesTable.style.display = 'none';
    noEpMsg.style.display = 'none';
    loadingInd.style.display = 'block';
    
    episodesData = []; // Reset
    let currentUrl = feedUrl;
    let pageCount = 0;

    try {
        // Paginierungs-Loop (Unterstützung für <atom:link rel="next">)
        while (currentUrl && pageCount < 20) { // Max 20 Seiten als Sicherheitslimit
            loadingInd.textContent = `Lade Episoden... (${episodesData.length} gefunden)`;
            
            const xmlText = await fetchXML(currentUrl);
            const nextUrl = parseXMLStringAndAppend(xmlText, fallbackTitle, fallbackAuthor, fallbackImg, feedUrl, pageCount === 0);
            
            currentUrl = nextUrl;
            pageCount++;
        }
        
        finalizeParsing();
    } catch (err) {
        showError(`Feed konnte nicht vollständig geladen werden. Bitte Feed-URL im Browser öffnen, als .xml speichern und lokal hochladen. (${err.message})`);
    }
}

// ==========================================
// 3. LOKALER DATEI-UPLOAD (Fallback)
// ==========================================
rssFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    podcastHeader.style.display = 'none';
    episodesTable.style.display = 'none';
    noEpMsg.style.display = 'none';
    loadingInd.style.display = 'block';
    episodesData = []; // Reset

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            parseXMLStringAndAppend(event.target.result, file.name, "Lokale Datei", "", "lokal", true);
            finalizeParsing();
        } catch (err) {
            showError(`Lokale Datei fehlerhaft: ${err.message}`);
        }
    };
    reader.readAsText(file);
});

function showError(message) {
    loadingInd.style.display = 'none';
    noEpMsg.style.display = 'block';
    noEpMsg.innerHTML = `<span style="color:var(--del-text); background:var(--del-bg); padding:10px; border-radius:4px; display:inline-block; max-width:80%; line-height: 1.4;">${message}</span>`;
}

// ==========================================
// 4. PARSING LOGIK
// ==========================================
function parseXMLStringAndAppend(xmlText, fallbackTitle, fallbackAuthor, fallbackImg, sourceUrl, isFirstPage) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");

    const parseError = xml.querySelector("parsererror");
    if (parseError) throw new Error("Kein gültiges XML/RSS-Format.");

    // Beim ersten Aufruf Podcast-Metadaten setzen
    if (isFirstPage) {
        const channel = xml.querySelector('channel');
        if (!channel) throw new Error("Kein <channel> Element im Feed.");

        const cTitle = channel.querySelector('title')?.textContent || fallbackTitle;
        const cAuthor = channel.querySelector('itunes\\:author')?.textContent || channel.querySelector('author')?.textContent || fallbackAuthor;
        const cImage = channel.querySelector('itunes\\:image')?.getAttribute('href') || channel.querySelector('image url')?.textContent || fallbackImg;

        currentPodcastMeta = { title: cTitle, author: cAuthor, feedUrl: sourceUrl };

        podTitle.textContent = cTitle;
        podAuthor.textContent = cAuthor;
        podImage.src = cImage || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
    }
    
    // Episoden extrahieren
    const items = xml.querySelectorAll('item');
    items.forEach((item) => {
        const title = item.querySelector('title')?.textContent || `Episode ${episodesData.length + 1}`;
        const pubDate = item.querySelector('pubDate')?.textContent || "";
        let description = item.querySelector('description')?.textContent || item.querySelector('itunes\\:summary')?.textContent || "";
        description = description.replace(/<[^>]*>?/gm, '').trim();

        const enclosure = item.querySelector('enclosure');
        const audioUrl = enclosure ? enclosure.getAttribute('url') : null;
        const audioType = enclosure ? enclosure.getAttribute('type') : "";

        if (audioUrl) {
            let dateObj = new Date(pubDate);
            let dateStr = isNaN(dateObj.getTime()) ? pubDate : dateObj.toISOString().split('T')[0];

            episodesData.push({ 
                id: episodesData.length, 
                title: title, 
                date: dateStr, 
                description: description, 
                audioUrl: audioUrl, 
                audioType: audioType 
            });
        }
    });

    // Prüfen ob es eine nächste Seite gibt (RFC 5005 Paginierung)
    const links = xml.querySelectorAll('*'); // Namespace-sicherer Query
    for (let i = 0; i < links.length; i++) {
        const nodeName = links[i].nodeName.toLowerCase();
        if ((nodeName === 'link' || nodeName.includes(':link')) && links[i].getAttribute('rel') === 'next') {
            return links[i].getAttribute('href');
        }
    }
    return null; // Keine weitere Seite
}

function finalizeParsing() {
    renderEpisodes();
    episodeSearchInput.value = ""; 
    loadingInd.style.display = 'none';
    podcastHeader.style.display = 'flex';
    episodesTable.style.display = 'table';
}

// ==========================================
// 5. EPISODEN RENDERING & SELEKTION
// ==========================================
function renderEpisodes() {
    episodesBody.innerHTML = '';
    checkAll.checked = false;
    updateSelCount();

    episodesData.forEach(ep => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="ep-check" data-id="${ep.id}"></td>
            <td class="ep-date">${ep.date}</td>
            <td>
                <div style="font-weight: 600; color: var(--text-color);">${ep.title}</div>
                <div class="ep-desc" title="${ep.description}">${ep.description}</div>
            </td>
            <td><a href="${ep.audioUrl}" target="_blank" style="font-size:0.8rem; color:var(--accent-primary);">Link</a></td>
        `;
        episodesBody.appendChild(tr);
    });

    document.querySelectorAll('.ep-check').forEach(cb => {
        cb.addEventListener('change', updateSelCount);
    });
}

// Suchfunktion Episoden
episodeSearchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = episodesBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
    checkAll.checked = false;
});

checkAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.ep-check').forEach(cb => { 
        const row = cb.closest('tr');
        if (row.style.display !== 'none') cb.checked = isChecked; 
    });
    updateSelCount();
});

function updateSelCount() {
    const count = document.querySelectorAll('.ep-check:checked').length;
    selCount.textContent = count;
    downloadBtn.disabled = count === 0;
}

// Bereinigt Dateinamen (Entfernt Sonderzeichen, doppelte Unterstriche etc.)
function sanitizeFilename(name) {
    if (!name) return "unbekannt";
    return name.replace(/[^a-z0-9_äöüß-]/gi, '_').replace(/_+/g, '_').substring(0, 80);
}

// ==========================================
// 6. DIREKTER DOWNLOAD
// ==========================================
downloadBtn.addEventListener('click', async () => {
    const selectedBoxes = document.querySelectorAll('.ep-check:checked');
    if (selectedBoxes.length === 0) return;

    const originalText = downloadBtn.innerHTML;
    downloadBtn.disabled = true;

    for (let i = 0; i < selectedBoxes.length; i++) {
        const cb = selectedBoxes[i];
        const epId = parseInt(cb.getAttribute('data-id'));
        const ep = episodesData.find(e => e.id === epId);
        
        if (ep) {
            downloadBtn.textContent = `Lade (${i + 1}/${selectedBoxes.length})...`;

            // === HIER IST DEIN GEFORDERTES DATEINAMEN FORMAT ===
            // Format: PodcastName_Datum_Folge
            const safePodcastTitle = sanitizeFilename(currentPodcastMeta.title || "Podcast");
            const safeEpTitle = sanitizeFilename(ep.title || "Episode");
            const fileNameBase = `${safePodcastTitle}_${ep.date}_${safeEpTitle}`;
            
            const metadata = {
                podcast_title: currentPodcastMeta.title,
                podcast_author: currentPodcastMeta.author,
                episode_title: ep.title,
                date: ep.date,
                audio_url: ep.audioUrl,
                audio_type: ep.audioType,
                description: ep.description
            };
            
            // 1. JSON Metadaten herunterladen (name_metadata.json)
            const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
            const jsonUrl = URL.createObjectURL(jsonBlob);
            const aJson = document.createElement('a');
            aJson.href = jsonUrl;
            aJson.download = `${fileNameBase}_metadata.json`; 
            document.body.appendChild(aJson);
            aJson.click();
            document.body.removeChild(aJson);
            URL.revokeObjectURL(jsonUrl);

            await new Promise(r => setTimeout(r, 600));

            // 2. Audiodatei triggern (name.mp3)
            let ext = ".mp3";
            if (ep.audioUrl.toLowerCase().includes(".m4a")) ext = ".m4a";
            if (ep.audioUrl.toLowerCase().includes(".wav")) ext = ".wav";
            if (ep.audioUrl.toLowerCase().includes(".ogg")) ext = ".ogg";
            
            try {
                const response = await fetch(ep.audioUrl);
                if (!response.ok) throw new Error("HTTP Fehler");
                
                const audioBlob = await response.blob();
                const audioBlobUrl = URL.createObjectURL(audioBlob);

                const aAudio = document.createElement('a');
                aAudio.href = audioBlobUrl;
                aAudio.download = `${fileNameBase}${ext}`;
                document.body.appendChild(aAudio);
                aAudio.click();
                document.body.removeChild(aAudio);
                URL.revokeObjectURL(audioBlobUrl);
                
            } catch (err) {
                console.warn("CORS blockiert den direkten Download. Nutze neues Fenster.", err);
                const aAudioFallback = document.createElement('a');
                aAudioFallback.href = ep.audioUrl;
                aAudioFallback.download = `${fileNameBase}${ext}`;
                aAudioFallback.target = '_blank';
                document.body.appendChild(aAudioFallback);
                aAudioFallback.click();
                document.body.removeChild(aAudioFallback);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
});
