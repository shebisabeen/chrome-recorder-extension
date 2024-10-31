let startButton;
let stopButton;
let indicator;
let statusText;
let timerElement;
let permissionStatus;
let timerInterval;
let mediaRecorder = null;
let audioContext = null;
let tabStream = null;
let micStream = null;

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

async function startRecording() {
  try {
    const port = chrome.runtime.connect({ name: "recorder" });
    console.log("Starting recording process...");
    hideError();

    // Clean up any existing streams first
    if (tabStream) {
      tabStream.getTracks().forEach((track) => track.stop());
      tabStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder = null;
    }

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
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Get microphone stream
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // Create audio context
    audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    });

    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    // Set up gain nodes
    const tabGain = audioContext.createGain();
    const micGain = audioContext.createGain();
    tabGain.gain.value = 1.0;
    micGain.gain.value = 1.0;

    // Connect streams
    tabSource.connect(tabGain);
    tabGain.connect(audioContext.destination);
    tabGain.connect(destination);
    micSource.connect(micGain);
    micGain.connect(destination);

    // Create and start MediaRecorder
    mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
      audioBitsPerSecond: 128000,
    });

    // Keep references in background context
    port.postMessage({
      action: "setStreams",
      streams: {
        tabStream,
        micStream,
        audioContext,
        mediaRecorder,
      },
    });

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result.split(",")[1];
          await chrome.runtime.sendMessage({
            action: "audioChunk",
            chunk: base64data,
          });
        };
        reader.readAsDataURL(event.data);
      }
    };

    mediaRecorder.start(1000);

    // Store stream locally to keep it alive
    window.streamToKeepAlive = destination.stream;

    // Notify background script
    const response = await chrome.runtime.sendMessage({
      action: "startRecording",
      stream: destination.stream,
    });

    if (response && response.success) {
      startButton.disabled = true;
      stopButton.disabled = false;
      indicator.classList.add("recording");
      statusText.textContent = "Recording";
      updateTimer(Date.now());
    } else {
      showError(
        "Error starting recording: " + (response?.error || "Unknown error")
      );
    }
  } catch (error) {
    console.error("Recording error:", error);
    showError("Error starting recording: " + error.message);
  }
}

async function stopRecording() {
  try {
    console.log("Stopping recording...");

    // Stop MediaRecorder first to ensure all chunks are collected
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    // Small delay to ensure last chunk is processed
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Get chunks from background script
    const response = await chrome.runtime.sendMessage({
      action: "stopRecording",
    });

    if (response.success && response.chunks && response.chunks.length > 0) {
      console.log("Received chunks:", response.chunks.length);

      // Convert base64 chunks back to Blobs
      const blobs = response.chunks.map((chunk) => {
        const byteCharacters = atob(chunk);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: "audio/webm" });
      });

      // Create final blob
      const finalBlob = new Blob(blobs, { type: "audio/webm" });
      console.log("Final blob size:", finalBlob.size);

      // Create download
      const url = URL.createObjectURL(finalBlob);
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
    } else {
      console.error("No chunks received or empty response");
      showError("No audio data received");
    }

    // Cleanup streams
    if (tabStream) {
      tabStream.getTracks().forEach((track) => track.stop());
      tabStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    // Update UI
    startButton.disabled = false;
    stopButton.disabled = true;
    indicator.classList.remove("recording");
    statusText.textContent = "Not Recording";
    if (timerInterval) clearInterval(timerInterval);
    timerElement.textContent = "00:00:00";
  } catch (error) {
    console.error("Error stopping recording:", error);
    showError("Error stopping recording: " + error.message);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  startButton = document.getElementById("startRecord");
  stopButton = document.getElementById("stopRecord");
  indicator = document.getElementById("recordingIndicator");
  statusText = document.getElementById("status");
  timerElement = document.getElementById("timer");
  permissionStatus = document.getElementById("permissionStatus");

  startButton.addEventListener("click", startRecording);
  stopButton.addEventListener("click", stopRecording);

  // Check recording status when popup opens
  chrome.runtime.sendMessage({ action: "getRecordingStatus" }, (response) => {
    if (response.isRecording) {
      startButton.disabled = true;
      stopButton.disabled = false;
      indicator.classList.add("recording");
      statusText.textContent = "Recording";
      updateTimer(response.startTime);
    }
  });
});
