var Knex = require("knex");
var sqlDb = require("./sql-database");

/**
* A client provides functions for a client of the payments library to use to:
* - create a new payment
*
* @param {object} db The database configuration (required if database is not provided)
*     @param {string} client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
*     @param {object} connection Connection configuration params
*         @param {string} host
*         @param {string} password
*         @param {string} user
*         @param {string} database
* @param {object} database The database implementation (optional)
*/
var Client = function (config) {
    this.database = config.database || new sqlDb({connection: Knex.initialize(config.db)});
    if (!this.database) {
        throw new Error("Must provide a database implementation or configuration parameters");
    }
}

/**
* Creates a new payment.
*
* @param {string} address The destination address the payment will send to.
* @param {int} amount The amount of stellars to send
* @param {string} memo A memo to describe this payment.
* @returns {Promise} A promise which will resolve once the payment has been created.
*
* TODO: address validation
*/
Client.prototype.createNewPayment = function (address, amount, memo) {
    if (address == null) {
        throw new Error("Address cannot be null");
    }
    if (amount == null) {
        throw new Error("Amount cannot be null");
    }
    return this.database.insertNewTransaction(address, amount, memo);
}

module.exports = Client;