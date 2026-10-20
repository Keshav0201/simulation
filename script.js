const algorithmSelect = document.getElementById('algorithmSelect');
const quantumWrap = document.getElementById('quantumWrap');
const quantumInput = document.getElementById('quantumInput');
const processBody = document.querySelector('#processTable tbody');
const priorityCols = () => document.querySelectorAll('.priority-col');
const addProcessBtn = document.getElementById('addProcessBtn');
const runBtn = document.getElementById('runBtn');
const loadExampleBtn = document.getElementById('loadExampleBtn');
const themeToggle = document.getElementById('themeToggle');
const simTitle = document.getElementById('simTitle');
const currentTimeEl = document.getElementById('currentTime');
const cpuProcess = document.getElementById('cpuProcess');
const cpuMeta = document.getElementById('cpuMeta');
const cpuProcessToken = document.getElementById('cpuProcessToken');
const readyQueue = document.getElementById('readyQueue');
const completedQueue = document.getElementById('completedQueue');
const processStatusCards = document.getElementById('processStatusCards');
const ganttChart = document.getElementById('ganttChart');
const ganttTimes = document.getElementById('ganttTimes');
const stepLabel = document.getElementById('stepLabel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSelect = document.getElementById('speedSelect');
const resultsBody = document.querySelector('#resultsTable tbody');
const avgWaiting = document.getElementById('avgWaiting');
const avgTurnaround = document.getElementById('avgTurnaround');
const cpuUtil = document.getElementById('cpuUtil');
const throughput = document.getElementById('throughput');

let steps = [];
let currentStep = 0;
let timer = null;
let lastResult = null;
let cpuAnimationTimer = null;
let previousExecuted = null;

const examples = [
  {id:'P1', arrival:0, burst:5, priority:2},
  {id:'P2', arrival:1, burst:3, priority:1},
  {id:'P3', arrival:2, burst:8, priority:4},
  {id:'P4', arrival:3, burst:6, priority:3},
];

function isPriorityAlgorithm() {
  return ['priority_np','priority_p'].includes(algorithmSelect.value);
}

function syncAlgorithmUI() {
  const isRR = algorithmSelect.value === 'rr';
  quantumWrap.classList.toggle('hidden', !isRR);
  priorityCols().forEach(el => el.classList.toggle('hidden', !isPriorityAlgorithm()));
  document.querySelectorAll('.priority-input').forEach(el => el.closest('td').classList.toggle('hidden', !isPriorityAlgorithm()));
  simTitle.textContent = `${algorithmSelect.options[algorithmSelect.selectedIndex].text} Simulation`;
}

function addProcessRow(data={}) {
  const rowCount = processBody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="pid-input" value="${data.id || 'P'+rowCount}" /></td>
    <td><input class="arrival-input" type="number" min="0" value="${data.arrival ?? rowCount-1}" /></td>
    <td><input class="burst-input" type="number" min="1" value="${data.burst ?? 4}" /></td>
    <td class="${isPriorityAlgorithm() ? '' : 'hidden'}"><input class="priority-input" type="number" min="0" value="${data.priority ?? rowCount}" /></td>
    <td><button class="delete-btn" title="Delete process">✕</button></td>`;
  tr.querySelector('.delete-btn').addEventListener('click', () => {
    if (processBody.children.length > 1) tr.remove();
  });
  processBody.appendChild(tr);
}

function loadExample() {
  processBody.innerHTML = '';
  examples.forEach(addProcessRow);
}

function getProcesses() {
  const rows = [...processBody.querySelectorAll('tr')];
  return rows.map((tr, index) => {
    const id = tr.querySelector('.pid-input').value.trim() || `P${index+1}`;
    const arrival = Number(tr.querySelector('.arrival-input').value);
    const burst = Number(tr.querySelector('.burst-input').value);
    const priority = Number(tr.querySelector('.priority-input').value);
    if (!Number.isInteger(arrival) || arrival < 0 || !Number.isInteger(burst) || burst <= 0) throw new Error(`Check arrival/burst values for ${id}.`);
    if (isPriorityAlgorithm() && (!Number.isInteger(priority) || priority < 0)) throw new Error(`Check priority for ${id}.`);
    return { id, arrival, burst, priority: Number.isFinite(priority) ? priority : 0, order:index };
  });
}

function buildSimulation(processes, algorithm, quantum=2) {
  const p = processes.map(x => ({...x, remaining:x.burst, start:null, completion:null}));
  const timeline = [];
  const snapshots = [{time:0, running:null, ready:[], completed:[], remaining:Object.fromEntries(p.map(x=>[x.id,x.remaining]))}];
  let time = 0;
  let completed = 0;
  let rrQueue = [];
  let rrCurrent = null;
  let rrSlice = 0;
  const maxArrival = Math.max(...p.map(x=>x.arrival));

  const arrived = () => p.filter(x => x.arrival <= time && x.remaining > 0);
  const notDone = x => x.remaining > 0;
  const readyIds = running => {
    let arr;
    if (algorithm === 'rr') arr = rrQueue.filter(notDone);
    else arr = arrived().filter(x => !running || x.id !== running.id);
    return arr.map(x => x.id);
  };
  const selectNP = (list, mode) => {
    if (mode==='fcfs') return [...list].sort((a,b)=>a.arrival-b.arrival || a.order-b.order)[0];
    if (mode==='sjf') return [...list].sort((a,b)=>a.burst-b.burst || a.arrival-b.arrival || a.order-b.order)[0];
    if (mode==='priority_np') return [...list].sort((a,b)=>a.priority-b.priority || a.arrival-b.arrival || a.order-b.order)[0];
  };

  let npCurrent = null;
  let lastAddedTime = -1;
  const addRRNewArrivals = () => {
    p.filter(x => x.arrival === time && x.remaining > 0 && (!rrCurrent || x.id !== rrCurrent.id) && !rrQueue.includes(x)).sort((a,b)=>a.order-b.order).forEach(x=>rrQueue.push(x));
  };

  while (completed < p.length && time < 10000) {
    let running = null;

    if (algorithm === 'rr') {
      addRRNewArrivals();
      if (!rrCurrent || rrCurrent.remaining <= 0 || rrSlice >= quantum) {
        if (rrCurrent && rrCurrent.remaining > 0 && rrSlice >= quantum) rrQueue.push(rrCurrent);
        rrCurrent = rrQueue.shift() || null;
        rrSlice = 0;
      }
      running = rrCurrent;
    } else if (['fcfs','sjf','priority_np'].includes(algorithm)) {
      if (!npCurrent || npCurrent.remaining <= 0) npCurrent = selectNP(arrived(), algorithm) || null;
      running = npCurrent;
    } else if (algorithm === 'srtf') {
      running = [...arrived()].sort((a,b)=>a.remaining-b.remaining || a.arrival-b.arrival || a.order-b.order)[0] || null;
    } else if (algorithm === 'priority_p') {
      running = [...arrived()].sort((a,b)=>a.priority-b.priority || a.arrival-b.arrival || a.order-b.order)[0] || null;
    }

    if (running) {
      if (running.start === null) running.start = time;
      timeline.push(running.id);
      running.remaining--;
      if (algorithm === 'rr') rrSlice++;
    } else {
      timeline.push('Idle');
    }

    time++;

    if (running && running.remaining === 0) {
      running.completion = time;
      completed++;
      if (algorithm === 'rr') { rrCurrent = null; rrSlice = 0; }
      if (['fcfs','sjf','priority_np'].includes(algorithm)) npCurrent = null;
    }

    if (algorithm === 'rr') {
      p.filter(x => x.arrival === time && x.remaining > 0 && (!rrCurrent || x.id !== rrCurrent.id) && !rrQueue.includes(x)).sort((a,b)=>a.order-b.order).forEach(x=>rrQueue.push(x));
    }

    const ready = algorithm === 'rr'
      ? rrQueue.filter(x=>x.remaining>0).map(x=>x.id)
      : p.filter(x=>x.arrival<=time && x.remaining>0 && (!running || x.id!==running.id)).map(x=>x.id);

    snapshots.push({
      time,
      running: running ? running.id : null,
      executed: running ? running.id : 'Idle',
      ready,
      completed: p.filter(x=>x.remaining===0).map(x=>x.id),
      remaining: Object.fromEntries(p.map(x=>[x.id,x.remaining]))
    });

    if (!running && time > maxArrival && completed < p.length && arrived().length===0) break;
  }

  const metrics = p.map(x => {
    const completion = x.completion ?? time;
    const tat = completion - x.arrival;
    const wt = tat - x.burst;
    const rt = (x.start ?? x.arrival) - x.arrival;
    return {...x, completion, tat, wt, rt};
  });
  const totalTime = timeline.length;
  const busy = timeline.filter(x=>x!=='Idle').length;
  return {
    timeline, snapshots, metrics,
    averages: {
      waiting: metrics.reduce((s,x)=>s+x.wt,0)/metrics.length,
      turnaround: metrics.reduce((s,x)=>s+x.tat,0)/metrics.length,
      cpuUtil: totalTime ? (busy/totalTime)*100 : 0,
      throughput: totalTime ? metrics.length/totalTime : 0
    }
  };
}

function renderResults(result) {
  resultsBody.innerHTML = '';
  result.metrics.forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${x.id}</strong></td><td>${x.arrival}</td><td>${x.burst}</td><td>${x.completion}</td><td>${x.tat}</td><td>${x.wt}</td><td>${x.rt}</td>`;
    resultsBody.appendChild(tr);
  });
  avgWaiting.textContent = result.averages.waiting.toFixed(2);
  avgTurnaround.textContent = result.averages.turnaround.toFixed(2);
  cpuUtil.textContent = `${result.averages.cpuUtil.toFixed(1)}%`;
  throughput.textContent = `${result.averages.throughput.toFixed(3)}/unit`;
}


function animateCpuProcess(pid) {
  if (!cpuProcessToken) return;
  clearTimeout(cpuAnimationTimer);
  const nextPid = pid || 'Idle';
  const isIdle = nextPid === 'Idle';
  const changed = previousExecuted !== null && previousExecuted !== nextPid;

  const showNext = () => {
    cpuProcessToken.className = 'cpu-process-token';
    if (isIdle) cpuProcessToken.classList.add('idle-token');
    cpuProcessToken.textContent = nextPid;
    void cpuProcessToken.offsetWidth;
    if (!isIdle) cpuProcessToken.classList.add('entering');
    cpuAnimationTimer = setTimeout(() => {
      cpuProcessToken.classList.remove('entering');
      if (!isIdle) cpuProcessToken.classList.add('executing');
    }, 460);
    previousExecuted = nextPid;
  };

  if (previousExecuted === nextPid) {
    cpuProcessToken.className = 'cpu-process-token' + (isIdle ? ' idle-token' : ' executing');
    cpuProcessToken.textContent = nextPid;
    return;
  }

  if (changed && previousExecuted !== 'Idle') {
    cpuProcessToken.className = 'cpu-process-token exiting';
    cpuAnimationTimer = setTimeout(showNext, 360);
  } else {
    showNext();
  }
}

function renderStep(index) {
  if (!lastResult) return;
  currentStep = Math.max(0, Math.min(index, lastResult.snapshots.length-1));
  const snap = lastResult.snapshots[currentStep];
  const processes = lastResult.metrics;
  currentTimeEl.textContent = snap.time;
  stepLabel.textContent = `Step ${currentStep} / ${lastResult.snapshots.length-1}`;
  const activePid = currentStep===0 ? 'Idle' : (snap.executed || 'Idle');
  cpuProcess.textContent = activePid;
  cpuMeta.textContent = currentStep===0 ? 'Simulation ready' : (snap.executed==='Idle' ? 'CPU is idle' : `Executed during time ${snap.time-1} → ${snap.time}`);
  animateCpuProcess(activePid);

  readyQueue.innerHTML = snap.ready.length ? snap.ready.map(id=>`<span class="chip">${id}</span>`).join('') : '<span class="muted">Empty</span>';
  completedQueue.innerHTML = snap.completed.length ? snap.completed.map(id=>`<span class="chip">${id}</span>`).join('') : '<span class="muted">None</span>';

  processStatusCards.innerHTML = processes.map(p => {
    const rem = snap.remaining[p.id];
    let state = 'Not Arrived';
    let cls = '';
    if (snap.completed.includes(p.id)) { state='Completed'; cls='completed'; }
    else if (currentStep>0 && snap.executed===p.id) { state='Running'; cls='running'; }
    else if (snap.ready.includes(p.id)) { state='Ready'; cls='ready'; }
    else if (p.arrival <= snap.time) state='Waiting';
    return `<div class="process-card ${cls}"><div class="pid">${p.id}</div><div class="state">${state}</div><div class="muted">Remaining: ${rem}</div></div>`;
  }).join('');

  ganttChart.innerHTML = '';
  ganttTimes.innerHTML = '';
  lastResult.timeline.forEach((pid, i) => {
    const block = document.createElement('div');
    block.className = `gantt-block ${pid==='Idle' ? 'idle' : ''} ${i===currentStep-1 ? 'active' : ''}`;
    block.textContent = pid;
    if (i >= currentStep) block.style.opacity = '.22';
    ganttChart.appendChild(block);

    const mark = document.createElement('div');
    mark.className = 'time-mark';
    mark.textContent = i;
    ganttTimes.appendChild(mark);
  });
  if (lastResult.timeline.length) {
    const end = document.createElement('div');
    end.className = 'time-mark';
    end.textContent = lastResult.timeline.length;
    end.style.minWidth = '0';
    end.style.flex = '0 0 0';
    ganttTimes.appendChild(end);
  }
}

function runSimulation() {
  clearInterval(timer);
  timer = null;
  try {
    const processes = getProcesses();
    if (new Set(processes.map(x=>x.id)).size !== processes.length) throw new Error('Process IDs must be unique.');
    const quantum = Number(quantumInput.value);
    if (algorithmSelect.value==='rr' && (!Number.isInteger(quantum) || quantum<=0)) throw new Error('Time quantum must be a positive integer.');
    lastResult = buildSimulation(processes, algorithmSelect.value, quantum);
    previousExecuted = null;
    renderResults(lastResult);
    renderStep(0);
  } catch (err) {
    alert(err.message);
  }
}

function play() {
  if (!lastResult) runSimulation();
  if (!lastResult || timer) return;
  if (currentStep >= lastResult.snapshots.length-1) currentStep = 0;
  timer = setInterval(() => {
    if (currentStep >= lastResult.snapshots.length-1) {
      clearInterval(timer); timer = null; return;
    }
    renderStep(currentStep+1);
  }, Number(speedSelect.value));
}

algorithmSelect.addEventListener('change', syncAlgorithmUI);
addProcessBtn.addEventListener('click', () => addProcessRow());
loadExampleBtn.addEventListener('click', loadExample);
runBtn.addEventListener('click', runSimulation);
prevBtn.addEventListener('click', () => renderStep(currentStep-1));
nextBtn.addEventListener('click', () => renderStep(currentStep+1));
playBtn.addEventListener('click', play);
pauseBtn.addEventListener('click', () => { clearInterval(timer); timer = null; });
resetBtn.addEventListener('click', () => { clearInterval(timer); timer = null; previousExecuted = null; if (lastResult) renderStep(0); });
speedSelect.addEventListener('change', () => { if (timer) { clearInterval(timer); timer = null; play(); } });
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  themeToggle.textContent = document.body.classList.contains('dark') ? '☀' : '☾';
});

loadExample();
syncAlgorithmUI();
runSimulation();
