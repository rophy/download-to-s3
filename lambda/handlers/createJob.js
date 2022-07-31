const AWS = require("aws-sdk");


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

function respond(statusCode, body) {
    try {
        if (typeof body === "string") {
            body = { "message": body };
        }
        body = JSON.stringify(body);
    } catch (err) {
        body = `{ "message": ${body}}`;
    }
    return {
        "headers": {
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN || "*"
        },
        "statusCode": statusCode,
        "body": body
    }
}

exports.lambdaHandler = async (event, context) => {
    try {
        if (!event.body) return respond(400, "missing request payload");

        let message = JSON.parse(event.body);
        console.log("message", message);
        const stepfunctions = new AWS.StepFunctions();

        if (!message.download_url) return respond(400, "missing required param 'download_url'");

        if (!message.email_to) return respond(400, "missing required param 'email_to'");

        let input = {
          "downloader_command": [
            "node",
            "app.js",
            "--download_url",
            message.download_url,
            "--email_to",
            message.email_to
          ]
        };

        if (message.rename_to) {
            input.downloader_command.push("--rename_to");
            input.downloader_command.push(message.rename_to);
        }

        if (message.expires_in) {
            input.downloader_command.push("--expires_in");
            input.downloader_command.push(message.expires_in.toString());
        }

        input = JSON.stringify(input);

        let response = await new Promise((resolve, reject) => {
            stepfunctions.startExecution({
                stateMachineArn: "arn:aws:states:ap-northeast-1:572921885201:stateMachine:DownloadToS3",
                input: input
            }, (err, response) => {
                if (err) return reject(err);
                else return resolve(response);
            });
        })

        return respond(200,response);
    }
    catch (err) {
        console.error(err);
        return respond(500, err);
    }
};
