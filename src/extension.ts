// codebasegps/src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';

declare const require: any; // allow conditional require for node-fetch fallback

// Use env BACKEND_URL if set, otherwise fallback to hosted backend
const BACKEND_URL = process.env.BACKEND_URL || 'https://codebasegpsservice-production.up.railway.app';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "codebasegps" is now active!');

  const disposable = vscode.commands.registerCommand('codebasegps.helloKenya', async () => {
    const panel = vscode.window.createWebviewPanel(
      'codebasegps',
      'codebaseGPS',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Provide HTML for the webview (includes vis-network for graph rendering)
    panel.webview.html = getWebviewContent(panel);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.command) {
            case 'search': {
              const results = await analyzeCodebase(message.text);
              panel.webview.postMessage({ command: 'searchResults', results });
              break;
            }

            case 'analyzeWithLLM': {
              await analyzeWithLLM(message.text, panel);
              break;
            }

            case 'map': {
              // Generate dependency map via backend
              panel.webview.postMessage({ command: 'llmResponse', text: '📡 Generating dependency map...' });

              const codebaseContext = await collectCodebaseContext();

              // Use native fetch if available, else fallback to node-fetch
              let _fetch: any = (globalThis as any).fetch;
              if (typeof _fetch === 'undefined') {
                try {
                  _fetch = require('node-fetch');
                } catch (err) {
                  panel.webview.postMessage({ command: 'llmResponse', text: '❌ fetch not available. Install node-fetch as fallback.' });
                  break;
                }
              }

              try {
                const resp = await _fetch(`${BACKEND_URL}/gps/query`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    task: 'map',
                    context: codebaseContext,
                    query: message.text ?? "" // <-- send empty string instead of null
                  })
                });

                if (!resp.ok) {
                  const t = await resp.text();
                  panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend error: ${resp.status} ${t}` });
                  break;
                }

                const json = await resp.json();
                if (json.status === 'success' && json.data) {
                  // Expect json.data to follow GraphResponse: { nodes: [{id,label,type,group,filePath?}], links: [{source,target,type}] }
                  panel.webview.postMessage({ command: 'graphData', data: json.data });
                } else {
                  panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend returned unexpected: ${JSON.stringify(json)}` });
                }
              } catch (err: any) {
                panel.webview.postMessage({ command: 'llmResponse', text: `❌ Fetch error: ${err?.message ?? String(err)}` });
              }

              break;
            }

            case 'impact': {
              // Run impact analysis on backend
              panel.webview.postMessage({ command: 'llmResponse', text: '📡 Running impact analysis...' });

              const codebaseContext = await collectCodebaseContext();

              let _fetch: any = (globalThis as any).fetch;
              if (typeof _fetch === 'undefined') {
                try {
                  _fetch = require('node-fetch');
                } catch (err) {
                  panel.webview.postMessage({ command: 'llmResponse', text: '❌ fetch not available. Install node-fetch as fallback.' });
                  break;
                }
              }

              try {
                const resp = await _fetch(`${BACKEND_URL}/gps/query`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    task: 'impact',
                    context: codebaseContext,
                    query: message.text ?? ""
                  })
                });

                if (!resp.ok) {
                  const t = await resp.text();
                  panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend error: ${resp.status} ${t}` });
                  break;
                }

                const json = await resp.json();
                if (json.status === 'success' && json.data) {
                  panel.webview.postMessage({ command: 'llmResponse', text: formatAIResponse(json.data, 'impact') });
                } else {
                  panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend returned unexpected: ${JSON.stringify(json)}` });
                }
              } catch (err: any) {
                panel.webview.postMessage({ command: 'llmResponse', text: `❌ Fetch error: ${err?.message ?? String(err)}` });
              }

              break;
            }

            case 'openFile': {
              // Open file in the editor when requested by webview (node click)
              try {
                const requestedPath = message.filePath as string;
                if (!requestedPath) break;

                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                let fileUri: vscode.Uri;
                if (path.isAbsolute(requestedPath)) {
                  fileUri = vscode.Uri.file(requestedPath);
                } else if (workspaceFolder) {
                  fileUri = vscode.Uri.joinPath(workspaceFolder.uri, requestedPath);
                } else {
                  fileUri = vscode.Uri.file(requestedPath);
                }

                const doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc, { preview: false });
              } catch (err) {
                console.error('Failed to open file:', err);
                panel.webview.postMessage({ command: 'llmResponse', text: `❌ Failed to open file: ${err?.message ?? String(err)}` });
              }
              break;
            }

            default:
              console.warn('Unknown message from webview:', message);
          }
        } catch (err) {
          console.error('Error handling webview message:', err);
          panel.webview.postMessage({ command: 'llmResponse', text: `❌ Internal extension error: ${String(err)}` });
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

/**
 * Try VS Code LLM API (Copilot) first; fallback to remote backend search if not available.
 */
async function analyzeWithLLM(userQuery: string, panel: vscode.WebviewPanel) {
  try {
    // Show initial message
    panel.webview.postMessage({ command: 'llmResponse', text: '📡 Connecting to Codebase GPS Brain...' });

    // Attempt to use VS Code's LLM (if available)
    const lmNamespace: any = (vscode as any).lm;
    if (lmNamespace && typeof lmNamespace.selectChatModels === 'function') {
      try {
        const models = await lmNamespace.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
        if (models && models.length > 0) {
          const model = models[0];
          const codebaseContext = await collectCodebaseContext();

          const messages = [
            vscode.LanguageModelChatMessage.User(`You are a helpful code assistant analyzing a codebase. Here's the project structure and file contents:

${codebaseContext}

User question: ${userQuery}

Provide a helpful, specific answer with file paths and line numbers when relevant. Be concise but thorough.`)
          ];

          const cts = new vscode.CancellationTokenSource();
          const response = await model.sendRequest(messages, {}, cts.token);

          panel.webview.postMessage({ command: 'llmResponse', text: '' });
          let full = '';
          for await (const chunk of response.text) {
            full += chunk;
            panel.webview.postMessage({ command: 'llmChunk', text: chunk });
          }
          return;
        } else {
          panel.webview.postMessage({ command: 'llmResponse', text: '⚠️ No local LLM models available, falling back to backend.' });
        }
      } catch (err) {
        // If any error using the local LLM API, silently fall back to backend path below
        console.warn('Local LLM API failed, falling back to backend', err);
      }
    } else {
      panel.webview.postMessage({ command: 'llmResponse', text: '⚠️ Local LLM API not available in this VS Code. Using backend instead.' });
    }

    // Backend fallback
    const codebaseContext = await collectCodebaseContext();

    let _fetch: any = (globalThis as any).fetch;
    if (typeof _fetch === 'undefined') {
      try {
        _fetch = require('node-fetch');
      } catch (err) {
        panel.webview.postMessage({ command: 'llmResponse', text: '❌ fetch not available. Install node-fetch as fallback.' });
        return;
      }
    }

    panel.webview.postMessage({ command: 'llmResponse', text: '📡 Calling remote Codebase GPS backend...' });

    const resp = await _fetch(`${BACKEND_URL}/gps/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'search', // defaulting to search here; UI could allow specifying impact/map
        context: codebaseContext,
        query: userQuery
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend error: ${resp.status} ${t}` });
      return;
    }

    const json = await resp.json();
    if (json.status === 'success' && json.data) {
      const formatted = formatAIResponse(json.data, 'search');
      panel.webview.postMessage({ command: 'llmResponse', text: formatted });
    } else {
      panel.webview.postMessage({ command: 'llmResponse', text: `❌ Backend returned unexpected: ${JSON.stringify(json)}` });
    }
  } catch (err: any) {
    panel.webview.postMessage({ command: 'llmResponse', text: `❌ Error: ${err?.message ?? String(err)}` });
  }
}

function formatAIResponse(data: any, task: string): string {
  if (!data) return 'No data returned.';
  if (task === 'impact') {
    return `⚠️ Risk Score: ${data.risk_score}/10\n\nAnalysis:\n${data.explanation}\n\nAffected Files:\n${(data.affected_modules || []).join('\n')}\n\nSuggested Tests:\n${(data.suggested_tests || []).join('\n')}`;
  }
  if (data.summary) return data.summary;
  if (data.results) return JSON.stringify(data.results, null, 2);
  return JSON.stringify(data, null, 2);
}

/**
 * Collect a concise codebase context: previews of up to 50 files, truncated to avoid token explosion.
 */
async function collectCodebaseContext(): Promise<string> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return 'No workspace folder open.';
  }

  const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,json,md,py}', '**/node_modules/**', 50);

  let context = `Workspace: ${workspaceFolder.name}\n\nFiles:\n`;

  for (const file of files) {
    try {
      const relativePath = vscode.workspace.asRelativePath(file);
      const content = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder().decode(content);
      const preview = text.slice(0, 500);
      context += `\n--- ${relativePath} ---\n${preview}${text.length > 500 ? '\n... (truncated)' : ''}\n`;
    } catch (err) {
      console.error(`Error reading ${file.fsPath}:`, err);
    }
  }

  return context;
}

/**
 * Simple local search through files (used by the Search button in the UI).
 * Returns array of { file: relativePath, matchCount } sorted by matchCount desc.
 */
async function analyzeCodebase(searchText: string): Promise<Array<{ file: string; matchCount: number }>> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return [];

  const files = await vscode.workspace.findFiles('**/*.{ts,js,java,cpp,md,env,yaml,json,py,tsx,jsx}', '**/node_modules/**');

  const results: Array<{ file: string; matchCount: number }> = [];

  const safePattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(safePattern, 'gi');

  for (const file of files) {
    try {
      const content = await vscode.workspace.fs.readFile(file);
      const text = new TextDecoder().decode(content);
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        results.push({ file: vscode.workspace.asRelativePath(file), matchCount: matches.length });
      }
    } catch (err) {
      console.error(`Error reading file ${file.fsPath}:`, err);
    }
  }

  results.sort((a, b) => b.matchCount - a.matchCount);
  return results;
}

/**
 * Webview HTML content with a modern "techy / AI" look and vis-network graph rendering.
 * Graph button sends 'map' command; when graphData is received, it renders an interactive graph.
 */
function getWebviewContent(panel: vscode.WebviewPanel): string {
  const cspSource = panel.webview.cspSource;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>codebaseGPS</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} https: 'unsafe-inline';">

<style>
  :root{
    --bg: var(--vscode-editor-background);
    --panel: var(--vscode-sideBar-background);
    --muted: rgba(255,255,255,0.06);
    --accent: #00E6C3; /* neon teal */
    --accent-2: #7C5CFF; /* purple */
    --glass: rgba(255,255,255,0.03);
    --radius: 12px;
  }
  html,body{height:100%;margin:0;background:linear-gradient(180deg, rgba(124,92,255,0.06) 0%, rgba(0,230,195,0.02) 100%), var(--bg); color:var(--vscode-foreground); font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; -webkit-font-smoothing:antialiased;}
  .container{padding:16px;display:grid;grid-template-columns: 1fr 420px; gap:16px; height:calc(100vh - 32px);}
  .card{background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00)); border:1px solid rgba(255,255,255,0.03); border-radius:var(--radius); box-shadow: 0 6px 18px rgba(2,6,23,0.4); overflow:hidden; display:flex; flex-direction:column;}
  .header{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.02);}
  .logo{width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;color:#001018;font-weight:700;box-shadow:0 4px 18px rgba(124,92,255,0.12);font-family:monospace;}
  .title{font-size:16px;font-weight:700;}
  .subtitle{font-size:12px;opacity:.75;}
  .toolbar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00));border-bottom:1px solid rgba(255,255,255,0.02);}
  .controls{display:flex;gap:8px;align-items:center;}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:var(--vscode-button-foreground);cursor:pointer;font-weight:600;}
  .btn.primary{background:linear-gradient(90deg,var(--accent),var(--accent-2)); color:#001018; box-shadow:0 6px 18px rgba(0,230,195,0.06); border:none;}
  .btn.ghost{background:transparent;border:1px solid rgba(255,255,255,0.04);}
  .btn:hover{transform:translateY(-1px);transition:all .12s ease;}
  .main{padding:12px;display:flex;flex-direction:column;gap:12px;height:100%;}
  #graphCard{flex:1;display:flex;flex-direction:column;gap:12px;padding:12px;}
  #graph{flex:1;border-radius:10px;border:1px solid rgba(255,255,255,0.03); background: linear-gradient(180deg, rgba(0,0,0,0.25), rgba(255,255,255,0.01));overflow:hidden;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.6);font-size:14px;}
  .rightPanel{display:flex;flex-direction:column;gap:12px;}
  .prompt{padding:12px;display:flex;flex-direction:column;gap:10px;}
  textarea#searchInput{width:100%;min-height:120px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00));color:var(--vscode-input-foreground);resize:vertical;font-family:monospace;font-size:13px;}
  .resultList{padding:12px;height:220px;overflow:auto;border-top:1px dashed rgba(255,255,255,0.02);}
  .resultItem{display:flex;flex-direction:column;padding:10px;border-radius:8px;background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00));border:1px solid rgba(255,255,255,0.02);margin-bottom:8px;}
  .resultMeta{display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.7);}
  .resultPath{font-weight:700;margin-top:6px;font-size:13px;color:var(--vscode-textLink-foreground);}
  .small{font-size:12px;opacity:0.8;}
  .badge{padding:6px 8px;border-radius:999px;background:rgba(255,255,255,0.03);font-weight:700;color:var(--accent);}
  .footerNote{font-size:12px;color:rgba(255,255,255,0.6);opacity:0.9;padding:8px 12px;}
  .mini-controls{display:flex;gap:8px;align-items:center;}
  .legend{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;}
  .legend div{display:flex;gap:6px;align-items:center;font-size:12px}
  .swatch{width:12px;height:12px;border-radius:3px;background:var(--accent);}
  @media (max-width: 920px) {
    .container{grid-template-columns: 1fr; padding:12px; }
    .rightPanel{order:2}
  }
</style>
</head>
<body>
  <div style="padding:10px 16px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="logo">CG</div>
        <div>
          <div class="title">codebaseGPS</div>
          <div class="subtitle">Navigate your repo with AI — instant context & maps</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <div class="badge">Hackathon Mode</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="card">
      <div class="header">
        <div style="flex:1">
          <div style="font-weight:700">Dependency Map</div>
          <div class="small" style="margin-top:4px">Interactive architectural view — click nodes to open files</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="mini-controls">
            <button id="btnGraphTop" class="btn primary">📈 Map</button>
            <button id="btnFitTop" class="btn ghost">Fit</button>
            <button id="btnExport" class="btn ghost">Export</button>
          </div>
        </div>
      </div>

      <div id="graphCard" class="main">
        <div id="graph">Click <strong>Map</strong> to fetch and render the dependency map.</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="legend">
            <div><span class="swatch" style="background:var(--accent)"></span> Entry</div>
            <div><span class="swatch" style="background:var(--accent-2)"></span> Core</div>
            <div><span class="swatch" style="background:#FFA94D"></span> Infra</div>
          </div>
          <div class="small">Nodes: <span id="nodeCount">0</span> • Edges: <span id="edgeCount">0</span></div>
        </div>
      </div>
    </div>

    <div class="rightPanel">
      <div class="card">
        <div class="header">
          <div style="flex:1">
            <div style="font-weight:700">Prompt Panel</div>
            <div class="small">Ask about the codebase — search locally or use AI</div>
          </div>
        </div>
        <div class="prompt">
          <textarea id="searchInput" placeholder="e.g. Which file handles authentication?"></textarea>
          <div style="display:flex;gap:8px;">
            <button id="btnSearch" class="btn primary">🔍 Search</button>
            <button id="btnAnalyze" class="btn">🤖 AI Analyze</button>
            <button id="btnImpact" class="btn ghost">⚠️ Impact</button>
          </div>
        </div>
        <div class="resultList" id="results">
          <div class="small">Results and AI responses will appear here.</div>
        </div>
        <div class="footerNote">Tip: Use <strong>Map</strong> to visualize dependencies before making large changes.</div>
      </div>
    </div>
  </div>

  <!-- vis-network CDN (quick prototype) -->
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>

  <script>
    const vscode = acquireVsCodeApi();

    const btnGraph = document.getElementById('btnGraphTop');
    const btnFit = document.getElementById('btnFitTop');
    const btnExport = document.getElementById('btnExport');
    const btnSearch = document.getElementById('btnSearch');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const btnImpact = document.getElementById('btnImpact');

    btnGraph?.addEventListener('click', () => {
      setGraphStatus('📡 Generating dependency map...');
      vscode.postMessage({ command: 'map', text: null });
    });

    btnFit?.addEventListener('click', () => {
      if (network) network.fit();
    });

    btnExport?.addEventListener('click', () => {
      if (!lastGraph) return alert('No graph to export');
      const dataStr = JSON.stringify(lastGraph, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'codebasegps-graph.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    btnSearch?.addEventListener('click', () => {
      const t = document.getElementById('searchInput').value.trim();
      if (!t) return;
      setResultsHtml('<div class="small">🔎 Searching locally...</div>');
      vscode.postMessage({ command: 'search', text: t });
    });

    btnAnalyze?.addEventListener('click', () => {
      const t = document.getElementById('searchInput').value.trim();
      if (!t) return;
      setResultsHtml('<div class="small">🤖 Calling AI...</div>');
      vscode.postMessage({ command: 'analyzeWithLLM', text: t });
    });

    btnImpact?.addEventListener('click', () => {
      const t = document.getElementById('searchInput').value.trim();
      if (!t) return;
      setResultsHtml('<div class="small">⚠️ Requesting impact analysis...</div>');
      vscode.postMessage({ command: 'impact', text: t });
    });

    // Helpers
    function setGraphStatus(msg) {
      const g = document.getElementById('graph');
      g.innerHTML = '<div style="opacity:.9;">' + msg + '</div>';
    }
    function setResultsHtml(html) {
      const el = document.getElementById('results');
      el.innerHTML = html;
    }

    // Networking from extension -> webview
    let network = null;
    let nodesDS = null;
    let edgesDS = null;
    let lastGraph = null;

    window.addEventListener('message', event => {
      const m = event.data;
      switch (m.command) {
        case 'searchResults':
          renderSearchResults(m.results);
          break;
        case 'llmResponse':
          renderAIResponse(m.text || '');
          break;
        case 'llmChunk':
          appendAIChunk(m.text || '');
          break;
        case 'graphData':
          lastGraph = m.data;
          renderDependencyGraph(m.data);
          break;
      }
    });

    function renderSearchResults(results) {
      if (!results || results.length === 0) {
        setResultsHtml('<div class="small">No local results found.</div>');
        return;
      }
      const out = document.createElement('div');
      results.forEach(r => {
        const item = document.createElement('div');
        item.className = 'resultItem';
        item.innerHTML = \`
          <div class="resultMeta">
            <div class="small">Matches: \${r.matchCount}</div>
            <div class="small">\${r.file}</div>
          </div>
          <div class="resultPath">\${r.file}</div>
        \`;
        item.addEventListener('click', () => {
          vscode.postMessage({ command: 'openFile', filePath: r.file });
        });
        out.appendChild(item);
      });
      const container = document.getElementById('results');
      container.innerHTML = '';
      container.appendChild(out);
    }

    function renderAIResponse(text) {
      setResultsHtml('<div class="llm-response">' + escapeHtml(text) + '</div>');
    }

    function appendAIChunk(chunk) {
      const el = document.querySelector('.llm-response');
      if (el) el.textContent += chunk;
      else renderAIResponse(chunk);
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderDependencyGraph(graphPayload) {
      const container = document.getElementById('graph');
      container.innerHTML = '';

      const nodes = (graphPayload.nodes || []).map(n => ({
        id: n.id,
        label: n.label,
        title: n.type || '',
        group: n.group || 0,
        filePath: n.filePath || n.label || n.id
      }));

      const edges = (graphPayload.links || []).map((e, idx) => ({
        id: 'e' + idx,
        from: e.source,
        to: e.target,
        arrows: 'to',
        title: e.type || 'import'
      }));

      nodesDS = new vis.DataSet(nodes.map(n => ({
        id: n.id,
        label: n.label,
        title: n.title,
        group: n.group,
        filePath: n.filePath
      })));

      edgesDS = new vis.DataSet(edges);

      const data = { nodes: nodesDS, edges: edgesDS };
      const options = {
        layout: { improvedLayout: true },
        physics: { stabilization: true, barnesHut: { gravitationalConstant: -20000 } },
        interaction: { hover: true, navigationButtons: true, keyboard: true },
        nodes: {
          shape: 'box',
          margin: 8,
          font: { multi: 'html' },
          color: { background: '#0b1220', border: 'rgba(255,255,255,0.06)' }
        },
        edges: {
          color: 'rgba(255,255,255,0.08)',
          smooth: { type: 'cubicBezier' }
        },
        groups: {
          1: { color: { background: '#00E6C3', border: '#00E6C3' }, font: { color: '#001018' } },
          2: { color: { background: '#7C5CFF', border: '#7C5CFF' }, font: { color: '#fff' } },
          3: { color: { background: '#FFA94D', border: '#FFA94D' }, font: { color: '#001018' } }
        }
      };

      network = new vis.Network(container, data, options);

      // Update counts
      document.getElementById('nodeCount').textContent = (nodes.length).toString();
      document.getElementById('edgeCount').textContent = (edges.length).toString();

      network.on('click', params => {
        if (!params.nodes || params.nodes.length === 0) return;
        const nodeId = params.nodes[0];
        const node = (graphPayload.nodes || []).find(n => n.id === nodeId);
        const filePath = node?.filePath || node?.label || node?.id;
        vscode.postMessage({ command: 'openFile', filePath });
      });

      // subtle entrance animation
      setTimeout(() => {
        container.style.opacity = '1';
      }, 120);
    }
  </script>
</body>
</html>`;
}

export function deactivate() {
  // Cleanup if needed in future
}
