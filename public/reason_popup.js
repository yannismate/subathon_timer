
$(document).ready(() => {

  const socket = io(window.location.origin, {transports: ['websocket', 'polling']});

  const reasonPopupQueue = []
  let animationRunning = false;

  socket.on('time_add_reason', async (data) => {
    reasonPopupQueue.push({secondsAdded: data.seconds_added, reason: data.reason})
    await startPopupAnimation()
  });

  const textElement = $("#reason_text");

  async function startPopupAnimation() {
    if(animationRunning) return;
    animationRunning = true;
    while(reasonPopupQueue.length !== 0) {

      console.log("test")
      const data = reasonPopupQueue.shift();
      textElement.text(`${data.reason}: ${data.secondsAdded > 0 ? "+" : ""}${data.secondsAdded}s`)
      textElement.css('animation-name', 'anim');

      await sleep(3000);
      textElement.css('animation-name', '')

      await sleep(1000);
    }
    animationRunning = false;
  }

})

async function sleep(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}