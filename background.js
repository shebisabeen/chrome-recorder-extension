let isRecording = false;
let startTime = null;
let audioChunks = [];
let activeStreams = null;
let keepAliveStreams = null; // New variable to store streams

function updateIcon(recording) {
  const iconPath = recording ? "icons/recording_icon.png" : "icons/icon48.png";
  chrome.action.setIcon({ path: iconPath });
}

async function handleStartRecording(stream) {
  console.log("Background: Starting new recording");
  isRecording = true;
  startTime = Date.now();
  audioChunks = [];
  updateIcon(true);
  return { success: true };
}

function handleStopRecording() {
  console.log(
    "Background: Stopping recording, total chunks:",
    audioChunks.length
  );
  isRecording = false;
  updateIcon(false);
  const chunks = [...audioChunks];
  audioChunks = [];
  return { success: true, chunks };
}

function handleAudioChunk(chunk) {
  if (chunk) {
    audioChunks.push(chunk);
    console.log("Background: Chunk stored, total chunks:", audioChunks.length);
  }
  return { success: true };
}

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.action === "setStreams") {
      activeStreams = msg.streams;
      keepAliveStreams = msg.streams; // Store in our local variable
      console.log("Streams stored in background");
    }
  });

  port.onDisconnect.addListener(() => {
    console.log("Popup closed, continuing recording in background");
    // Keep the streams alive using our local variable
    if (keepAliveStreams) {
      console.log("Keeping streams alive in background");
    }
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  const existingContexts = await chrome.runtime.getContexts({});

  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === "OFFSCREEN_DOCUMENT"
  );

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Recording from chrome.tabCapture API",
    });
  }

  // Get a MediaStream for the active tab.
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    type: "start-recording",
    target: "offscreen",
    data: streamId,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background: Received message:", message.action);

  if (message.action === "startRecording") {
    const result = handleStartRecording(message.stream);
    sendResponse(result);
  } else if (message.action === "stopRecording") {
    const result = handleStopRecording();
    sendResponse(result);
  } else if (message.action === "audioChunk") {
    const result = handleAudioChunk(message.chunk);
    sendResponse(result);
  } else if (message.action === "getRecordingStatus") {
    sendResponse({
      isRecording,
      startTime,
    });
  }
  return true;
});
