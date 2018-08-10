// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

import {
    Uri
} from 'vscode';
import * as configUtil from './confighelper';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TargetInformation {
    name: string;
    location?: vscode.Location;
}

interface TargetResult {
    name: string;
    startPosition: number;
    endPosition: number;
}

export class BuildProjectContext implements vscode.Disposable {
    private readonly invalidateEventEmitter = new vscode.EventEmitter<void>();
    private readonly buildProjectPath: Uri;
    private readonly buildProjectFolder: Uri;

    private fileSystemWachter: vscode.FileSystemWatcher;
    private targetRegExp: RegExp;
    private projectTargets: Promise<TargetInformation[]>;

    public readonly buildProjectFolderRelativePath: string;
    public readonly buildProjectRelativePath: string;
    public readonly buildAssemblyName: string;

    public get onInvalidate(): vscode.Event<void> {
        return this.invalidateEventEmitter.event;
    }

    constructor(buildProjectPath: Uri, config: any) {
        this.setConfig(config);

        this.buildProjectPath = buildProjectPath;
        this.buildProjectRelativePath = vscode.workspace.asRelativePath(buildProjectPath);
        this.buildProjectFolder = Uri.file(buildProjectPath.path.substring(0, buildProjectPath.path.lastIndexOf('/')));
        this.buildProjectFolderRelativePath = vscode.workspace.asRelativePath(this.buildProjectFolder);
        this.buildAssemblyName = this.buildProjectPath.path.substring(this.buildProjectPath.path.lastIndexOf('/') + 1).replace('.csproj', '');

        this.fileSystemWachter = vscode.workspace.createFileSystemWatcher(`${this.buildProjectFolder.fsPath}/**/*.cs*`, true, true, false);

        this.fileSystemWachter.onDidCreate(this.handleFileCreated);
        this.fileSystemWachter.onDidDelete(this.handleFileDeleted);
        this.projectTargets = new Promise<TargetInformation[]>(resolve => resolve(this.findProjectTargets()));
    }

    public static async findContext(config: any): Promise<BuildProjectContext | null> {
        const files = await vscode.workspace.findFiles(configUtil.buildProjectGlob(config));
        if (files.length === 0) {
            return null;
        }
        if (files.length > 1) {
            await vscode.window.showWarningMessage(`Multiple build projects where found. Please adjust 'nuke.buildProjectPattern' in the settings. Using: '${files[0].fsPath}'`);
        }
        return new BuildProjectContext(files[0], config);
    }

    public setConfig(config: any): void {
        this.targetRegExp = new RegExp(configUtil.targetRegExp(config), 'g');
    }

    public findTargetsInDocument(document: vscode.TextDocument): TargetInformation[] {

        if (!this.isChildOf(this.buildProjectFolder, document.uri)) { return []; }
        const targetResults = this.findTargets(document.getText());
        return targetResults.map(result => {
            const range = new vscode.Range(document.positionAt(result.startPosition), document.positionAt(result.endPosition));
            const location: vscode.Location = new vscode.Location(document.uri, range);
            return <TargetInformation>{ name: result.name, location: location };
        });
    }

    public getProjectTargets(): Promise<TargetInformation[]> {
        return this.projectTargets;
    }

    private findProjectTargets(): TargetInformation[] {
        let targets: TargetInformation[] = [];
        const files: string[] = this.findFilesByExtension(this.buildProjectFolder.fsPath, 'cs');
        files.forEach(file => {
            const content = fs.readFileSync(file, 'utf-8');
            targets = targets.concat(this.findTargets(content)
                .map(x => <TargetInformation>{ name: x.name }));
        });
        return targets;
    }

    private findFilesByExtension(root: string, extension: string): string[] {
        const files = fs.readdirSync(root);
        let result: string[] = [];

        files.forEach(file => {
            var newRoot = path.join(root, file);
            if (fs.statSync(newRoot).isDirectory()) {
                result = result.concat(this.findFilesByExtension(newRoot, extension));
            }
            else if (file.substr(-1 * (extension.length + 1)) === '.' + extension) {
                result.push(newRoot);
            }
        });
        return result;
    }

    private isChildOf(rootPath: vscode.Uri, childPath: vscode.Uri): boolean {
        if (rootPath === childPath) { return false; }
        const rootTokens = rootPath.path.split('/').filter(x => x.length);
        const childTokens = childPath.path.split('/').filter(x => x.length);
        if (rootTokens.length >= childTokens.length) { return false; }
        return rootTokens.every((token, index) => token === childTokens[index]);
    }

    private findTargets(fileContent: string): TargetResult[] {
        const targets: TargetResult[] = [];
        let match: RegExpExecArray;

        do {
            match = this.targetRegExp.exec(fileContent);
            if (match) {
                targets.push({ name: match[1], startPosition: match.index, endPosition: match.index + match[0].length });
            }
        } while (match);
        return targets;
    }

    public async handleWorkspaceDocumentSaved(document: vscode.TextDocument): Promise<void> {
        if (this.isChildOf(this.buildProjectFolder, document.uri)) {
            this.handleFileChange(document.uri);
        }
    }

    private async handleFileDeleted(file: Uri) {
        if (file === this.buildProjectPath) {
            this.invalidateEventEmitter.fire();
        } else if (file.fsPath.endsWith('.cs')) {
            this.handleFileChange(file);
        }
    }

    private async handleFileCreated(file: Uri) {
        if (file.fsPath.endsWith('.cs')) {
            this.handleFileChange(file);
        }
    }

    private handleFileChange(file: Uri) {

        this.projectTargets = new Promise(resolve => {
            const newTargets = this.findProjectTargets();
            resolve(newTargets);

        });
    }

    public dispose() {
        if (this.fileSystemWachter) { this.fileSystemWachter.dispose(); }
        this.invalidateEventEmitter.dispose();
    }
}

export class BuildAnalyzer implements vscode.Disposable {

    private config: any;
    private context?: BuildProjectContext;
    private workspaceRootFolder: vscode.WorkspaceFolder;

    constructor(config: any) {
        this.config = config;
    }

    public get buildContext(): BuildProjectContext | null {
        return this.context;
    }

    public get workspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceRootFolder;
    }

    public getBuildContextSafe(): BuildProjectContext {
        if (!this.context) {
            throw new Error('No build project was found. Please adjust \'nuke.buildProjectPattern\' in the settings.');
        }
        return this.context;
    }

    public async activate(): Promise<void> {
        this.workspaceRootFolder = vscode.workspace.workspaceFolders[0];
        await this.updateContext();
    }

    public updateConfig(config: any): void {
        const oldConfig = this.config;
        this.config = config;
        if (configUtil.buildProjectGlob(oldConfig) !== configUtil.buildProjectGlob(config)) {
            this.updateContext();
        } else if (this.context) {
            this.context.setConfig(config);
        }
    }

    public async handleWorkspaceDocumentSaved(document: vscode.TextDocument): Promise<void> {
        if (this.buildContext) {
            await this.buildContext.handleWorkspaceDocumentSaved(document);
        }
    }

    private async updateContext(): Promise<void> {
        this.context = await BuildProjectContext.findContext(this.config);
        if (this.context) {
            this.context.onInvalidate(async () => {
                this.context.dispose();
                this.context = null;
                await this.updateContext();
            });
        }
    }

    public dispose() {
        if (this.context) { this.context.dispose(); }
    }
}

