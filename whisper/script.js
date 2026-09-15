let fileGroups = {};

// --- SLIDER LOGIC ---
const formatBtns = document.querySelectorAll('.toggle-btn');
const exFlk = document.getElementById('example-flk');
const exXml = document.getElementById('example-xml');

formatBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        formatBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const format = e.target.dataset.format;
        exFlk.style.display = format === 'flk' ? 'flex' : 'none';
        exXml.style.display = format === 'xml' ? 'flex' : 'none';
    });
});

// --- HELPER FUNCTIONS ---
function formatTimeH(s) {
    if (s === null || s === undefined) return "none";
    let hours = Math.floor(s / 3600);
    let minutes = Math.floor((s % 3600) / 60);
    let seconds = Math.floor(s % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function escapeXML(str) {
    if(typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- PYTHON PORT: structure_whisper_speakers ---
function structureWhisperSpeakers(whisperData, markPauses = false, minPause = 0.1) {
    let elements = whisperData.map(item => ({
        text: item.text !== undefined ? item.text : (item.word || ""),
        timestamp: [
            item.timestamp ? item.timestamp[0] : item.start,
            item.timestamp ? item.timestamp[1] : item.end
        ],
        speaker: item.speaker || "UNKNOWN"
    }));

    let newSpeakers = [];
    for (let el of elements) {
        el.timestamp_h = ["none", "none"];
        if (typeof el.timestamp[0] === 'number') {
            el.timestamp[0] = Math.round(el.timestamp[0] * 100) / 100;
            el.timestamp_h[0] = formatTimeH(el.timestamp[0]);
        }
        if (typeof el.timestamp[1] === 'number') {
            el.timestamp[1] = Math.round(el.timestamp[1] * 100) / 100;
            el.timestamp_h[1] = formatTimeH(el.timestamp[1]);
        }
        if (el.timestamp[0] >= 0) {
            newSpeakers.push(el);
        }
    }
    elements = newSpeakers;

    let lastSpeaker = null, lastTs = 0;
    let sentenceStart = null, sentenceStop = null;
    let sentenceStartH = null, sentenceStopH = null;
    let documentData = [];
    let paragraphSentences = [];
    let sentenceText = "";

    for (let el of elements) {
        let begin = false;
        let speaker = el.speaker;

        if (sentenceText === "") {
            sentenceStart = el.timestamp[0];
            sentenceStartH = el.timestamp_h[0];
            begin = true;
        }

        if (speaker !== lastSpeaker && paragraphSentences.length !== 0) {
            documentData.push({
                speaker: lastSpeaker,
                timestamp: [paragraphSentences[0].timestamp[0], paragraphSentences[paragraphSentences.length - 1].timestamp[1]],
                timestamp_h: [paragraphSentences[0].timestamp_h[0], paragraphSentences[paragraphSentences.length - 1].timestamp_h[1]],
                sentences: paragraphSentences
            });
            paragraphSentences = [];
        }

        let pause = el.timestamp[0] - lastTs;
        if (markPauses && pause >= minPause && !begin) {
            let pauseTxt = " (.)";
            if (pause >= 0.2) pauseTxt = " (-)";
            if (pause >= 0.5) pauseTxt = " (--)";
            if (pause >= 0.8) pauseTxt = " (---)";
            if (pause >= 1) pauseTxt = ` (${pause.toFixed(1)})`;
            sentenceText += pauseTxt;
        }

        sentenceStop = el.timestamp[1];
        sentenceStopH = el.timestamp_h[1];
        sentenceText += el.text; 

        let lastChar = el.text.trim().slice(-1);
        if (['.', '?', '!'].includes(lastChar)) {
            paragraphSentences.push({
                text: sentenceText.startsWith(" ") ? sentenceText.substring(1) : sentenceText, 
                timestamp: [sentenceStart, sentenceStop],
                timestamp_h: [sentenceStartH, sentenceStopH]
            });
            sentenceText = "";
        }

        lastSpeaker = speaker;
        if (el.timestamp[1] !== null) lastTs = el.timestamp[1];
    }

    if (sentenceText.trim() !== "") {
        paragraphSentences.push({
            text: sentenceText.startsWith(" ") ? sentenceText.substring(1) : sentenceText,
            timestamp: [sentenceStart, sentenceStop],
            timestamp_h: [sentenceStartH, sentenceStopH]
        });
    }

    if (paragraphSentences.length > 0) {
        documentData.push({
            speaker: lastSpeaker,
            timestamp: [paragraphSentences[0].timestamp[0], paragraphSentences[paragraphSentences.length - 1].timestamp[1]],
            timestamp_h: [paragraphSentences[0].timestamp_h[0], paragraphSentences[paragraphSentences.length - 1].timestamp_h[1]],
            sentences: paragraphSentences
        });
    }

    return documentData;
}

// --- GENERATOR FUNKTIONEN ---
function generateFLK(documentData, metaObj, baseName) {
    let now = new Date();
    let currentTime = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    
    let logText = "Generated by whisper-annotation-tools";
    if (metaObj && Object.keys(metaObj).length > 0) {
        logText += ` ${metaObj.podcast_title || metaObj.name || ''}, ${metaObj.date || ''}, ${metaObj.audio_url || metaObj.spotify_url || ''}`;
    }
    
    let speakersList = Array.from(new Set(documentData.map(p => p.speaker))).sort();
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<folker-transcription>\n  <head>\n    <transcription-log>\n      <log-entry start="${currentTime}" end="${currentTime}" who="system">${escapeXML(logText.trim())}</log-entry>\n    </transcription-log>\n  </head>\n`;
    xml += `  <speakers>\n`;
    for (let spk of speakersList) {
        xml += `    <speaker speaker-id="${escapeXML(spk)}">\n      <name>${escapeXML(spk)}</name>\n    </speaker>\n`;
    }
    xml += `  </speakers>\n`;

    let audioFile = baseName + ".wav";
    xml += `  <recording path="${escapeXML(audioFile)}" />\n  <timeline>\n`;

    let startTs = -1, endTs = -1;
    let lastId = 0, startId = 0, endId = 0;
    let timelineXML = "";
    let contributionXML = "";

    for (let paragraph of documentData) {
        for (let sentence of paragraph.sentences) {
            if (sentence.timestamp[0] !== startTs) {
                lastId++; startId = lastId; startTs = sentence.timestamp[0];
                timelineXML += `    <timepoint timepoint-id="TLI_${startId}" absolute-time="${startTs}" />\n`;
            }
            if (sentence.timestamp[1] !== endTs) {
                lastId++; endId = lastId; endTs = sentence.timestamp[1];
                timelineXML += `    <timepoint timepoint-id="TLI_${endId}" absolute-time="${endTs}" />\n`;
            }

            contributionXML += `  <contribution speaker-reference="${escapeXML(paragraph.speaker)}" start-reference="TLI_${startId}" end-reference="TLI_${endId}">\n`;
            contributionXML += `    <unparsed>${escapeXML(sentence.text)}</unparsed>\n  </contribution>\n`;
        }
    }
    xml += timelineXML;
    xml += `  </timeline>\n`;
    xml += contributionXML;
    xml += `</folker-transcription>`;
    
    return xml;
}

function generateXML(documentData, metaObj) {
    let docAttrs = "";
    for (let [k, v] of Object.entries(metaObj || {})) {
        docAttrs += ` ${k}="${escapeXML(String(v))}"`;
    }
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by whisper-annotation-tools -->\n<doc${docAttrs}>\n`;

    for (let p of documentData) {
        let pTs = `[${p.timestamp[0]}, ${p.timestamp[1]}]`;
        let pTsh = `['${p.timestamp_h[0]}', '${p.timestamp_h[1]}']`;
        xml += `  <p speaker="${escapeXML(p.speaker)}" timestamp="${pTs}" timestamp_h="${pTsh}">\n`;

        for (let s of p.sentences) {
            let sTs = `[${s.timestamp[0]}, ${s.timestamp[1]}]`;
            let sTsh = `['${s.timestamp_h[0]}', '${s.timestamp_h[1]}']`;
            xml += `    <s timestamp="${sTs}" timestamp_h="${sTsh}">${escapeXML(s.text)}</s>\n`;
        }
        xml += `  </p>\n`;
    }
    xml += `</doc>`;
    return xml;
}

// --- BULK UPLOAD HANDLING ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const actionSection = document.getElementById('action-section');
const btnConvertAll = document.getElementById('btn-convert-all');

function setupDropZone(dz, input) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dz.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(eventName => dz.addEventListener(eventName, () => dz.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(eventName => dz.addEventListener(eventName, () => dz.classList.remove('dragover')));
    
    dz.addEventListener('drop', e => processFiles(e.dataTransfer.files));
    input.addEventListener('change', function() { processFiles(this.files); });
}
setupDropZone(dropZone, fileInput);

function processFiles(files) {
    if(files.length === 0) return;

    Array.from(files).forEach(file => {
        const isMeta = file.name.endsWith('_metadata.json');
        const baseName = isMeta ? file.name.replace('_metadata.json', '') : file.name.replace('.json', '');
        
        if (!fileGroups[baseName]) fileGroups[baseName] = { transcript: null, metadata: null };

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (isMeta) {
                    fileGroups[baseName].metadata = data;
                } else {
                    if (Array.isArray(data)) fileGroups[baseName].transcript = data;
                    else if (data.speakers && Array.isArray(data.speakers)) fileGroups[baseName].transcript = data.speakers;
                    else if (data.segments && Array.isArray(data.segments)) fileGroups[baseName].transcript = data.segments;
                }
                renderFileList();
            } catch(err) { console.error("Parse Error bei Datei", file.name); }
        };
        reader.readAsText(file);
    });
}

function renderFileList() {
    fileList.innerHTML = '';
    const entries = Object.entries(fileGroups);
    if(entries.length === 0) return;

    let hasValidTranscript = false;

    entries.forEach(([base, group]) => {
        const hasT = group.transcript !== null;
        const hasM = group.metadata !== null;
        if(hasT) hasValidTranscript = true;

        let statusHtml = "";
        if (hasT && hasM) statusHtml = `<span class="status-pair">✓ Paar gefunden</span>`;
        else if (hasT) statusHtml = `<span class="status-single">Nur Transkript</span>`;
        else statusHtml = `<span style="color:var(--text-light);">Nur Metadaten</span>`;

        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `<span>${base}</span> ${statusHtml}`;
        fileList.appendChild(div);
    });

    fileListContainer.style.display = 'block';
    
    if (hasValidTranscript) actionSection.classList.remove('hidden');
    else actionSection.classList.add('hidden');
}

// --- JSZIP / DIREKT EXPORT ---
btnConvertAll.addEventListener('click', async () => {
    const format = document.querySelector('.toggle-btn.active').dataset.format;
    const entries = Object.entries(fileGroups);
    const validEntries = entries.filter(([base, group]) => group.transcript);
    
    if (validEntries.length === 0) return;

    const originalText = btnConvertAll.innerHTML;
    btnConvertAll.disabled = true;
    btnConvertAll.textContent = "Verarbeite...";

    // FIX: Keine ZIP bei nur 1-2 generierten Output-Dateien
    if (validEntries.length <= 2) {
        for (let i = 0; i < validEntries.length; i++) {
            const [baseName, group] = validEntries[i];
            const docData = structureWhisperSpeakers(group.transcript, format === 'flk'); // Folker = Pausen markieren wie original
            const meta = group.metadata || {};

            if (format === 'flk') {
                const flkContent = generateFLK(docData, meta, baseName);
                downloadBlob(flkContent, `${baseName}.flk`, 'application/xml');
            } else {
                const xmlContent = generateXML(docData, meta);
                downloadBlob(xmlContent, `${baseName}_sketchengine.xml`, 'application/xml');
            }

            if (i < validEntries.length - 1) await new Promise(r => setTimeout(r, 600)); // Pause für Multi-Download
        }
        btnConvertAll.disabled = false;
        btnConvertAll.innerHTML = originalText;
        return;
    }

    // ZIP für 3+ Dateien
    const zip = new JSZip();

    for (let [baseName, group] of validEntries) {
        const docData = structureWhisperSpeakers(group.transcript, format === 'flk');
        const meta = group.metadata || {};

        if (format === 'flk') {
            const flkContent = generateFLK(docData, meta, baseName);
            zip.file(`${baseName}.flk`, flkContent);
        } else {
            const xmlContent = generateXML(docData, meta);
            zip.file(`${baseName}_sketchengine.xml`, xmlContent);
        }
    }

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whisper_converted_${format.toUpperCase()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(e) {
        alert("Fehler bei der ZIP-Generierung: " + e.message);
    } finally {
        btnConvertAll.disabled = false;
        btnConvertAll.innerHTML = originalText;
    }
});
