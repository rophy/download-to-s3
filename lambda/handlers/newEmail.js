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
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN || "*"
        },
        "statusCode": statusCode,
        "body": body
    }
}

function validateEmail(email) {
    return email.match(
        /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
};

exports.lambdaHandler = async (event, context) => {
    try {
        if (!event.body) return respond(400, "missing request payload");

        let message = JSON.parse(event.body);
        console.log("message", message);

        if (!message.email) return respond(400, "missing required param 'email'");

        let email = message.email;

        if (typeof email !== 'string') return respond(400, "email must be a string");
        if (!validateEmail(email)) return respond(400, "invalid email format");
        if (process.env.LIMIT_EMAIL_DOMAIN) {
            let domain = process.env.LIMIT_EMAIL_DOMAIN;

            // domain must match suffix of email.
            if (email.indexOf(domain) + domain.length !== email.length) {
                return respond(400, `only accepts email domain: ${domain}`);
            }

        }


        console.log("Verifying email addresses...");
        const sesv2 = new AWS.SESV2();
        let data = null;
        try {
            data = await sesv2.getEmailIdentity({
                EmailIdentity: email
            }).promise();
            if (data.VerifiedForSendingStatus) {
                return respond(409, "Email already registered and verified");
            } else {
                return respond(409, "Email already registered, but not verified. If you want to receive another verification email, try DELETE /email and POST /email again.")
            }
        } catch(err) {
            if (err.statusCode !== 404) {
                return respond(500, err);
            }
            data = await sesv2.createEmailIdentity({
                EmailIdentity: email
            }).promise();
            return respond(200, data);
        }

        // should never reach here.
        throw new Error("something unexpected happened!");

    }
    catch (err) {
        console.error(err);
        return respond(500, err);
    }
};
