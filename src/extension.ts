// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

'use strict';
import * as vscode from 'vscode';
import { BuildAnalyzer } from './util/buildanalyzer';
import { debugNukeTarget, runNukeTarget } from './features/commands';
import { NukeTaskProvider } from './features/taskProvider';
import { CodeLensProvider } from './features/codeLens';
import * as configUtil from './util/confighelper';

let codeLensProvider: CodeLensProvider;
let analyzer: BuildAnalyzer;

export async function activate(context: vscode.ExtensionContext) {

    const config = configUtil.config();
    analyzer = new BuildAnalyzer(config);
    await analyzer.activate();

    codeLensProvider = new CodeLensProvider(analyzer);
    let taskProvider = new NukeTaskProvider(analyzer);
    context.subscriptions.push(
        vscode.commands.registerCommand('nuke.debugTarget', async (targetName?: string, args?: string[]) => await debugNukeTarget(analyzer, targetName, args)),
        vscode.commands.registerCommand('nuke.debugSingleTarget', async (targetName?: string, args?: string[]) => await debugNukeTarget(analyzer, targetName, (args || []).concat('-Skip'))),
        vscode.commands.registerCommand('nuke.runTarget', async (targetName?: string, args?: string[]) => await runNukeTarget(analyzer, taskProvider, targetName, args)),
        vscode.commands.registerCommand('nuke.runSingleTarget', async (targetName?: string, args?: string[]) => await runNukeTarget(analyzer, taskProvider, targetName, (args || []).concat('-Skip'))),

        vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'csharp' }, codeLensProvider),
        vscode.tasks.registerTaskProvider('nuke', taskProvider),

        vscode.workspace.onDidChangeConfiguration(handleConfigurationChanged),
        vscode.workspace.onDidSaveTextDocument(handleDocumentSaved),
        analyzer
    );
    updateCodeLens(config);
}

async function handleDocumentSaved(document: vscode.TextDocument): Promise<void> {
    await analyzer.handleWorkspaceDocumentSaved(document);
}

async function handleConfigurationChanged(): Promise<void> {
    const config = configUtil.config();
    updateCodeLens(config);
    await analyzer.updateConfig(config);
}

function updateCodeLens(config: vscode.WorkspaceConfiguration): void {
    codeLensProvider.updateConfig(configUtil.getCodeLensConfiguration(config));
}
