pipeline {
    agent { label 'nodejs' }
    options {
        buildDiscarder(logRotator(numToKeepStr:'10'))
        timeout(time: 15, unit: 'MINUTES')
    }
    stages { 
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
        stage('Pack') {
            steps {
                sh '/bin/bash ./build.sh Pack -Skip -NoInit'
            }
            post {
				success {
					archiveArtifacts 'output/*.vsix'
				}
			}
        }
    }
}