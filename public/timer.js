
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
    } else if(endingAt < Date.now()) {
      $timer.text("00:00");
    }
    $uptime.text("Uptime " + dateMillisToTimer(Date.now() + (Date.now() - startedAt)));
    wheelLogic();
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
    const follow = req.follow >= 0 ? "+" + String(req.follow) : String(req.follow);
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
      t2Div.innerText = `T2: ${t2}s`;

      const t3Div = document.createElement('div');
      t3Div.classList.add('incentive');
      t3Div.innerText = `T3: ${t3}s`;

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

    if(req.follow !== 0) {
      const followDiv = document.createElement('div');
      followDiv.classList.add('incentive');
      followDiv.innerText = `Follow: ${follow}s`;
      $incentives.append(followDiv);
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

    const yCoords = min === max ? Array.from({length: 60}, () => 55) : arr.map(x => mapValue(x, min, max, 105, 5));

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


  // Wheel
  const $wheelSvg = $('#wheel_svg');
  const $wheelText = $('#wheel-text');
  const wheelQueue = [];
  let wheelAnimationRunning = false;
  /*<circle id="wheel_chart_to_self" r="5" cx="10" cy="10" stroke-dasharray="0"/>*/
  socket.on('display_spin', (req) => {
    wheelQueue.push(req);
  });
  function wheelLogic() {
    if(wheelAnimationRunning || wheelQueue.length <= 0) return;

    wheelAnimationRunning = true;
    $wheelText.text('Sub Wheel')
    $wheelSvg.html('');
    const wheelData = wheelQueue.shift();
    let totalChances = 0;
    for(let i = 0; i < wheelData.results.length; i++) {
      let rs = wheelData.results[i];
      $wheelSvg.html($wheelSvg.html() + `<circle id="wheel_part_${i}" r="5" cx="10" cy="10" stroke-width="10" fill="none" stroke="${rs.color}" />`);
      setChartCircle($(`#wheel_part_${i}`), rs.chance, totalChances);
      totalChances += rs.chance;
    }
    $wheelSvg.html($wheelSvg.html() + `<text x="10" y="10.5"
              text-anchor="middle"
              alignment-baseline="central">
          <tspan class="wheel-text">${wheelData.sender}</tspan>`);
    const outcome = wheelData.random;
    const amountOfSpins = Math.floor((Math.random() * 6) + 10) - outcome;
    const deg = amountOfSpins * 360.0;

    $('#container').addClass("wheel-active");
    $('#wheel-container').addClass("animate__bounceIn");

    setTimeout(async () => {

      // Start Spin
      $wheelSvg.css("transform", `rotate(${deg}deg)`);

      await sleep(5000);

      // Display result
      $wheelText.text(wheelData.res.text);
      socket.emit("spin_completed", wheelData.id);

      await sleep(4000);

      // Hide wheel
      $('#container').removeClass("wheel-active");
      $('#wheel-container').removeClass("animate__bounceIn");

      // Reset wheel rotation
      const oldTransition = $wheelSvg.css('transition');
      $wheelSvg.css("transition", "transform 0.1s linear");
      await sleep(20);
      $wheelSvg.css('transform', 'rotate(0deg)');
      await sleep(20);
      $wheelSvg.css("transition", oldTransition);
      wheelAnimationRunning = false;

    }, 2500);
  }

});

function mapValue(value, x1, y1, x2, y2) {
  return (value - x1) * (y2 - x2) / (y1 - x1) + x2;
}

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

function setChartCircle(element, percentage, offset) {
  offset = 1.25 - offset;
  const radius = element.attr("r");
  const circ = radius * 2 * Math.PI;
  element.attr("stroke-dasharray", `${circ * percentage} ${circ * (1-percentage)}`);
  element.attr("stroke-dashoffset", circ * offset);
}

async function sleep(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
