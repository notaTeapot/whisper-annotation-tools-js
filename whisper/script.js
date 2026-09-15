let rawWhisperData = null;
let metadataObj = {};
let originalFileName = "export";

const inputTranscript = document.getElementById('file-input-transcript');
const dropZoneTranscript = document.getElementById('drop-zone-transcript');
const nameTranscript = document.getElementById('name-transcript');
const metaKey = document.getElementById('meta-key');
const metaValue = document.getElementById('meta-value');
const btnAddMeta = document.getElementById('btn-add-meta');
const metaJsonTextarea = document.getElementById('meta-json');
const metaError = document.getElementById('meta-error');
const actionSection = document.getElementById('action-section');
const btnDownloadFLK = document.getElementById('btn-download-flk');
const btnDownloadXML = document.getElementById('btn-download-xml');

function formatTimeH(s) {
    if (s === null || s === undefined) return "none";
    let hours = Math.floor(s / 3600);
    let minutes = Math.floor((s % 3600) / 60);
    let seconds = Math.floor(s % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

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

function setupDropZone(dropZone, fileInput, nameDisplay) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover')));
    dropZone.addEventListener('drop', e => {
        if (e.dataTransfer.files[0]) handleWhisperFile(e.dataTransfer.files[0], nameDisplay);
    });
    fileInput.addEventListener('change', function() {
        if (this.files[0]) handleWhisperFile(this.files[0], nameDisplay);
    });
}
setupDropZone(dropZoneTranscript, inputTranscript, nameTranscript);

function handleWhisperFile(file, nameDisplay) {
    const reader = new FileReader();
    nameDisplay.textContent = file.name;
    originalFileName = file.name.replace(/\.[^/.]+$/, "");

    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                rawWhisperData = parsed;
            } else if (parsed.speakers && Array.isArray(parsed.speakers)) {
                rawWhisperData = parsed.speakers;
                if (parsed.metadata) metadataObj = parsed.metadata;
            } else if (parsed.segments && Array.isArray(parsed.segments)) {
                rawWhisperData = parsed.segments;
            } else {
                throw new Error("Unbekanntes Format. Erwartet wird ein Array oder ein Objekt mit 'speakers' / 'segments'.");
            }

            updateMetaTextarea(); 
            
            if (rawWhisperData && rawWhisperData.length > 0) {
                actionSection.classList.remove('hidden');
            }
        } catch (error) {
            console.error(error);
            alert(`Fehler beim Lesen der Datei ${file.name}.\nGrund: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

function updateMetaTextarea() {
    metaJsonTextarea.value = Object.keys(metadataObj).length ? JSON.stringify(metadataObj, null, 2) : '';
}

btnAddMeta.addEventListener('click', () => {
    const k = metaKey.value.trim(), v = metaValue.value.trim();
    if (k) {
        metadataObj[k] = v;
        updateMetaTextarea();
        metaKey.value = ''; metaValue.value = '';
        metaError.classList.add('hidden');
    }
});

metaJsonTextarea.addEventListener('input', () => {
    const raw = metaJsonTextarea.value.trim();
    if (!raw) { metadataObj = {}; metaError.classList.add('hidden'); return; }
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            metadataObj = parsed; metaError.classList.add('hidden');
        } else throw new Error();
    } catch (e) { metaError.classList.remove('hidden'); }
});

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function escapeXML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

btnDownloadFLK.addEventListener('click', () => {
    if (!rawWhisperData) return;
    const documentData = structureWhisperSpeakers(rawWhisperData, true); 
    
    let now = new Date();
    let currentTime = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    let logText = metadataObj.name ? `Generated by whisper-annotation-tools ${metadataObj.name}, ${metadataObj.date || ''}, ${metadataObj.spotify_url || ''}` : "Generated by whisper-annotation-tools";
    
    let speakersList = Array.from(new Set(documentData.map(p => p.speaker))).sort();
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<folker-transcription>\n  <head>\n    <transcription-log>\n      <log-entry start="${currentTime}" end="${currentTime}" who="system">${escapeXML(logText)}</log-entry>\n    </transcription-log>\n  </head>\n`;
    xml += `  <speakers>\n`;
    for (let spk of speakersList) {
        xml += `    <speaker speaker-id="${escapeXML(spk)}">\n      <name>${escapeXML(spk)}</name>\n    </speaker>\n`;
    }
    xml += `  </speakers>\n`;

    let audioFile = originalFileName + ".wav";
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
    
    downloadBlob(xml, `${originalFileName}.flk`, 'application/xml');
});

btnDownloadXML.addEventListener('click', () => {
    if (!rawWhisperData) return;
    const documentData = structureWhisperSpeakers(rawWhisperData);
    
    let docAttrs = "";
    for (let [k, v] of Object.entries(metadataObj)) {
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
    
    downloadBlob(xml, `${originalFileName}_sketchengine.xml`, 'application/xml');
});
