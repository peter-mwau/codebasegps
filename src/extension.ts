// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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
					body { 
						padding: 20px; 
						font-family: var(--vscode-font-family);
					}
					.search-container {
						margin: 20px 0;
					}
					input {
						width: 70%;
						padding: 8px;
						margin-right: 10px;
						background: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border);
					}
					button {
						padding: 8px 16px;
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						cursor: pointer;
					}
					button:hover {
						background: var(--vscode-button-hoverBackground);
					}
					#results {
						margin-top: 20px;
					}
					.file-result {
						margin: 10px 0;
						padding: 10px;
						background: var(--vscode-editor-background);
						border-left: 3px solid var(--vscode-textLink-foreground);
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
						}
					});
				</script>
			</head>
			<body>
				<h1>codebaseGPS</h1>
				<p>Search and analyze your workspace files</p>
				<div class="search-container">
					<input type="text" id="searchInput" placeholder="Enter text to search..." />
					<button onclick="searchCodebase()">Search</button>
				</div>
				<div id="results"></div>
			</body>
			</html>`;
		}
	});

	context.subscriptions.push(disposable);
}

// Function to analyze codebase
async function analyzeCodebase(searchText: string) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return [];
	}

	// Find all TypeScript and JavaScript files, excluding node_modules
	const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx}', '**/node_modules/**');
	
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
