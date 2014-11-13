module.exports = {
    db: {
        client   : "mysql",
        connection: {
            user       : "root",
            database : "stellar-payments_test"
        }
    },
    maxTransactionsInFlight: 10,
    stellarAddress: "gM3a41VDi7fBj8EZBqnBGkGPGz4idBquro",
    stellarSecretKey: "s3ghL92vyTCYYMW9HLNSTHnJxtzkx9eSBAiwQFnukHNNLURM3W5",
    stellarIp: "live.stellar.org",
    stellarRpcPort: 9002,
    stellarWebsocketPort: 9001
}