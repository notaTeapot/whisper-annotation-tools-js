let transcriptData = null;
let metadataObj = {};
let originalFileName = "export";

// UI Elements: Upload
const inputTranscript = document.getElementById('file-input-transcript');
const dropZoneTranscript = document.getElementById('drop-zone-transcript');
const nameTranscript = document.getElementById('name-transcript');

// UI Elements: Metadata Editor
const metaKey = document.getElementById('meta-key');
const metaValue = document.getElementById('meta-value');
const btnAddMeta = document.getElementById('btn-add-meta');
const metaJsonTextarea = document.getElementById('meta-json');
const metaError = document.getElementById('meta-error');

// UI Elements: Actions
const actionSection = document.getElementById('action-section');
const statusMessage = document.getElementById('status-message');
const btnDownloadFLK = document.getElementById('btn-download-flk');
const btnDownloadXML = document.getElementById('btn-download-xml');

// --- Drag & Drop & File Handling ---

function setupDropZone(dropZone, fileInput, nameDisplay) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
    });

    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file, nameDisplay);
    });

    fileInput.addEventListener('change', function() {
        if (this.files[0]) handleFile(this.files[0], nameDisplay);
    });
}

setupDropZone(dropZoneTranscript, inputTranscript, nameTranscript);

function handleFile(file, nameDisplay) {
    const reader = new FileReader();
    nameDisplay.textContent = file.name;
    originalFileName = file.name.replace(/\.[^/.]+$/, "");

    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            
            // Kompatibilität mit dem FLK Format aus dem Repo
            if (parsed.transcript && parsed.metadata) {
                transcriptData = parsed.transcript;
                metadataObj = parsed.metadata; 
                updateMetaTextarea(); 
            } else {
                // Rohdaten Whisper JSON Array
                transcriptData = parsed;
            }
            checkReadyState();
        } catch (error) {
            alert(`Fehler beim Lesen der Datei ${file.name}. Bitte stelle sicher, dass es gültiges JSON ist.`);
            console.error(error);
        }
    };
    reader.readAsText(file);
}

function checkReadyState() {
    if (transcriptData) {
        actionSection.classList.remove('hidden');
        statusMessage.textContent = 'Daten bereit. Wähle das gewünschte Format:';
        statusMessage.className = 'success';
    }
}

// --- Metadata Editor Logic ---

function updateMetaTextarea() {
    if (Object.keys(metadataObj).length === 0) {
        metaJsonTextarea.value = '';
    } else {
        metaJsonTextarea.value = JSON.stringify(metadataObj, null, 2);
    }
}

btnAddMeta.addEventListener('click', () => {
    const k = metaKey.value.trim();
    const v = metaValue.value.trim();
    
    if (k) {
        metadataObj[k] = v;
        updateMetaTextarea();
        
        metaKey.value = '';
        metaValue.value = '';
        metaError.classList.add('hidden');
    }
});

metaJsonTextarea.addEventListener('input', () => {
    const raw = metaJsonTextarea.value.trim();
    
    if (!raw) {
        metadataObj = {};
        metaError.classList.add('hidden');
        return;
    }
    
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            metadataObj = parsed;
            metaError.classList.add('hidden');
        } else {
            throw new Error("Muss ein JSON-Objekt sein.");
        }
    } catch (e) {
        metaError.classList.remove('hidden');
    }
});

// --- Conversion Logic ---

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 1. Export as .flk (Beibehaltung der Funktionalität aus dem Repo)
btnDownloadFLK.addEventListener('click', () => {
    if (!transcriptData) return;
    
    const flkStructure = {
        metadata: metadataObj,
        transcript: transcriptData
    };
    
    const jsonString = JSON.stringify(flkStructure, null, 2);
    downloadBlob(jsonString, `${originalFileName}.flk`, 'application/json');
});

// 2. Export as Sketch Engine XML
btnDownloadXML.addEventListener('click', () => {
    if (!transcriptData) return;
    
    let docAttributes = '';
    for (const [key, value] of Object.entries(metadataObj)) {
        const safeValue = String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        docAttributes += ` ${key}="${safeValue}"`;
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<corpus>\n  <doc${docAttributes}>\n`;

    transcriptData.forEach(segment => {
        const speaker = segment.speaker || "UNKNOWN";
        const start = segment.start;
        const end = segment.end;
        
        xml += `    <u who="${speaker}" start="${start}" end="${end}">\n`;

        if (segment.words && Array.isArray(segment.words)) {
            segment.words.forEach(w => {
                // Word score als Attribut, Wort-Text sicher escapen
                const scoreAttr = w.score !== undefined ? ` score="${w.score}"` : '';
                const wordText = w.word
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                xml += `      <w start="${w.start}" end="${w.end}"${scoreAttr}>${wordText}</w>\n`;
            });
        }
        xml += `    </u>\n`;
    });

    xml += `  </doc>\n</corpus>`;
    
    downloadBlob(xml, `${originalFileName}_sketchengine.xml`, 'application/xml');
});
