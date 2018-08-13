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
        stage('Prepare Release') {
            steps {
                script {
                    sshagent(['github_ssh_nuke']) {
                        sh '/bin/bash ./build.sh PrepareRelease'
                    }
                }
            }
        }
    }
}