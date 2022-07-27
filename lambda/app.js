const https = require("https");
const stream = require("stream");
const url = require("url");
const path = require("path");
const AWS = require("aws-sdk");
const contentDisposition = require("content-disposition");


const BUCKET = process.env.BUCKET;
const PREFIX = process.env.PREFIX;


/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */

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
    let disposition = hasHeader("content-disposition", response.headers);
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

exports.lambdaHandler = async (event, context) => {
    if (!event.body) return new Error("body is missing");
    try {

        let message = JSON.parse(event.body);
        console.log("message", message);
        const s3 = new AWS.S3({'apiVersion':'2006-03-01'});

        const prom = new Promise((resolve, reject) => {
            getWithRedirects(message.download_url, response => resolve(response));
        })

        .then((response) => {
            let filename = getFilename(message.download_url, response);
            // Stream the download to S3.
            let piper = new stream.PassThrough();
            response.pipe(piper);
            return new Promise((resolve, reject) => {
                s3.upload({
                    Bucket: BUCKET,
                    Key: `${PREFIX}/${Date.now()}/${filename}`,
                    Body: piper
                }, (err, data) => {
                    console.log("after s3 upload", err, data);
                    if (err) return reject(err);
                    return resolve(data);
                });
            });
        })
        .then((data) => {
            // Generate a presigned URL.
            return s3.getSignedUrlPromise("getObject", {
                Bucket: data.Bucket,
                Key: data.Key,
                Expires: message.expiration || 3600
            });
        });

        let presignedUrl = await prom;
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
