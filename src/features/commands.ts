// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { compileBuildProjectTaskName } from '../constants';
import { BuildAnalyzer, BuildProjectContext } from '../util/buildanalyzer';
import { NukeTaskProvider } from './taskProvider';

export async function debugNukeTarget(analyzer: BuildAnalyzer, targetName?: string, args: string[] = []) {
    const ctx = analyzer.getBuildContextSafe();
    targetName = await validateOrRetreiveTarget(ctx, targetName);
    const url = vscode.workspace.workspaceFolders === undefined ? undefined : vscode.workspace.workspaceFolders[0];
    const config = getConfiguration(targetName, ctx.buildProjectFolderRelativePath, ctx.buildAssemblyName, args);
    await vscode.debug.startDebugging(url, config);
}

export async function runNukeTarget(service: BuildAnalyzer, taskProvider: NukeTaskProvider, targetName?: string, args?: string[]) {
    const ctx = service.getBuildContextSafe();
    targetName = await validateOrRetreiveTarget(await service.buildContext, targetName);
    const task = taskProvider.createTask(targetName, ctx.buildProjectRelativePath, args);
    await vscode.tasks.executeTask(task);
}


async function validateOrRetreiveTarget(context: BuildProjectContext, target?: string): Promise<string> {
    if (target === undefined || target === null) {
        const targets = (await context.getProjectTargets()).map(x => x.name);
        return await vscode.window.showQuickPick(['Default'].concat(targets));
    }
    target = target.trim();
    if (target === '') { return 'Default'; }
    return target;
}

function getConfiguration(target: string, relativeProjectFolderPath: string, assemblyName: string, args: string[]): vscode.DebugConfiguration {
    let configArgs: string[] = (target ? [target] : []).concat(args);
    return <vscode.DebugConfiguration>{
        name: 'nuke',
        verbosity: 'normal',
        type: 'coreclr',
        preLaunchTask: `nuke: ${compileBuildProjectTaskName}`,
        request: 'launch',
        program: path.join('${workspaceFolder}', relativeProjectFolderPath, 'bin', 'Debug', assemblyName + '.dll'),
        args: configArgs,
        cwd: '${workspaceFolder}',
        console: 'internalConsole',
        stopAtEntry: false,
        internalConsoleOptions: 'openOnSessionStart'
    };
}
