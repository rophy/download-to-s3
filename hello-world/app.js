const http = require('http');
const fs = require('fs');
const AWS = require('aws-sdk');


// const axios = require('axios')
// const url = 'http://checkip.amazonaws.com/';
let response;

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
exports.lambdaHandler = async (event, context) => {
    if (!event.body) return new Error("body is missing");

    const s3 = new AWS.S3({'apiVersion':'2006-03-01'});

    const prom = new Promise((resolve, reject) => {
        s3.listObjects({
            Bucket: "***REMOVED***",
            Prefix: "shared/"
        }, (err, data) => {
            if (err) return reject(err);
            return resolve(data.Contents);
        });

        return;
        
        http.get(event.body, function(resp) {
            resp.pipe(file);
    
            file.on('finish', () => {
                return {
                    "statusCode": 200,
                    "body": "OK"
                };
            });

            file.on('error', (err) => {
                return {
                    "statusCode": 500,
                    "body": err
                };
            });
        });    
    });
    try {
        response = await prom;
        return {
            "statusCode": 200,
            "body": response
        };
    }
    catch (err) {
        return {
            "statusCode": 500,
            "body": err
        };
    }
};
