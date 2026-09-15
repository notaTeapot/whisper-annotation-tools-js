// ==========================================
// NAVIGATION TAB LOGIC
// ==========================================
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Tabs toggeln
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Sections toggeln
        document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active-tool'));
        document.getElementById(tab.dataset.target).classList.add('active-tool');
        
        // Redraw Folker wavesurfer falls der Container vorher versteckt war
        if(tab.dataset.target === 'folker-tool' && ws) {
            setTimeout(() => ws.drawBuffer(), 50);
        }
    });
});

// ==========================================
// TOOL 1: WHISPER CONVERTER LOGIC
// ==========================================
let transcriptData = null;
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
const statusMessage = document.getElementById('status-message');
const btnDownloadFLK = document.getElementById('btn-download-flk');
const btnDownloadXML = document.getElementById('btn-download-xml');

function setupDropZone(dropZone, fileInput, nameDisplay) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover')));
    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) handleWhisperFile(file, nameDisplay);
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
            if (parsed.transcript && parsed.metadata) {
                transcriptData = parsed.transcript;
                metadataObj = parsed.metadata; 
                updateMetaTextarea(); 
            } else {
                transcriptData = parsed;
            }
            if (transcriptData) {
                actionSection.classList.remove('hidden');
            }
        } catch (error) {
            alert(`Fehler beim Lesen der Datei ${file.name}. Ungültiges JSON.`);
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

btnDownloadFLK.addEventListener('click', () => {
    if (!transcriptData) return;
    downloadBlob(JSON.stringify({ metadata: metadataObj, transcript: transcriptData }, null, 2), `${originalFileName}.flk`, 'application/json');
});

btnDownloadXML.addEventListener('click', () => {
    if (!transcriptData) return;
    let docAttrs = '';
    for (const [k, v] of Object.entries(metadataObj)) docAttrs += ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<corpus>\n  <doc${docAttrs}>\n`;
    transcriptData.forEach(segment => {
        xml += `    <u who="${segment.speaker || "UNKNOWN"}" start="${segment.start}" end="${segment.end}">\n`;
        if (segment.words) {
            segment.words.forEach(w => {
                const s = w.score !== undefined ? ` score="${w.score}"` : '';
                xml += `      <w start="${w.start}" end="${w.end}"${s}>${w.word.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w>\n`;
            });
        }
        xml += `    </u>\n`;
    });
    xml += `  </doc>\n</corpus>`;
    downloadBlob(xml, `${originalFileName}_sketchengine.xml`, 'application/xml');
});


// ==========================================
// TOOL 2: FOLKER WER ANALYZER LOGIC
// ==========================================
const ws = WaveSurfer.create({
    container: '#waveform-container', waveColor: '#b5d4eb', progressColor: '#007bff', height: 60, normalize: true, cursorWidth: 2
});
const wsRegions = ws.registerPlugin(WaveSurfer.Regions.create());
let activeRegion = null;

document.getElementById('play-pause-btn').addEventListener('click', () => ws.playPause());
ws.on('play', () => document.getElementById('play-pause-btn').innerText = '⏸');
ws.on('pause', () => document.getElementById('play-pause-btn').innerText = '▶');

document.getElementById('audio-file').addEventListener('change', function(e) {
    if (e.target.files[0]) {
        ws.loadBlob(e.target.files[0]);
        document.getElementById('player-row').style.display = 'flex';
    }
});

let rawRefXmlString = null, rawHypXmlString = null, globalRefBlocks = [], refSpeakerColors = {};
const colorPalette = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];

async function handleFileChange() {
    const r = document.getElementById('ref-file').files[0], h = document.getElementById('hyp-file').files[0];
    if (r) rawRefXmlString = await r.text();
    if (h) rawHypXmlString = await h.text();
    if (rawRefXmlString && rawHypXmlString) {
        const tempRef = parseFolkerXML(rawRefXmlString, { ignoreGat2: false, replaceHyphens: false, keepCase: true, keepPunct: true });
        const tempHyp = parseFolkerXML(rawHypXmlString, { ignoreGat2: false, replaceHyphens: false, keepCase: true, keepPunct: true });
        renderSpeakerSettings(tempRef.speakers, tempHyp.speakers);
        runAnalysis();
    }
}

function changeAlignmentPreset() {
    const preset = document.getElementById('alignment-preset').value;
    if (preset === 'nist') { document.getElementById('weight-sub').value = 4; document.getElementById('weight-del').value = 3; document.getElementById('weight-ins').value = 3; } 
    else if (preset === 'lev') { document.getElementById('weight-sub').value = 1; document.getElementById('weight-del').value = 1; document.getElementById('weight-ins').value = 1; }
    runAnalysis();
}
function setCustomAlignment() { document.getElementById('alignment-preset').value = 'custom'; runAnalysis(); }

function runAnalysis() {
    if (!rawRefXmlString || !rawHypXmlString) return;
    document.getElementById('loading').style.display = 'block';
    document.getElementById('player-row').style.display = 'flex';

    const optsRef = {
        isAsr: false, keepPunct: !document.getElementById('ref-punct').checked, keepCase: !document.getElementById('ref-case').checked,
        ignoreGat2: document.getElementById('ref-gat').checked, replaceHyphens: document.getElementById('ref-hyphen').checked
    };
    const optsAsr = {
        isAsr: true, keepPunct: !document.getElementById('asr-punct').checked, keepCase: !document.getElementById('asr-case').checked,
        ignoreGat2: document.getElementById('asr-gat').checked, replaceHyphens: document.getElementById('asr-hyphen').checked
    };

    const refData = parseFolkerXML(rawRefXmlString, optsRef), hypData = parseFolkerXML(rawHypXmlString, optsAsr);
    calculateSpeakerMapping(refData, hypData);

    const activeRef = new Set(), activeAsr = new Set();
    document.querySelectorAll('.ref-spk-cb:checked').forEach(cb => activeRef.add(cb.value));
    document.querySelectorAll('.asr-spk-cb:checked').forEach(cb => activeAsr.add(cb.value));
    if(activeRef.size === 0) refData.speakers.forEach(s => activeRef.add(s));
    if(activeAsr.size === 0) hypData.speakers.forEach(s => activeAsr.add(s));

    const finalRefBlocks = refData.blocks.filter(b => activeRef.has(b.speaker)), finalRefWords = [];
    finalRefBlocks.forEach(b => finalRefWords.push(...b.words));
    const finalHypBlocks = hypData.blocks.filter(b => activeAsr.has(b.speaker)), finalHypWords = [];
    finalHypBlocks.forEach(b => finalHypWords.push(...b.words));

    globalRefBlocks = finalRefBlocks;
    const costs = { sub: parseInt(document.getElementById('weight-sub').value)||4, del: parseInt(document.getElementById('weight-del').value)||3, ins: parseInt(document.getElementById('weight-ins').value)||3 };
    worker.postMessage({ refWords: finalRefWords, hypWords: finalHypWords, costs });
}

function calculateSpeakerMapping(refData, hypData) {
    const mapping = {}; 
    hypData.blocks.forEach(hBlock => {
        const hDur = hBlock.endTime - hBlock.startTime;
        if (hDur <= 0) return;
        if (!mapping[hBlock.speaker]) mapping[hBlock.speaker] = { total: 0, refs: {} };
        mapping[hBlock.speaker].total += hDur;
        refData.blocks.forEach(rBlock => {
            const overlap = Math.max(0, Math.min(hBlock.endTime, rBlock.endTime) - Math.max(hBlock.startTime, rBlock.startTime));
            if (overlap > 0) {
                if (!mapping[hBlock.speaker].refs[rBlock.speaker]) mapping[hBlock.speaker].refs[rBlock.speaker] = 0;
                mapping[hBlock.speaker].refs[rBlock.speaker] += overlap;
            }
        });
    });
    const container = document.getElementById('mapping-container');
    const asrSpeakers = Object.keys(mapping).sort();
    if (!asrSpeakers.length) return container.innerHTML = '<em class="text-muted">Keine ASR-Sprecherdaten gefunden.</em>';
    let html = `<table class="mapping-table"><thead><tr><th>ASR Sprecher</th><th>Bester Match in Ref</th></tr></thead><tbody>`;
    asrSpeakers.forEach(asrSpk => {
        let bestRef = "Kein Match", bestPct = 0;
        Object.keys(mapping[asrSpk].refs).forEach(r => { const p = (mapping[asrSpk].refs[r]/mapping[asrSpk].total)*100; if(p > bestPct){ bestPct=p; bestRef=r; } });
        const c = bestRef !== "Kein Match" && refSpeakerColors[bestRef] ? `<span class="spk-color-box" style="background:${refSpeakerColors[bestRef]}"></span>` : '';
        html += `<tr><td><strong>${asrSpk}</strong></td><td><div style="display:flex; align-items:center;">${c} ${bestRef} (${bestPct.toFixed(1)}%)</div><div class="map-bar-container"><div class="map-bar" style="width: ${bestPct}%;"></div></div></td></tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderSpeakerSettings(refSpks, hypSpks) {
    const container = document.getElementById('speaker-settings');
    const existR = {}, existH = {};
    document.querySelectorAll('.ref-spk-cb').forEach(cb => existR[cb.value] = cb.checked);
    document.querySelectorAll('.asr-spk-cb').forEach(cb => existH[cb.value] = cb.checked);
    if (!refSpks.length && !hypSpks.length) return container.innerHTML = '<em class="text-muted">Keine Sprecher.</em>';

    refSpeakerColors = {};
    refSpks.sort().forEach((s, i) => refSpeakerColors[s] = colorPalette[i % colorPalette.length]);

    container.innerHTML = `<div class="speaker-col"><h5>Ref-Sprecher</h5>${refSpks.sort().map(s => `<label class="speaker-list-item"><input type="checkbox" class="ref-spk-cb" value="${s}" ${existR[s] !== false ? 'checked' : ''} onchange="runAnalysis()"><span class="spk-color-box" style="background:${refSpeakerColors[s]}"></span> ${s}</label>`).join('')}</div>
                           <div class="speaker-col"><h5>ASR-Sprecher</h5>${hypSpks.sort().map(s => `<label class="speaker-list-item"><input type="checkbox" class="asr-spk-cb" value="${s}" ${existH[s] !== false ? 'checked' : ''} onchange="runAnalysis()"> ${s}</label>`).join('')}</div>`;
}

function formatTimeFolker(sec) {
    if(isNaN(sec)) return "00:00.00";
    const m = Math.floor(sec/60), s = Math.floor(sec%60), ms = Math.floor((sec%1)*100);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
}
function normalizeTextWord(w, opts) { let r = w.trim(); if (!opts.keepCase) r = r.toLowerCase(); if (!opts.keepPunct) r = r.replace(/[.,/#!$%^&*;:{}=\_`~()?"']/g, ""); return r; }
function parseFolkerXML(xmlStr, opts) {
    const doc = new DOMParser().parseFromString(xmlStr, "application/xml");
    const tMap = {}; doc.querySelectorAll("timepoint").forEach(tp => tMap[tp.getAttribute("timepoint-id")] = parseFloat(tp.getAttribute("absolute-time")));
    const blocks = []; const speakers = new Set(); let bIdx = 0;
    doc.querySelectorAll("contribution").forEach(c => {
        let spk = c.getAttribute("speaker-reference") || "UNKNOWN"; speakers.add(spk);
        let curr = { id: bIdx++, startTime: tMap[c.getAttribute("start-reference")]||0, endTime: null, speaker: spk, metaTokens: [], words: [] };
        const process = (n) => {
            if (n.nodeName === 'time') { curr.endTime = tMap[n.getAttribute('timepoint-reference')]; if (curr.words.length||curr.metaTokens.length) blocks.push(curr); curr = { id: bIdx++, startTime: curr.endTime, endTime: null, speaker: spk, metaTokens: [], words: [] }; }
            else if (n.nodeName === 'non-phonological' && !opts.ignoreGat2) curr.metaTokens.push(`((${n.getAttribute('description')||''}))`);
            else if (n.nodeName === 'pause' && !opts.ignoreGat2) curr.metaTokens.push(`(${n.getAttribute('duration')})`);
            else if (n.nodeName === 'breathe' && !opts.ignoreGat2) curr.metaTokens.push(n.getAttribute('type')==='out' ? 'h°' : '°h');
            else if (n.nodeType === 3 && n.nodeValue.trim()) {
                let txt = n.nodeValue;
                if(opts.ignoreGat2) txt = txt.replace(/\(\(.*?\)\)/g, ' ').replace(/\([^)]+\)/g, ' ');
                if(opts.replaceHyphens) txt = txt.replace(/-/g, ' ');
                txt.split(/\s+/).forEach(t => { if(t.trim()) { const norm = normalizeTextWord(t, opts); if(norm) curr.words.push({orig:t, norm, blockIndex:curr.id}); }});
            } else if (n.childNodes) n.childNodes.forEach(process);
        };
        c.childNodes.forEach(process);
        curr.endTime = tMap[c.getAttribute("end-reference")]; if (curr.words.length||curr.metaTokens.length) blocks.push(curr);
    });
    return { words: blocks.flatMap(b=>b.words), blocks, speakers: Array.from(speakers) };
}

// Inline Web Worker for NIST Sclite
const worker = new Worker(URL.createObjectURL(new Blob([`
    self.onmessage = function(e) {
        const { refWords, hypWords, costs } = e.data;
        const len1 = refWords.length, len2 = hypWords.length;
        if (!len1 && !len2) { postMessage({ wer: 0, subs: 0, ins: 0, dels: 0, alignment: [] }); return; }
        const cols = len2 + 1, mat = new Uint32Array((len1 + 1) * cols);
        for(let i=0;i<=len1;i++) mat[i*cols] = i*costs.del;
        for(let j=0;j<=len2;j++) mat[j] = j*costs.ins;
        for(let i=1;i<=len1;i++) for(let j=1;j<=len2;j++) {
            const m = refWords[i-1].norm === hypWords[j-1].norm;
            mat[i*cols+j] = Math.min(mat[(i-1)*cols+j]+costs.del, mat[i*cols+(j-1)]+costs.ins, mat[(i-1)*cols+(j-1)]+(m?0:costs.sub));
        }
        let i=len1, j=len2, a=[], s=0, ins=0, d=0;
        while(i>0||j>0) {
            const m = i>0 && j>0 && refWords[i-1].norm === hypWords[j-1].norm;
            if(m && mat[i*cols+j] === mat[(i-1)*cols+(j-1)]) { a.unshift({type:'C',ref:refWords[i-1],hyp:hypWords[j-1]}); i--; j--; }
            else if(i>0 && j>0 && !m && mat[i*cols+j] === mat[(i-1)*cols+(j-1)]+costs.sub) { a.unshift({type:'S',ref:refWords[i-1],hyp:hypWords[j-1]}); s++; i--; j--; }
            else if(i>0 && mat[i*cols+j] === mat[(i-1)*cols+j]+costs.del) { a.unshift({type:'D',ref:refWords[i-1],hyp:null}); d++; i--; }
            else { a.unshift({type:'I',ref:null,hyp:hypWords[j-1], blockFallback: i>0?refWords[i-1].blockIndex:(len1>0?refWords[0].blockIndex:0)}); ins++; j--; }
        }
        postMessage({ wer: len1?((s+ins+d)/len1)*100:0, subs:s, ins, dels:d, alignment:a });
    };
`], { type: 'application/javascript' })));

worker.onmessage = function(e) {
    document.getElementById('loading').style.display = 'none';
    const { wer, subs, dels, ins, alignment } = e.data;
    document.getElementById('wer-score').innerText = wer.toFixed(2) + '%';
    document.getElementById('stat-s').innerText = subs; document.getElementById('stat-d').innerText = dels; document.getElementById('stat-i').innerText = ins;
    
    const bMap = new Map(), sC = {}, dC = {}, iC = {};
    alignment.forEach(a => {
        const id = a.ref ? a.ref.blockIndex : a.blockFallback;
        if (!bMap.has(id)) bMap.set(id, []);
        bMap.get(id).push(a);
        if(a.type === 'S') sC[`${a.ref.orig}➔${a.hyp.orig}`] = (sC[`${a.ref.orig}➔${a.hyp.orig}`]||0)+1;
        else if(a.type === 'D') dC[a.ref.orig] = (dC[a.ref.orig]||0)+1;
        else if(a.type === 'I') iC[a.hyp.orig] = (iC[a.hyp.orig]||0)+1;
    });

    const rl = (m, id) => { const el = document.getElementById(id); el.innerHTML = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w,c])=>`<li><span>${w}</span><span class="error-count">${c}x</span></li>`).join('')||'<li class="text-muted">Keine Fehler</li>'; };
    rl(sC, 'top-subs-list'); rl(dC, 'top-dels-list'); rl(iC, 'top-ins-list');

    const trBody = document.getElementById('transcript-body'), gCont = document.getElementById('wer-graph-container');
    trBody.innerHTML = ''; gCont.innerHTML = '';
    const totT = globalRefBlocks.length ? Math.max(...globalRefBlocks.map(b=>b.endTime)) : 0;

    globalRefBlocks.forEach(b => {
        const al = bMap.get(b.id) || [];
        let n=0, s=0, d=0, i=0; al.forEach(x=>{ if(x.type==='C')n++; if(x.type==='S'){n++;s++;} if(x.type==='D'){n++;d++;} if(x.type==='I')i++; });
        const bw = n ? ((s+d+i)/n)*100 : 0, dur = b.endTime - b.startTime;
        
        if (dur>0 && totT>0) {
            const bar = document.createElement('div'); bar.className = 'graph-bar';
            bar.style.width = (dur/totT*100)+'%'; bar.style.height = Math.max(Math.min(bw,100),5)+'%';
            bar.style.backgroundColor = bw>30?'#ea4335':(bw>10?'#fbbc04':'#34a853'); bar.title=`${b.speaker} | WER: ${Math.round(bw)}%`;
            gCont.appendChild(bar);
        }

        const r = document.createElement('div'); r.className = 'tr-row'; r.dataset.start = b.startTime; r.dataset.end = b.endTime;
        r.innerHTML = `<div class="td col-start">${formatTimeFolker(b.startTime)}</div><div class="td col-end">${formatTimeFolker(b.endTime)}</div><div class="td col-speaker"><span class="spk-color-box" style="background:${refSpeakerColors[b.speaker]||'#fff'}"></span>${b.speaker}</div>`;
        const tc = document.createElement('div'); tc.className = 'td col-text';
        b.metaTokens.forEach(m => tc.innerHTML += `<span class="token token-meta">${m}</span>`);
        al.forEach(a => {
            if(a.type==='C') tc.innerHTML += `<span class="token token-C">${a.ref.orig}</span>`;
            else if(a.type==='S') tc.innerHTML += `<span class="token token-S">${a.ref.orig}<span class="sub-hyp">[${a.hyp.orig}]</span></span>`;
            else if(a.type==='D') tc.innerHTML += `<span class="token token-D">${a.ref.orig}</span>`;
            else if(a.type==='I') tc.innerHTML += `<span class="token token-I">[+${a.hyp.orig}]</span>`;
        });
        r.appendChild(tc); r.onclick = () => ws.play(parseFloat(r.dataset.start)); trBody.appendChild(r);
    });
};

ws.on('timeupdate', t => {
    let f = false;
    document.querySelectorAll('.tr-row').forEach(r => {
        const s = parseFloat(r.dataset.start), e = parseFloat(r.dataset.end);
        if (t>=s && t<=e) {
            f = true;
            if (!r.classList.contains('active')) {
                document.querySelectorAll('.tr-row.active').forEach(x => x.classList.remove('active'));
                r.classList.add('active'); r.scrollIntoView({behavior:'smooth', block:'center'});
                if(!activeRegion) activeRegion = wsRegions.addRegion({start:s, end:e, color:'rgba(51,153,255,0.3)', drag:false, resize:false});
                else activeRegion.setOptions({start:s, end:e});
            }
        }
    });
    if (!f) { document.querySelectorAll('.tr-row.active').forEach(x=>x.classList.remove('active')); if(activeRegion) {activeRegion.remove(); activeRegion=null;} }
});
