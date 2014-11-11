/**
* A client provides functions for a client of the payments library to use to:
* - create a new payment
* @param {object} database The instantiated stellar payments database implementation.
*/
var Client = function (database) {
    this.database = database;
}

/**
* Creates a new payment
* @param {string} address The destination address the payment will send to.
* @param {int} amount The amount of stellars to send
* @param {string} memo A memo to describe this payment.
* @returns {Promise} A promise which will resolve once the payment has been created.
*/
Client.prototype.createNewPayment = function (address, amount, memo) {
    return this.database.insertNewTransaction(address, amount, memo);
}