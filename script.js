let recordedBlob = null;
let uploadedBlob = null;
let mediaRecorder = null;
let audioChunks = [];
let timerInt = null;
let seconds = 0;
let audioCtx = null;

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const micBtn = document.getElementById('micBtn');
const timerEl = document.getElementById('timer');
const recStatus = document.getElementById('recStatus');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileNameEl = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const resultAudio = document.getElementById('resultAudio');
const downloadBtn = document.getElementById('downloadBtn');

const tuneRange = document.getElementById('tuneRange');
const reverbRange = document.getElementById('reverbRange');
const guitarRange = document.getElementById('guitarRange');
const tuneVal = document.getElementById('tuneVal');
const reverbVal = document.getElementById('reverbVal');
const guitarVal = document.getElementById('guitarVal');
const guitarToggle = document.getElementById('guitarToggle');
const compToggle = document.getElementById('compToggle');

tabs.forEach(t => t.onclick = () => {
  tabs.forEach(x => x.classList.remove('active'));
  panels.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.tab + '-panel').classList.add('active');
  updateBtn();
});

tuneRange.oninput = () => tuneVal.textContent = tuneRange.value + '%';
reverbRange.oninput = () => reverbVal.textContent = reverbRange.value + '%';
guitarRange.oninput = () => guitarVal.textContent = guitarRange.value + '%';

micBtn.onclick = async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    seconds = 0;
    timerEl.textContent = '00:00';
    recStatus.textContent = '🔴 Recording... dubara dabao stop karne ke liye';

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      recStatus.textContent = '✅ Recording ho gayi! Ab "Studio Magic" dabao';
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerInt);
      micBtn.classList.remove('recording');
      updateBtn();
    };

    mediaRecorder.start();
    micBtn.classList.add('recording');
    timerInt = setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds/60)).padStart(2,'0');
      const s = String(seconds%60).padStart(2,'0');
      timerEl.textContent = `${m}:${s}`;
    }, 1000);
  } catch (e) {
    alert('Mic permission nahi mila. Upload tab use karo.');
  }
};

dropZone.onclick = () => fileInput.click();
dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = '#00d4ff'; };
dropZone.ondragleave = () => dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
dropZone.ondrop = e => {
  e.preventDefault();
  dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
};
fileInput.onchange = e => e.target.files[0] && handleFile(e.target.files[0]);

function handleFile(f) {
  if (!f.type.startsWith('audio/')) { alert('Sirf audio file'); return; }
  uploadedBlob = f;
  fileNameEl.textContent = '📁 ' + f.name;
  updateBtn();
}

function updateBtn() {
  const active = document.querySelector('.tab.active').dataset.tab;
  processBtn.disabled = !((active === 'record' && recordedBlob) || (active === 'upload' && uploadedBlob));
}

processBtn.onclick = async () => {
  const active = document.querySelector('.tab.active').dataset.tab;
  const blob = active === 'record' ? recordedBlob : uploadedBlob;
  if (!blob) return;

  processBtn.disabled = true;
  result.classList.remove('show');
  loading.classList.add('show');
  loading.textContent = 'Studio processing chal rahi hai...';

  try {
    const buf = await blob.arrayBuffer();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(buf);
    const processed = await processAudio(decoded);
    const wav = bufferToWav(processed);
    const url = URL.createObjectURL(wav);

    resultAudio.src = url;
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-studio-song.wav';
      a.click();
    };

    loading.classList.remove('show');
    result.classList.add('show');
  } catch (e) {
    alert('Error: ' + e.message);
    loading.classList.remove('show');
  }
  processBtn.disabled = false;
};

async function processAudio(buffer) {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const offline = new OfflineAudioContext(2, len, sr);
  const src = offline.createBufferSource();
  src.buffer = buffer;

  const hp = offline.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 80;

  const warmth = offline.createBiquadFilter();
  warmth.type = 'peaking'; warmth.frequency.value = 200;
  warmth.Q.value = 1; warmth.gain.value = 2;

  const presence = offline.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 3000;
  presence.Q.value = 1; presence.gain.value = 3;

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = compToggle.checked ? -24 : -12;
  comp.knee.value = 20;
  comp.ratio.value = compToggle.checked ? 6 : 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;

  const gain = offline.createGain();
  gain.gain.value = 1.2;

  const reverbAmt = parseInt(reverbRange.value) / 100;
  const conv = offline.createConvolver();
  conv.buffer = makeImpulse(sr, 2.2, 2.5);
  const wet = offline.createGain(); wet.gain.value = reverbAmt * 0.5;
  const dry = offline.createGain(); dry.gain.value = 1 - reverbAmt * 0.3;

  const chorus = offline.createDelay();
  chorus.delayTime.value = 0.02;
  const chorusGain = offline.createGain();
  chorusGain.gain.value = parseInt(tuneRange.value) / 100 * 0.15;

  const merge = offline.createGain();

  src.connect(hp);
  hp.connect(warmth);
  warmth.connect(presence);
  presence.connect(comp);
  comp.connect(gain);

  gain.connect(dry); dry.connect(merge);
  gain.connect(conv); conv.connect(wet); wet.connect(merge);
  gain.connect(chorus); chorus.connect(chorusGain); chorusGain.connect(merge);

  merge.connect(offline.destination);

  if (guitarToggle.checked) {
    const gv = parseInt(guitarRange.value) / 100;
    if (gv > 0) {
      const gbuf = synthGuitar(sr, buffer.duration);
      const gsrc = offline.createBufferSource();
      gsrc.buffer = gbuf;
      const gg = offline.createGain(); gg.gain.value = gv * 0.35;
      gsrc.connect(gg); gg.connect(offline.destination);
      gsrc.start(0);
    }
  }

  src.start(0);
  return await offline.startRendering();
}

function makeImpulse(sr, sec, decay) {
  const len = sr * sec;
  const imp = audioCtx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = imp.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
  }
  return imp;
}

function synthGuitar(sr, dur) {
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(2, len, sr);
  const chords = [
    [220.00, 261.63, 329.63],
    [174.61, 220.00, 261.63],
    [261.63, 329.63, 392.00],
    [196.00, 246.94, 293.66]
  ];
  const cd = 2.0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let c = 0; c < Math.ceil(dur/cd); c++) {
      const chord = chords[c % chords.length];
      const start = Math.floor(c * cd * sr);
      chord.forEach(freq => {
        const pl = Math.floor(sr * 1.8);
        const noise = new Float32Array(pl);
        for (let i = 0; i < pl; i++) noise[i] = Math.random()*2-1;
        const per = Math.floor(sr / freq);
        for (let i = per; i < pl; i++) noise[i] = (noise[i-per] + noise[i-per+1]) * 0.5 * 0.996;
        for (let i = 0; i < pl; i++) {
          const idx = start + i;
          if (idx >= len) break;
          const env = Math.exp(-i / (sr * 0.8));
          d[idx] += noise[i] * env * 0.15;
        }
      });
    }
  }
  return buf;
}

function bufferToWav(buf) {
  const nc = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const ba = nc * 2, ds = len * ba, bs = 44 + ds;
  const ab = new ArrayBuffer(bs), v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'RIFF'); v.setUint32(4, 36+ds, true); ws(8,'WAVE'); ws(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*ba,true); v.setUint16(32,ba,true);
  v.setUint16(34,16,true); ws(36,'data'); v.setUint32(40,ds,true);
  const chs = []; for (let i = 0; i < nc; i++) chs.push(buf.getChannelData(i));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nc; c++) {
      let s = Math.max(-1, Math.min(1, chs[c][i]));
      v.setInt16(off, s < 0 ? s*0x8000 : s*0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}