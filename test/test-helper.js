var Promise = require("bluebird");
var Knex    = require('knex');
var config  = require('../config');

process.env["NODE_ENV"]="test";

var testHelper  = module.exports;
testHelper.config = config;
var db;
testHelper.logger = {
    error: function () {},
    warn: function () {},
    info: function () {}
};

var clearDb = function() {
    return Promise.all([
        db.raw("TRUNCATE TABLE Transactions")
    ]);
};

beforeEach(function (done) {
    db = Knex.initialize(config.db);
    testHelper.db = db;
    clearDb()
        .then(function () { done(); });
});

afterEach(function (done) {
    db.client.pool.destroy();
    done();
});