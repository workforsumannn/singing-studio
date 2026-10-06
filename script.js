document.addEventListener('DOMContentLoaded', () => {

    // ---------- STATE ----------
    let audioCtx = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let startTime = 0;
    let timerInterval = null;
    let analyser = null;
    let animationFrame = null;
    let micStream = null;
    let uploadedAudioBuffer = null;
    let recordedBlob = null;

    // ---------- ELEMENTS ----------
    const micBtn = document.getElementById('mic-btn');
    const timerDisplay = document.getElementById('timer');
    const recStatus = document.getElementById('rec-status');
    const canvas = document.getElementById('waveform-canvas');
    const ctx = canvas.getContext('2d');

    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.panel');
    const presets = document.querySelectorAll('.preset-card');

    const sliders = {
        autotune: document.getElementById('autotune'),
        reverb: document.getElementById('reverb'),
        warmth: document.getElementById('warmth'),
        gain: document.getElementById('gain')
    };
    const values = {
        autotune: document.getElementById('val-autotune'),
        reverb: document.getElementById('val-reverb'),
        warmth: document.getElementById('val-warmth'),
        gain: document.getElementById('val-gain')
    };

    const toggles = {
        compression: document.getElementById('tog-compression'),
        deesser: document.getElementById('tog-deesser'),
        limiter: document.getElementById('tog-limiter')
    };

    const processBtn = document.getElementById('process-btn');
    const loader = document.getElementById('loader');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.getElementById('progress-fill');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const resultSection = document.getElementById('result-section');
    const resultAudio = document.getElementById('result-audio');
    const dlWav = document.getElementById('dl-wav');
    const dlMp3 = document.getElementById('dl-mp3');

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('selected-file-name');

    // ---------- PRESETS (Vocal Only) ----------
    const presetData = {
        bollywood: { tune: 75, reverb: 35, warmth: 60, gain: 110 },
        acoustic:  { tune: 40, reverb: 20, warmth: 45, gain: 100 },
        pop:       { tune: 85, reverb: 40, warmth: 55, gain: 115 },
        lofi:      { tune: 30, reverb: 60, warmth: 75, gain: 95 }
    };

    // ---------- INIT ----------
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // ---------- TABS ----------
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab + '-panel').classList.add('active');
            updateProcessBtn();
        });
    });

    // ---------- PRESETS ----------
    presets.forEach(preset => {
        preset.addEventListener('click', () => {
            presets.forEach(p => p.classList.remove('active'));
            preset.classList.add('active');
            const data = presetData[preset.dataset.preset];
            sliders.autotune.value = data.tune;
            sliders.reverb.value = data.reverb;
            sliders.warmth.value = data.warmth;
            sliders.gain.value = data.gain;
            updateSliderValues();
        });
    });

    function updateSliderValues() {
        values.autotune.textContent = sliders.autotune.value;
        values.reverb.textContent = sliders.reverb.value;
        values.warmth.textContent = sliders.warmth.value;
        values.gain.textContent = sliders.gain.value;
    }

    Object.values(sliders).forEach(slider => {
        slider.addEventListener('input', updateSliderValues);
    });

    function updateProcessBtn() {
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'record') processBtn.disabled = !recordedBlob;
        else processBtn.disabled = !uploadedAudioBuffer;
    }

    // ---------- RECORDING ----------
    micBtn.addEventListener('click', async () => {
        initAudio();
        if (!isRecording) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
                });

                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';

                mediaRecorder = new MediaRecorder(micStream, { mimeType });
                recordedChunks = [];

                const sourceNode = audioCtx.createMediaStreamSource(micStream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 2048;
                sourceNode.connect(analyser);

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) recordedChunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    recordedBlob = new Blob(recordedChunks, { type: mimeType });
                    recStatus.textContent = 'Recording complete. Ab Studio Magic dabao.';
                    micStream.getTracks().forEach(t => t.stop());
                    clearInterval(timerInterval);
                    cancelAnimationFrame(animationFrame);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    updateProcessBtn();
                };

                mediaRecorder.start(100);
                isRecording = true;
                micBtn.classList.add('recording');
                recStatus.textContent = 'Recording... dubara dabao stop ke liye';
                startTime = Date.now();
                timerInterval = setInterval(updateTimer, 1000);
                drawWaveform();

            } catch (err) {
                showError('Mic access nahi mila. Upload tab use karo.');
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
        }
    });

    function updateTimer() {
        const delta = Math.floor((Date.now() - startTime) / 1000);
        const m = String(Math.floor(delta / 60)).padStart(2, '0');
        const s = String(delta % 60).padStart(2, '0');
        timerDisplay.textContent = `${m}:${s}`;
    }

    function drawWaveform() {
        if (!analyser) return;
        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);

        const draw = () => {
            if (!isRecording) return;
            analyser.getByteTimeDomainData(data);

            ctx.fillStyle = 'rgba(18,18,26,0.6)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
            grad.addColorStop(0, '#8b5cf6');
            grad.addColorStop(1, '#06b6d4');

            ctx.lineWidth = 2;
            ctx.strokeStyle = grad;
            ctx.beginPath();

            const sliceW = canvas.width / bufLen;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                const v = data[i] / 128.0;
                const y = (v * canvas.height) / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceW;
            }
            ctx.stroke();
            animationFrame = requestAnimationFrame(draw);
        };
        draw();
    }

    // ---------- UPLOAD ----------
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    async function handleFile(file) {
        if (!file.type.startsWith('audio/')) {
            showError('Sirf audio file chalegi.');
            return;
        }
        initAudio();
        fileNameDisplay.textContent = file.name;

        try {
            const ab = await file.arrayBuffer();
            uploadedAudioBuffer = await audioCtx.decodeAudioData(ab);
            recordedBlob = null;
            updateProcessBtn();
        } catch (e) {
            showError('Audio decode fail ho gaya.');
        }
    }

    // ---------- PROCESS ----------
    processBtn.addEventListener('click', async () => {
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;

        let buffer = null;
        if (activeTab === 'upload' && uploadedAudioBuffer) {
            buffer = uploadedAudioBuffer;
        } else if (activeTab === 'record' && recordedBlob) {
            try {
                const ab = await recordedBlob.arrayBuffer();
                buffer = await audioCtx.decodeAudioData(ab);
            } catch (e) {
                showError('Recording decode fail.');
                return;
            }
        }

        if (!buffer) {
            showError('Pehle audio record ya upload karo.');
            return;
        }

        processBtn.disabled = true;
        loader.classList.remove('hidden');
        resultSection.classList.add('hidden');
        errorBox.classList.add('hidden');
        progressFill.style.width = '0%';

        const steps = [
            'Audio decode ho raha hai...',
            'Noise aur rumble hata rahe hain...',
            'Muddy frequencies cut kar rahe hain...',
            'De-esser lag raha hai...',
            'Dual-stage compression...',
            'Presence aur clarity...',
            'Air aur sparkle...',
            'Warmth aur body...',
            'Reverb aur final polish...'
        ];

        let stepIndex = 0;
        const stepInterval = setInterval(() => {
            loadingText.textContent = steps[stepIndex % steps.length];
            progressFill.style.width = Math.min(95, ((stepIndex + 1) / steps.length) * 100) + '%';
            stepIndex++;
        }, 600);

        try {
            const processedBuffer = await processAudio(audioCtx, buffer);

            const wavBlob = audioBufferToWav(processedBuffer);
            const url = URL.createObjectURL(wavBlob);

            resultAudio.src = url;

            dlWav.onclick = () => {
                const a = document.createElement('a');
                a.href = url;
                a.download = 'StudioPro-Suman-V1.wav';
                a.click();
            };

            dlMp3.onclick = () => {
                exportMp3(processedBuffer);
            };

            clearInterval(stepInterval);
            progressFill.style.width = '100%';

            setTimeout(() => {
                loader.classList.add('hidden');
                resultSection.classList.remove('hidden');
                resultSection.scrollIntoView({ behavior: 'smooth' });
            }, 400);

        } catch (e) {
            clearInterval(stepInterval);
            loader.classList.add('hidden');
            showError('Processing error: ' + e.message);
            console.error(e);
        }

        processBtn.disabled = false;
    });

    // ---------- VOCAL-ONLY PROCESSING CHAIN ----------
    async function processAudio(ctx, buffer) {
        const sr = buffer.sampleRate;
        const len = buffer.length;
        const offline = new OfflineAudioContext(2, len, sr);
        const src = offline.createBufferSource();
        src.buffer = buffer;

        const reverbAmt = parseInt(sliders.reverb.value) / 100;
        const warmthAmt = parseInt(sliders.warmth.value) / 100;
        const gainAmt = parseInt(sliders.gain.value) / 100;

        // 1. High-pass filter (80 Hz)
        const hp = offline.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 80;
        hp.Q.value = 0.7;

        // 2. Subtractive EQ 1 (300 Hz mud)
        const eq1 = offline.createBiquadFilter();
        eq1.type = 'peaking';
        eq1.frequency.value = 300;
        eq1.Q.value = 1.2;
        eq1.gain.value = -3;

        // 3. Subtractive EQ 2 (520 Hz boxiness)
        const eq2 = offline.createBiquadFilter();
        eq2.type = 'peaking';
        eq2.frequency.value = 520;
        eq2.Q.value = 1.4;
        eq2.gain.value = -2.5;

        // 4. De-esser (6.8 kHz)
        const deEss = offline.createBiquadFilter();
        deEss.type = 'peaking';
        deEss.frequency.value = 6800;
        deEss.Q.value = 2;
        deEss.gain.value = toggles.deesser.checked ? -5 : 0;

        // 5. Warmth (220 Hz body)
        const warmth = offline.createBiquadFilter();
        warmth.type = 'peaking';
        warmth.frequency.value = 220;
        warmth.Q.value = 1;
        warmth.gain.value = 1.5 + (warmthAmt * 2.5);

        // 6. Compressor 1 (peak control)
        const comp1 = offline.createDynamicsCompressor();
        comp1.threshold.value = toggles.compression.checked ? -20 : -10;
        comp1.knee.value = 8;
        comp1.ratio.value = 4;
        comp1.attack.value = 0.003;
        comp1.release.value = 0.1;

        // 7. Compressor 2 (smoothness)
        const comp2 = offline.createDynamicsCompressor();
        comp2.threshold.value = toggles.compression.checked ? -18 : -8;
        comp2.knee.value = 20;
        comp2.ratio.value = 2;
        comp2.attack.value = 0.02;
        comp2.release.value = 0.28;

        // 8. Presence boost (3.2 kHz clarity)
        const presence = offline.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 3200;
        presence.Q.value = 0.9;
        presence.gain.value = 2.5;

        // 9. Air shelf (10.5 kHz sparkle)
        const air = offline.createBiquadFilter();
        air.type = 'highshelf';
        air.frequency.value = 10500;
        air.gain.value = 2;

        // 10. Output gain
        const gain = offline.createGain();
        gain.gain.value = 1.1 * gainAmt;

        // 11. Reverb (short room, subtle)
        const conv = offline.createConvolver();
        conv.buffer = makeImpulse(sr, 1.8, 3.2);
        const wet = offline.createGain();
        wet.gain.value = reverbAmt * 0.35;
        const dry = offline.createGain();
        dry.gain.value = 1 - reverbAmt * 0.2;

        const merge = offline.createGain();

        // Build chain
        src.connect(hp);
        hp.connect(eq1);
        eq1.connect(eq2);
        eq2.connect(deEss);
        deEss.connect(warmth);
        warmth.connect(comp1);
        comp1.connect(comp2);
        comp2.connect(presence);
        presence.connect(air);
        air.connect(gain);

        gain.connect(dry);
        dry.connect(merge);

        gain.connect(conv);
        conv.connect(wet);
        wet.connect(merge);

        // Limiter
        if (toggles.limiter.checked) {
            const limiter = offline.createDynamicsCompressor();
            limiter.threshold.value = -2;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.001;
            limiter.release.value = 0.05;
            merge.connect(limiter);
            limiter.connect(offline.destination);
        } else {
            merge.connect(offline.destination);
        }

        src.start(0);
        return await offline.startRendering();
    }

    // ---------- REVERB IMPULSE (Short Room) ----------
    function makeImpulse(sr, sec, decay) {
        const len = Math.floor(sr * sec);
        const imp = audioCtx.createBuffer(2, len, sr);
        for (let c = 0; c < 2; c++) {
            const d = imp.getChannelData(c);
            for (let i = 0; i < len; i++) {
                const early = i < sr * 0.04 ? (Math.random() * 0.3) : 0;
                d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)) + early;
            }
        }
        return imp;
    }

    // ---------- WAV EXPORT ----------
    function audioBufferToWav(buf) {
        const nc = buf.numberOfChannels;
        const sr = buf.sampleRate;
        const len = buf.length;
        const ba = nc * 2;
        const ds = len * ba;
        const bs = 44 + ds;
        const ab = new ArrayBuffer(bs);
        const view = new DataView(ab);

        const writeStr = (o, s) => {
            for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
        };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + ds, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, nc, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * ba, true);
        view.setUint16(32, ba, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, ds, true);

        const channels = [];
        for (let i = 0; i < nc; i++) channels.push(buf.getChannelData(i));

        let off = 44;
        for (let i = 0; i < len; i++) {
            for (let c = 0; c < nc; c++) {
                let s = Math.max(-1, Math.min(1, channels[c][i]));
                view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                off += 2;
            }
        }
        return new Blob([ab], { type: 'audio/wav' });
    }

    // ---------- MP3 EXPORT ----------
    function exportMp3(buffer) {
        if (typeof lamejs === 'undefined') {
            showError('MP3 encoder load nahi hua. WAV download karo.');
            return;
        }
        try {
            const channels = buffer.numberOfChannels;
            const sr = buffer.sampleRate;
            const encoder = new lamejs.Mp3Encoder(channels, sr, 192);
            const left = buffer.getChannelData(0);
            const right = channels > 1 ? buffer.getChannelData(1) : left;

            const to16 = (arr) => {
                const o = new Int16Array(arr.length);
                for (let i = 0; i < arr.length; i++) {
                    let s = Math.max(-1, Math.min(1, arr[i]));
                    o[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                return o;
            };

            const l16 = to16(left);
            const r16 = to16(right);
            const blockSize = 1152;
            const mp3Data = [];

            for (let i = 0; i < l16.length; i += blockSize) {
                const lc = l16.subarray(i, i + blockSize);
                const rc = r16.subarray(i, i + blockSize);
                const buf = encoder.encodeBuffer(lc, rc);
                if (buf.length > 0) mp3Data.push(buf);
            }
            const end = encoder.flush();
            if (end.length > 0) mp3Data.push(end);

            const blob = new Blob(mp3Data, { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'StudioPro-Suman-V1.mp3';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            showError('MP3 export fail: ' + e.message);
        }
    }

    // ---------- UTIL ----------
    function showError(msg) {
        errorMsg.textContent = msg;
        errorBox.classList.remove('hidden');
        setTimeout(() => errorBox.classList.add('hidden'), 7000);
    }

    // Initial
    updateSliderValues();
});