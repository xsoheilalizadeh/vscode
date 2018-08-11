node('nodejs') {
    timeout(10) {
        timestamps {
            ansiColor('xterm') {
                stage('Checkout') {
                    retry(3) {
                        checkout scm
                    }  
                }
                stage('Test') {
                    sh '/bin/bash ./build.sh Checkstyle'
                    checkstyle canComputeNew: false, healthy: '100', pattern: 'output/checkstyle.xml', unHealthy: '1', unstableTotalAll: '1'
                }
                stage('Release') {
                    withCredentials([string(credentialsId: 'vsts_nuke', variable: 'VSTSAccessToken')]) {
                        sshagent(['github_ssh_nuke']) {
                            sh 'git config user.name "nuke-bot" && git config user.email "34026207+nuke-bot@users.noreply.github.com"'
                            sh '/bin/bash ./build.sh Release'
                        }
                    }
                    archiveArtifacts 'output/*.vsix'
                }
            }
        }
    }
}