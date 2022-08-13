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
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN || "*"
        },
        "statusCode": statusCode,
        "body": body
    }
}

exports.lambdaHandler = async (event, context) => {
    try {
        console.log(event.queryStringParameters);
        if (!event.queryStringParameters) return respond(400, "missing request payload");

        let message = event.queryStringParameters;
        if (!message.job_id) return respond(400, "missing required query 'job_id'");

        let arn = process.env.STEPFN_ARN.replace('stateMachine', 'execution');

        const stepfunctions = new AWS.StepFunctions();
        let data = await stepfunctions.describeExecution({
            executionArn: `${arn}:${message.job_id}`
        }).promise();

        let response = {
            job_id: data.name,
            status: data.status,
            start_date: data.startDate,
            stop_date: data.stopDate,
            input: data.input && JSON.parse(data.input),
            output: data.output && JSON.parse(data.output)
        };

        return respond(200, response);
    }
    catch (err) {
        console.error(err);
        return respond(500, err);
    }
};
