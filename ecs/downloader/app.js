
["BUCKET", "PREFIX"].forEach( envName => {
    if (!process.env[envName]) throw new Error(`missing env var ${envName}`)
});

const argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 --download_url=URL [--rename_to=FILE_NAME] [--expires_in=SECONDS] [--emai_to=EMAIL]')
    .describe("download_url", "direct download link of the file")
    .describe("email_to", "send the s3 download link to this email address")
    .describe("expires_in", "[default: 3600] seconds which the link will expire")
    .describe("rename_to", "rename downloaded file in s3")
    .demandOption(['download_url'])
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
    try {

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

        let s3Key = `${process.env.PREFIX}/${Date.now()}/${filename}`;
        console.log(`Uploading to: s3://${process.env.BUCKET}/${s3Key}`)

        let data = await new Promise((resolve, reject) => {
            s3.upload({
                Bucket: process.env.BUCKET,
                Key: s3Key,
                Body: piper
            }, (err, data) => {
                if (err) return reject(err);
                return resolve(data);
            });
        });


        // Generate a presigned URL.
        let presignedUrl = await s3.getSignedUrlPromise("getObject", {
            Bucket: data.Bucket,
            Key: data.Key,
            Expires: argv.expires_in || 3600
        });

        return {
            "statusCode": 200,
            "body": presignedUrl
        };
    }
    catch (err) {
        console.error(err);
        return {
            "statusCode": 500,
            "body": err
        };
    }
};

downloader();

