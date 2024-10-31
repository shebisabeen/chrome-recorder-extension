let startButton = document.getElementById("startRecord");
let stopButton = document.getElementById("stopRecord");
let indicator = document.getElementById("recordingIndicator");
let statusText = document.getElementById("status");
let timerElement = document.getElementById("timer");
let permissionStatus = document.getElementById("permissionStatus");
let timerInterval;
let mediaRecorder = null;
let audioChunks = [];

function showError(message) {
  permissionStatus.textContent = message;
  permissionStatus.style.display = "block";
}

function hideError() {
  permissionStatus.style.display = "none";
}

function updateTimer(startTime) {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor((elapsed / 1000) % 60);
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    timerElement.textContent = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, 1000);
}

async function checkMicrophonePermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function startRecording() {
  try {
    hideError();
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://")
    ) {
      showError(
        "Recording is not supported on this page. Please try on a regular webpage."
      );
      return;
    }

    // Get tab stream ID
    const streamId = await new Promise((resolve) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) =>
        resolve(streamId)
      );
    });

    // Get tab audio stream
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Get microphone stream
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // Create audio context
    const audioContext = new AudioContext();

    // Create sources and destination
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    // Create a gain node for tab audio
    const tabGain = audioContext.createGain();
    tabGain.gain.value = 1.0;

    // Connect tab audio to both speakers and recorder
    tabSource.connect(tabGain);
    tabGain.connect(audioContext.destination);
    tabGain.connect(destination);

    // Connect mic to recorder only
    micSource.connect(destination);

    // Create media recorder
    mediaRecorder = new MediaRecorder(destination.stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      const filename = `recording_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.webm`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      // Cleanup
      tabStream.getTracks().forEach((track) => track.stop());
      micStream.getTracks().forEach((track) => track.stop());
      audioContext.close();
    };

    // Start recording
    mediaRecorder.start(1000);
    chrome.runtime.sendMessage({ action: "startRecording" });

    // Update UI
    startButton.disabled = true;
    stopButton.disabled = false;
    indicator.classList.add("recording");
    statusText.textContent = "Recording";
    updateTimer(Date.now());
  } catch (error) {
    console.error("Recording error:", error);
    showError("Error starting recording: " + error.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    chrome.runtime.sendMessage({ action: "stopRecording" });

    startButton.disabled = false;
    stopButton.disabled = true;
    indicator.classList.remove("recording");
    statusText.textContent = "Not Recording";
    if (timerInterval) clearInterval(timerInterval);
    timerElement.textContent = "00:00:00";
  }
}

startButton.addEventListener("click", async () => {
  const hasPermission = await checkMicrophonePermission();
  if (!hasPermission) {
    chrome.tabs.create({ url: "permission.html" });
    return;
  }
  startRecording();
});

stopButton.addEventListener("click", stopRecording);

// Check recording status when popup opens
document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ action: "getRecordingStatus" }, (response) => {
    if (response && response.isRecording) {
      startButton.disabled = true;
      stopButton.disabled = false;
      indicator.classList.add("recording");
      statusText.textContent = "Recording";
      updateTimer(response.startTime);
    }
  });
});

// Handle popup close
window.addEventListener("unload", () => {
  if (timerInterval) clearInterval(timerInterval);
});
