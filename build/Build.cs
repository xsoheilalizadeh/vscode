// Copyright Matthias Koch, Sebastian Karasek 2018.
// Distributed under the MIT License.
// https://github.com/nuke-build/vscode/blob/master/LICENSE

using Nuke.Common;
using Nuke.Common.Git;
using Nuke.Common.Tooling;
using Nuke.Common.Tools.GitVersion;
using Nuke.GitHub;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Nuke.Common.IO;
using static Nuke.Common.ChangeLog.ChangelogTasks;
using static Nuke.Common.IO.FileSystemTasks;
using static Nuke.Common.Tooling.ProcessTasks;
using static Nuke.Common.Tools.Git.GitTasks;
using static Nuke.Common.Tools.Npm.NpmTasks;
using static Nuke.Common.IO.PathConstruction;

class Build : NukeBuild
{
    const string c_repoName = "vscode";
    const string c_repoOwner = "nuke-build";

    public static int Main() => Execute<Build>(x => x.Pack);

    [Parameter] readonly string GitHubAccessToken;
    [Parameter] readonly string VSTSAccessToken;

    [GitVersion] readonly GitVersion GitVersion;
    [GitRepository] readonly GitRepository GitRepository;

    string PackageFile => OutputDirectory / $"vscode-nuke-v{GitVersion.SemVer}.vsix";
    string VscePath => NodeModulesPath / "vsce" / "out" / "vsce";
    string TSLintPath => NodeModulesPath / "tslint" / "bin" / "tslint";
    string NodePath => ToolPathResolver.GetPathExecutable("node");

    AbsolutePath NodeModulesPath => RootDirectory / "node_modules";

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
        .Executes(() =>
        {
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
        .OnlyWhen(ShouldUpdateChangelog)
        .Executes(() =>
        {
            FinalizeChangelog(ChangelogFile, GitVersion.MajorMinorPatch, GitRepository);
        });

    Target Pack => _ => _
        .DependsOn(Compile)
        .After(Changelog)
        .Executes(() =>
        {
            UpdateVersion(GitVersion.SemVer);
            StartProcess(NodePath, $"{VscePath} package --out {PackageFile}").AssertZeroExitCode();
        });

    Target Push => _ => _
        .DependsOn(Pack)
        .Requires(() => VSTSAccessToken)
        .Requires(() => GitRepository.Branch == "master")
        .Requires(() => GitHasCleanWorkingCopy())
        .Executes(() =>
        {
            StartProcess(NodePath, $"{VscePath} publish --pat {VSTSAccessToken} --packagePath {PackageFile}").AssertZeroExitCode();
        });

    bool IsReleaseBranch => GitRepository.Branch.StartsWith("release/");

    Target PrepareRelease => _ => _
        .Before(Install)
        .DependsOn(Changelog, Clean)
        .Executes(() =>
        {
            UpdateVersion(GitVersion.MajorMinorPatch);
            var releaseBranch = IsReleaseBranch ? GitRepository.Branch : $"release/v{GitVersion.MajorMinorPatch}";
            var isMasterBranch = GitRepository.Branch == "master";

            if (!isMasterBranch && !IsReleaseBranch)
            {
                Git($"checkout -b {releaseBranch}");
            }

            if (!GitHasCleanWorkingCopy())
            {
                Git($"add {ChangelogFile} package.json package-lock.json");
                var commitCommand = $"commit -m \"Finalize v{GitVersion.MajorMinorPatch}\"";
                if (isMasterBranch) commitCommand += " -m \"+semver: skip\"";
                Git(commitCommand);
            }

            if (!isMasterBranch)
            {
                Git("checkout master");
                Git($"merge --no-ff --no-edit {releaseBranch}");
                Git($"branch -D {releaseBranch}");
            }
            if (IsReleaseBranch)
            {
                Git($"push origin --delete {releaseBranch}");
            }
            Git($"push origin master");
        });

    Target Release => _ => _
        .DependsOn(Push, Changelog, PrepareRelease)
        .Requires(() => GitRepository.Branch == "master")
        .Requires(() => GitHubAccessToken)
        .Executes(async () =>
        {;
            await GitHubTasks.PublishRelease(new GitHubReleaseSettings()
                .SetToken(GitHubAccessToken)
                .SetArtifactPaths(new[] { PackageFile })
                .SetRepositoryName("vscode")
                .SetRepositoryOwner("nuke-build")
                .SetCommitSha("master")
                .SetTag($"NUKE VS Code Extension v{GitVersion.MajorMinorPatch}")
                .SetReleaseNotes($"[Changelog](https://github.com/{c_repoOwner}/{c_repoName}/blob/{GitVersion.MajorMinorPatch}/CHANGELOG.md)"));
        });

    void UpdateVersion(string version)
    {
        void UpdateVersion(string filePath)
        {
            var packageJson = TextTasks.ReadAllText(filePath);
            var package = JObject.Parse(packageJson);
            var packageVersion = package.Value<string>("version");
            if (version == packageVersion)
            {
                return;
            }
            package["version"] = new JValue(version);
            TextTasks.WriteAllText(filePath, package.ToString(Formatting.Indented) + EnvironmentInfo.NewLine);
        }
        UpdateVersion(RootDirectory / "package.json");
        UpdateVersion(RootDirectory / "package-lock.json");
    }

    bool ShouldUpdateChangelog()
    {
        bool TryGetChangelogSectionNotes(string tag, out string[] sectionNotes)
        {
            sectionNotes = new string[0];
            try
            {
                sectionNotes = ExtractChangelogSectionNotes(ChangelogFile, tag).ToArray();
                return sectionNotes.Length > 0;
            }
            catch (System.Exception)
            {
                return false;
            }
        }

        var nextSectionAvailable = TryGetChangelogSectionNotes("vNext", out var vNextSection);
        var semVerSectionAvailable = TryGetChangelogSectionNotes(GitVersion.MajorMinorPatch, out var semVerSection);
        if (semVerSectionAvailable)
        {
            ControlFlow.Assert(!nextSectionAvailable, $"{GitVersion.MajorMinorPatch} is already in changelog.");
            return false;
        }

        return nextSectionAvailable;
    }
}