#!/usr/bin/env node
var Knex = require("knex");
var SqlDb = require("./sql-database");
var UInt160 = require("stellar-lib").UInt160;

/**
* A client provides functions for a client of the payments library to use to:
* - create a new payment
* @param {object} config
* @param {object} config.db The database configuration (required if database is not provided)
* @param {string} config.db.client The type of client adapter. Knex supports (Postgres, MySQL, MariaDB and SQLite3)
* @param {object} config.db.connection Connection configuration params
* @param {string} config.db.connection.host
* @param {string} config.db.connection.password
* @param {string} config.db.connection.user
* @param {string} config.db.connection.database
* @param {object} [config.database] The database implementation.
*/
var Client = function (config) {
    this.database = config.database || new SqlDb({connection: Knex.initialize(config.db)});
    if (!this.database) {
        throw new Error("Must provide a database implementation or configuration parameters");
    }
}

/**
* Creates a new payment.
*
* @param {string} address The destination address the payment will send to.
* @param {int} amount The amount of stellars to send
* @param {string} [memo] A memo to describe this payment.
* @returns {Promise} A promise which will resolve once the payment has been created.
*
* TODO: address validation
*/
Client.prototype.createNewPayment = function (address, amount, memo) {
    if (!UInt160.is_valid(address)) {
        throw new Error("Address must be a valid Stellar address");
    }
    if (!amount) {
        throw new Error("Amount cannot be null");
    }
    return this.database.insertNewTransaction(address, amount, memo);
}

var config = require("../config");
var client = new Client(config);
client.createNewPayment("", 1);

module.exports = Client;