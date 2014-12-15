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
StellarNetwork.errors.Transaction   = Error.subclass('TransactionError');
StellarNetwork.errors.NetworkError  = Error.subclass('NetworkError');

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
* Fetches the transaction with the given hash from stellard.
*/
StellarNetwork.prototype.getTransaction = function(hash) {
    var opts = {
        transaction: hash
    };
    return this.sendRequest("tx", opts).get("body");
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
                    reject(new StellarNetwork.errors.NetworkError(result));
                } else {
                    var error = result["body"].result.error;
                    if (error && isNetworkError(error)) {
                        reject(new StellarNetwork.errors.NetworkError(error));
                    } else {
                        resolve(result);
                    }
                }
            });
    });
};

function isNetworkError(error) {
    switch (error) {
        case "noNetwork":
        case "noCurrent":
            return true;
        default:
            return false;
    }
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

function callListeners(listeners, message) {
    if (!listeners) { return; }

    _.forEach(listeners, function (listener) {
        listener(message);
    });
}

module.exports = StellarNetwork;
