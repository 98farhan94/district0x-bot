var jp = require('jsonpath');
var moment = require('moment');
var numeral = require('numeral');
var request = require('request');

var options = {
    defaultCurrency: 'USD',

    // supported currencies and api steps to arrive at the final value
    currencies: {
        USD: { steps: ['DNTBTC', 'BTCUSD'], format: '$0,0.00' },
        BTC: { steps: ['DNTBTC'], format: '0,0[.][00000000] BTC' },
        ETH: { steps: ['DNTETH'], format: '0,0[.][00000000] ETH' },
        GBP: { steps: ['DNTBTC', 'BTCGBP'], format: '£0,0.00' }
    },

    // api steps
    api: {
        DNTBTC: { url: 'https://api.coinmarketcap.com/v1/ticker/district0x/', path: '$[0].price_btc' },
        BTCUSD: { url: 'https://blockchain.info/ticker', path: '$.USD.buy' },
        BTCGBP: { url: 'https://blockchain.info/ticker', path: '$.GBP.buy' },
        DNTETH: { url: 'https://api.coinmarketcap.com/v1/ticker/district0x/?convert=eth', path: '$[0].price_eth' }
    },

    // display date/time format
    dtFormat: 'Do MMM YYYY h:mma [UTC]',

    // refresh rate in milliseconds to retrieve a new price (default to 10 minutes)
    refreshTime: 600000
};

// store the last retrieved rate
var cachedRates = {};

var mktChannel;

// !price {currency}
// !price {currency} {amount}
var command = '!stats';

module.exports={
  command: command,
  init: init,
  respond: respond
};

function init(channel_) {
  mktChannel = channel_;
  if (!channel_) {
    console.log('No market and trading channel. Statbot will only respond to DMs.');
  }

  var currencies = Object.keys(options.currencies);
  for (var i = 0; i < currencies.length; i++) {
    cachedRates[currencies[i]] = { rate: 0, time: null };
  }
}

var globalSlackParams = {};

function respond(bot, data) {
  var channel = data.channel,
      words = data.text.trim().split(' ').filter( function(n){return n !== "";} );

  if (words[0] !== command || (channel != mktChannel && !channel.startsWith('D'))) {
    // if the received message isn't starting with the trigger,
    // or the channel is not the market-and-trading channel, nor sandbox, nor a DM -> ignore
    return;
  }

  var currency = /*(words.length > 1) ? words[1].toUpperCase() : */ options.defaultCurrency;
  var amount = (words.length > 2) ? /*parseFloat(words[2], 10)*/1 : 1;
  var showHelp = (isNaN(amount)) || (Object.keys(options.currencies).indexOf(currency) === -1);

  var moveToBotSandbox = showHelp && channel !== mktChannel && !channel.startsWith("D");
  if (moveToBotSandbox) {
    bot.postMessage(channel, 'Please use PM to talk to bot.', globalSlackParams);
    return;
  }

  if (showHelp) {
    doHelp(bot, channel);
  } else {
    doSteps(bot, channel, currency, amount);
  }
}

function doHelp(bot, channel) {
  var message =
    '`' + command + '`: show the price of 1 DNT in ' + options.defaultCurrency + '\n' +
    '`' + command + ' help`: this message\n' +
    '`' + command + ' CURRENCY`: show the price of 1 DNT in CURRENCY. Supported values for CURRENCY are *btc* and *usd* (case-insensitive)\n' +
    '`' + command + ' CURRENCY AMOUNT`: show the price of AMOUNT DNT in CURRENCY\n';

    if (!channel.startsWith("D")) {
      message =
        '*USE PM FOR HELP*\n' +
        message +
        '\n' +
        '*Everyone will see what I say. Send me a Direct Message if you want to interact privately.*\n' +
        'If I\'m not responding in some channel, you can invite me by @mentioning me.\n';
    }

  bot.postMessage(channel, message, globalSlackParams);
}

function formatMessage(amount, rate, option) {
    var value = numeral(rate.rate * amount).format(option.format);
    return '*' + numeral(amount).format('0,0[.][00000000]') + ' :dnt: = ' + value + '*\n_last updated ' + rate.time.utc().format(options.dtFormat) + '_';
}

function doSteps(bot, channel, currency, amount) {
    var option = options.currencies[currency];
    var shouldReload = true;
    if (cachedRates[currency]) {
        var cache = cachedRates[currency];
        shouldReload = cache.time === null || moment().diff(cache.time) >= options.refreshTime;
        if (!shouldReload) {
            var message = formatMessage(amount, cache, option);
            if (cachedRates['BTC'])
            message += formatMessage(amount, cachedRates['BTC'], options.currencies['BTC']);
            if (cachedRates['ETH'])
            message += formatMessage(amount, caccachedRates['ETH'], options.currencies['ETH']);
            bot.postMessage(channel, message);
        }
    }

    if (shouldReload) {
        // copy the steps array
        var steps = [];
        for (var i = 0; i < option.steps.length; i++) {
            steps.push(option.steps[i]);
        }

        processSteps(bot, channel, currency, 0, amount, steps, option);
        processSteps(bot, channel, currency, 0, amount, steps, option);
    }
}

function processSteps(bot, channel, currency, rate, amount, steps, option) {
    if (steps.length > 0) {
        var pairName = steps[0];
        if (!options.api[pairName]) {
            bot.postMessage(channel, 'There was a configuration error. ' + pairName + ' pair was not found.');
            return;
        }

        var pair = options.api[pairName];
        request.get(pair.url, function(error, response, body) {
            if (error) {
                bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
                return;
            }
            var pairRate = 0;
            try {
                pairRate = jp.query(JSON.parse(body), pair.path);
                if (Array.isArray(pairRate) && pairRate.length > 0) {
                    pairRate = pairRate[0];
                }
            } catch (ignored) {
                // invalid response or pair rate
            }

            if (pairRate > 0) {
                rate = (rate === 0) ? pairRate : rate * pairRate;
                steps.shift();
                if (steps.length > 0) {
                    processSteps(bot, channel, currency, rate, amount, steps, option);
                    return;
                }

                // final step, cache and then response
                var result = { rate: rate, time: moment() };
                cachedRates[currency] = result;
                bot.postMessage(channel, formatMessage(amount, result, option));
            } else {
                bot.postMessage(channel, 'The rate returned for the ' + pairName + ' pair was invalid.');
            }
        });
    }
}
