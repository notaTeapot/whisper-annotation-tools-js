let episodesData = [];
let currentPodcastMeta = {};

// UI Elemente Sidebar
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const rssInput = document.getElementById('rss-input');
const loadRssBtn = document.getElementById('load-rss-btn');
const rssFileInput = document.getElementById('rss-file-input');

// UI Elemente Main
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
// 1. ITUNES SEARCH & LOOKUP API
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
                loadFromiTunes(pod.collectionId, pod.artworkUrl100);
            });
            searchResults.appendChild(li);
        });
    } catch (err) {
        searchResults.innerHTML = `<li style="padding:10px;color:red;text-align:center;">Fehler: ${err.message}</li>`;
    }
});

searchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchBtn.click(); });

async function loadFromiTunes(collectionId, fallbackImg) {
    podcastHeader.style.display = 'none';
    episodesTable.style.display = 'none';
    noEpMsg.style.display = 'none';
    loadingInd.style.display = 'block';

    try {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=5000`);
        const data = await res.json();

        if(data.results.length === 0) throw new Error("Keine Daten bei Apple gefunden.");

        const podcastInfo = data.results.find(r => r.kind === 'podcast' || r.wrapperType === 'track');
        const episodes = data.results.filter(r => r.wrapperType === 'podcastEpisode');

        currentPodcastMeta = {
            title: podcastInfo?.collectionName || "Unbekannt",
            author: podcastInfo?.artistName || "Unbekannt",
            feedUrl: podcastInfo?.feedUrl || ""
        };

        podTitle.textContent = currentPodcastMeta.title;
        podAuthor.textContent = currentPodcastMeta.author;
        podImage.src = podcastInfo?.artworkUrl600 || podcastInfo?.artworkUrl100 || fallbackImg || '';

        episodesData = [];
        episodes.forEach((ep, index) => {
            if (ep.episodeUrl) {
                let dateObj = new Date(ep.releaseDate);
                let dateStr = isNaN(dateObj.getTime()) ? ep.releaseDate : dateObj.toISOString().split('T')[0];

                episodesData.push({
                    id: index,
                    title: ep.trackName || `Episode ${index + 1}`,
                    date: dateStr,
                    description: ep.description || "",
                    audioUrl: ep.episodeUrl,
                    audioType: ep.episodeContentType || "audio/mpeg"
                });
            }
        });

        if (episodesData.length === 0) throw new Error("Der iTunes-Eintrag enthält keine abrufbaren Episoden-URLs.");

        finalizeParsing();

    } catch (err) {
        showError(`iTunes Abruf fehlgeschlagen: ${err.message}`);
    }
}

// ==========================================
// 2. LOKALER DATEI-UPLOAD
// ==========================================
rssFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    podcastHeader.style.display = 'none';
    episodesTable.style.display = 'none';
    noEpMsg.style.display = 'none';
    loadingInd.style.display = 'block';

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            parseXMLString(event.target.result, file.name, "Lokale Datei", "", "lokal");
        } catch (err) {
            showError(`Lokale Datei fehlerhaft: ${err.message}`);
        }
    };
    reader.readAsText(file);
});

// ==========================================
// 3. RSS URL LADEN
// ==========================================
loadRssBtn.addEventListener('click', () => {
    const url = rssInput.value.trim();
    if(url) loadRSSUrl(url);
});

async function fetchXML(url) {
    try {
        const directRes = await fetch(url);
        if (directRes.ok) return await directRes.text();
    } catch (e) {}

    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        if (data.contents) return data.contents;
    } catch (e) {
        throw new Error("Der Server blockiert alle externen Anfragen oder das XML ist zu groß.");
    }
    throw new Error("Fehler beim Verarbeiten des Feeds.");
}

async function loadRSSUrl(feedUrl) {
    podcastHeader.style.display = 'none';
    episodesTable.style.display = 'none';
    noEpMsg.style.display = 'none';
    loadingInd.style.display = 'block';

    try {
        const xmlText = await fetchXML(feedUrl);
        parseXMLString(xmlText, "Unbekannt", "Unbekannt", "", feedUrl);
    } catch (err) {
        showError(`Netzwerk Blockade. Bitte nutze die Such-Funktion oben. (${err.message})`);
    }
}

function showError(message) {
    loadingInd.style.display = 'none';
    noEpMsg.style.display = 'block';
    noEpMsg.innerHTML = `<span style="color:var(--del-text); background:var(--del-bg); padding:10px; border-radius:4px; display:inline-block; max-width:80%; line-height: 1.4;">${message}</span>`;
}

// ==========================================
// 4. PARSING LOGIK (Für RSS/XML)
// ==========================================
function parseXMLString(xmlText, fallbackTitle, fallbackAuthor, fallbackImg, sourceUrl) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");

    const parseError = xml.querySelector("parsererror");
    if (parseError) throw new Error("Kein gültiges XML/RSS-Format.");

    const channel = xml.querySelector('channel');
    if (!channel) throw new Error("Kein <channel> Element im Feed.");

    const cTitle = channel.querySelector('title')?.textContent || fallbackTitle;
    const cAuthor = channel.querySelector('itunes\\:author')?.textContent || channel.querySelector('author')?.textContent || fallbackAuthor;
    const cImage = channel.querySelector('itunes\\:image')?.getAttribute('href') || channel.querySelector('image url')?.textContent || fallbackImg;

    currentPodcastMeta = { title: cTitle, author: cAuthor, feedUrl: sourceUrl };

    podTitle.textContent = cTitle;
    podAuthor.textContent = cAuthor;
    podImage.src = cImage || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
    
    episodesData = [];
    const items = xml.querySelectorAll('item');

    items.forEach((item, index) => {
        const title = item.querySelector('title')?.textContent || `Episode ${index + 1}`;
        const pubDate = item.querySelector('pubDate')?.textContent || "";
        let description = item.querySelector('description')?.textContent || item.querySelector('itunes\\:summary')?.textContent || "";
        description = description.replace(/<[^>]*>?/gm, '').trim();

        const enclosure = item.querySelector('enclosure');
        const audioUrl = enclosure ? enclosure.getAttribute('url') : null;
        const audioType = enclosure ? enclosure.getAttribute('type') : "";

        if (audioUrl) {
            let dateObj = new Date(pubDate);
            let dateStr = isNaN(dateObj.getTime()) ? pubDate : dateObj.toISOString().split('T')[0];

            episodesData.push({ id: index, title: title, date: dateStr, description: description, audioUrl: audioUrl, audioType: audioType });
        }
    });

    finalizeParsing();
}

function finalizeParsing() {
    renderEpisodes();
    episodeSearchInput.value = ""; // Suchfeld leeren bei neuem Feed
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

// Such-/Filterfunktion
episodeSearchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = episodesBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    checkAll.checked = false;
});

checkAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.ep-check').forEach(cb => { 
        const row = cb.closest('tr');
        if (row.style.display !== 'none') {
            cb.checked = isChecked; 
        }
    });
    updateSelCount();
});

function updateSelCount() {
    const count = document.querySelectorAll('.ep-check:checked').length;
    selCount.textContent = count;
    downloadBtn.disabled = count === 0;
}

// Funktion für sichere Dateinamen
function sanitizeFilename(name) {
    if (!name) return "unbekannt";
    return name.replace(/[^a-z0-9_äöüß-]/gi, '_').substring(0, 80);
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

            // NEUES NAMENSFORMAT: PodcastName_Datum_EpisodenTitel
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
            
            // Metadaten JSON speichern
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

            // Audiodatei triggern
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
