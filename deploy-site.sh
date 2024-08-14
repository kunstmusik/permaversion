#!/bin/sh
ANT_ID=2b08WiXKuFcJE9ed_mR23PFbpkuHgVdOHy-32sr2nVE
UNDERNAME="test"

npx permaweb-deploy --ant-process=${ANT_ID} --undername=${UNDERNAME} --deploy-folder=test-app
