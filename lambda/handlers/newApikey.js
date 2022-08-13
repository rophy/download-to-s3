const AWS = require("aws-sdk");
const assert = require("assert");

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
        assert(process.env.USAGE_PLAN_ID, "missing env var `USAGE_PLAN_ID`");

        if (!event.body) return respond(400, "missing request payload");

        let message = JSON.parse(event.body);
        console.log("message", message);

        if (!message.email) return respond(400, "missing required param 'email'");
        if (typeof message.email !== 'string') return respond(400, "email must be a string");

        let email = message.email;

        console.log("Verifying email address...");
        const sesv2 = new AWS.SESV2();
        let data = await sesv2.getEmailIdentity({
            EmailIdentity: email
        }).promise();
        if (!data.VerifiedForSendingStatus) {
            return respond(403, "Email not verified. Only verified email is allowed to create apikey.")
        }

        const apigateway = new AWS.APIGateway();
        console.log("Check if apikey already exists...");
        data = await apigateway.getApiKeys({
            nameQuery: email,
            includeValues: false
        }).promise();

        if (data.items.length > 0) {
            if (!message.recreate) {
                return respond(409, "Apikey already exists. To regenerate, add parameter `recreate=true`");
            }
            data = await apigateway.deleteApiKey({
                apiKey: data.items[0].id
            }).promise();
            console.log("deleteApiKey", data);
        }

        // data.items.length == 0
        console.log("Creating apikey...");
        let keyData = await apigateway.createApiKey({
            enabled: true,
            name: email
        }).promise();

        console.log("Associating with usage plan...");
        data = await apigateway.createUsagePlanKey({
            keyId: keyData.id,
            keyType: "API_KEY",
            usagePlanId: process.env.USAGE_PLAN_ID
        }).promise();

        console.log("Sending apikey via email...");
        let body = {
            Content: {
                Simple: {
                    Body: {
                        Text: {
                            Data: `Your apikey is: ${keyData.value}`
                        }
                    },
                    Subject: {
                        Data: `API Key for ${email}`
                    }
                }
            },
            Destination: {
                ToAddresses: [email]
            },
            FromEmailAddress: "rophy123@gmail.com"
        };

        console.log(JSON.stringify(body));
        data = await sesv2.sendEmail(body).promise();


        return respond(200, "apikey will be sent to your email.");


    } catch (err) {
        console.error(err);
        return respond(err.statusCode || 500, err.message);
    }
};
