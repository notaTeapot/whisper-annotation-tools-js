let transcriptData = null;
let metadataObj = {};
let originalFileName = "export";

// UI Elements
const inputTranscript = document.getElementById('file-input-transcript');
const inputMeta = document.getElementById('file-input-meta');
const dropZoneTranscript = document.getElementById('drop-zone-transcript');
const dropZoneMeta = document.getElementById('drop-zone-meta');
const nameTranscript = document.getElementById('name-transcript');
const nameMeta = document.getElementById('name-meta');

const actionSection = document.getElementById('action-section');
const statusMessage = document.getElementById('status-message');
const btnDownloadFLK = document.getElementById('btn-download-flk');
const btnDownloadXML = document.getElementById('btn-download-xml');

// --- File Handling Logic ---

function setupDropZone(dropZone, fileInput, nameDisplay, isMeta) {
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
        if (file) handleFile(file, nameDisplay, isMeta);
    });

    fileInput.addEventListener('change', function() {
        if (this.files[0]) handleFile(this.files[0], nameDisplay, isMeta);
    });
}

setupDropZone(dropZoneTranscript, inputTranscript, nameTranscript, false);
setupDropZone(dropZoneMeta, inputMeta, nameMeta, true);

function handleFile(file, nameDisplay, isMeta) {
    const reader = new FileReader();
    nameDisplay.textContent = file.name;
    
    if (!isMeta) {
        originalFileName = file.name.replace(/\.[^/.]+$/, "");
    }

    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (isMeta) {
                metadataObj = parsed;
            } else {
                // If the uploaded file is already a .flk (contains metadata + transcript), extract accordingly
                if (parsed.transcript && parsed.metadata) {
                    transcriptData = parsed.transcript;
                    metadataObj = parsed.metadata; // Override with internal metadata if present
                    nameMeta.textContent = "Metadaten aus .flk geladen";
                } else {
                    transcriptData = parsed;
                }
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

// 1. Export as .flk (JSON structure)
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
    
    // Construct doc attributes from metadata
    let docAttributes = '';
    for (const [key, value] of Object.entries(metadataObj)) {
        // Ensure values are safe for XML attributes
        const safeValue = String(value).replace(/"/g, '&quot;').replace(/&/g, '&amp;').replace(/</g, '&lt;');
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
                const wordText = w.word
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                xml += `      <w start="${w.start}" end="${w.end}" score="${w.score}">${wordText}</w>\n`;
            });
        }
        xml += `    </u>\n`;
    });

    xml += `  </doc>\n</corpus>`;
    
    downloadBlob(xml, `${originalFileName}_sketchengine.xml`, 'application/xml');
});
