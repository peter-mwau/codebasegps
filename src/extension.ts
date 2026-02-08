// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


const BACKEND_URL = process.env.BACKEND_URL || 'https://codebasegpsservice-production.up.railway.app';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codebasegps" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('codebasegps.helloKenya', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		// vscode.window.showInformationMessage('Hello Kenya from codebaseGPS!! Yes Buddy!');

		const panel = vscode.window.createWebviewPanel(
			'codebasegps', // Identifies the type of the webview. Used internally
			'codebaseGPS', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{
				enableScripts: true
			} // Webview options. More on these later.
		);

		// And set its HTML content
		panel.webview.html = getWebviewContent();

		// Listen for messages from the webview
		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'search':
						const results = await analyzeCodebase(message.text);
						panel.webview.postMessage({ command: 'searchResults', results });
						break;
					case 'analyzeWithLLM':
						await analyzeWithLLM(message.text, panel);
						break;
				}
			},
			undefined,
			context.subscriptions
		);

		function getWebviewContent() {
			return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>codebaseGPS</title>
				<style>
					:root {
						color-scheme: light dark;
					}
					body { 
						padding: 16px; 
						font-family: var(--vscode-font-family);
						color: var(--vscode-foreground);
						background: var(--vscode-editor-background);
					}
					.app-header {
						display: flex;
						align-items: baseline;
						gap: 10px;
						margin-bottom: 12px;
						padding: 10px 12px;
						border: 1px solid var(--vscode-panel-border);
						border-radius: 8px;
						background: var(--vscode-sideBarSectionHeader-background);
					}
					.app-title {
						font-size: 16px;
						font-weight: 700;
					}
					.app-subtitle {
						font-size: 12px;
						opacity: 0.8;
					}
					.app {
						display: grid;
						grid-template-columns: 2fr 1fr;
						gap: 16px;
						height: calc(100vh - 32px);
					}
					.panel {
						display: flex;
						flex-direction: column;
						border: 1px solid var(--vscode-panel-border);
						border-radius: 8px;
						background: var(--vscode-sideBar-background);
						overflow: hidden;
					}
					.panel-header {
						padding: 12px 14px;
						font-weight: 600;
						border-bottom: 1px solid var(--vscode-panel-border);
						background: var(--vscode-sideBarSectionHeader-background);
					}
					.panel-body {
						padding: 14px;
						overflow: auto;
						flex: 1;
					}
					#results {
						height: 100%;
					}
					.file-result {
						margin: 10px 0;
						padding: 10px;
						background: var(--vscode-editor-background);
						border-left: 3px solid var(--vscode-textLink-foreground);
						border-radius: 4px;
					}
					.llm-response {
						padding: 14px;
						background: var(--vscode-editor-background);
						border: 1px solid var(--vscode-panel-border);
						border-radius: 6px;
						white-space: pre-wrap;
						line-height: 1.6;
					}
					.composer {
						display: flex;
						flex-direction: column;
						gap: 12px;
					}
					.composer-input {
						display: flex;
						align-items: center;
						gap: 8px;
						padding: 10px 12px;
						border-radius: 10px;
						background: var(--vscode-input-background);
						border: 1px solid var(--vscode-input-border);
						box-shadow: 0 2px 8px rgba(0,0,0,0.08);
					}
					textarea {
						flex: 1;
						min-height: 120px;
						resize: vertical;
						background: transparent;
						color: var(--vscode-input-foreground);
						border: none;
						outline: none;
						font-family: var(--vscode-font-family);
						font-size: 13px;
						line-height: 1.5;
					}
					.button-group {
						display: flex;
						gap: 8px;
					}
					button {
						padding: 8px 12px;
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						cursor: pointer;
						border-radius: 6px;
					}
					button:hover {
						background: var(--vscode-button-hoverBackground);
					}
					.secondary {
						background: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					.secondary:hover {
						background: var(--vscode-button-secondaryHoverBackground);
					}
				</style>
				<script>
					const vscode = acquireVsCodeApi();
					
					function searchCodebase() {
						const searchText = document.getElementById('searchInput').value;
						if (searchText) {
							document.getElementById('results').innerHTML = '<p>Searching...</p>';
							vscode.postMessage({ command: 'search', text: searchText });
						}
					}
				
					function analyzeWithAI() {
						const searchText = document.getElementById('searchInput').value;
						if (searchText) {
							document.getElementById('results').innerHTML = '<p>🤖 Analyzing codebase with AI...</p>';
							vscode.postMessage({ command: 'analyzeWithLLM', text: searchText });
						}
					}
					
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'searchResults':
								const resultsDiv = document.getElementById('results');
								if (message.results.length === 0) {
									resultsDiv.innerHTML = '<p>No results found.</p>';
								} else {
									resultsDiv.innerHTML = '<h3>Found in ' + message.results.length + ' file(s):</h3>';
									message.results.forEach(result => {
										const div = document.createElement('div');
										div.className = 'file-result';
										div.innerHTML = '<strong>' + result.file + '</strong><br>Matches: ' + result.matchCount;
										resultsDiv.appendChild(div);
									});
								}
								break;
							case 'llmResponse':
								const resultsDiv2 = document.getElementById('results');
								resultsDiv2.innerHTML = '<div class="llm-response">' + message.text + '</div>';
								break;
							case 'llmChunk':
								const existingResponse = document.querySelector('.llm-response');
								if (existingResponse) {
									existingResponse.textContent += message.text;
								}
								break;
						}
					});
				</script>
			</head>
			<body>
				<div class="app-header">
					<div class="app-title">codebaseGPS</div>
					<div class="app-subtitle">AI codebase assistant</div>
				</div>
				<div class="app">
					<div class="panel">
						<div class="panel-header">Codebase Analysis</div>
						<div class="panel-body">
							<div id="results">Use the prompt panel to search or analyze your codebase.</div>
						</div>
					</div>
					<div class="panel">
						<div class="panel-header">Prompt Panel</div>
						<div class="panel-body">
							<div class="composer">
								<div class="composer-input">
									<textarea id="searchInput" placeholder="Ask anything about your codebase..."></textarea>
								</div>
								<div class="button-group">
									<button class="secondary" onclick="searchCodebase()">🔍 Search</button>
									<button onclick="analyzeWithAI()">🤖 AI Analyze</button>
								</div>
								<p style="opacity: 0.8; font-size: 12px; margin: 4px 0 0;">Tip: Try “Which file should I edit to render the wallet balance?”</p>
							</div>
						</div>
					</div>
				</div>
			</body>
			</html>`;
		}
	});

	context.subscriptions.push(disposable);
}

// Function to analyze with LLM(vscode copilot)
async function analyzeWithLLM(userQuery: string, panel: vscode.WebviewPanel) {
	try {
		// Get GitHub Copilot models
		const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
		
		if (models.length === 0) {
			panel.webview.postMessage({ 
				command: 'llmResponse', 
				text: '⚠️ GitHub Copilot is not available. Please ensure you have GitHub Copilot enabled in VS Code.' 
			});
			return;
		}

		const model = models[0];

		// Collect codebase context
		const codebaseContext = await collectCodebaseContext();

		// Create messages for the LLM
		const messages = [
			vscode.LanguageModelChatMessage.User(
				`You are a helpful code assistant analyzing a codebase. Here's the project structure and file contents:

${codebaseContext}

User question: ${userQuery}

Provide a helpful, specific answer with file paths and line numbers when relevant. Be concise but thorough.`
			)
		];

		// Send request and stream response
		const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
		
		let fullResponse = '';
		panel.webview.postMessage({ command: 'llmResponse', text: '' });
		
		for await (const chunk of response.text) {
			fullResponse += chunk;
			panel.webview.postMessage({ command: 'llmChunk', text: chunk });
		}

	} catch (error: any) {
		panel.webview.postMessage({ 
			command: 'llmResponse', 
			text: `❌ Error: ${error.message}` 
		});
	}
}

// async function analyzeWithLLM(userQuery: string, panel: vscode.WebviewPanel) {
//     try {
//         panel.webview.postMessage({ command: 'llmResponse', text: '📡 Connecting to Codebase GPS Brain...' });

//         // 1. Collect full codebase context (no more 500-char limit!)
//         const codebaseContext = await collectCodebaseContext();

//         // 2. Prepare the payload for your FastAPI Dispatcher
//         const payload = {
//             task: "search", // Or "impact" depending on your UI logic
//             context: codebaseContext,
//             query: userQuery
//         };

//         // 3. Call your FastAPI Backend
//         const response = await fetch(`${BACKEND_URL}/gps/query`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(payload)
//         });

//         if (!response.ok) {
//             throw new Error(`Backend returned ${response.status}: ${await response.text()}`);
//         }

//         const result = await response.json() as { status: string; data: any };

//         // 4. Handle the Response (Your FastAPI returns { status, data, task })
//         if (result.status === 'success') {
//             // If it's the search/impact task, it returns a structured string or JSON
//             const formattedResponse = formatAIResponse(result.data, payload.task);
//             panel.webview.postMessage({ command: 'llmResponse', text: formattedResponse });
//         }

//     } catch (error: any) {
//         panel.webview.postMessage({ 
//             command: 'llmResponse', 
//             text: `❌ Backend Error: ${error.message}. Make sure ngrok is running!` 
//         });
//     }
// }

// Helper to turn JSON data from your Backend into nice Markdown for the Webview
function formatAIResponse(data: any, task: string): string {
    if (task === 'impact') {
        return `### ⚠️ Risk Score: ${data.risk_score}/10\n\n**Analysis:** ${data.explanation}\n\n**Affected Files:**\n${data.affected_modules.join('\n')}`;
    }
    // Default for search
    return data.summary || JSON.stringify(data, null, 2);
}

// Function to collect codebase context
async function collectCodebaseContext(): Promise<string> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return 'No workspace folder open.';
	}

	// Find relevant files (limit to avoid token overflow)
	const files = await vscode.workspace.findFiles(
		'**/*.{ts,js,tsx,jsx,py,java,json,md}',
		'**/node_modules/**',
		50 // Limit to 50 files
	);

	let context = `Workspace: ${workspaceFolder.name}\n\nFiles:\n`;
	
	for (const file of files) {
		try {
			const relativePath = vscode.workspace.asRelativePath(file);
			const content = await vscode.workspace.fs.readFile(file);
			const text = new TextDecoder().decode(content);
			
			// Limit file content to first 500 characters to avoid token overflow
			const preview = text.slice(0, 500);
			context += `\n--- ${relativePath} ---\n${preview}${text.length > 500 ? '\n... (truncated)' : ''}\n`;
		} catch (error) {
			console.error(`Error reading ${file.fsPath}:`, error);
		}
	}

	return context;
}

// Function to analyze codebase
async function analyzeCodebase(searchText: string) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return [];
	}

	// Find all TypeScript and JavaScript files, excluding node_modules
	const files = await vscode.workspace.findFiles('**/*.{ts,js,java,cpp,md,env,yaml,json,py,tsx,jsx}', '**/node_modules/**');
	
	const results = [];
	for (const file of files) {
		try {
			const content = await vscode.workspace.fs.readFile(file);
			const text = new TextDecoder().decode(content);
			
			// Count matches
			const matches = text.match(new RegExp(searchText, 'gi'));
			if (matches && matches.length > 0) {
				results.push({
					file: vscode.workspace.asRelativePath(file),
					matchCount: matches.length
				});
			}
		} catch (error) {
			console.error(`Error reading file ${file.fsPath}:`, error);
		}
	}
	
	return results;
}

// This method is called when your extension is deactivated
export function deactivate() {}
