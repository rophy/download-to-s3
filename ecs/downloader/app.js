
["S3_BUCKET","S3_PREFIX"].forEach( envName => {
    if (!process.env[envName]) throw new Error(`missing env var ${envName}`)
});

const argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 --download_url=URL [--rename_to=FILE_NAME] [--expires_in=SECONDS]')
    .describe("download_url", "direct download link of the file")
    .describe("expires_in", "[default: 3600] seconds which the link will expire")
    .number("expires_in")
    .default("expires_in", 3600)
    .describe("rename_to", "rename downloaded file in s3")
    .demandOption(["download_url"])
    .argv;

const https = require("https");
const stream = require("stream");
const url = require("url");
const path = require("path");
const AWS = require("aws-sdk");
const contentDisposition = require("content-disposition");


function hasHeader(header, headers) {
    var headers = Object.keys(headers || this.headers)
      , lheaders = headers.map(function (h) {return h.toLowerCase()})
      ;
    header = header.toLowerCase()
    for (var i=0;i<lheaders.length;i++) {
      if (lheaders[i] === header) return headers[i];
    }
    return false;
}

function getWithRedirects(url, callback) {
    console.log("getWithRedirects", url);
    https.get(url, response => {
        if (response.statusCode >= 300
            && response.statusCode < 400
            && hasHeader('location', response.headers)) {

            let location = response.headers[hasHeader('location', response.headers)];
            if (location) {
                return getWithRedirects(location, callback);
            }
        }
        callback(response);
    });
}

function getFilename(download_url, response) {
    // Try to determine filename.
    let filename = null;

    // Ideally, this is a binary file, and we have the content-disposition header.
    let disposition = response.headers[hasHeader("content-disposition", response.headers)];
    if (disposition) {
        disposition = contentDisposition.parse(disposition);
        if (disposition.parameters.filename) {
            filename = disposition.parameters.filename;
        }
    }

    // Fall back to filename from URL.
    if (!filename) {
        filename = path.basename(url.parse(download_url).pathname);
    }

    // In case we cannot parse any filename, give a reasonable default.
    if (!filename) {
        filename = `${Date.now()}.downloaded.contents`;
    }
    return filename;
}

downloader = async () => {

    const s3 = new AWS.S3({'apiVersion':'2006-03-01'});

    let response = await new Promise((resolve, reject) => {
        getWithRedirects(argv.download_url, response => resolve(response));
    });

    let filename = null;
    if (argv.rename_to) {
        filename = argv.rename_to;
    } else {
        filename = getFilename(argv.download_url, response);
    }
    

    // Stream the download to S3.
    let piper = new stream.PassThrough();
    response.pipe(piper);

    let s3Key = `${process.env.S3_PREFIX}/${Date.now()}/${filename}`;
    console.log(`Uploading to s3://${process.env.S3_BUCKET}/${s3Key}`)

    let data = await new Promise((resolve, reject) => {
        s3.upload({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
            Body: piper
        }, (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        });
    });


    // Generate a presigned URL.
    console.log("Generating presigned URL...");
    let presignedUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: data.Bucket,
        Key: data.Key,
        Expires: argv.expires_in
    });


    if (process.env.STEPFUNCTION_EXECUTION_NAME) {

        console.log("Saving states in dynamodb...");
        const dynamodb = new AWS.DynamoDB();
        let expiration = Date.now() + argv.expires_in*1000;
        let ttl = Math.floor( (Date.now()+3600000)/1000 ).toString();
        let params = {
            "TableName": "download-to-s3",
            "Item": {
                "sfn_exec_name": {
                    "S": process.env.STEPFUNCTION_EXECUTION_NAME
                },
                "expiration": {
                    "S": new Date(expiration).toISOString()
                },
                "s3_path": {
                    "S": s3Key
                },
                "presigned_url": {
                    "S": presignedUrl
                },
                "ttl": {
                    "N": ttl
                }
            }
        };

        let data = await dynamodb.putItem(params).promise();
        console.log(data);
    }

    console.log(presignedUrl);

};

downloader()
.catch(err => {
    console.error(err);
    process.exit(1);
});
