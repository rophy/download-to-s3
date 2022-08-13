
exports.createJob = require('./handlers/createJob.js').lambdaHandler;
exports.queryJob = require('./handlers/queryJob.js').lambdaHandler;
exports.newEmail = require('./handlers/newEmail.js').lambdaHandler;
exports.deleteEmail = require('./handlers/deleteEmail.js').lambdaHandler;