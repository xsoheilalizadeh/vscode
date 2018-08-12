pipeline {
    agent { label 'nodejs' }
    parameters {
        string(name: 'GitBranchOrCommit', defaultValue: 'master', description: 'Git branch or commit to build.  If a branch, builds the HEAD of that branch.  If a commit, then checks out that specific commit.')
    }
    options {
        timeout(time: 15, unit: 'MINUTES')
        ansiColor('xterm')
        skipDefaultCheckout()
    }
    stages { 
        stage('Checkout') {
            steps {
                sh 'git config --global user.name "nuke-bot" && git config --global user.email "34026207+nuke-bot@users.noreply.github.com"'
                script {
                    scm.branches = [[$class: 'hudson.plugins.git.BranchSpec', name: "refs/heads/${params.GitBranchOrCommit}"]]
                }
                checkout scm
            }
        }
		stage('Test') {
            steps {
                sh '/bin/bash ./build.sh Checkstyle'
            }
            post {
				always {
					checkstyle canComputeNew: false, healthy: '100', pattern: 'output/checkstyle.xml', unHealthy: '1', unstableTotalAll: '1'
				}
			}
        }
        stage('Release') {
            environment {
                VSTSAccessToken = credentials('vsts_nuke')
                GitHubAccessToken = credentials('github_token_nuke_client')
            }
            steps {
                script {
                    sshagent(['github_ssh_nuke']) {
                        sh '/bin/bash ./build.sh Release'
                    }
                }
                archiveArtifacts 'output/*.vsix'
            }
        }
    }
    post {
        always {
            script {
                githubNotify('github_user_nuke','nuke-build', 'vscode')
            }
        }
    }
}

String getCommitSha() {
    return sh(returnStdout: true, script: 'git rev-parse HEAD').trim()
}

void githubNotifyPending(String credentialsId, String owner, String repo, String context = null) {
    context = context || env.JOB_NAME
    githubNotify(account: owner,
        context: context,
        credentialsId: credentialsId,
        description: description,
        repo: repo,
        sha: "${getCommitSha()}",
        status: "${currentBuild.currentResult}",
        targetUrl: env.RUN_DISPLAY_URL
    )
}

void githubNotify(String credentialsId, String owner, String repo, String context = null) {
    context = context || env.JOB_NAME

    String description = ''
    String status = ''
    switch(currentBuild.currentResult) {
        case 'SUCCESS': 
            description = 'Build finished succesfully.'
            status = 'success'
        break
        case 'UNSTABLE': 
            description = 'Build finished with warnings.' 
            status = 'error'
        break
        case 'FAILURE': 
            description = 'Build finished.'
            status = 'failure'
        break
        case 'NOT_BUILT':
            description = 'Build was skipped.'
            status = 'failure'
        break
        case 'ABORTED':
            description = 'Build was aborted.'
            status = 'failure'
        break
    }
   
    githubNotify(account: owner,
        context: context,
        credentialsId: credentialsId,
        description: description,
        repo: repo,
        sha: "${getCommitSha()}",
        status: status,
        targetUrl: env.RUN_DISPLAY_URL
    )
}
