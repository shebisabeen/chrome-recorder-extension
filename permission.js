document
  .getElementById("requestPermission")
  .addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      document.getElementById("status").textContent =
        "Permission granted! You can close this tab.";

      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      document.getElementById("status").textContent =
        "Permission denied. Please try again.";
    }
  });
