const mapValue = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

$(document).ready(() => {

  const $timer = $('#timer');
  const $uptime = $('#uptime');

  const socket = io(window.location.origin, {transports: ['websocket', 'polling']});

  // Timer and Uptime
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


  const $incentives = $('#incentives');

  // Incentives
  socket.on('update_incentives', (req) => {
    $('.incentive').remove();
    const t1 = req.tier_1 >= 0 ? "+" + String(req.tier_1) : String(req.tier_1);
    const t2 = req.tier_2 >= 0 ? "+" + String(req.tier_2) : String(req.tier_2);
    const t3 = req.tier_3 >= 0 ? "+" + String(req.tier_3) : String(req.tier_3);
    const bits = req.bits >= 0 ? "+" + String(req.bits) : String(req.bits);
    const donation = req.donation >= 0 ? "+" + String(req.donation) : String(req.donation);
    if(req.tier_2 === 0 && req.tier_3 === 0) {
      const subDiv = document.createElement('div');
      subDiv.classList.add('incentive');
      subDiv.innerText = `Sub: ${t1}s`;
      $incentives.append(subDiv);
    } else {
      const t1Div = document.createElement('div');
      t1Div.classList.add('incentive');
      t1Div.innerText = `T1: ${t1}s`;

      const t2Div = document.createElement('div');
      t2Div.classList.add('incentive');
      t2Div.innerText = `T1: ${t2}s`;

      const t3Div = document.createElement('div');
      t3Div.classList.add('incentive');
      t3Div.innerText = `T1: ${t3}s`;

      $incentives.append(t1Div, t2Div, t3Div);
    }

    if(req.bits !== 0) {
      const bitsDiv = document.createElement('div');
      bitsDiv.classList.add('incentive');
      bitsDiv.innerText = `100 Bits: ${bits}s`;
      $incentives.append(bitsDiv);
    }

    if(req.donation !== 0) {
      const donationDiv = document.createElement('div');
      donationDiv.classList.add('incentive');
      donationDiv.innerText = `$1: ${donation}s`;
      $incentives.append(donationDiv);
    }
  });

  const $graphSvg = $('#graph_svg');
  const $graphPath = $('#graph_path');
  const $graphIcon = $('#graph_icon');
  let graphLastY = 0;
  // Graph
  socket.on('update_graph', (req) => {
    const arr = req.data;
    let min = Math.min(...arr);
    let max = Math.max(...arr);

    const yCoords = min === max ? Array.from({length: 60}, _x => 55) : arr.map(x => mapValue(x, min, max, 105, 5));

    let path = `M5 ${yCoords[0]}`;
    for(let i = 1; i < yCoords.length; i++) {
      path = path + ` L ${i*14+5} ${yCoords[i]}`;
    }

    $graphPath.attr('d', path);

    graphLastY = yCoords[yCoords.length - 1];

    const iconY = mapValue(graphLastY, 0, 110, $graphSvg.height(), 0);
    $graphIcon.css('transform', `translateX(-50%) translateY(-${iconY}px)`);
  });
  $(window).resize(() => {
    const iconY = mapValue(graphLastY, 0, 110, $graphSvg.height(), 0);
    $graphIcon.css('transform', `translateX(-50%) translateY(-${iconY}px)`);
  });

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