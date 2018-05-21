/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const languages = ['csharp'];

    context.subscriptions.push(vscode.commands.registerCommand('extension.runTarget', runTarget));

    languages.forEach(language => {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(language, { provideCodeLenses }));
    });

    function provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        var getMatches = function* () {
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                let targetIndex = line.text.indexOf("Target ");
                let lambdaIndex = line.text.indexOf(" =>")
                if (targetIndex > 0 && lambdaIndex > targetIndex) {
                    let nameIndex = targetIndex + 7;
                    let name = line.text.substr(nameIndex, lambdaIndex - nameIndex);
                    let range = new vscode.Range(i, nameIndex, i, lambdaIndex);
                    yield new vscode.CodeLens(range, {
                            title: 'Run',
                            command: 'extension.runTarget',
                            arguments: [ name, true ]
                        });
                    yield new vscode.CodeLens(range, {
                            title: 'Debug',
                            command: 'extension.runTarget',
                            arguments: [ name, false ]
                        });
                }
            }
        };

        return Array.from(getMatches());
    }

    function runTarget(target: string, noDebug: boolean) {
        const config: vscode.DebugConfiguration = {
            name: "bla",
            verbosity: "normal",
            type: "coreclr",
            preLaunchTask: "build",
            request: "launch",
            program: "${workspaceFolder}/build/bin/Debug/.build.dll",
            args: [ target ],
            noDebug: noDebug,
            cwd: "${workspaceFolder}",
            console: "internalConsole",
            stopAtEntry: false,
            internalConsoleOptions: "openOnSessionStart"
          };
 
        let url = vscode.workspace.workspaceFolders == undefined ? undefined:  vscode.workspace.workspaceFolders[0]
        return vscode.debug.startDebugging(url,config);
    }
}
