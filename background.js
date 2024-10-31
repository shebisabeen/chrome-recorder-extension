let isRecording = false;
let startTime = null;
let mediaRecorder = null;
let audioChunks = [];

function updateIcon(recording) {
  const iconPath = recording ? "icons/recording_icon.png" : "icons/icon48.png";
  chrome.action.setIcon({ path: iconPath });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startRecording") {
    isRecording = true;
    startTime = Date.now();
    updateIcon(true);
    sendResponse({ success: true });
  } else if (message.action === "stopRecording") {
    isRecording = false;
    startTime = null;
    updateIcon(false);
    sendResponse({ success: true });
  } else if (message.action === "getRecordingStatus") {
    sendResponse({
      isRecording: isRecording,
      startTime: startTime,
    });
  }
  return true;
});
