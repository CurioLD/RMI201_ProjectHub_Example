const hub = (() => {
  const store = {};
  const calcs = [];
  const subs = [];
  let failed = false;
  const api = {
    data(id) {
      if (store[id]) return { status: 'ok', data: store[id] };
      return { status: failed ? 'error' : 'loading', data: [] };
    },
    calc(id, { inputs, fn }) { calcs.push({ id, inputs, fn }); },
    onData(fn) { subs.push(fn); fn(); },
    setLink(id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ } },
  };
  const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  Promise.all([get('project-data.json'), get('charter.json')]).then(([p, c]) => {
    store.issues = p.issues;
    store.sync = [{ synced_at: p.synced_at, issues: p.issues.length }];
    Object.assign(store, c);
    calcs.forEach((k) => { store[k.id] = k.fn(...k.inputs.map((i) => store[i] || [])); });
    subs.forEach((f) => f());
  }).catch(() => { failed = true; subs.forEach((f) => f()); });
  return api;
})();
hub.calc('progress', {
  title: 'Progress by phase',
  description: 'Share of Jira stories and tasks marked Done in the blueprint, storyboard and build epics.',
  inputs: ['issues'],
  fn: (issues) => {
    const phases = [
      ['Blueprint', ['RMI101-2']],
      ['Storyboard', ['RMI101-3', 'RMI101-117', 'RMI101-222', 'RMI101-391']],
      ['Build', ['RMI101-4', 'RMI101-314', 'RMI101-320', 'RMI101-447']],
    ];
    return phases.map(([phase, epics]) => {
      const rows = issues.filter((r) => epics.includes(r.epic));
      const done = rows.filter((r) => r.status === 'Done').length;
      return { phase, done, total: rows.length, pct: rows.length ? Math.round((done / rows.length) * 100) : 0 };
    });
  },
});

hub.calc('groups', {
  title: 'Timeline groups',
  description: 'Done and total issues, and the date span, for each timeline group and for the whole project.',
  inputs: ['issues'],
  fn: (issues) => {
    const groups = {
      '00': ['RMI101-1'], '01': ['RMI101-2'],
      D1: ['RMI101-3'], D2: ['RMI101-117'], D3: ['RMI101-222'], D4: ['RMI101-391'],
      B1: ['RMI101-4'], B2: ['RMI101-314'], B3: ['RMI101-320'], B4: ['RMI101-447'],
      '04': ['RMI101-5', 'RMI101-273'], '05': ['RMI101-6'],
    };
    const sum = (group, rows) => {
      const starts = rows.map((r) => r.start || r.due).filter(Boolean).sort();
      const dues = rows.map((r) => r.due || r.start).filter(Boolean).sort();
      return { group, done: rows.filter((r) => r.status === 'Done').length, total: rows.length,
        start: starts[0] || null, due: dues[dues.length - 1] || null };
    };
    const out = Object.entries(groups).map(([g, epics]) => sum(g, issues.filter((r) => epics.includes(r.epic))));
    out.push(sum('all', issues));
    return out;
  },
});

hub.calc('gateway_counts', {
  title: 'Gateway sign-offs',
  description: 'Gateway sign-off issues in Jira, counted by gateway number from the summary, and how many are Done.',
  inputs: ['issues'],
  fn: (issues) => ['1', '2', '3'].map((gateway) => {
    const rows = issues.filter((r) => (r.summary || '').includes('(Gateway ' + gateway + ')'));
    return { gateway, done: rows.filter((r) => r.status === 'Done').length, total: rows.length };
  }),
});

hub.calc('totals', {
  title: 'Scope totals',
  description: 'Courses, modules, videos and assessments summed across the courses in this hub.',
  inputs: ['scope'],
  fn: (scope) => [{
    courses: scope.length,
    modules: scope.reduce((a, r) => a + Number(r.modules), 0),
    videos: scope.reduce((a, r) => a + Number(r.videos), 0),
    assessments: scope.reduce((a, r) => a + Number(r.assessments), 0),
  }],
});

(() => {
  const GROUPS = [
    { id: '00', name: 'Governance', epics: ['RMI101-1'] },
    { id: '01', name: 'Align', epics: ['RMI101-2'] },
    { id: 'D1', name: 'BUSM2639 design', sub: 'Tranche 1', epics: ['RMI101-3'], tr: 't1' },
    { id: 'D2', name: 'ISYS3488 design', sub: 'Tranche 1', epics: ['RMI101-117'], tr: 't1' },
    { id: 'D3', name: 'BUSM4497 design', sub: 'Tranche 2', epics: ['RMI101-222'], tr: 't2' },
    { id: 'D4', name: 'BUSM3125 design', sub: 'Tranche 2', epics: ['RMI101-391'], tr: 't2' },
    { id: 'B1', name: 'BUSM2639 build', sub: 'Tranche 1', epics: ['RMI101-4'], tr: 't1' },
    { id: 'B2', name: 'ISYS3488 build', sub: 'Tranche 1', epics: ['RMI101-314'], tr: 't1' },
    { id: 'B3', name: 'BUSM4497 build', sub: 'Tranche 2', epics: ['RMI101-320'], tr: 't2' },
    { id: 'B4', name: 'BUSM3125 build', sub: 'Tranche 2', epics: ['RMI101-447'], tr: 't2' },
    { id: '04', name: 'Launch', epics: ['RMI101-5', 'RMI101-273'] },
    { id: '05', name: 'Retain', epics: ['RMI101-6'] },
  ];
  const DAY = 864e5;
  const now = new Date();
  const TODAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const P = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00Z') : null);
  const fDay = d3.utcFormat('%a %-d %b');
  const fShort = d3.utcFormat('%-d %b');
  const fMon = d3.utcFormat('%b %Y');
  const URL = (k) => 'https://curiogroup.atlassian.net/browse/' + encodeURIComponent(k);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const open = new Set();

  const norm = (r) => {
    const sum = String(r.summary || '');
    const gm = sum.match(/\(Gateway (\d)\)/);
    let cat = 'act';
    if (/SME Review/i.test(sum)) cat = 'rev';
    else if (/Synthesia|Graphic design|Technical Build|H5P|Canvas shell|client environment QA|Build Remediation|Build review/i.test(sum)) cat = 'media';
    const s = P(r.start), d = P(r.due);
    return {
      key: r.key, epic: r.epic, status: r.status, done: r.status === 'Done', doing: r.status === 'In progress',
      s: s || d, d: d || s, sum, gw: gm ? gm[1] : null, cat,
      title: sum.replace(/^\d[\d.,a-z\s-]*?—\s*/i, '').replace(/\s*\(Gateway \d\)/, '').trim(),
    };
  };
  const byDate = (a, b) => (a.s ? +a.s : Infinity) - (b.s ? +b.s : Infinity) || (a.d ? +a.d : Infinity) - (b.d ? +b.d : Infinity)
    || Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]);
  const span = (a, b) => (a && b ? (+a === +b ? fShort(a) : fShort(a) + ' to ' + fShort(b)) : 'No dates in Jira');
  const daysTo = (d) => Math.round((d - TODAY) / DAY);
  const failLine = () => el('div', 'h-fail', 'Failed to load');
  const tick = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 12 12'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M2 6.5l2.5 2.5L10 3.5'); p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#FFFFFF'); p.setAttribute('stroke-width', '1.8'); s.appendChild(p); return s;
  };
  const statusIcon = (r) => {
    const st = el('span', 'h-st' + (r.done ? ' done' : r.doing ? ' doing' : ''));
    if (r.done) st.appendChild(tick());
    st.appendChild(el('span', 'h-sr', r.status));
    return st;
  };
  const keyLink = (k) => { const a = el('a', 'h-key', k); a.href = URL(k); a.target = '_blank'; a.rel = 'noopener'; return a; };
  const contract = (tr, id) => {
    const m = hub.data('milestones');
    if (m.status !== 'ok' || !tr) return null;
    const row = m.data.find((x) => x.id === id);
    const v = row && row[tr + '_date'];
    return v ? P(v) : null;
  };
  const countChip = (done, due) => {
    if (done) return el('span', 'h-count ok', 'Signed off');
    if (!due) return el('span', 'h-count', 'No date');
    const n = daysTo(due);
    if (n < 0) return el('span', 'h-count late', (-n) + (n === -1 ? ' day overdue' : ' days overdue'));
    return el('span', 'h-count', n === 0 ? 'Due today' : 'In ' + n + (n === 1 ? ' day' : ' days'));
  };

  /* ---------- Hero, chips, footer ---------- */
  function drawHero() {
    const g = hub.data('groups');
    const all = g.status === 'ok' ? g.data.find((x) => x.group === 'all') : null;
    document.querySelectorAll('.h-range').forEach((n) => {
      n.textContent = all && all.start ? fMon(P(all.start)) + ' to ' + fMon(P(all.due)) : '—';
    });
    const p = hub.data('progress');
    document.querySelectorAll('[data-source="progress"]').forEach((n) => {
      const row = p.status === 'ok' ? p.data.find((x) => 'phase=' + x.phase === n.dataset.where) : null;
      n.textContent = row ? String(row[n.dataset.field]) : '—';
    });
    document.querySelectorAll('.h-meter span').forEach((n) => {
      const row = p.status === 'ok' ? p.data.find((x) => x.phase === n.dataset.phase) : null;
      n.style.width = row ? row.pct + '%' : '0';
    });
    const gc = hub.data('gateway_counts');
    document.querySelectorAll('[data-source="gateway_counts"]').forEach((n) => {
      const row = gc.status === 'ok' ? gc.data.find((x) => 'gateway=' + x.gateway === n.dataset.where) : null;
      n.textContent = row ? String(row[n.dataset.field]) : '—';
    });
    const s = hub.data('sync');
    const at = s.status === 'ok' && s.data[0] ? new Date(s.data[0].synced_at) : null;
    document.getElementById('synced').textContent = at && !isNaN(at)
      ? at.toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  }

  /* ---------- Timeline ---------- */
  function drawTimeline() {
    const box = document.getElementById('gantt');
    const s = hub.data('issues');
    if (s.status !== 'ok') {
      box.classList.toggle('h-skel', s.status === 'loading');
      box.replaceChildren(...(s.status === 'loading' ? [] : [failLine()]));
      return;
    }
    box.classList.remove('h-skel');
    const rows = s.data.map(norm);
    const dated = rows.filter((r) => r.s);
    const gs = hub.data('groups');
    const gstat = (id) => (gs.status === 'ok' ? gs.data.find((x) => x.group === id) : null);
    const x0 = d3.utcMonth.floor(d3.min(dated, (r) => r.s));
    const x1 = d3.utcMonth.ceil(new Date(+d3.max(dated, (r) => r.d) + DAY));
    const pct = (d) => ((d - x0) / (x1 - x0)) * 100;
    const parts = [];

    const head = el('div', 'h-months');
    head.appendChild(el('div', 'h-lab'));
    const htrk = el('div', 'h-trk');
    d3.utcMonths(x0, x1).forEach((m) => { const l = el('span', 'h-mlab', d3.utcFormat('%b')(m)); l.style.left = pct(m) + '%'; htrk.appendChild(l); });
    head.appendChild(htrk);
    parts.push(head);

    const ov = el('div', 'h-overlay');
    d3.utcMonths(x0, x1).forEach((m) => { const l = el('div', 'h-mline'); l.style.left = pct(m) + '%'; ov.appendChild(l); });
    if (TODAY >= x0 && TODAY < x1) {
      const t = el('div', 'h-today'); t.style.left = pct(new Date(+TODAY + DAY / 2)) + '%';
      t.appendChild(el('b', null, 'Today ' + fShort(TODAY))); ov.appendChild(t);
    }
    parts.push(ov);

    GROUPS.forEach((G) => {
      const items = rows.filter((r) => G.epics.includes(r.epic)).sort(byDate);
      const st = gstat(G.id);
      const b = el('button', 'h-grp'); b.type = 'button'; b.id = 'grp-' + G.id;
      b.setAttribute('aria-expanded', open.has(G.id) ? 'true' : 'false');
      const lab = el('div', 'h-lab');
      const ch = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ch.setAttribute('viewBox', '0 0 10 10'); ch.setAttribute('class', 'h-chev'); ch.setAttribute('aria-hidden', 'true');
      const cp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); cp.setAttribute('d', 'M3 1l4 4-4 4'); cp.setAttribute('fill', 'none'); cp.setAttribute('stroke', 'currentColor'); cp.setAttribute('stroke-width', '1.5'); ch.appendChild(cp);
      lab.appendChild(ch);
      lab.appendChild(el('span', 'h-code', G.id));
      const nm = el('span', 'h-gname', G.name); lab.appendChild(nm);
      const meta = el('span', 'h-gmeta');
      meta.appendChild(document.createTextNode((st && st.start ? span(P(st.start), P(st.due)) : 'Nothing scheduled') + ' · '));
      const dn = el('span', null, st ? String(st.done) : '—'); dn.dataset.source = 'groups'; dn.dataset.where = 'group=' + G.id; dn.dataset.field = 'done';
      const tt = el('span', null, st ? String(st.total) : '—'); tt.dataset.source = 'groups'; tt.dataset.where = 'group=' + G.id; tt.dataset.field = 'total';
      meta.append(dn, document.createTextNode('/'), tt);
      lab.appendChild(meta);
      b.appendChild(lab);
      const trk = el('div', 'h-trk');
      if (st && st.start) { const sp = el('div', 'h-span'); sp.style.left = pct(P(st.start)) + '%'; sp.style.width = Math.max(0.6, pct(new Date(+P(st.due) + DAY)) - pct(P(st.start))) + '%'; trk.appendChild(sp); }
      b.appendChild(trk);
      b.addEventListener('click', () => { open.has(G.id) ? open.delete(G.id) : open.add(G.id); drawTimeline(); });
      parts.push(b);
      if (!open.has(G.id)) return;
      if (!items.length) { parts.push(el('div', 'h-empty', 'Nothing scheduled in Jira for this phase yet.')); return; }
      items.forEach((r) => {
        const row = el('div', 'h-row' + (r.done ? ' done' : ''));
        const l = el('div', 'h-lab');
        l.appendChild(statusIcon(r));
        const t = el('div');
        t.appendChild(el('span', 'h-title', r.title));
        if (r.gw) t.appendChild(el('span', 'h-tag', 'Gateway ' + r.gw));
        l.appendChild(t);
        const m = el('div', 'h-meta');
        m.appendChild(keyLink(r.key));
        m.appendChild(el('span', null, r.s ? (+r.s === +r.d ? fDay(r.s) : fDay(r.s) + ' to ' + fDay(r.d)) : 'No dates in Jira'));
        if (!r.done && r.d && r.d < TODAY) m.appendChild(el('span', 'h-od', 'Overdue'));
        l.appendChild(m);
        row.appendChild(l);
        const tr = el('div', 'h-trk');
        if (r.s) {
          if (r.gw) { const dm = el('div', 'h-dia'); dm.style.left = pct(new Date(+r.d + DAY / 2)) + '%'; tr.appendChild(dm); }
          else { const bar = el('div', 'h-bar ' + r.cat); bar.style.left = pct(r.s) + '%'; bar.style.width = (pct(new Date(+r.d + DAY)) - pct(r.s)) + '%'; tr.appendChild(bar); }
        }
        row.appendChild(tr);
        parts.push(row);
      });
    });
    box.replaceChildren(...parts);
  }
  document.getElementById('exp-all').addEventListener('click', () => { GROUPS.forEach((g) => open.add(g.id)); drawTimeline(); });
  document.getElementById('col-all').addEventListener('click', () => { open.clear(); drawTimeline(); });

  /* ---------- Gateways ---------- */
  function gwRow(title, sub, due, done, contractDate, keys) {
    const r = el('div', 'h-gwrow');
    const left = el('div');
    left.appendChild(el('h4', null, title));
    const m = el('div', 'h-meta');
    keys.forEach((k) => m.appendChild(keyLink(k)));
    if (sub) m.appendChild(el('span', null, sub));
    m.appendChild(el('span', null, due ? 'Due ' + fDay(due) : 'No date in Jira'));
    if (contractDate) m.appendChild(el('span', null, 'Contract ' + fDay(contractDate)));
    left.appendChild(m);
    r.appendChild(left);
    r.appendChild(countChip(done, due));
    return r;
  }
  function drawGateways() {
    const s = hub.data('issues');
    const lists = document.querySelectorAll('.h-gwlist');
    if (s.status !== 'ok') {
      lists.forEach((n) => { n.classList.toggle('h-skel', s.status === 'loading'); n.replaceChildren(...(s.status === 'loading' ? [] : [failLine()])); });
      return;
    }
    const rows = s.data.map(norm);
    const groupOf = (r) => GROUPS.find((g) => g.epics.includes(r.epic));
    lists.forEach((n) => {
      n.classList.remove('h-skel');
      const gw = n.dataset.gw;
      const its = rows.filter((r) => r.gw === gw);
      const out = [];
      if (gw === '1') {
        its.sort(byDate).forEach((r) => {
          const tr = /Tranche 2/i.test(r.sum) ? 't2' : 't1';
          out.push(gwRow(tr === 't2' ? 'Tranche 2 blueprints' : 'Tranche 1 blueprints', r.title, r.d, r.done, contract(tr, 'g1'), [r.key]));
        });
      } else if (gw === '2') {
        GROUPS.filter((g) => g.id[0] === 'D').forEach((G) => {
          const ch = its.filter((r) => G.epics.includes(r.epic)).sort((a, b) => (+a.d || 0) - (+b.d || 0));
          if (!ch.length) return;
          const next = ch.find((r) => !r.done);
          const allDone = !next;
          const last = ch[ch.length - 1];
          const row = gwRow(G.name.replace(' design', '') + ' storyboards', G.sub + ' · ' + ch.filter((r) => r.done).length + ' of ' + ch.length + ' modules signed off',
            allDone ? last.d : next.d, allDone, contract(G.tr, 'g2'), []);
          const stages = el('div', 'h-stages');
          ch.forEach((r) => {
            const wk = r.sum.match(/Week (\d+)/);
            const late = !r.done && r.d && r.d < TODAY;
            const c = el('a', 'h-stage' + (r.done ? ' done' : r === next ? ' cur' : '') + (late ? ' late' : ''));
            c.href = URL(r.key); c.target = '_blank'; c.rel = 'noopener';
            c.appendChild(el('b', null, wk ? 'Week ' + wk[1] : 'Assessment'));
            c.appendChild(document.createTextNode(r.d ? fShort(r.d) : 'No date'));
            c.setAttribute('aria-label', (wk ? 'Week ' + wk[1] : 'Assessment') + ', ' + r.status + (late ? ', overdue' : '') + ', ' + r.key);
            stages.appendChild(c);
          });
          row.appendChild(stages);
          out.push(row);
        });
      } else {
        GROUPS.filter((g) => g.id[0] === 'B').forEach((G) => {
          its.filter((r) => G.epics.includes(r.epic)).forEach((r) => {
            out.push(gwRow(G.name.replace(' build', '') + ' final sign-off', G.sub, r.d, r.done, contract(G.tr, 'g3'), [r.key]));
          });
        });
      }
      if (!out.length) out.push(el('div', 'h-empty', 'No sign-offs for this gateway in Jira yet.'));
      n.replaceChildren(...out);
    });
  }

  /* ---------- Charter tables ---------- */
  function fillTable(id, ds) {
    const t = document.getElementById(id);
    const s = hub.data(ds);
    const tb = t.querySelector('tbody');
    const cols = [...t.querySelectorAll('th')].map((th) => th.dataset.field);
    if (s.status !== 'ok') { tb.replaceChildren(); return; }
    tb.replaceChildren(...s.data.map((r) => {
      const tr = el('tr');
      cols.forEach((c) => { const td = el('td', /^(blueprint|storyboard|media|build|handover|modules|videos|assessments)$/.test(c) ? 'c' : null, r[c] == null ? '' : String(r[c])); tr.appendChild(td); });
      return tr;
    }));
  }
  function drawCharter() {
    fillTable('t-scope', 'scope');
    fillTable('t-ms', 'milestones');
    fillTable('t-people', 'people');
    fillTable('t-actions', 'actions');
    const tot = hub.data('totals');
    document.querySelectorAll('[data-source="totals"]').forEach((n) => {
      n.textContent = tot.status === 'ok' && tot.data[0] ? String(tot.data[0][n.dataset.field]) : '—';
    });
  }

  /* ---------- Tabs ---------- */
  const tabs = [...document.querySelectorAll('.h-tab')];
  let current = 'timeline';
  function show(id, link) {
    current = id;
    tabs.forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.dataset.tab).hidden = !on;
    });
    if (link) hub.setLink(id);
    draw();
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => show(b.dataset.tab, true));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); show(n.dataset.tab, true);
    });
  });
  document.querySelectorAll('.h-nav button').forEach((b) => b.addEventListener('click', () => {
    const t = document.getElementById(b.dataset.go);
    t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); hub.setLink(t.id);
  }));

  function draw() {
    drawHero();
    if (current === 'timeline') drawTimeline();
    if (current === 'gateways') drawGateways();
    drawCharter();
  }
  hub.onData(draw);

  const h = location.hash.slice(1);
  if (['timeline', 'gateways', 'charter'].includes(h)) show(h, false);
  else if (h && document.getElementById(h) && document.getElementById(h).closest('#charter')) {
    show('charter', false);
    const t = document.getElementById(h); if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView();
  }
})();
