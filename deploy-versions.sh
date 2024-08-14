#!/bin/sh
SOURCE_ANT_PROCESS=2b08WiXKuFcJE9ed_mR23PFbpkuHgVdOHy-32sr2nVE
SOURCE_UNDERNAME="test"
VERSIONS_ANT_ID=2b08WiXKuFcJE9ed_mR23PFbpkuHgVdOHy-32sr2nVE
VERSIONS_UNDERNAME="versions"

node dist/index.js --ant-process=${VERSIONS_ANT_ID} --undername=${VERSIONS_UNDERNAME}  \
    --source-ant-process=${SOURCE_ANT_PROCESS} --source-ant-undername=${SOURCE_UNDERNAME} \
    --additional-fields.version="1.0.7" 
