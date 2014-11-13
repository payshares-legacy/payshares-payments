var Promise     = require("bluebird");
var _           = require("lodash");
var unirest     = require('unirest');

var errors      = require('./errors');

function stellard(config) {
    this.stellardIp = config.stellardIp;
    this.stellardRpcPort = config.stellardRpcPort;
    this.stellardWebsocketPort = config.stellardWebsocketPort;
}

stellard.errors = {};
stellard.errors.Transaction = Error.subclass('TransactionError');

/**
* Submits the signed tx_blob to the stellard server.
* @param {string} tx_blob the signed transaction blob
*/
stellard.prototype.submitTransactionBlob = function (tx_blob) {
    var opts = {
        tx_blob: tx_blob
    };
    return this.sendRequest("submit", opts).then(returnBody);
};

/**
* Submits the given transaction to the network for signing, returning the response.
* @param {string} account The account sending the payment.
* @param {string} secret The secret key for the account sending the transaction.
* @param {string} destination The account receiving the payment
* @param {number|object} amount The amount to send. Either number (in stroops) for STR or amount object.
* @param {object} options
*/
stellard.prototype.signPaymentTransaction = function (account, secret, destination, amount, options) {
    var tx_json = constructPaymentTransactionJson(account, destination, amount, options);
    var opts = {
        secret: secret,
        tx_json: tx_json
    };
    return this.sendRequest("sign", opts).then(returnBody);
};

/**
* Submits the given transaction to the network, returning the response.
* @param {string} account The account sending the payment.
* @param {string} secret The secret key for the account sending the transaction.
* @param {string} destination The account receiving the payment
* @param {number|object} amount The amount to send. Either number (in stroops) for STR or amount object.
* @param {object} options
*/
stellard.prototype.sendPaymentTransaction = function (account, secret, destination, amount, options) {
    var tx_json = constructPaymentTransactionJson(account, destination, amount, options);
    var opts = {
        secret: secret,
        tx_json: tx_json
    };
    return this.sendRequest("submit", opts).then(returnBody);
};

/**
* Fetches the transaction with the given hash from stellard.
*/
stellard.prototype.getTransaction = function(hash) {
    var opts = {
        transaction: hash
    };
    return this.sendRequest("tx", opts).then(returnBody);
};

/**
* Return the transactions that have been applied to the given address.
* @param {string} address the address to fetch the transactions for
* @param {object} options options to add to the request
*   - ledger_index_min
*   - ledger_index_max
*   - marker
*/
stellard.prototype.getAccountTransactions = function(address, options) {
    var opts = {
        account: address
    };
    _.assign(opts, options);
    return this.sendRequest("account_tx", opts).then(returnBody);
};

stellard.prototype.getAccountInfo = function (address) {
    var opts = {
        account: address
    };
    return this.sendRequest("account_info", opts).then(returnBody);
};

/**
* Extract and return the main json response from the unirest result, or null.
*/
function returnBody(result) {
    return result.body;
}

/**
* Builds the tx_json field for the transaction.
*/
function constructPaymentTransactionJson(account, destination, amount, options) {
    var txJson = {
        TransactionType: "Payment",
        Account: account,
        Destination: destination,
        Amount: amount
    };
    _.assign(txJson, options);
    return txJson;
}

function handleWebsocketMessage(message) {
    message = JSON.parse(message);
    // the first messages returned from a subscription call contain an inner "result" object...
    message = message.result ? message.result : message;
    callListeners(stellard.listeners[message.type], message);
}

function callListeners(listeners, message) {
    if (!listeners) { return; }

    _.forEach(listeners, function (listener) {
        listener(message);
    });
}

stellard.prototype.sendRequest = function(method, opts) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var uri = 'http://' + self.stellardIp + ':' + self.stellardRpcPort;
        var request = {
            method: method,
            params: [opts]
        };

        unirest.post(uri)
            .headers({ 'Accept': 'application/json' })
            .send(JSON.stringify(request))
            .end(function (result) {
                if (result.error) {
                    reject(result);
                } else {
                    resolve(result);
                }
            });
    });
}

module.exports = stellard;
