var Logger = {};

Logger.error = function (message) {
    console.error(message);
};

Logger.info = function (message) {
    console.info(message);
};

Logger.warn = function (message) {
    console.info(message);
};

Logger.debug = function (message) {
    console.info(message);
};

module.exports = Logger;