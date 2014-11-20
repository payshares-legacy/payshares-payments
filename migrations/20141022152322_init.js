'use strict';

exports.up = function(knex, Promise) {
    return knex.schema.createTable('Transactions', function (table) {
        table.increments("id").primary();
        table.string("address", 128);
        table.string("amount", 255);
        table.string("currency", 255);
        table.string("issuer", 255);
        table.string("memo", 512);
        table.text("txblob");
        table.string("txhash", 255);
        table.integer("sequence");
        table.text("error");
        table.timestamp("signedAt").nullable();
        table.timestamp("submittedAt").nullable();
        table.timestamp("confirmedAt").nullable();
        table.timestamp("abortedAt").nullable();
    });
};

exports.down = function(knex, Promise) {
    return knex.schema.dropTable("Transactions");
};
