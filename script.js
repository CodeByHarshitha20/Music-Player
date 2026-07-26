const tracks = [
  {
    title: "Amber Static",
    artist: "The Low Frequencies",
    duration: 22,
    chord: [220.0, 277.18, 329.63],   // A3, C#4, E4
    wave: "sine"
  },
  {
    title: "Slow Room, Blue Light",
    artist: "Nadia Ferro",
    duration: 18,
    chord: [196.0, 246.94, 293.66],   // G3, B3, D4
    wave: "triangle"
  },
  {
    title: "Nine Floors Up",
    artist: "Marching Season",
    duration: 26,
    chord: [174.61, 220.0, 261.63],   // F3, A3, C4
    wave: "sawtooth"
  },
  {
    title: "Tape Hiss Lullaby",
    artist: "The Low Frequencies",
    duration: 20,
    chord: [246.94, 293.66, 349.23],  // B3, D4, F4
    wave: "sine"
  },
  {
    title: "Corner Booth, 2am",
    artist: "Marching Season",
    duration: 24,
    chord: [207.65, 261.63, 311.13],  // G#3, C4, D#4
    wave: "triangle"
  }
];

/*Synth audio engine*/
class AudioEngine {
  constructor(){
    this.ctx = null;
    this.masterGain = null;
    this.filter = null;
    this.oscillators = [];
    this.envelopeGain = null;
    this.playStartCtxTime = 0;
    this.playing = false;
  }
  _ensureContext(){
    if (!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended"){
      this.ctx.resume();
    }
  }
  setVolume(v){
    if (this.masterGain) this.masterGain.gain.value = v;
    this._pendingVolume = v;
  }
  start(track, elapsed){
    this._ensureContext();
    this._stopOscillators();
    const now = this.ctx.currentTime;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;
    this.envelopeGain = this.ctx.createGain();
    this.envelopeGain.gain.setValueAtTime(0, now);
    this.envelopeGain.gain.linearRampToValueAtTime(0.22, now + 0.35);
    this.filter.connect(this.envelopeGain);
    this.envelopeGain.connect(this.masterGain);
    if (this._pendingVolume !== undefined){
      this.masterGain.gain.value = this._pendingVolume;
    }
    this.oscillators = track.chord.map((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = track.wave;
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 4; // gentle chorus
      osc.connect(this.filter);
      osc.start(now);
      return osc;
    });
    this.playStartCtxTime = now - elapsed;
    this.playing = true;
  }
  stop(){
    const elapsed = this.playing ? (this.ctx.currentTime - this.playStartCtxTime) : 0;
    if (this.envelopeGain && this.ctx){
      const now = this.ctx.currentTime;
      this.envelopeGain.gain.cancelScheduledValues(now);
      this.envelopeGain.gain.setValueAtTime(this.envelopeGain.gain.value, now);
      this.envelopeGain.gain.linearRampToValueAtTime(0, now + 0.12);
    }
    const oscsToKill = this.oscillators;
    if (this.ctx){
      const killTime = this.ctx.currentTime + 0.15;
      oscsToKill.forEach(o => { try{ o.stop(killTime); }catch(e){} });
    }
    this.oscillators = [];
    this.playing = false;
    return elapsed;
  }
  _stopOscillators(){
    this.oscillators.forEach(o => { try{ o.stop(); }catch(e){} });
    this.oscillators = [];
  }
  currentElapsed(){
    if (!this.playing || !this.ctx) return null;
    return this.ctx.currentTime - this.playStartCtxTime;
  }
}

/*Player state*/
const engine = new AudioEngine();
const state = {
  index: 0,
  elapsed: 0,      // seconds into the current track
  isPlaying: false,
  autoplay: true,
  volume: 0.7
};
let progressTimer = null;
/*DOM refs*/
const el = {
  trackTitle: document.getElementById("trackTitle"),
  trackArtist: document.getElementById("trackArtist"),
  trackCount: document.getElementById("trackCount"),
  currentTime: document.getElementById("currentTime"),
  durationTime: document.getElementById("durationTime"),
  progressBar: document.getElementById("progressBar"),
  volumeBar: document.getElementById("volumeBar"),
  playBtn: document.getElementById("playBtn"),
  playIcon: document.getElementById("playIcon"),
  pauseIcon: document.getElementById("pauseIcon"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  autoplayToggle: document.getElementById("autoplayToggle"),
  playlist: document.getElementById("playlist"),
  record: document.getElementById("record"),
  tonearm: document.getElementById("tonearm"),
  labelInitial: document.getElementById("labelInitial")
};
function formatTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function currentTrack(){
  return tracks[state.index];
}
function renderPlaylist(){
  el.playlist.innerHTML = "";
  tracks.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "track-row";
    li.dataset.index = i;
    li.innerHTML = `
      <span class="track-row__index">${(i + 1).toString().padStart(2, "0")}</span>
      <span class="track-row__equalizer"><span></span><span></span><span></span></span>
      <span class="track-row__meta">
        <div class="track-row__title">${t.title}</div>
        <div class="track-row__artist">${t.artist}</div>
      </span>
      <span class="track-row__duration">${formatTime(t.duration)}</span>
    `;
    li.addEventListener("click", () => {
      if (i === state.index){
        togglePlay();
      } else {
        loadTrack(i, { autoplay: true });
      }
    });
    el.playlist.appendChild(li);
  });
  refreshPlaylistHighlight();
}
function refreshPlaylistHighlight(){
  [...el.playlist.children].forEach((li, i) => {
    li.classList.toggle("is-active", i === state.index);
    li.classList.toggle("is-playing", i === state.index && state.isPlaying);
  });
}
function updateTrackInfoUI(){
  const t = currentTrack();
  el.trackTitle.textContent = t.title;
  el.trackArtist.textContent = t.artist;
  el.trackCount.textContent = `TRACK ${(state.index + 1).toString().padStart(2, "0")} / ${tracks.length.toString().padStart(2, "0")}`;
  el.durationTime.textContent = formatTime(t.duration);
  el.labelInitial.textContent = t.artist.charAt(0);
}
function updateProgressUI(){
  const t = currentTrack();
  const pct = Math.min(100, (state.elapsed / t.duration) * 100);
  el.progressBar.value = pct;
  el.progressBar.style.setProperty("--fill", pct + "%");
  el.currentTime.textContent = formatTime(state.elapsed);
}
function setPlayIcon(isPlaying){
  el.playIcon.style.display = isPlaying ? "none" : "";
  el.pauseIcon.style.display = isPlaying ? "" : "none";
  el.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}
function setSpinning(isPlaying){
  el.record.classList.toggle("is-spinning", isPlaying);
  el.tonearm.classList.toggle("is-down", isPlaying);
}
/*Core transport actions*/
function loadTrack(index, { autoplay = false } = {}){
  const wasPlaying = state.isPlaying;
  if (state.isPlaying) engine.stop();
  state.index = (index + tracks.length) % tracks.length;
  state.elapsed = 0;
  state.isPlaying = false;
  updateTrackInfoUI();
  updateProgressUI();
  setPlayIcon(false);
  setSpinning(false);
  refreshPlaylistHighlight();
  stopProgressTimer();
  if (autoplay || wasPlaying){
    play();
  }
}
function play(){
  const t = currentTrack();
  if (state.elapsed >= t.duration) state.elapsed = 0;
  engine.start(t, state.elapsed);
  state.isPlaying = true;
  setPlayIcon(true);
  setSpinning(true);
  refreshPlaylistHighlight();
  startProgressTimer();
}
function pause(){
  state.elapsed = engine.stop();
  state.isPlaying = false;
  setPlayIcon(false);
  setSpinning(false);
  refreshPlaylistHighlight();
  stopProgressTimer();
}
function togglePlay(){
  state.isPlaying ? pause() : play();
}
function next({ autoplay } = {}){
  loadTrack(state.index + 1, { autoplay: autoplay ?? state.isPlaying });
}
function prev({ autoplay } = {}){
  if (state.elapsed > 2){
    state.elapsed = 0;
    if (state.isPlaying){
      engine.stop();
      play();
    } else {
      updateProgressUI();
    }
    return;
  }
  loadTrack(state.index - 1, { autoplay: autoplay ?? state.isPlaying });
}
function handleTrackEnd(){
  if (state.autoplay){
    next({ autoplay: true });
  } else {
    engine.stop();
    state.elapsed = 0;
    state.isPlaying = false;
    setPlayIcon(false);
    setSpinning(false);
    refreshPlaylistHighlight();
    stopProgressTimer();
    updateProgressUI();
  }
}
function startProgressTimer(){
  stopProgressTimer();
  progressTimer = setInterval(() => {
    const elapsed = engine.currentElapsed();
    if (elapsed === null) return;
    const t = currentTrack();
    if (elapsed >= t.duration){
      state.elapsed = t.duration;
      updateProgressUI();
      handleTrackEnd();
      return;
    }
    state.elapsed = elapsed;
    updateProgressUI();
  }, 150);
}
function stopProgressTimer(){
  if (progressTimer){
    clearInterval(progressTimer);
    progressTimer = null;
  }
}
/*volume*/
el.progressBar.addEventListener("input", () => {
  const t = currentTrack();
  const pct = Number(el.progressBar.value);
  state.elapsed = (pct / 100) * t.duration;
  el.progressBar.style.setProperty("--fill", pct + "%");
  el.currentTime.textContent = formatTime(state.elapsed);
  if (state.isPlaying){
    engine.start(t, state.elapsed); // reseat oscillators at new position
  }
});
el.volumeBar.addEventListener("input", () => {
  const v = Number(el.volumeBar.value) / 100;
  state.volume = v;
  engine.setVolume(v);
  el.volumeBar.style.setProperty("--fill", el.volumeBar.value + "%");
});
/*Buttons*/
el.playBtn.addEventListener("click", togglePlay);
el.nextBtn.addEventListener("click", () => next());
el.prevBtn.addEventListener("click", () => prev());
el.autoplayToggle.addEventListener("change", () => {
  state.autoplay = el.autoplayToggle.checked;
});
/*space to play/pause*/
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement.tagName !== "INPUT"){
    e.preventDefault();
    togglePlay();
  }
});
/*Init*/
renderPlaylist();
updateTrackInfoUI();
updateProgressUI();
engine.setVolume(state.volume);
el.volumeBar.style.setProperty("--fill", el.volumeBar.value + "%");
