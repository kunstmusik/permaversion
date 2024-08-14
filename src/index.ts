#!/usr/bin/env node
import { ANT, ArweaveSigner } from "@ar.io/sdk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "node:fs";
import TurboDeploy from "./turbo";

const VERSIONS_SITE_DIST = "./versions-site-dist";

const argv = yargs(hideBin(process.argv))
  .option("ant-process", {
    alias: "a",
    type: "string",
    description: "ANT process ID to update",
    demandOption: true,
  })
  .option("template-folder", {
    alias: "d",
    type: "string",
    description:
      "Folder containing version site template to deploy. If no folder is provided, a directory with just the versions.json will be deployed.",
    default: "./versions-site",
  })
  .option("undername", {
    alias: "u",
    type: "string",
    description: "ANT undername to update.",
    default: "@",
  })
  .option("source-ant-process", {
    type: "string",
    description: "Source ANT process ID to read target ID from.",
    demandOption: true,
  })
  .option("source-ant-undername", {
    type: "string",
    description: "Source ANT undername to read target ID from.",
    default: "@",
  })
  .option("gateway", {
    alias: "g",
    type: "string",
    description: "Arweave gateway FQDN",
    default: "arweave.net",
  })
  .option("additional-fields", {
    type: "object",
    description: "Additional fields to add to the ANT record",
    default: {},
  })
  .option("dry-run", {
    type: "boolean",
    description:
      "Generate versions-site-dist but do not upload or update ANT record.",
    default: false,
  })
  .option("deploy-dist", {
    type: "boolean",
    description:
      "Only deploy current versions-site-dist folder and update ANT record.",
    default: false,
  })
  .parse();
const DEPLOY_KEY = process.env.DEPLOY_KEY;

(async () => {
  if (!DEPLOY_KEY) {
    console.error("DEPLOY_KEY not configured");
    return;
  }

  if (argv.antProcess.length == 0) {
    console.error("ant process must not be empty");
    return;
  }

  if (argv.undername.length == 0) {
    console.error("undername must not be empty");
    return;
  }

  if (argv.sourceAntProcess.length == 0) {
    console.error("source ant process must not be empty");
    return;
  }

  if (argv.sourceAntUndername.length == 0) {
    console.error("source ant undername must not be empty");
    return;
  }

  // handle reading of existing versions.json
  const jwk = JSON.parse(Buffer.from(DEPLOY_KEY, "base64").toString("utf-8"));
  const signer = new ArweaveSigner(jwk);
  const sourceAnt = ANT.init({ processId: argv.sourceAntProcess, signer });
  const versionsAnt = ANT.init({ processId: argv.antProcess, signer });

  if (argv.deployDist) {
    console.info("Deploying current versions-site-dist to ANT");
  } else {
    console.info(
      "Retrieving source record from ANT: \n\tProcess ID:",
      argv.sourceAntProcess,
      "\n\tUndername:",
      argv.sourceAntUndername
    );

    const sourceRecord = await sourceAnt.getRecord({
      undername: argv.sourceAntUndername,
    });

    const sourceTxId = sourceRecord?.transactionId;

    const currentRecord = await versionsAnt.getRecord({
      undername: argv.undername,
    });
    const currentTxId = currentRecord?.transactionId;

    if (!sourceTxId) {
      console.error(
        "No transaction ID found for undername [",
        argv.sourceAntUndername,
        "]"
      );
      return;
    } else {
      console.log("Found transaction ID [", sourceTxId, "]");
    }

    console.info(
      "Retrieving versions.json from ANT: \n\tProcess ID ",
      argv.antProcess,
      "\n\tUndername: ",
      argv.undername
    );

    const versionsRecords = await versionsAnt.getRecords();
    const versionsTxId = versionsRecords[argv.undername].transactionId;

    if (!versionsTxId) {
      console.error(
        "No transaction ID found for undername [",
        argv.undername,
        "]"
      );
      return;
    }

    const versionsUrl = `https://${argv.gateway}/raw/${versionsTxId}`;
    const versionsRes = await fetch(versionsUrl);

    let versionsJson;

    if (versionsRes.ok) {
      try {
        const manifest = await versionsRes.json();
        const versionsJsonTxId = manifest.paths["versions.json"]?.id;
        console.log(versionsJsonTxId);
        const versionsData = await fetch(
          `https://${argv.gateway}/${versionsJsonTxId}`
        );
        versionsJson = await versionsData.json();
      } catch (e) {
        console.warn(
          `Unable to fetch versions.json from ${versionsUrl}. Creating new versions.json.`
        );
        versionsJson = { versions: [] };
      }
    } else {
      console.warn(
        `Unable to fetch versions.json from ${versionsUrl}. Creating new versions.json.`
      );

      versionsJson = { versions: [] };
    }

    if(versionsJson.versions.length > 0 && versionsJson.versions[0].txId === sourceTxId) {
      console.info("Source TxId is already the latest version. Exiting.");
      return;
    }

    const newVersion = {
      txId: sourceTxId,
      timestamp: new Date().getTime(),
      ...argv.additionalFields,
    };

    versionsJson.versions = [newVersion, ...versionsJson.versions];

    if (currentTxId) {
      versionsJson.previousVersionsSiteTxId = currentTxId;
    }

    if (fs.existsSync(VERSIONS_SITE_DIST)) {
      console.info("Removing existing versions-site-dist folder");
      fs.rmSync(VERSIONS_SITE_DIST, { recursive: true, force: true });
    }

    if (fs.existsSync(argv.templateFolder)) {
      console.info(`Copying ${argv.templateFolder} to ${VERSIONS_SITE_DIST}`);
      fs.cpSync(argv.templateFolder, VERSIONS_SITE_DIST, { recursive: true });
    } else {
      console.info("Creating new versions-site-dist folder");
      fs.mkdirSync(VERSIONS_SITE_DIST);
    }

    console.info("Writing versions.json to versions-site-dist");
    fs.writeFileSync(
      `${VERSIONS_SITE_DIST}/versions.json`,
      JSON.stringify(versionsJson, null, 2),
      { flush: true }
    );
  }

  if (argv.dryRun) {
    console.info("Dry run complete. Exiting.");
    return;
  }

  console.info("Uploading versions-site-dist to Arweave");
  const manifestId = await TurboDeploy(VERSIONS_SITE_DIST, jwk);

  if (!manifestId) {
    console.error("Failed to upload versions-site-dist to Arweave");
    return;
  }

  await versionsAnt.setRecord({
    undername: argv.undername,
    transactionId: manifestId,
    ttlSeconds: 3600,
  });

  console.log(
    `Deployed TxId [${manifestId}] to ANT [${argv.antProcess}] using undername [${argv.undername}]`
  );

})();
