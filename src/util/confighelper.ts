// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

'use strict';
import * as vscode from 'vscode';

export interface CodeLensConfiguration {
    runTargetCodeLensSettings: TargetCodeLensConfiguration;
    debugTargetCodeLensSettings: TargetCodeLensConfiguration;
}
export interface TargetCodeLensConfiguration {
    enabled?: boolean;
    skipDependencies?: boolean;
}

export function getCodeLensConfiguration(config: vscode.WorkspaceConfiguration): CodeLensConfiguration {
    return {
        runTargetCodeLensSettings: config.runTargetCodeLens,
        debugTargetCodeLensSettings: config.debugTargetCodeLens
    };
}

export function targetRegExp(config: vscode.WorkspaceConfiguration): string {
    return config.targetRegularExpression;
}

export function buildProjectGlob(config: vscode.WorkspaceConfiguration): string {
    return config.buildProjectPattern;
}

export function config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('nuke', null);
}
