// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

'use strict';
import { compileBuildProjectTaskName } from '../constants';
import { BuildAnalyzer } from '../util/buildanalyzer';
import { ProviderResult, TaskProvider, Task, CancellationToken, TaskDefinition, ProcessExecution, ProcessExecutionOptions } from 'vscode';

export interface NukeTaskDefinition extends TaskDefinition {
    target: string;
    args?: string[];
}

export class NukeTaskProvider implements TaskProvider {

    private readonly analyzer: BuildAnalyzer;

    constructor(analyzer: BuildAnalyzer) {
        this.analyzer = analyzer;
    }

    public async provideTasks(token?: CancellationToken): Promise<Task[]> {
        const ctx = this.analyzer.buildContext;
        if (!ctx) { return []; }

        const projectTargets = await ctx.getProjectTargets();

        return [this.createCompileTask(ctx.buildProjectRelativePath), this.createTask('Default', ctx.buildProjectRelativePath)]
            .concat(projectTargets.map(target => this.createTask(target.name, ctx.buildProjectRelativePath)));
    }

    public resolveTask(task: Task, token?: CancellationToken): ProviderResult<Task> {
        if (!task.definition || task.definition.type !== 'nuke' || !task.definition.target || !this.analyzer.buildContext) {
            return undefined;
        }
        let definition: NukeTaskDefinition = <NukeTaskDefinition>task.definition;
        return this.createTaskFromDefinition(definition, this.analyzer.buildContext.buildProjectRelativePath);
    }

    public createTask(target: string, buildProjectRelativePath: string, args?: string[]): Task {
        target = target.trim();
        if (target === '') { target = 'Default'; }

        const definition = this.createTaskDefinition(target, args);
        const task = this.createTaskFromDefinition(definition, buildProjectRelativePath);
        return task;
    }

    private createTaskDefinition(target: string, args?: string[]) {
        return <NukeTaskDefinition>{ label: target, type: 'nuke', target: target, args: args };
    }

    private createTaskFromDefinition(definition: NukeTaskDefinition, buildProjectRelativePath: string): Task {
        const projectFilePath = '${workspaceFolder}/' + buildProjectRelativePath;
        const args: string[] = ['run', '--project', projectFilePath, '--', definition.target].concat(definition.args || []);

        const processExecutionOptions: ProcessExecutionOptions = {
            cwd: '${workspaceFolder}'
        };
        const processExecution: ProcessExecution = new ProcessExecution('dotnet', args, processExecutionOptions);
        return new Task(definition, this.analyzer.workspaceFolder, definition.label, 'nuke', processExecution, '$msCompile');
    }

    private createCompileTask(buildProjectRelativePath: string): Task {
        const definition: TaskDefinition = {
            type: 'process',
            label: compileBuildProjectTaskName,
            command: 'dotnet',
            args: ['build', '${workspaceFolder}/' + buildProjectRelativePath]
        };
        const processOptions: ProcessExecutionOptions = {
            cwd: '${workspaceFolder}'
        };
        const processExecution: ProcessExecution = new ProcessExecution(definition.command, definition.args, processOptions);
        return new Task(definition, this.analyzer.workspaceFolder, definition.label, 'nuke', processExecution, '$msCompile');
    }
}