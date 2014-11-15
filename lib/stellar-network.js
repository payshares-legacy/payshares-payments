var Promise     = require("bluebird");
var _           = require("lodash");
var unirest     = require('unirest');

var errors      = require('./errors');

function StellarNetwork(config) {
    this.stellardIp = config.stellardIp;
    this.stellardRpcPort = config.stellardRpcPort;
    this.stellardWebsocketPort = config.stellardWebsocketPort;
}

StellarNetwork.errors = {};
StellarNetwork.errors.Transaction = Error.subclass('TransactionError');

/**
* Submits the signed tx_blob to the stellard server.
* @param {string} tx_blob the signed transaction blob
*/
StellarNetwork.prototype.submitTransactionBlob = function (tx_blob) {
    var opts = {
        tx_blob: tx_blob
    };
    return this.sendRequest("submit", opts).get("body");
};

/**
* Submits the given transaction to the network for signing, returning the response.
* @param {string} account The account sending the payment.
* @param {string} secret The secret key for the account sending the transaction.
* @param {string} destination The account receiving the payment
* @param {number|object} amount The amount to send. Either number (in stroops) for STR or amount object.
* @param {object} [options]
*/
StellarNetwork.prototype.signPaymentTransaction = function (account, secret, destination, amount, options) {
    var tx_json = constructPaymentTransactionJson(account, destination, amount, options);
    var opts = {
        secret: secret,
        tx_json: tx_json
    };
    return this.sendRequest("sign", opts).get("body");
};

/**
* Submits the given transaction to the network, returning the response.
* @param {string} account The account sending the payment.
* @param {string} secret The secret key for the account sending the transaction.
* @param {string} destination The account receiving the payment
* @param {number|object} amount The amount to send. Either number (in stroops) for STR or amount object.
* @param {object} options
*/
StellarNetwork.prototype.sendPaymentTransaction = function (account, secret, destination, amount, options) {
    var tx_json = constructPaymentTransactionJson(account, destination, amount, options);
    var opts = {
        secret: secret,
        tx_json: tx_json
    };
    return this.sendRequest("submit", opts).get("body");
};

/**
* Fetches the transaction with the given hash from stellard.
*/
StellarNetwork.prototype.getTransaction = function(hash) {
    var opts = {
        transaction: hash
    };
    return this.sendRequest("tx", opts).get("body");
};

/**
* Return the transactions that have been applied to the given address.
* @param {string} address the address to fetch the transactions for
* @param {object} options options to add to the request
*   - ledger_index_min
*   - ledger_index_max
*   - marker
*/
StellarNetwork.prototype.getAccountTransactions = function(address, options) {
    var opts = {
        account: address
    };
    _.assign(opts, options);
    return this.sendRequest("account_tx", opts).get("body");
};

StellarNetwork.prototype.getAccountInfo = function (address) {
    var opts = {
        account: address
    };
    return this.sendRequest("account_info", opts).get("body");
};

StellarNetwork.prototype.sendRequest = function(method, opts) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var uri = 'http://' + self.stellardIp + ':' + self.stellardRpcPort;
        var request = {
            method: method,
            params: [opts]
        };

        unirest.post(uri)
            .headers({ 'Accept': 'application/json' })
            .type("json")
            .send(request)
            .end(function (result) {
                if (result.error) {
                    reject(result);
                } else {
                    resolve(result);
                }
            });
    });
};

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

function callListeners(listeners, message) {
    if (!listeners) { return; }

    _.forEach(listeners, function (listener) {
        listener(message);
    });
}

module.exports = StellarNetwork;
