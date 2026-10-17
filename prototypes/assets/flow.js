(() => {
  const view = document.querySelector('#view');
  const initialHome = view.innerHTML;
  const apps = {
    canvas: { name: 'Canvas', url: 'https://school.example/canvas', tasks: ['List upcoming assignments', 'Find course materials'], input: 'Course', sample: 'Design 101', result: 'Weekly sketch study', detail: 'Sample assignment · due Friday · Design 101' },
    youtube: { name: 'YouTube', url: 'https://www.youtube.com', tasks: ['Search videos and read descriptions'], input: 'Search phrase', sample: 'How to make a paper lamp', result: 'Make a paper lamp', detail: 'Sample video description: Fold a simple paper shade with materials from home.' },
    notion: { name: 'Notion', url: 'https://notion.so', tasks: [], input: 'Page name', sample: 'Project notes', result: 'Project notes', detail: 'Sample page: Research notes and next steps for the project.' }
  };
  let currentApp = 'canvas';
  let taskName = '';
  let recordedStep = 0;
  let tested = false;
  let taskInput = '';
  let inputValue = '';
  let taskSaved = false;
  const events = [];
  const taskDefinitions = new Map();
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const app = () => apps[currentApp];
  const button = (label, action, primary = false, extra = '') => `<button class="flow-button${primary ? ' primary' : ''}" data-action="${action}" ${extra}>${label}</button>`;
  const header = (title, description, action = '') => `<header class="flow-header"><div><button class="flow-back" data-action="home">← All apps</button><h1>${escape(title)}</h1><p>${description}</p></div>${action}</header>`;
  const notice = '<p class="flow-note">Interactive prototype · sample data. This flow does not contact websites, record traffic, or create a working connector.</p>';
  const show = content => {
    view.innerHTML = content;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const heading = view.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  };
  const steps = current => `<ol class="flow-steps">${['Name task', 'Demonstrate', 'Review & test'].map((label, index) => `<li class="${current === index ? 'current' : ''}">${index + 1}. ${label}</li>`).join('')}</ol>`;
  const taskRows = () => app().tasks.map(name => `<li class="flow-row"><div><strong>${escape(name)}</strong><p>Taught task · sample definition</p></div>${button('Try task', 'try-task', false, `data-task="${escape(name)}"`)}</li>`).join('');
  function showHome() {
    const createdApps = Object.entries(apps).filter(([id]) => id.startsWith('app-'));
    const added = createdApps.length ? `<section class="flow-panel"><h2>Apps created in this preview</h2><ul class="flow-list">${createdApps.map(([id, item]) => `<li class="flow-row"><div><strong>${escape(item.name)}</strong><p>${escape(item.url)} · ${item.tasks.length} taught tasks</p></div>${button('Open app', 'open-app', false, `data-app="${id}"`)}</li>`).join('')}</ul></section>` : '';
    show(initialHome + added);
  }
  function showApp() {
    show(header(app().name, `${escape(app().url)} · Sample connection`, button('Create task', 'teach', true)) + `<div class="flow-grid"><section class="flow-panel"><h2>Tasks</h2>${app().tasks.length ? `<ul class="flow-list">${taskRows()}</ul>` : '<p class="flow-empty">Teach your first task to make it available to your assistant.</p>'}</section><aside><section class="flow-panel"><h2>Use with your assistant</h2><p>Connect this app once. Your assistant can use all its saved tasks.</p>${button('Connect assistant', 'connect')}</section><section class="flow-panel"><h2>Connection recovery</h2><p>Explore what happens when a saved sign-in expires.</p>${button('Try reconnection', 'reconnect')}</section></aside></div>${notice}`);
  }
  function showCreateApp() {
    show(header('Create an app', 'One website, with all the tasks you teach it.') + `<form id="create-app" class="flow-panel flow-stack"><label class="flow-field">App name<input name="name" placeholder="e.g. Canvas" required maxlength="60" autocomplete="off"></label><label class="flow-field">Website address<input name="url" type="url" placeholder="https://your-website.com" required><small>Start with the website you normally open.</small></label><div class="flow-actions"><button class="flow-button primary" type="submit">Continue to sign-in</button>${button('Cancel', 'home')}</div></form>${notice}`);
  }
  function showSignIn() {
    show(header(`Sign in to ${app().name}`, 'In the real product, you would sign in and complete verification in the browser.') + `<div class="flow-browser"><div class="flow-browser-bar">Simulated browser · ${escape(app().url)}</div><div class="flow-browser-page"><h2>Connect your website session</h2><p>This preview never asks for a real password or verification code.</p>${button('Simulate successful sign-in', 'signed-in', true)}</div></div>${notice}`);
  }
  function showTeach() {
    taskSaved = false;
    show(header('Teach a task', `Show ${escape(app().name)} what you want your assistant to do.`) + steps(0) + `<form id="create-task" class="flow-panel flow-stack"><label class="flow-field">Task name<input name="task" placeholder="e.g. ${escape(app().tasks[0] || 'Read a page')}" value="${escape(taskName)}" required maxlength="100"><small>Choose a clear action your assistant can recognize.</small></label><p>You will perform the steps yourself in the browser. The product will record the actions and requests.</p><div class="flow-actions"><button class="flow-button primary" type="submit">Start demonstration</button>${button('Cancel', 'open-app')}</div></form>${notice}`);
  }
  function recordingContent() {
    if (currentApp === 'canvas') return [
      `<h2>Sample course home</h2><p>Choose a course to begin your demonstration.</p>${button('Open Design 101', 'record-step', true)}`,
      `<h2>Design 101</h2><p>Choose the information you want to read.</p>${button('Open assignments', 'record-step', true)}`,
      `<h2>Assignments</h2><p><strong>Weekly sketch study</strong></p><p>Due Friday · Design 101 · Sample data</p>`
    ][Math.min(recordedStep, 2)];
    if (currentApp === 'youtube') return [
      `<h2>Search videos</h2><label class="flow-field">Search phrase<input id="demo-search" value="How to make a paper lamp"></label>${button('Search sample videos', 'record-step', true)}`,
      `<h2>Sample search results</h2>${button('Open “Make a paper lamp”', 'record-step', true)}`,
      `<h2>Make a paper lamp</h2><p>Sample video · 8 minutes</p>${button('Read description', 'record-step', true)}`,
      `<h2>Video description</h2><p>Fold a simple paper shade with materials from home.</p><p>Sample description · no real video was opened.</p>`
    ][Math.min(recordedStep, 3)];
    return [`<h2>${escape(app().name)} sample workspace</h2><p>Open a sample page to demonstrate a reading task.</p>${button('Open sample page', 'record-step', true)}`, `<h2>Project notes</h2><p>Research notes and next steps for the project.</p><p>Sample content · no website was opened.</p>`][Math.min(recordedStep, 1)];
  }
  function showRecording() {
    const ready = recordedStep >= (currentApp === 'canvas' ? 2 : currentApp === 'youtube' ? 3 : 1);
    show(header(taskName, 'Demonstration: you click the steps. The product records them.') + steps(1) + `<div class="flow-note">Recording simulation · ${recordedStep} sample action${recordedStep === 1 ? '' : 's'} recorded</div><div class="flow-browser"><div class="flow-browser-bar">${escape(app().url)} · simulated browser</div><div class="flow-browser-page">${recordingContent()}</div></div><div class="flow-actions">${button('Stop & review', 'review', true, ready ? '' : 'disabled')}${button('Cancel demonstration', 'teach')}</div>${!ready ? '<p class="flow-preview">Complete the sample steps to enable review.</p>' : ''}${notice}`);
  }
  function showReview() {
    show(header('Review your task', 'Choose what can change each time. Test before you save.') + steps(2) + `<div class="flow-grid"><form id="test-task" class="flow-panel"><h2>${escape(taskName)}</h2><label class="flow-field">Input name<input name="inputName" value="${escape(taskInput || app().input)}" required maxlength="60"></label><label class="flow-field">Test value<input name="inputValue" value="${escape(inputValue || app().sample)}" required maxlength="200"></label><p class="flow-preview">Proposed result: a title and readable text from the selected page.</p><div class="flow-actions"><button class="flow-button" type="submit">Test sample task</button>${button('Save task', 'save', true, tested ? '' : 'disabled')}</div>${!tested ? '<p class="flow-preview">Run the sample test to enable saving.</p>' : '<p class="flow-live" role="status">Sample test complete. The task is ready to save.</p>'}</form><section class="flow-panel"><h2>Test result</h2>${tested ? result() : '<p>Run a test to preview the result your assistant would receive.</p>'}<p class="flow-note">This is a fixed sample result. Real request capture and execution still need to be built.</p></section></div>${notice}`);
  }
  const result = () => `<article class="flow-result"><strong>${escape(app().result)}</strong><p>${escape(app().detail)}</p><p class="flow-code">${escape(taskInput || app().input)}: ${escape(inputValue || app().sample)}</p></article>`;
  function showTryTask() {
    show(header(taskName, `Try a saved task from ${escape(app().name)}.`) + `<div class="flow-grid"><form id="run-task" class="flow-panel"><label class="flow-field">${escape(taskInput)}<input name="value" required value="${escape(inputValue)}"></label><button class="flow-button primary" type="submit">Run sample task</button></form><section class="flow-panel" id="run-result"><h2>Result</h2><p>Your sample result will appear here.</p></section></div>${notice}`);
  }
  function showConnect() {
    show(header(`Connect ${app().name}`, 'Saved tasks become tools your assistant can use.') + `<section class="flow-panel flow-stack"><h2>Your app’s MCP address</h2><p>Add the address as a connector in a compatible assistant. The real product will require authentication.</p><div class="flow-copy"><label class="flow-field">Demo address — does not work<input id="mcp-address" readonly value="https://mcparrot.example/mcp/${escape(currentApp)}"></label>${button('Copy demo address', 'copy')}</div><p id="copy-status" class="flow-live" role="status"></p><h2 class="flow-spaced-heading">Available tasks</h2>${app().tasks.length ? `<ul>${app().tasks.map(name => `<li>${escape(name)}</li>`).join('')}</ul>` : '<p>Create a task first to give your assistant something to use.</p>'}<div class="flow-note">Example request: “${escape(app().tasks[0] || 'Run my saved task')}.” This preview does not connect to an assistant.</div></section>${notice}`);
  }
  function showReconnect(stage = 0) {
    const content = [
      `<h2>A task needs your attention</h2><p>Your sample session has expired. The pending task is paused while Browser Use attempts sign-in.</p><p>With your permission, the real product could use securely saved credentials. Otherwise, you sign in manually.</p>${button('Simulate reaching verification', 'verification', true)}`,
      `<h2>Verification required</h2><p>Your assistant would show a secure link to this page. Approve the request on your device or complete verification in the browser.</p><p>This sample collects no passwords or codes.</p>${button('Simulate approval', 'approved', true)}`,
      `<h2>Connection restored</h2><p>The sample task resumed after verification. Your assistant may need to request its status again.</p>${result()}${button('Back to app', 'open-app', true)}`
    ][stage];
    show(header(`Reconnect ${app().name}`, 'Keep the pending task while you restore access.') + `<section class="flow-panel flow-stack">${content}</section>${notice}`);
  }
  function showActivity() {
    show(header('Activity', 'Only actions from this preview appear here.') + `<section class="flow-panel"><h2>Recent sample actions</h2>${events.length ? `<ul class="flow-list">${events.map(event => `<li class="flow-row"><strong>${escape(event)}</strong><span class="flow-badge">This preview</span></li>`).reverse().join('')}</ul>` : '<p class="flow-empty">No activity yet. Open an app and teach or test a task.</p>'}</section>${notice}`);
  }
  async function copyAddress() {
    const field = document.querySelector('#mcp-address');
    field.select();
    try {
      await navigator.clipboard.writeText(field.value);
      document.querySelector('#copy-status').textContent = 'Demo address copied. It is not a working connector.';
    } catch {
      document.querySelector('#copy-status').textContent = 'Address selected. Use your browser’s Copy command.';
    }
  }
  const actions = {
    home: showHome,
    'new-app': showCreateApp,
    'open-app': showApp,
    'signed-in': () => { events.push(`${app().name}: simulated sign-in`); showApp(); },
    teach: () => { taskName = ''; showTeach(); },
    'record-step': () => { recordedStep += 1; showRecording(); },
    review: () => { tested = false; taskInput = ''; inputValue = ''; showReview(); },
    save: () => {
      if (taskSaved) return;
      app().tasks.push(taskName);
      taskDefinitions.set(`${currentApp}:${taskName}`, { name: taskInput, value: inputValue });
      taskSaved = true;
      events.push(`${app().name}: saved “${taskName}” in this preview`);
      showApp();
    },
    'try-task': () => {
      const definition = taskDefinitions.get(`${currentApp}:${taskName}`);
      taskInput = definition?.name || app().input;
      inputValue = definition?.value || app().sample;
      showTryTask();
    },
    connect: showConnect,
    reconnect: () => showReconnect(),
    verification: () => showReconnect(1),
    approved: () => { events.push(`${app().name}: simulated verification and resumed task`); showReconnect(2); },
    activity: showActivity,
    copy: copyAddress
  };
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    if (control.dataset.app) currentApp = control.dataset.app;
    if (control.dataset.task) taskName = control.dataset.task;
    const action = actions[control.dataset.action];
    if (action) { event.preventDefault(); action(); }
  });
  view.addEventListener('input', event => {
    if (event.target.closest('#test-task') && tested) {
      tested = false;
      view.querySelector('[data-action="save"]').disabled = true;
      view.querySelector('.flow-live').textContent = 'Inputs changed. Run the sample test again before saving.';
    }
  });
  view.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    if (event.target.id === 'create-app') {
      currentApp = `app-${Object.keys(apps).length}`;
      apps[currentApp] = { name: data.get('name').trim(), url: data.get('url'), tasks: [], input: 'Page name', sample: 'Project notes', result: 'Project notes', detail: 'Sample page: Research notes and next steps for the project.' };
      showSignIn();
    }
    if (event.target.id === 'create-task') {
      taskName = data.get('task').trim();
      recordedStep = 0;
      showRecording();
    }
    if (event.target.id === 'test-task') {
      taskInput = data.get('inputName').trim();
      inputValue = data.get('inputValue').trim();
      tested = true;
      events.push(`${app().name}: tested sample task`);
      showReview();
    }
    if (event.target.id === 'run-task') {
      inputValue = data.get('value');
      document.querySelector('#run-result').innerHTML = `<h2>Sample result</h2>${result()}<p class="flow-note">Fixed sample data; no website request ran.</p>`;
      events.push(`${app().name}: ran sample task`);
    }
  });
})();
