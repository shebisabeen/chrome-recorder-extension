# Chrome Recorder Extension

A Chrome extension that simultaneously records both tab audio and microphone input, with advanced audio processing capabilities.

## Overview

This extension allows you to record audio from both the current browser tab and your microphone simultaneously. It's perfect for:

- Creating voiceovers for web content
- Recording commentary while browsing
- Capturing both system audio and voice input

## Features

- Simultaneous recording of tab audio and microphone input
- Advanced audio processing:
  - Noise suppression for microphone input
  - Echo cancellation
  - Auto gain control
  - Customized gain levels (1.0x for tab audio, 1.5x for microphone)
- Background recording capability using service workers
- Visual recording status indicator
- Automatic file download upon completion
- Protection against recording Chrome system pages

## Running this extension

1. Clone this repository
2. Load this directory in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)
3. Pin the extension from the extension menu
4. Navigate to the webpage you want to record
5. Click the extension icon to open the control panel
6. Click the start recording button to begin recording
7. Click the stop recording button to end recording and download the file

## Technical Details

- Uses the `chrome.tabCapture` API for tab audio recording
- Implements offscreen documents for background processing
- Records in WebM audio format
- Requires Chrome version 116 or higher
- Uses Web Audio API for advanced audio mixing and processing

## Permissions Required

- `tabCapture`: For capturing tab audio
- `offscreen`: For background recording capability
- `tabs`: For tab management
- `activeTab`: For accessing current tab information
- Host permissions for all URLs (`*://*/*`)

## Implementation Notes

The extension uses a service worker architecture with an offscreen document for continuous recording even when the popup is closed. For more details on the implementation, see the [Audio recording and screen capture guide](https://developer.chrome.com/docs/extensions/mv3/screen_capture/#audio-and-video-offscreen-doc).

## Limitations

- Cannot record audio from Chrome system pages (URLs starting with `chrome://` or `chrome-extension://`)
- Requires explicit user interaction to start recording
- Recording will automatically create a new tab with the recorded audio file when stopped
