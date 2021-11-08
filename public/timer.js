const mapValue = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

$(document).ready(() => {

  const $timer = $('#timer');
  const $uptime = $('#uptime');

  const socket = io(window.location.origin, {transports: ['websocket', 'polling']});

  //Timer and Uptime
  let endingAt = 0;
  let startedAt = Date.now();

  let timerAnimationPlaying = false;
  let animationInterval = 0;
  setInterval(() => {
    if(!timerAnimationPlaying && endingAt > Date.now()) {
      $timer.text(dateMillisToTimer(endingAt));
    }
    $uptime.text("Uptime " + dateMillisToTimer(Date.now() + (Date.now() - startedAt)));
  }, 1000);
  socket.on('update_timer', (req) => {
    const newEndingAt = req.ending_at;
    if(req.forced) {
      endingAt = newEndingAt;
      $timer.text(dateMillisToTimer(endingAt));
    } else {
      if(timerAnimationPlaying) {
        clearInterval(animationInterval);
      }
      timerAnimationPlaying = true;

      let currentIndex = 0;
      const keyframes = calculateKeyframeArray(endingAt, newEndingAt);
      animationInterval = setInterval(() => {
        $timer.text(keyframes[currentIndex]);
        currentIndex++;
        if(currentIndex >= keyframes.length) {
          clearInterval(animationInterval);
          timerAnimationPlaying = false;
          endingAt = newEndingAt;
        }
      }, 20);
    }
  });
  socket.on('update_uptime', (req) => {
    startedAt = req.started_at;
  })

});

function dateMillisToTimer(millis) {
  const millisLeft = millis - Date.now();
  if(millisLeft <= 0) return '00:00';
  const secondsLeft = Math.round(millisLeft / 1000);

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  if(hours > 0) return `${hours}:${minutes}:${seconds}`;
  else return `${minutes}:${seconds}`;
}

function calculateKeyframeArray(oldTime, newTime) {
  return Array.from({length: 50}, (_, k) => {
    return Math.ceil(mapValue(k, 0, 50, oldTime, newTime));
  }).map(dateMillisToTimer);

}