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
	const disposable = vscode.commands.registerCommand('codebasegps.helloKenya', () => {
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

		// Add this line to send a message to the webview:
		panel.webview.postMessage({ command: 'alert' });

		function getWebviewContent() {
			return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>codebaseGPS</title>
				<script>
					const vscode = acquireVsCodeApi();
					window.addEventListener('message', event => {
						const message = event.data; // The JSON data our extension sent
						switch (message.command) {
							case 'alert':
								document.getElementById('tag1').style.color = 'yellow';
								break;
						}
					});
				</script>
			</head>
			<body>
				<h1>Hello Kenya from codebaseGPS!! Yes Buddy!</h1>
				<p id="tag1">Welcome to your VS Code extension powered by Webview.</p>
			</body>
			</html>`;
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
