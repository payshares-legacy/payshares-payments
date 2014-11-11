Stellar Payments
=====================

Stellar Payments is a library providing robust transaction submission to the Stellar network.
It is tolerant against failures to the network, transaction errors from the network, and
confirms transactions only when they are included in a closed ledger.

Stellar Payments uses persistent storage to keep track of transactions through the various states
(signed, submitted, and confirmed). It is bundled with a Knex implementation which supports various
SQL libraries.

The library provides two classes to help with creating and processing transactions: Payments and Client.

### Processing Payments
#### Config
```js
{
    // limits amount of txns we'll sign each iteration (maxTransactionsInFlight only sign (max - (signed submitted unconfirmed txns)))
    maxTransactionsInFlight: 10,
    stellarAddress: "ADDRESS",
    stellarSecretKey: "SECRET",
    stellardIp: "live.stellar.org", // the stellard instance you'll submit transactions to
    stellardRpcPort: 9002,
    stellardWebsocketPort: 9001
    db: {
        client: "mysql",
        connection: {
            host: "localhost",
            user: "user",
            password: "password",
            database: "stellar-payments_test"
        }
    },
    logger: obj, // OPTIONAL logger implementation
    network: obj, // OPTIONAL network implementation (will use bundled network by default)
    database: obj, // OPTIONAL database layer implementation
}
```
#### API
```js
var StellarPayments = require('stellar-payments').Payments;
var payments = new StellarPayments(config);

processPayments();

// calls processPayments every 500 ms
function processPayments() {
    payments.processPayments()
        .then(function () {
            setTimeout(function () {
                processPayments();
            }, 500);
        });
}

```

### Creating Payments
#### Config
```js
{
    db: {
        client: "mysql",
        connection: {
            host: "localhost",
            user: "user",
            password: "password",
            database: "stellar-payments_test"
        }
    }
}
```
#### API
```js
var PaymentsClient = require('stellar-payments').Client;
var payments = new PaymentsClient(config);

// create a payment, amount is in stroops (microstellars)
payments.createNewPayment(STELLAR_ADDRESS, 1000000, "withdrawal");
```