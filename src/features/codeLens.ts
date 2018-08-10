// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

'use strict';
import * as vscode from 'vscode';
import { CancellationToken, CodeLens, Range, TextDocument, EventEmitter, Event} from 'vscode';
import { TargetInformation, BuildAnalyzer } from '../util/buildanalyzer';
import { CodeLensConfiguration } from '../util/confighelper';


export class CodeLensProvider implements vscode.CodeLensProvider {
    private readonly onDidChangeCodeLensEmitter = new EventEmitter<void>();
    private readonly analyzer: BuildAnalyzer;

    private config: CodeLensConfiguration;

    public get onDidChangeCodeLenses(): Event<void> {
        return this.onDidChangeCodeLensEmitter.event;
    }

    public constructor(analyzer: BuildAnalyzer) {
        this.analyzer = analyzer;
    }

    public provideCodeLenses(document: TextDocument, token: CancellationToken): vscode.ProviderResult<CodeLens[]> {
        const codeLenses: CodeLens[] = [];
        if (!this.config.debugTargetCodeLensSettings.enabled && this.config.runTargetCodeLensSettings.enabled) { return codeLenses; }

        return new Promise<CodeLens[]>((resolve, reject) => {

            if (!document) {
                return reject('No open documents');
            }
            if (token.isCancellationRequested) {
                return resolve(codeLenses);
            }

            this.analyzer.buildContext.findTargetsInDocument(document).forEach(target => {
                if (token.isCancellationRequested) { return resolve(codeLenses); }

                [false, true].forEach(x => {
                    const codeLens = this.createCodeLens(x, target);
                    if (codeLens) { codeLenses.push(codeLens); }
                });
            });
            return resolve(codeLenses);
        });
    }

    private createCodeLens(debug: boolean, targetInfo: TargetInformation): TargetCodeLens | null {
        const config = debug ? this.config.debugTargetCodeLensSettings : this.config.runTargetCodeLensSettings;
        if (!config.enabled) { return null; }
        return new TargetCodeLens(targetInfo.location.range, targetInfo.name, debug, config.skipDependencies);
    }

    public updateConfig(config: CodeLensConfiguration): void {
        this.config = config;
    }
}

export class TargetCodeLens extends CodeLens {
    public constructor(range: Range, target: string, debug: boolean, skipDependencies: boolean) {
        super(range);

        const action = debug ? 'Debug' : 'Run';
        let tooltipAction = debug ? 'debugging' : 'running';
        if (skipDependencies) { tooltipAction += ' without dependencies'; }
        const args = [target];
        if (skipDependencies) { args.push('-Skip'); }
        this.command = {
            title: `${action} Target`,
            command: `nuke.${action.toLowerCase()}Target`,
            tooltip: `Start ${tooltipAction} this target`,
            arguments: args
        };
    }
}

