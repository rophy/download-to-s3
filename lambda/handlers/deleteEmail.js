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
    console.log(statusCode, body);
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
            "Access-Control-Allow-Methods": "OPTIONS,POST,DELETE",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN || "*"
        },
        "statusCode": statusCode,
        "body": body
    }
}

exports.lambdaHandler = async (event, context) => {
    if (!event.body) return respond(400, "missing request payload");

    let message = JSON.parse(event.body);
    console.log("message", message);

    if (!message.email) return respond(400, "missing required param 'email'");
    if (typeof message.email !== 'string') return respond(400, "email must be a string");

    let email = message.email;

    console.log("Verifying email addresses...");
    const sesv2 = new AWS.SESV2();
    try {
        let data = await sesv2.deleteEmailIdentity({
            EmailIdentity: email
        }).promise();
        return respond(200, data);
    } catch (err) {
        console.error(err);
        return respond(err.statusCode, err.message);
    }

};
