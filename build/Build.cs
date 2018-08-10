// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

using Nuke.Common;
using Nuke.Common.Git;
using Nuke.Common.Tooling;
using Nuke.Common.Tools.GitVersion;
using Nuke.Common.Utilities;
using Nuke.Common.Utilities.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Nuke.Common.IO;
using static Nuke.Common.ChangeLog.ChangelogTasks;
using static Nuke.Common.IO.FileSystemTasks;
using static Nuke.Common.Tooling.ProcessTasks;
using static Nuke.Common.Tools.Git.GitTasks;
using static Nuke.Common.Tools.Npm.NpmTasks;


class Build : NukeBuild
{
    public static int Main() => Execute<Build>(x => x.Pack);

    [Parameter] readonly string AccessToken;

    [GitVersion] readonly GitVersion GitVersion;
    [GitRepository] readonly GitRepository GitRepository;

    string PackageFile => OutputDirectory / "vscode-nuke.vsix";
    string VscePath => NodeModulesPath / "vsce" / "out" / "vsce";
    string TSLintPath => NodeModulesPath / "tslint" / "bin" / "tslint";
    PathConstruction.AbsolutePath NodeModulesPath => RootDirectory / "node_modules";
    string NodePath => ToolPathResolver.GetPathExecutable("node");

    Target Clean => _ => _
        .Executes(() =>
        {
            DeleteDirectory(RootDirectory / "node_modules");
            EnsureCleanDirectory(OutputDirectory);
        });

    Target Install => _ => _
        .DependsOn(Clean)
        .Executes(() =>
        {
            Npm("install");
        });

    Target Compile => _ => _ 
        .DependsOn(Install)
        .Executes(() => {
            Npm("run compile");
        });
        
    Target CheckStyle => _ => _
        .DependsOn(Compile)
        .Executes(() =>
        {
            var tsLintCommand = $"{TSLintPath} --project {RootDirectory}";
            if (IsServerBuild)
            {
                tsLintCommand += $" --format checkstyle --out {OutputDirectory / "checkstyle.xml"}";
            }
            StartProcess(NodePath, tsLintCommand).AssertZeroExitCode();
        });

    string ChangelogFile => RootDirectory / "CHANGELOG.md";

    IEnumerable<string> ChangelogSectionNotes => ExtractChangelogSectionNotes(ChangelogFile);

    Target Changelog => _ => _
        .OnlyWhen(() => InvokedTargets.Contains(nameof(Changelog)))
        .Executes(() =>
        {
            FinalizeChangelog(ChangelogFile, GitVersion.SemVer, GitRepository);

            Git($"add {ChangelogFile}");
            Git($"commit -m \"Finalize {Path.GetFileName(ChangelogFile)} for {GitVersion.MajorMinorPatch}\"");
        });

    Target Pack => _ => _
        .DependsOn(Install, Changelog)
        .Executes(() =>
        {
            UpdateVersion(GitVersion.SemVer);
            StartProcess(NodePath, $"{VscePath} package --out {PackageFile}").AssertZeroExitCode();
        });

    Target Push => _ => _
        .DependsOn(Pack, Changelog)
        .Requires(() => AccessToken)
        .Executes(() =>
        {
            StartProcess(NodePath, $"{VscePath} publish --pat {AccessToken} --packagePath {PackageFile}").AssertZeroExitCode();
        });

    void UpdateVersion(string version)
    {
        var packageJsonPath = RootDirectory / "package.json";
        var packageJson = TextTasks.ReadAllText(packageJsonPath);
        var package = JObject.Parse(packageJson);
        var packageVersion = package.Value<string>("version");
        if (version == packageVersion) { return; }
        package["version"] = version;
        TextTasks.WriteAllText(packageJsonPath, package.ToString(Formatting.Indented));
    }
}